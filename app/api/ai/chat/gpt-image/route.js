import dbConnect from '@/lib/ai/db';
import { ConversationStore as Conversation, UserStore as User } from '@/lib/ai/server/store';
import { getAuthPayload } from '@/lib/ai/auth';
import { rateLimit, getClientIP } from '@/lib/ai/rateLimit';
import {
    generateMessageId,
    isNonEmptyString,
} from '@/app/api/ai/chat/utils';
import {
    loadConversationForRoute,
    rollbackConversationTurn,
    buildConversationWriteCondition,
    CONVERSATION_WRITE_CONFLICT_ERROR,
} from '@/app/api/ai/chat/conversationState';
import { resolveMinimaxImageProviderConfig } from '@/lib/ai/modelRoutes';
import { MINIMAX_IMAGE_MODEL } from '@/lib/ai/shared/models';
import {
    CHAT_RATE_LIMIT,
    MAX_REQUEST_BYTES,
    SSE_PADDING,
    HEARTBEAT_INTERVAL_MS,
} from '@/lib/ai/server/chat/routeConstants';
import { logError } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// MiniMax 官方国内版图像生成（同步返回，直接拿到图片 URL）
async function generateMinimaxImage({ baseUrl, apiKey, prompt, aspectRatio, imageUrls, signal }) {
    const body = {
        model: MINIMAX_IMAGE_MODEL,
        prompt,
        aspect_ratio: aspectRatio || '1:1',
        response_format: 'url',
        n: 1,
        prompt_optimizer: true,
    };
    // 支持人物主体参考图（图生图）
    if (Array.isArray(imageUrls) && imageUrls.length > 0) {
        body.subject_reference = [
            {
                type: 'character',
                image_file: imageUrls[0],
            },
        ];
    }

    const res = await fetch(`${baseUrl}/image_generation`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal,
    });

    if (!res.ok) {
        let errorMessage = `图片生成请求失败（${res.status}）`;
        try {
            const data = await res.json();
            if (data?.base_resp?.status_msg) errorMessage = data.base_resp.status_msg;
            else if (data?.error?.message) errorMessage = data.error.message;
            else if (data?.message) errorMessage = data.message;
        } catch { /* ignore */ }
        throw new Error(errorMessage);
    }

    const data = await res.json();
    // MiniMax 业务错误码在 base_resp.status_code，0 为成功
    if (data?.base_resp && data.base_resp.status_code !== 0) {
        throw new Error(data.base_resp.status_msg || '图片生成失败');
    }
    const url = Array.isArray(data?.data?.image_urls) ? data.data.image_urls[0] : null;
    if (!url) {
        throw new Error('图片生成完成但未返回图片地址');
    }
    return url;
}

