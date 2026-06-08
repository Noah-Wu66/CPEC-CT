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
import {
  buildQwenChatRequest,
  createBailianOpenAIClient,
  getOpenAIReasoningText,
  getQwenMaxCompletionTokens,
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

function buildUsageProviderState(usage) {
  if (!usage || typeof usage !== "object" || Array.isArray(usage)) return undefined;
  return { bailianOpenAI: { usage } };
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
      const effectiveHistory = (limit > 0) ? historyBeforeCurrentPrompt.slice(-limit) : historyBeforeCurrentPrompt;
      const currentTurn = Array.isArray(msgs) && msgs[msgs.length - 1]?.role === "user" ? [msgs[msgs.length - 1]] : [];
      const allForAttachments = [...effectiveHistory, ...currentTurn];
      const fileTextMap = await prepareDocumentAttachmentMapByUrls(collectAttachmentUrls(allForAttachments), {
        userId: user.userId, conversationId: currentConversationId, signal: req?.signal,
      });
      qwenMessages = await buildBailianMessagesFromHistory(allForAttachments, { fileTextMap });
    } else {
      const effectiveHistory = (limit > 0) ? history.slice(-limit) : history;
      const fileTextMap = await prepareDocumentAttachmentMapByUrls(collectAttachmentUrls(effectiveHistory), {
        userId: user.userId, conversationId: currentConversationId, signal: req?.signal,
      });
      qwenMessages = await buildBailianMessagesFromHistory(effectiveHistory, { fileTextMap });
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
        let finalMessagePersisted = false;

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
          const requestMessages = systemPrompt.trim()
            ? [{ role: "system", content: systemPrompt }, ...qwenMessages]
            : qwenMessages;

          const stream = await bailianClient.chat.completions.create(
            buildQwenChatRequest({
              model: apiModel,
              messages: requestMessages,
              stream: true,
              maxCompletionTokens: getQwenMaxCompletionTokens(),
            }),
            { signal: req?.signal }
          );

          for await (const chunk of stream) {
            if (clientAborted) break;

            if (chunk?.usage) {
              finalUsage = chunk.usage;
            }

            const delta = chunk?.choices?.[0]?.delta;
            if (!delta) continue;

            const reasoningChunk = getOpenAIReasoningText(delta);
            if (reasoningChunk) {
              fullThought += reasoningChunk;
              sendEvent({ type: "thought", content: reasoningChunk });
            }

            if (typeof delta.content === "string" && delta.content) {
              fullText += delta.content;
              sendEvent({ type: "text", content: delta.content });
            }
          }

          if (clientAborted) {
            await rollbackCurrentTurn();
            try { controller.close(); } catch { /* ignore */ }
            return;
          }

          fullText = fullText.trim();
          fullThought = fullThought.trim();

          controller.enqueue(encoder.encode("data: [DONE]\n\n"));

          if (user && currentConversationId) {
            const providerState = buildUsageProviderState(finalUsage);
            const modelMessage = {
              id: resolvedModelMessageId,
              role: "model",
              content: fullText,
              thought: fullThought,
              citations: null,
              type: "text",
              parts: [{ text: fullText }],
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
