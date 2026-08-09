import dbConnect from "@/lib/ai/db";
import { ConversationStore as Conversation, UserStore as User } from "@/lib/ai/server/store";
import { getAuthPayload } from "@/lib/ai/auth";
import { rateLimit, getClientIP } from "@/lib/ai/rateLimit";
import {
  getModelConfig,
  isBailianChatModel,
  isPrimaryChatModelId,
  modelSupportsAvailableInput,
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
import { prepareDocumentAttachmentMapByFiles } from "@/lib/ai/server/files/service";
import {
  resolveMessagesWithStoredFiles,
  resolveStoredFileDescriptorsForUser,
} from "@/lib/storage/access";
import { buildDirectChatSystemPrompt } from "@/lib/ai/server/chat/systemPromptBuilder";
import {
  parseSystemPrompt,
  parseWebSearchConfig,
} from "@/lib/ai/server/chat/requestConfig";
import {
  buildChatCompletionsRequest,
  createBailianOpenAIClient,
  getChatCompletionChunkDelta,
  getChatCompletionChunkThoughtDelta,
  getChatCompletionCompletedUsage,
  getChatCompletionMessage,
  getChatCompletionToolCalls,
  normalizeOpenAIError,
} from "@/lib/ai/server/bailian/openai";
import {
  executeFirecrawlChatTool,
  FIRECRAWL_CHAT_TOOLS,
} from "@/lib/ai/server/chat/firecrawlTools";
import {
  buildChatMessagesFromHistory,
  buildCurrentUserMessage,
  normalizeOpenAIMessageContentParts,
} from "@/app/api/ai/chat/chatHelpers";
import {
  CHAT_RATE_LIMIT,
  MAX_REQUEST_BYTES,
  SSE_PADDING,
  HEARTBEAT_INTERVAL_MS,
} from "@/lib/ai/server/chat/routeConstants";
import { logError } from "@/lib/logger";
import { getPublicRequestOrigin } from "@/lib/request-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function buildChatProviderState({ completionId, usage }) {
  const state = {};
  if (typeof completionId === "string" && completionId.trim()) state.completionId = completionId.trim();
  if (usage && typeof usage === "object" && !Array.isArray(usage)) state.usage = usage;
  if (Object.keys(state).length === 0) return undefined;
  return { bailianChatCompletions: state };
}

function assertMessageInputsSupported(messages, model) {
  for (const message of Array.isArray(messages) ? messages : []) {
    for (const part of Array.isArray(message?.parts) ? message.parts : []) {
      if (part?.inlineData && !modelSupportsAvailableInput(model, "image")) {
        throw new Error("当前模型不支持历史消息中的图片");
      }
      if (part?.fileData) {
        const inputType = getAttachmentInputType(part.fileData.category);
        if (!inputType || !modelSupportsAvailableInput(model, inputType)) {
          throw new Error("当前模型不支持历史消息中的附件");
        }
      }
    }
  }
}

