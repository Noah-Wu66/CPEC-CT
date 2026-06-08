import dbConnect from "@/lib/ai/db";
import { ConversationStore as Conversation, UserStore as User } from "@/lib/ai/server/store";
import { getAuthPayload } from "@/lib/ai/auth";
import { rateLimit, getClientIP } from "@/lib/ai/rateLimit";
import {
  generateMessageId,
  isNonEmptyString,
} from "@/app/api/ai/chat/utils";
import {
  loadConversationForRoute,
  rollbackConversationTurn,
  buildConversationWriteCondition,
  CONVERSATION_WRITE_CONFLICT_ERROR,
} from "@/app/api/ai/chat/conversationState";
import { dashScopeRequest, extractFirstUrl, getTaskId, pollDashScopeTask } from "@/lib/ai/server/bailian/dashscope";
import { WAN_IMAGE_MODEL } from "@/lib/ai/shared/models";
import {
  CHAT_RATE_LIMIT,
  MAX_REQUEST_BYTES,
  SSE_PADDING,
  HEARTBEAT_INTERVAL_MS,
} from "@/lib/ai/server/chat/routeConstants";
import { logError } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeImageSize(value) {
  const ratio = typeof value === "string" ? value.trim() : "";
  if (ratio === "16:9") return "1280*720";
  if (ratio === "9:16") return "720*1280";
  if (ratio === "4:3") return "1024*768";
  if (ratio === "3:4") return "768*1024";
  return "1024*1024";
}

