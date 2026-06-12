import dbConnect from "@/lib/ai/db";
import { ConversationStore as Conversation, UserStore as User } from "@/lib/ai/server/store";
import { getAuthPayload } from "@/lib/ai/auth";
import { rateLimit, getClientIP } from "@/lib/ai/rateLimit";
import {
  getModelConfig,
  isBailianChatModel,
} from "@/lib/ai/shared/models";
import {
  isNonEmptyString,
  sanitizeStoredMessagesStrict,
  generateMessageId,
} from "@/app/api/ai/chat/utils";
import { getAttachmentInputType } from "@/lib/ai/shared/attachments";
import {
  CONVERSATION_WRITE_CONFLICT_ERROR,
  buildConversationWriteCondition,
  loadConversationForRoute,
  rollbackConversationTurn,
} from "@/app/api/ai/chat/conversationState";
import {
  enrichConversationPartsWithBlobIds,
  enrichStoredMessagesWithBlobIds,
} from "@/lib/ai/server/conversations/blobReferences";
import { prepareDocumentAttachmentMapByUrls } from "@/lib/ai/server/files/service";
import { buildDirectChatSystemPrompt } from "@/lib/ai/server/chat/systemPromptBuilder";
import {
  parseSystemPrompt,
  parseWebSearchConfig,
  parseWebSearchEnabled,
} from "@/lib/ai/server/chat/requestConfig";
import { WEB_BROWSING_IDENTIFIER, WebBrowsingApiName } from "@/lib/ai/shared/webBrowsing";
import {
  buildQwenResponsesRequest,
  createBailianOpenAIClient,
  getResponsesCompletedUsage,
  normalizeOpenAIError,
} from "@/lib/ai/server/bailian/openai";
import {
  buildBailianMessagesFromHistory,
  buildCurrentUserMessage,
  normalizeOpenAIMessageContentParts,
} from "@/app/api/ai/bailian/bailianHelpers";
import {
  CHAT_RATE_LIMIT,
  MAX_REQUEST_BYTES,
  SSE_PADDING,
  HEARTBEAT_INTERVAL_MS,
} from "@/lib/ai/server/chat/routeConstants";
import { logError } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function buildBailianResponsesProviderState({ responseId, previousResponseId, usage, tools }) {
  const state = {};
  if (typeof responseId === "string" && responseId.trim()) state.responseId = responseId.trim();
  if (typeof previousResponseId === "string" && previousResponseId.trim()) state.previousResponseId = previousResponseId.trim();
  if (usage && typeof usage === "object" && !Array.isArray(usage)) state.usage = usage;
  if (tools && typeof tools === "object" && !Array.isArray(tools)) state.tools = tools;
  return Object.keys(state).length > 0 ? { bailianResponses: state } : undefined;
}

function getStoredBailianResponseId(messages) {
  if (!Array.isArray(messages)) return "";
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message?.role !== "model") continue;
    const responseId = message?.providerState?.bailianResponses?.responseId;
    if (typeof responseId === "string" && responseId.trim()) return responseId.trim();
  }
  return "";
}

function uniqueCitationsFromMap(citationMap) {
  return Array.from(citationMap.values()).filter((item) => item?.url);
}