export async function POST(req) {
  let writePermitTime = null;
  let providerLogScope = "ai.chat";
  let providerDisplayName = "模型服务";

  try {
    const publicOrigin = getPublicRequestOrigin(req);
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
    if (!isPrimaryChatModelId(model)) {
      return Response.json({ error: "unsupported model" }, { status: 400 });
    }

    const usesBailian = isBailianChatModel(model);
    if (!usesBailian) {
      return Response.json({ error: "unsupported model" }, { status: 400 });
    }
    providerLogScope = "ai.bailian";
    providerDisplayName = "阿里云百炼";

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
      logError(providerLogScope, "connect database", dbError);
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

    const openAIClient = createBailianOpenAIClient();
    const apiModel = model;

    let trustedHistory;
    let currentAttachments = [];
    let currentImages = [];
    try {
      trustedHistory = await resolveMessagesWithStoredFiles(sanitizeStoredMessagesStrict(history), user.userId);
      assertMessageInputsSupported(trustedHistory, model);
      const requestedAttachments = Array.isArray(config?.attachments)
        ? config.attachments
        : [];
      const requestedImages = Array.isArray(config?.images) ? config.images : [];
      currentAttachments = requestedAttachments.length
        ? await resolveStoredFileDescriptorsForUser(requestedAttachments, user.userId)
        : [];
      currentImages = requestedImages.length
        ? await resolveStoredFileDescriptorsForUser(requestedImages, user.userId)
        : [];
      if (currentAttachments.some((item) => !["file", "video"].includes(getAttachmentInputType(item.category)))) {
        throw new Error("附件类型无效");
      }
      if (currentImages.some((item) => item.category !== "image")) {
        throw new Error("图片附件类型无效");
      }
      if (currentImages.length > 0 && !modelSupportsAvailableInput(model, "image")) {
        throw new Error("当前模型不支持图片");
      }
      if (
        currentAttachments.some((item) => {
          const inputType = getAttachmentInputType(item.category);
          return !modelSupportsAvailableInput(model, inputType);
        })
      ) {
        throw new Error("当前模型不支持这类附件");
      }
    } catch (error) {
      return Response.json({ error: error?.message || "附件无效" }, { status: 400 });
    }

    const limit = Number.parseInt(historyLimit, 10);
    if (!Number.isFinite(limit) || limit < 0) {
      return Response.json({ error: "historyLimit invalid" }, { status: 400 });
    }

    const isRegenerateMode = mode === "regenerate" && user && currentConversationId && Array.isArray(messages);
    const resolvedUserMessageId = (typeof userMessageId === "string" && userMessageId.trim()) ? userMessageId.trim() : generateMessageId();
    const resolvedModelMessageId = (typeof modelMessageId === "string" && modelMessageId.trim()) ? modelMessageId.trim() : generateMessageId();

    let chatMessages = [];
    let storedMessagesForRegenerate = null;

    const collectAttachmentFiles = (msgs) => msgs.flatMap((msg) =>
      Array.isArray(msg?.parts)
        ? msg.parts
          .map((part) => part?.fileData)
          .filter((file) => getAttachmentInputType(file?.category) === "file" && isNonEmptyString(file?.fileId))
        : []
    );

    if (isRegenerateMode) {
      let sanitized;
      try {
        sanitized = sanitizeStoredMessagesStrict(messages);
      } catch (e) {
        return Response.json({ error: e?.message || "messages invalid" }, { status: 400 });
      }
      sanitized = await resolveMessagesWithStoredFiles(sanitized, user.userId);
      assertMessageInputsSupported(sanitized, model);
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
      const effectiveHistory = (limit > 0) ? historyBeforeCurrentPrompt.slice(-limit) : historyBeforeCurrentPrompt;
      const inputMessages = [...effectiveHistory, ...currentTurn];
      const fileTextMap = await prepareDocumentAttachmentMapByFiles(collectAttachmentFiles(inputMessages), {
        userId: user.userId, conversationId: currentConversationId, signal: req?.signal,
      });
      chatMessages = await buildChatMessagesFromHistory(inputMessages, { fileTextMap, publicOrigin });
    } else {
      const effectiveHistory = (limit > 0) ? trustedHistory.slice(-limit) : trustedHistory;
      const fileTextMap = await prepareDocumentAttachmentMapByFiles(collectAttachmentFiles(effectiveHistory), {
        userId: user.userId, conversationId: currentConversationId, signal: req?.signal,
      });
      chatMessages = await buildChatMessagesFromHistory(effectiveHistory, { fileTextMap, publicOrigin });
    }

    const userSystemPrompt = parseSystemPrompt(config?.systemPrompt);
    const systemPromptSuffix = parseSystemPrompt(config?.systemPromptSuffix);
    const webSearchConfig = parseWebSearchConfig(config?.webSearch);

    if (user && !currentConversationId) {
      const titleSource = isNonEmptyString(prompt) ? prompt : (currentAttachments[0]?.name || (currentImages.length ? "图片对话" : "New Chat"));
      const title = titleSource.length > 30 ? `${titleSource.substring(0, 30)}...` : titleSource;
      const newConv = await Conversation.create({
        userId: user.userId,
        title,
        model,
        settings: settings && typeof settings === "object" ? settings : {},
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
      const currentDocumentAttachments = currentAttachments.filter(
        (item) => getAttachmentInputType(item.category) === "file"
      );
      const currentVideoAttachments = currentAttachments.filter(
        (item) => getAttachmentInputType(item.category) === "video"
      );
      if (currentDocumentAttachments.length > 0) {
        fileTextMap = await prepareDocumentAttachmentMapByFiles(
          currentDocumentAttachments,
          { userId: user.userId, conversationId: currentConversationId, signal: req?.signal }
        );
        attachmentEntries = currentDocumentAttachments.filter((item) => fileTextMap.has(item.url));
      }
      attachmentEntries.push(...currentVideoAttachments);
      dbImageEntries = currentImages;

      const currentContent = await buildCurrentUserMessage({
        prompt,
        images: currentImages,
        attachments: attachmentEntries,
        fileTextMap,
        publicOrigin,
      });
      if (currentContent.length === 0) {
        return Response.json({ error: "请至少输入内容或上传附件" }, { status: 400 });
      }
      chatMessages.push({
        role: "user",
        content: normalizeOpenAIMessageContentParts(currentContent),
      });

      if (user) {
        const storedUserParts = [];
        if (isNonEmptyString(prompt)) storedUserParts.push({ text: prompt });
        for (const entry of dbImageEntries) {
          storedUserParts.push({ inlineData: { fileId: entry.fileId, mimeType: entry.mimeType, url: entry.url } });
        }
        for (const attachment of attachmentEntries) {
          storedUserParts.push({
            fileData: {
              fileId: attachment.fileId, url: attachment.url, name: attachment.name, mimeType: attachment.mimeType,
              size: attachment.size, extension: attachment.extension, category: attachment.category,
            },
          });
        }
        const userMsgTime = new Date();
        const userMessage = {
          id: resolvedUserMessageId, role: "user", content: prompt, type: "parts", parts: storedUserParts,
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
        let finalCompletionId = "";
        let finalMessagePersisted = false;
        let finalCitations = [];
        let finalTools = [];
        let searchContextTokens = 0;

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
            userSystemPrompt,
            systemPromptSuffix,
            enableWebSearch: webSearchConfig.enabled,
            searchContextSection: "",
          });

          let responseMessages = chatMessages;

          if (webSearchConfig.enabled) {
            responseMessages = [...chatMessages];
            let toolCallsUsed = 0;

            while (toolCallsUsed < 5) {
              const toolResponse = await openAIClient.chat.completions.create(
                buildChatCompletionsRequest({
                  model: apiModel,
                  messages: responseMessages,
                  system: systemPrompt,
                  stream: false,
                  reasoningEffort: "medium",
                  tools: FIRECRAWL_CHAT_TOOLS,
                  toolChoice: "auto",
                }),
                { signal: req?.signal }
              );

              if (typeof toolResponse?.id === "string" && toolResponse.id.trim()) {
                finalCompletionId = toolResponse.id.trim();
              }
              const toolUsage = getChatCompletionCompletedUsage(toolResponse);
              if (toolUsage) finalUsage = toolUsage;

              const assistantMessage = getChatCompletionMessage(toolResponse);
              const calls = getChatCompletionToolCalls(toolResponse);
              const reasoningText = typeof assistantMessage?.reasoning === "string"
                ? assistantMessage.reasoning
                : typeof assistantMessage?.reasoning_content === "string"
                  ? assistantMessage.reasoning_content
                  : "";
              if (reasoningText) {
                fullThought += reasoningText;
                sendEvent({ type: "thought", content: reasoningText });
              }

              if (calls.length === 0) {
                break;
              }

              const assistantToolMessage = {
                role: "assistant",
                content: assistantMessage?.content || "",
                tool_calls: calls,
                ...(typeof assistantMessage?.reasoning === "string"
                  ? { reasoning: assistantMessage.reasoning }
                  : {}),
                ...(Array.isArray(assistantMessage?.reasoning_details)
                  ? { reasoning_details: assistantMessage.reasoning_details }
                  : {}),
              };
              responseMessages.push(assistantToolMessage);

              for (const call of calls) {
                if (toolCallsUsed >= 5) {
                  responseMessages.push({
                    role: "tool",
                    tool_call_id: call.id,
                    name: call?.function?.name || "",
                    content: JSON.stringify({ error: "联网工具最多调用五次" }),
                  });
                  continue;
                }

                toolCallsUsed += 1;
                const round = toolCallsUsed;
                let callArgs = {};
                try {
                  callArgs = JSON.parse(call?.function?.arguments || "{}");
                } catch {
                  callArgs = {};
                }
                const isSearch = call?.function?.name === "firecrawl_search";
                const query = typeof callArgs?.query === "string" ? callArgs.query.trim() : "";
                const url = typeof callArgs?.url === "string" ? callArgs.url.trim() : "";

                sendEvent(isSearch
                  ? { type: "search_start", query, round, toolId: call.id }
                  : { type: "page_fetch_start", url, round, toolId: call.id });

                let execution;
                try {
                  execution = await executeFirecrawlChatTool(call);
                } catch (toolError) {
                  const message = toolError instanceof Error ? toolError.message : "Firecrawl 联网失败";
                  sendEvent(isSearch
                    ? { type: "search_error", query, round, message, toolId: call.id }
                    : { type: "page_fetch_error", url, round, message, toolId: call.id });
                  throw toolError;
                }

                const publicResults = execution.results.map((item) => ({
                  title: item.title,
                  url: item.url,
                  content: item.content || item.raw_content || "",
                  score: item.score ?? null,
                  favicon: item.favicon || "",
                }));
                sendEvent(execution.apiName === "search"
                  ? { type: "search_result", query: execution.args.query, round, results: publicResults, toolId: call.id }
                  : { type: "page_fetch_result", url: execution.args.url || "", round, results: publicResults, toolId: call.id });

                const knownCitationUrls = new Set(finalCitations.map((item) => item.url));
                for (const citation of execution.citations) {
                  if (!knownCitationUrls.has(citation.url)) {
                    knownCitationUrls.add(citation.url);
                    finalCitations.push(citation);
                  }
                }
                finalTools.push(execution.tool);
                searchContextTokens += Math.ceil(JSON.stringify(execution.modelResult).length / 4);
                sendEvent({ type: "citations", citations: finalCitations });
                sendEvent({ type: "tool_result", tool: execution.tool });

                responseMessages.push({
                  role: "tool",
                  tool_call_id: call.id,
                  name: call?.function?.name || "",
                  content: JSON.stringify(execution.modelResult),
                });
              }
            }
          }

          finalCompletionId = "";
          finalUsage = null;
          const stream = await openAIClient.chat.completions.create(
            buildChatCompletionsRequest({
              model: apiModel,
              messages: responseMessages,
              system: systemPrompt,
              stream: true,
            }),
            { signal: req?.signal }
          );

          for await (const chunk of stream) {
            if (clientAborted) break;

            if (typeof chunk?.id === "string" && chunk.id.trim()) {
              finalCompletionId = chunk.id.trim();
            }

            const delta = getChatCompletionChunkDelta(chunk);
            const textDelta = typeof delta?.content === "string" ? delta.content : "";
            if (textDelta) {
              fullText += textDelta;
              sendEvent({ type: "text", content: textDelta });
            }

            const thoughtDelta = getChatCompletionChunkThoughtDelta(chunk);
            if (thoughtDelta) {
              fullThought += thoughtDelta;
              sendEvent({ type: "thought", content: thoughtDelta });
            }

            const usage = getChatCompletionCompletedUsage(chunk);
            if (usage) {
              finalUsage = usage;
            }
          }

          if (clientAborted) {
            await rollbackCurrentTurn();
            try { controller.close(); } catch { /* ignore */ }
            return;
          }

          fullText = fullText.trim();
          fullThought = fullThought.trim();

          if (searchContextTokens > 0) {
            sendEvent({ type: "search_context_tokens", tokens: searchContextTokens });
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));

          if (user && currentConversationId) {
            const providerState = buildChatProviderState({
              completionId: finalCompletionId,
              usage: finalUsage,
            });
            const modelMessage = {
              id: resolvedModelMessageId,
              role: "model",
              content: fullText,
              thought: fullThought,
              type: "text",
              parts: [{ text: fullText }],
              ...(finalCitations.length > 0 ? { citations: finalCitations } : {}),
              ...(finalTools.length > 0 ? { tools: finalTools } : {}),
              ...(searchContextTokens > 0 ? { searchContextTokens } : {}),
              ...(providerState ? { providerState } : {}),
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
    logError(providerLogScope, "handle chat request", error, { status: error?.status, code: error?.code });
    const rawStatus = typeof error?.status === "number" ? error.status : 500;
    const isUpstreamAuthError = rawStatus === 401;
    const status = isUpstreamAuthError ? 500 : rawStatus;
    let errorMessage = error?.message;
    if (isUpstreamAuthError) {
      errorMessage = `模型服务认证失败，请检查 ${providerDisplayName} 接口配置`;
    } else if (error?.message?.includes("API_KEY") || error?.message?.includes("DASHSCOPE")) {
      errorMessage = "API configuration error. Please check your API keys.";
    }
    return Response.json({ error: errorMessage }, { status });
  }
}
