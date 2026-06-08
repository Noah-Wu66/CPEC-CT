import dbConnect from '@/lib/ai/db';
import { ConversationStore as Conversation } from '@/lib/ai/server/store';
import { getAuthPayload } from '@/lib/ai/auth';
import { sanitizeImportedConversation } from '@/lib/ai/server/conversations/sanitize';
import { enrichStoredMessagesWithBlobIds } from '@/lib/ai/server/conversations/blobReferences';
import { migrateLegacyConversationModelsForUser } from '@/lib/ai/server/conversations/service';
import { MAX_REQUEST_BYTES } from '@/lib/ai/server/chat/routeConstants';
import { logError } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        await dbConnect();
        const user = await getAuthPayload();
        if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        await migrateLegacyConversationModelsForUser(user.userId);

        const conversations = await Conversation.find({ userId: user.userId })
            .sort({ pinned: -1, updatedAt: -1 })
            .select('title model updatedAt pinned')
            .lean();

        return Response.json({ conversations });
    } catch (error) {
        logError('ai.conversations', 'list conversations', error);
        return Response.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function POST(req) {
    try {
        const contentLength = req.headers.get('content-length');
        if (contentLength && Number(contentLength) > MAX_REQUEST_BYTES) {
            return Response.json({ error: 'Request too large' }, { status: 413 });
        }

        await dbConnect();
        const user = await getAuthPayload();
        if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        let body = null;
        try {
            body = await req.json();
        } catch {
            return Response.json({ error: 'Invalid JSON' }, { status: 400 });
        }

        const conversationInput = sanitizeImportedConversation(body, 0, user.userId);
        if (Array.isArray(conversationInput.messages) && conversationInput.messages.length > 0) {
            conversationInput.messages = await enrichStoredMessagesWithBlobIds(conversationInput.messages, {
                userId: user.userId,
            });
        }
        const created = await Conversation.create({
            ...conversationInput,
            pinned: Boolean(conversationInput.pinned),
            updatedAt: new Date(),
        });

        return Response.json({ conversation: created.toObject() });
    } catch (error) {
        return Response.json({ error: error?.message || '创建会话失败' }, { status: 400 });
    }
}