export async function POST(req) {
    let writePermitTime = null;

    try {
        const contentLength = req.headers.get('content-length');
        if (contentLength && Number(contentLength) > MAX_REQUEST_BYTES) {
            return Response.json({ error: 'Request too large' }, { status: 413 });
        }

        let body;
        try {
            body = await req.json();
        } catch {
            return Response.json({ error: 'Invalid JSON in request body' }, { status: 400 });
        }

        const { prompt, model, config, conversationId, settings, userMessageId, modelMessageId } = body;

        if (!model || typeof model !== 'string') {
            return Response.json({ error: 'Model is required' }, { status: 400 });
        }
        if (typeof prompt !== 'string' || !prompt.trim()) {
            return Response.json({ error: '请输入图片描述' }, { status: 400 });
        }

        const auth = await getAuthPayload();
        if (!auth) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const clientIP = getClientIP(req);
        const rateLimitKey = `chat:${auth.userId}:${clientIP}`;
        const { success, resetTime } = rateLimit(rateLimitKey, CHAT_RATE_LIMIT);
        if (!success) {
            const retryAfter = Math.ceil((resetTime - Date.now()) / 1000);
            return Response.json(
                { error: '请求过于频繁，请稍后再试' },
                { status: 429, headers: { 'Retry-After': String(retryAfter) } }
            );
        }

        let user = null;
        try {
            await dbConnect();
            const userDoc = await User.findById(auth.userId);
            if (!userDoc) {
                return Response.json({ error: 'Unauthorized' }, { status: 401 });
            }
            user = auth;
        } catch (dbError) {
            logError('ai.gpt-image', 'connect database', dbError);
            return Response.json({ error: 'Database connection failed' }, { status: 500 });
        }

        const { baseUrl, apiKey } = resolveMinimaxImageProviderConfig();

        let currentConversationId = conversationId;
        let currentConversation = await loadConversationForRoute({
            conversationId: currentConversationId,
            userId: user.userId,
            expectedProvider: 'minimax-image',
        });
        let createdConversationForRequest = false;
        let previousMessages = Array.isArray(currentConversation?.messages) ? currentConversation.messages : [];
        let previousUpdatedAt = currentConversation?.updatedAt ? new Date(currentConversation.updatedAt) : new Date();

        const resolvedUserMessageId = (typeof userMessageId === 'string' && userMessageId.trim())
            ? userMessageId.trim()
            : generateMessageId();
        const resolvedModelMessageId = (typeof modelMessageId === 'string' && modelMessageId.trim())
            ? modelMessageId.trim()
            : generateMessageId();

        const imageUrls = [];
        if (Array.isArray(config?.images) && config.images.length > 0) {
            for (const img of config.images) {
                if (img?.url) imageUrls.push(img.url);
            }
        }

        if (user && !currentConversationId) {
            const titleSource = prompt;
            const title = titleSource.length > 30 ? titleSource.substring(0, 30) + '...' : titleSource;
            const newConv = await Conversation.create({
                userId: user.userId,
                title,
                model,
                settings: settings && typeof settings === 'object' ? settings : {},
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
                storedUserParts.push({ inlineData: { url, mimeType: 'image/jpeg' } });
            }

            const userMsgTime = new Date();
            const userMessage = {
                id: resolvedUserMessageId,
                role: 'user',
                content: prompt,
                type: 'parts',
                parts: storedUserParts,
            };
            const updatedConv = await Conversation.findOneAndUpdate(
                { _id: currentConversationId, userId: user.userId },
                {
                    $push: { messages: userMessage },
                    updatedAt: userMsgTime,
                },
                { new: true }
            ).select('updatedAt');
            if (!updatedConv) {
                return Response.json({ error: 'Not found' }, { status: 404 });
            }
            writePermitTime = updatedConv.updatedAt?.getTime?.() ?? userMsgTime.getTime();
        }

        const encoder = new TextEncoder();
        let clientAborted = false;
        const onAbort = () => { clientAborted = true; };
        try {
            req?.signal?.addEventListener?.('abort', onAbort, { once: true });
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
                        const padding = !paddingSent ? SSE_PADDING : '';
                        paddingSent = true;
                        const data = `data: ${JSON.stringify(payload)}${padding}\n\n`;
                        controller.enqueue(encoder.encode(data));
                    };

                    sendEvent({ type: 'thought', content: '正在生成图片，请稍候...' });

                    const imageUrl = await generateMinimaxImage({
                        baseUrl,
                        apiKey,
                        prompt,
                        aspectRatio: config?.imageAspectRatio || config?.imageSize || '1:1',
                        imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
                        signal: req?.signal,
                    });

                    if (clientAborted) {
                        await rollbackCurrentTurn();
                        try { controller.close(); } catch { /* ignore */ }
                        return;
                    }

                    if (!imageUrl) {
                        throw new Error('图片生成失败，请稍后重试');
                    }

                    const markdownImage = `![生成的图片](${imageUrl})`;
                    sendEvent({ type: 'text', content: markdownImage });
                    controller.enqueue(encoder.encode('data: [DONE]\n\n'));

                    if (user && currentConversationId) {
                        const modelMessage = {
                            id: resolvedModelMessageId,
                            role: 'model',
                            content: markdownImage,
                            type: 'parts',
                            parts: [
                                { inlineData: { url: imageUrl, mimeType: 'image/png' } },
                            ],
                        };
                        const persistedConversation = await Conversation.findOneAndUpdate(
                            buildConversationWriteCondition(currentConversationId, user.userId, writePermitTime),
                            {
                                $push: { messages: modelMessage },
                                updatedAt: new Date(),
                            },
                            { new: true }
                        ).select('updatedAt');
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
                        const errorPayload = JSON.stringify({ type: 'stream_error', message: err?.message || 'Unknown error' });
                        const padding = !paddingSent ? SSE_PADDING : '';
                        paddingSent = true;
                        controller.enqueue(encoder.encode(`data: ${errorPayload}${padding}\n\n`));
                        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
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
                        req?.signal?.removeEventListener?.('abort', onAbort);
                    } catch { /* ignore */ }
                }
            }
        });

        const headers = {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
        };
        if (currentConversationId) {
            headers['X-Conversation-Id'] = currentConversationId;
        }
        return new Response(responseStream, { headers });

    } catch (error) {
        logError('ai.gpt-image', 'handle image generation request', error, {
            status: error?.status,
        });

        const rawStatus = typeof error?.status === 'number' ? error.status : 500;
        const status = rawStatus === 401 ? 500 : rawStatus;
        let errorMessage = error?.message;

        if (rawStatus === 401) {
            errorMessage = '图片生成服务认证失败，请检查接口配置';
        } else if (error?.message?.includes('API_KEY')) {
            errorMessage = 'API 配置错误，请检查 API Key';
        }

        return Response.json({ error: errorMessage }, { status });
    }
}