export async function POST(req) {
  let writePermitTime = null;

  try {
    const contentLength = req.headers.get("content-length");
    if (contentLength && Number(contentLength) > MAX_REQUEST_BYTES) {
      return Response.json({ error: "Request too large" }, { status: 413 });
    }

    let body;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "Invalid JSON in request body" }, { status: 400 });
    }

    const { prompt, model, config, history, historyLimit, conversationId, mode, messages, settings, userMessageId, modelMessageId } = body;

    if (!model || typeof model !== "string") {
      return Response.json({ error: "Model is required" }, { status: 400 });
    }
    if (typeof prompt !== "string") {
      return Response.json({ error: "Prompt is required" }, { status: 400 });
    }
    if (!Array.isArray(history)) {
      return Response.json({ error: "history must be an array" }, { status: 400 });
    }
    if (!isBailianChatModel(model)) {
      return Response.json({ error: "unsupported model" }, { status: 400 });
    }

    const auth = await getAuthPayload();
    if (!auth) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const clientIP = getClientIP(req);
    const rateLimitKey = `chat:${auth.userId}:${clientIP}`;
    const { success, resetTime } = rateLimit(rateLimitKey, CHAT_RATE_LIMIT);
    if (!success) {
      const retryAfter = Math.ceil((resetTime - Date.now()) / 1000);
      return Response.json(
        { error: "请求过于频繁，请稍后再试" },
        { status: 429, headers: { "Retry-After": String(retryAfter), "X-RateLimit-Remaining": "0" } }
      );
    }

    let user = null;
    try {
      await dbConnect();
      const userDoc = await User.findById(auth.userId);
      if (!userDoc) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }
      user = auth;
    } catch (dbError) {
      logError("ai.bailian", "connect database", dbError);
      return Response.json({ error: "Database connection failed" }, { status: 500 });
    }

    let currentConversationId = conversationId;
    let currentConversation = await loadConversationForRoute({
      conversationId: currentConversationId,
      userId: user.userId,
      expectedProvider: getModelConfig(model)?.provider,
    });
    let createdConversationForRequest = false;
    let previousMessages = Array.isArray(currentConversation?.messages) ? currentConversation.messages : [];
    let previousUpdatedAt = currentConversation?.updatedAt ? new Date(currentConversation.updatedAt) : new Date();

    const bailianClient = createBailianOpenAIClient();
    const apiModel = model;

    const currentAttachments = Array.isArray(config?.attachments)
      ? config.attachments.filter((item) => getAttachmentInputType(item?.category) === "file" && isNonEmptyString(item?.url))
      : [];

    const limit = Number.parseInt(historyLimit, 10);
    if (!Number.isFinite(limit) || limit < 0) {
      return Response.json({ error: "historyLimit invalid" }, { status: 400 });
    }

    const isRegenerateMode = mode === "regenerate" && user && currentConversationId && Array.isArray(messages);
    const resolvedUserMessageId = (typeof userMessageId === "string" && userMessageId.trim()) ? userMessageId.trim() : generateMessageId();
    const resolvedModelMessageId = (typeof modelMessageId === "string" && modelMessageId.trim()) ? modelMessageId.trim() : generateMessageId();

    let qwenMessages = [];
    let storedMessagesForRegenerate = null;
    let previousResponseId = "";

    const collectAttachmentUrls = (msgs) => msgs.flatMap((msg) =>
      Array.isArray(msg?.parts)
        ? msg.parts
          .map((part) => part?.fileData)
          .filter((file) => getAttachmentInputType(file?.category) === "file" && isNonEmptyString(file?.url))
          .map((file) => file.url)
        : []
    );

    if (isRegenerateMode) {
      let sanitized;
      try {
        sanitized = sanitizeStoredMessagesStrict(messages);
      } catch (e) {
        return Response.json({ error: e?.message || "messages invalid" }, { status: 400 });
      }
      sanitized = await enrichStoredMessagesWithBlobIds(sanitized, { userId: user.userId });
      const regenerateTime = new Date();
      const conv = await Conversation.findOneAndUpdate(
        { _id: currentConversationId, userId: user.userId },
        { $set: { messages: sanitized, updatedAt: regenerateTime } },
        { new: true }
      ).select("messages updatedAt");
      if (!conv) return Response.json({ error: "Not found" }, { status: 404 });
      storedMessagesForRegenerate = sanitized;
      writePermitTime = conv.updatedAt?.getTime?.();

      const msgs = storedMessagesForRegenerate;
      const historyBeforeCurrentPrompt = Array.isArray(msgs) && msgs[msgs.length - 1]?.role === "user" ? msgs.slice(0, -1) : msgs;
      const currentTurn = Array.isArray(msgs) && msgs[msgs.length - 1]?.role === "user" ? [msgs[msgs.length - 1]] : [];
      previousResponseId = getStoredBailianResponseId(historyBeforeCurrentPrompt);
      const effectiveHistory = previousResponseId
        ? []
        : ((limit > 0) ? historyBeforeCurrentPrompt.slice(-limit) : historyBeforeCurrentPrompt);
      const inputMessages = [...effectiveHistory, ...currentTurn];
      const fileTextMap = await prepareDocumentAttachmentMapByUrls(collectAttachmentUrls(inputMessages), {
        userId: user.userId, conversationId: currentConversationId, signal: req?.signal,
      });
      qwenMessages = await buildBailianMessagesFromHistory(inputMessages, { fileTextMap });
    } else {
      previousResponseId = getStoredBailianResponseId(previousMessages);
      if (!previousResponseId) {
        const effectiveHistory = (limit > 0) ? history.slice(-limit) : history;
        const fileTextMap = await prepareDocumentAttachmentMapByUrls(collectAttachmentUrls(effectiveHistory), {
          userId: user.userId, conversationId: currentConversationId, signal: req?.signal,
        });
        qwenMessages = await buildBailianMessagesFromHistory(effectiveHistory, { fileTextMap });
      }
    }

    const userSystemPrompt = parseSystemPrompt(config?.systemPrompt);
    const systemPromptSuffix = parseSystemPrompt(config?.systemPromptSuffix);

    const webSearchConfig = parseWebSearchConfig(config?.webSearch);
    const enableWebSearch = parseWebSearchEnabled(config?.webSearch);

    if (user && !currentConversationId) {
      const titleSource = isNonEmptyString(prompt) ? prompt : (currentAttachments[0]?.name || (config?.images?.length ? "图片对话" : "New Chat"));
      const title = titleSource.length > 30 ? `${titleSource.substring(0, 30)}...` : titleSource;
      const newConv = await Conversation.create({
        userId: user.userId,
        title,
        model,
        settings: {
          ...(settings && typeof settings === "object" ? settings : {}),
          webSearch: webSearchConfig,
        },
        messages: [],
      });
      currentConversationId = newConv._id.toString();
      currentConversation = newConv.toObject();
      createdConversationForRequest = true;
      previousMessages = [];
      previousUpdatedAt = currentConversation?.updatedAt ? new Date(currentConversation.updatedAt) : new Date();
    }

    let dbImageEntries = [];
    let attachmentEntries = [];
    if (!isRegenerateMode) {
      let fileTextMap = new Map();
      if (currentAttachments.length > 0) {
        fileTextMap = await prepareDocumentAttachmentMapByUrls(
          currentAttachments.map((item) => item.url),
          { userId: user.userId, conversationId: currentConversationId, signal: req?.signal }
        );
        attachmentEntries = currentAttachments.filter((item) => fileTextMap.has(item.url));
      }
      if (Array.isArray(config?.images)) {
        dbImageEntries = config.images.filter((img) => img?.url).map((img) => ({ url: img.url, mimeType: img.mimeType || "image/jpeg" }));
      }

      const currentContent = await buildCurrentUserMessage({
        prompt,
        images: config?.images,
        attachments: attachmentEntries,
        fileTextMap,
      });
      if (currentContent.length === 0) {
        return Response.json({ error: "请至少输入内容或上传附件" }, { status: 400 });
      }
      qwenMessages.push({
        role: "user",
        content: normalizeOpenAIMessageContentParts(currentContent),
      });

      if (user) {
        const storedUserParts = [];
        if (isNonEmptyString(prompt)) storedUserParts.push({ text: prompt });
        for (const entry of dbImageEntries) {
          storedUserParts.push({ inlineData: { mimeType: entry.mimeType, url: entry.url } });
        }
        for (const attachment of attachmentEntries) {
          storedUserParts.push({
            fileData: {
              url: attachment.url, name: attachment.name, mimeType: attachment.mimeType,
              size: attachment.size, extension: attachment.extension, category: attachment.category,
            },
          });
        }
        const enrichedStoredUserParts = await enrichConversationPartsWithBlobIds(storedUserParts, { userId: user.userId });
        const userMsgTime = new Date();
        const userMessage = {
          id: resolvedUserMessageId, role: "user", content: prompt, type: "parts", parts: enrichedStoredUserParts,
        };
        const updatedConv = await Conversation.findOneAndUpdate(
          { _id: currentConversationId, userId: user.userId },
          { $push: { messages: userMessage }, updatedAt: userMsgTime },
          { new: true }
        ).select("updatedAt");
        if (!updatedConv) {
          return Response.json({ error: "Not found" }, { status: 404 });
        }
        writePermitTime = updatedConv.updatedAt?.getTime?.() ?? userMsgTime.getTime();
      }
    }

    const encoder = new TextEncoder();
    let clientAborted = false;
    const onAbort = () => { clientAborted = true; };
    try { req?.signal?.addEventListener?.("abort", onAbort, { once: true }); } catch { /* ignore */ }

    let paddingSent = false;
    let heartbeatTimer = null;

    const responseStream = new ReadableStream({
      async start(controller) {
        let fullText = "";
        let fullThought = "";
        let finalUsage = null;
        let finalResponseId = "";
        let finalToolUsage = null;
        const toolRuns = new Map();
        const citationMap = new Map();
        const responseToolRounds = new Map();
        let searchRound = 0;
        let readerRound = 0;
        let finalMessagePersisted = false;

        const addCitation = (url, title = "") => {
          if (typeof url !== "string" || !url.trim()) return;
          const cleanUrl = url.trim();
          if (!citationMap.has(cleanUrl)) {
            citationMap.set(cleanUrl, { url: cleanUrl, title: typeof title === "string" ? title : "" });
          }
        };

        const patchToolRun = (id, patch) => {
          if (typeof id !== "string" || !id.trim()) return;
          const key = id.trim();
          const current = toolRuns.get(key) || { id: key };
          toolRuns.set(key, { ...current, ...patch });
        };

        const sourcesToResults = (sources) => {
          if (!Array.isArray(sources)) return [];
          return sources
            .map((source) => {
              const url = typeof source?.url === "string" ? source.url.trim() : "";
              if (!url) return null;
              const title = typeof source?.title === "string" && source.title.trim() ? source.title.trim() : url;
              addCitation(url, title);
              return { title, url };
            })
            .filter(Boolean);
        };

        const urlsToResults = (urls) => {
          if (!Array.isArray(urls)) return [];
          return urls
            .map((url) => (typeof url === "string" ? url.trim() : ""))
            .filter(Boolean)
            .map((url) => {
              addCitation(url, url);
              return { title: url, url };
            });
        };

        const handleOutputItemAdded = (item, sendEvent) => {
          if (!item || typeof item !== "object") return;
          if (item.type === "web_search_call") {
            const round = searchRound + 1;
            searchRound = round;
            responseToolRounds.set(item.id, round);
            const query = typeof item.action?.query === "string" ? item.action.query : "联网搜索";
            patchToolRun(item.id, {
              identifier: WEB_BROWSING_IDENTIFIER,
              apiName: WebBrowsingApiName.search,
              type: "builtin",
              status: "running",
              title: "联网搜索",
              arguments: { query },
              startedAt: new Date().toISOString(),
            });
            sendEvent({ type: "search_start", query, round });
          } else if (item.type === "web_extractor_call") {
            const round = readerRound + 1;
            readerRound = round;
            responseToolRounds.set(item.id, round);
            const urls = Array.isArray(item.urls) ? item.urls.filter((url) => typeof url === "string" && url.trim()) : [];
            const url = urls[0] || "";
            patchToolRun(item.id, {
              identifier: WEB_BROWSING_IDENTIFIER,
              apiName: WebBrowsingApiName.crawlSinglePage,
              type: "builtin",
              status: "running",
              title: "网页阅读",
              arguments: { urls, goal: item.goal || "" },
              startedAt: new Date().toISOString(),
            });
            sendEvent({ type: "page_fetch_start", url, round });
          }
        };

        const handleOutputItemDone = (item, sendEvent) => {
          if (!item || typeof item !== "object") return;
          if (item.type === "web_search_call") {
            const query = typeof item.action?.query === "string" ? item.action.query : "联网搜索";
            const sources = Array.isArray(item.action?.sources) ? item.action.sources : [];
            const results = sourcesToResults(sources);
            const round = responseToolRounds.get(item.id) || searchRound || 1;
            patchToolRun(item.id, {
              status: "success",
              summary: results.map((result) => result.url).join("\n"),
              state: { results },
              citations: results,
              finishedAt: new Date().toISOString(),
            });
            sendEvent({ type: "search_result", query, results, round });
          } else if (item.type === "web_extractor_call") {
            const urls = Array.isArray(item.urls) ? item.urls.filter((url) => typeof url === "string" && url.trim()) : [];
            const results = urlsToResults(urls);
            const round = responseToolRounds.get(item.id) || readerRound || 1;
            patchToolRun(item.id, {
              status: "success",
              summary: typeof item.output === "string" ? item.output : "",
              content: typeof item.output === "string" ? item.output : "",
              state: { results },
              citations: results,
              finishedAt: new Date().toISOString(),
            });
            sendEvent({ type: "page_fetch_result", url: urls[0] || "", results, round });
          }
        };

        const rollbackCurrentTurn = async () => {
          if (finalMessagePersisted) return;
          await rollbackConversationTurn({
            conversationId: currentConversationId,
            userId: user.userId,
            createdConversationForRequest,
            isRegenerateMode,
            previousMessages,
            previousUpdatedAt,
            userMessageId: resolvedUserMessageId,
            writePermitTime,
          });
        };

        try {
          const sendHeartbeat = () => {
            try { if (!clientAborted) controller.enqueue(encoder.encode(`: ping ${Date.now()}\n\n`)); } catch { /* ignore */ }
          };
          heartbeatTimer = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
          sendHeartbeat();

          const sendEvent = (payload) => {
            const padding = !paddingSent ? SSE_PADDING : "";
            paddingSent = true;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}${padding}\n\n`));
          };

          const systemPrompt = await buildDirectChatSystemPrompt({
            userSystemPrompt, systemPromptSuffix, enableWebSearch, searchContextSection: "",
          });
          const tools = enableWebSearch
            ? [{ type: "web_search" }, { type: "web_extractor" }]
            : undefined;

          const stream = await bailianClient.responses.create(
            buildQwenResponsesRequest({
              model: apiModel,
              input: qwenMessages,
              instructions: systemPrompt,
              previousResponseId,
              stream: true,
              reasoningEffort: "high",
              tools,
            }),
            { signal: req?.signal }
          );

          for await (const chunk of stream) {
            if (clientAborted) break;

            if (chunk?.type === "response.output_text.delta") {
              const delta = typeof chunk.delta === "string" ? chunk.delta : "";
              if (delta) {
                fullText += delta;
                sendEvent({ type: "text", content: delta });
              }
              continue;
            }

            if (chunk?.type === "response.reasoning_summary_text.delta") {
              const delta = typeof chunk.delta === "string" ? chunk.delta : "";
              if (delta) {
                fullThought += delta;
                sendEvent({ type: "thought", content: delta });
              }
              continue;
            }

            if (chunk?.type === "response.output_item.added") {
              handleOutputItemAdded(chunk.item, sendEvent);
              continue;
            }

            if (chunk?.type === "response.output_item.done") {
              handleOutputItemDone(chunk.item, sendEvent);
              continue;
            }

            if (chunk?.type === "response.completed") {
              finalUsage = getResponsesCompletedUsage(chunk);
              finalResponseId = typeof chunk.response?.id === "string" ? chunk.response.id : "";
              finalToolUsage = chunk.response?.usage?.x_tools && typeof chunk.response.usage.x_tools === "object"
                ? chunk.response.usage.x_tools
                : null;
            }
          }

          if (clientAborted) {
            await rollbackCurrentTurn();
            try { controller.close(); } catch { /* ignore */ }
            return;
          }

          fullText = fullText.trim();
          fullThought = fullThought.trim();

          const citations = uniqueCitationsFromMap(citationMap);
          if (citations.length > 0) {
            sendEvent({ type: "citations", citations });
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));

          if (user && currentConversationId) {
            const providerState = buildBailianResponsesProviderState({
              responseId: finalResponseId,
              previousResponseId,
              usage: finalUsage,
              tools: finalToolUsage,
            });
            const persistedTools = Array.from(toolRuns.values()).filter((tool) => tool?.id && tool?.identifier && tool?.apiName);
            const modelMessage = {
              id: resolvedModelMessageId,
              role: "model",
              content: fullText,
              thought: fullThought,
              citations: citations.length > 0 ? citations : null,
              type: "text",
              parts: [{ text: fullText }],
              ...(providerState ? { providerState } : {}),
              ...(persistedTools.length > 0 ? { tools: persistedTools } : {}),
            };
            const persistedConversation = await Conversation.findOneAndUpdate(
              buildConversationWriteCondition(currentConversationId, user.userId, writePermitTime),
              { $push: { messages: modelMessage }, updatedAt: new Date() },
              { new: true }
            ).select("updatedAt");
            if (!persistedConversation) {
              const conflictError = new Error(CONVERSATION_WRITE_CONFLICT_ERROR);
              conflictError.status = 409;
              throw conflictError;
            }
            finalMessagePersisted = true;
            writePermitTime = persistedConversation.updatedAt?.getTime?.() ?? Date.now();
          }
          controller.close();
        } catch (err) {
          const error = normalizeOpenAIError(err);
          if (clientAborted) {
            try { await rollbackCurrentTurn(); } catch { /* ignore */ }
            try { controller.close(); } catch { /* ignore */ }
            return;
          }
          try { await rollbackCurrentTurn(); } catch { /* ignore */ }
          try {
            const errorPayload = JSON.stringify({ type: "stream_error", message: error?.message || "Unknown error" });
            const padding = !paddingSent ? SSE_PADDING : "";
            paddingSent = true;
            controller.enqueue(encoder.encode(`data: ${errorPayload}${padding}\n\n`));
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          } catch {
            controller.error(error);
          }
        } finally {
          if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
          try { req?.signal?.removeEventListener?.("abort", onAbort); } catch { /* ignore */ }
        }
      },
    });

    const headers = {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    };
    if (currentConversationId) {
      headers["X-Conversation-Id"] = currentConversationId;
    }
    return new Response(responseStream, { headers });

  } catch (error) {
    logError("ai.bailian", "handle chat request", error, { status: error?.status, code: error?.code });
    const rawStatus = typeof error?.status === "number" ? error.status : 500;
    const isUpstreamAuthError = rawStatus === 401;
    const status = isUpstreamAuthError ? 500 : rawStatus;
    let errorMessage = error?.message;
    if (isUpstreamAuthError) {
      errorMessage = "模型服务认证失败，请检查百炼接口配置";
    } else if (error?.message?.includes("API_KEY") || error?.message?.includes("DASHSCOPE")) {
      errorMessage = "API configuration error. Please check your API keys.";
    }
    return Response.json({ error: errorMessage }, { status });
  }
}