async function generateBailianImage({ prompt, aspectRatio, imageUrls, signal }) {
  const body = {
    model: WAN_IMAGE_MODEL,
    input: {
      prompt,
      ...(Array.isArray(imageUrls) && imageUrls.length > 0 ? { image_url: imageUrls[0] } : {}),
    },
    parameters: {
      n: 1,
      size: normalizeImageSize(aspectRatio),
      prompt_extend: true,
      watermark: false,
    },
  };

  const started = await dashScopeRequest("/services/aigc/multimodal-generation/generation", {
    headers: { "X-DashScope-Async": "enable" },
    body,
    signal,
  });
  const taskId = getTaskId(started);
  if (!taskId) {
    const directUrl = extractFirstUrl(started?.output);
    if (directUrl) return directUrl;
    throw new Error("图片任务创建成功但缺少 task_id");
  }

  const result = await pollDashScopeTask(taskId, { signal, timeoutMs: 15 * 60 * 1000 });
  const imageUrl = extractFirstUrl(result?.output);
  if (!imageUrl) {
    throw new Error("图片生成完成但未返回图片地址");
  }
  return imageUrl;
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

    const { prompt, model, config, conversationId, settings, userMessageId, modelMessageId } = body;

    if (!model || typeof model !== "string") {
      return Response.json({ error: "Model is required" }, { status: 400 });
    }
    if (typeof prompt !== "string" || !prompt.trim()) {
      return Response.json({ error: "请输入图片描述" }, { status: 400 });
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
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
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
      logError("ai.image", "connect database", dbError);
      return Response.json({ error: "Database connection failed" }, { status: 500 });
    }

    let currentConversationId = conversationId;
    let currentConversation = await loadConversationForRoute({
      conversationId: currentConversationId,
      userId: user.userId,
      expectedProvider: "bailian-image",
    });
    let createdConversationForRequest = false;
    let previousMessages = Array.isArray(currentConversation?.messages) ? currentConversation.messages : [];
    let previousUpdatedAt = currentConversation?.updatedAt ? new Date(currentConversation.updatedAt) : new Date();

    const resolvedUserMessageId = (typeof userMessageId === "string" && userMessageId.trim())
      ? userMessageId.trim()
      : generateMessageId();
    const resolvedModelMessageId = (typeof modelMessageId === "string" && modelMessageId.trim())
      ? modelMessageId.trim()
      : generateMessageId();

    const imageUrls = [];
    if (Array.isArray(config?.images) && config.images.length > 0) {
      for (const img of config.images) {
        if (img?.url) imageUrls.push(img.url);
      }
    }

    if (user && !currentConversationId) {
      const title = prompt.length > 30 ? `${prompt.substring(0, 30)}...` : prompt;
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

    if (user) {
      const storedUserParts = [];
      if (isNonEmptyString(prompt)) storedUserParts.push({ text: prompt });
      for (const url of imageUrls) {
        storedUserParts.push({ inlineData: { url, mimeType: "image/jpeg" } });
      }

      const userMsgTime = new Date();
      const userMessage = {
        id: resolvedUserMessageId,
        role: "user",
        content: prompt,
        type: "parts",
        parts: storedUserParts,
      };
      const updatedConv = await Conversation.findOneAndUpdate(
        { _id: currentConversationId, userId: user.userId },
        {
          $push: { messages: userMessage },
          updatedAt: userMsgTime,
        },
        { new: true }
      ).select("updatedAt");
      if (!updatedConv) {
        return Response.json({ error: "Not found" }, { status: 404 });
      }
      writePermitTime = updatedConv.updatedAt?.getTime?.() ?? userMsgTime.getTime();
    }

    const encoder = new TextEncoder();
    let clientAborted = false;
    const onAbort = () => { clientAborted = true; };
    try {
      req?.signal?.addEventListener?.("abort", onAbort, { once: true });
    } catch { /* ignore */ }

    let paddingSent = false;
    let heartbeatTimer = null;

    const responseStream = new ReadableStream({
      async start(controller) {
        let finalMessagePersisted = false;

        const rollbackCurrentTurn = async () => {
          if (finalMessagePersisted) return;
          await rollbackConversationTurn({
            conversationId: currentConversationId,
            userId: user.userId,
            createdConversationForRequest,
            isRegenerateMode: false,
            previousMessages,
            previousUpdatedAt,
            userMessageId: resolvedUserMessageId,
            writePermitTime,
          });
        };

        try {
          const sendHeartbeat = () => {
            try {
              if (clientAborted) return;
              controller.enqueue(encoder.encode(`: ping ${Date.now()}\n\n`));
            } catch { /* ignore */ }
          };
          heartbeatTimer = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
          sendHeartbeat();

          const sendEvent = (payload) => {
            const padding = !paddingSent ? SSE_PADDING : "";
            paddingSent = true;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}${padding}\n\n`));
          };

          sendEvent({ type: "thought", content: "正在生成图片，请稍候..." });

          const imageUrl = await generateBailianImage({
            prompt,
            aspectRatio: config?.imageAspectRatio || config?.imageSize || "1:1",
            imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
            signal: req?.signal,
          });

          if (clientAborted) {
            await rollbackCurrentTurn();
            try { controller.close(); } catch { /* ignore */ }
            return;
          }

          const markdownImage = `![生成的图片](${imageUrl})`;
          sendEvent({ type: "text", content: markdownImage });
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));

          if (user && currentConversationId) {
            const modelMessage = {
              id: resolvedModelMessageId,
              role: "model",
              content: markdownImage,
              type: "parts",
              parts: [
                { inlineData: { url: imageUrl, mimeType: "image/png" } },
              ],
            };
            const persistedConversation = await Conversation.findOneAndUpdate(
              buildConversationWriteCondition(currentConversationId, user.userId, writePermitTime),
              {
                $push: { messages: modelMessage },
                updatedAt: new Date(),
              },
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
          if (clientAborted) {
            try { await rollbackCurrentTurn(); } catch { /* ignore */ }
            try { controller.close(); } catch { /* ignore */ }
            return;
          }
          try { await rollbackCurrentTurn(); } catch { /* ignore */ }
          try {
            const errorPayload = JSON.stringify({ type: "stream_error", message: err?.message || "Unknown error" });
            const padding = !paddingSent ? SSE_PADDING : "";
            paddingSent = true;
            controller.enqueue(encoder.encode(`data: ${errorPayload}${padding}\n\n`));
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          } catch {
            controller.error(err);
          }
        } finally {
          if (heartbeatTimer) {
            clearInterval(heartbeatTimer);
            heartbeatTimer = null;
          }
          try {
            req?.signal?.removeEventListener?.("abort", onAbort);
          } catch { /* ignore */ }
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
    logError("ai.image", "handle image generation request", error, {
      status: error?.status,
    });

    const rawStatus = typeof error?.status === "number" ? error.status : 500;
    const status = rawStatus === 401 ? 500 : rawStatus;
    let errorMessage = error?.message;

    if (rawStatus === 401) {
      errorMessage = "图片生成服务认证失败，请检查百炼接口配置";
    } else if (error?.message?.includes("API_KEY") || error?.message?.includes("DASHSCOPE")) {
      errorMessage = "API 配置错误，请检查 API Key";
    }

    return Response.json({ error: errorMessage }, { status });
  }
}
