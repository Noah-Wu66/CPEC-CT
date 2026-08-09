import { ObjectId, type Filter } from 'mongodb';
import { getDb } from '@/lib/db';
import { buildPublicFileUrl, findStoredFileByIdForUser } from '@/lib/storage/repository';

const STORED_FILE_BASE = 'https://stored-file.invalid';

export interface StoredFileReferenceTokens {
  fileIds: Set<string>;
  publicIds: Set<string>;
}

export function createStoredFileReferenceTokens(): StoredFileReferenceTokens {
  return { fileIds: new Set<string>(), publicIds: new Set<string>() };
}

export function getStoredFilePublicId(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return '';

  try {
    const parsed = new URL(value, STORED_FILE_BASE);
    const parts = parsed.pathname.split('/');
    if (parts.length !== 4 || parts[1] !== 'files' || !parts[2] || !parts[3]) return '';
    const publicId = decodeURIComponent(parts[2]);
    return /^[A-Za-z0-9_-]{24,64}$/.test(publicId) ? publicId : '';
  } catch {
    return '';
  }
}

export function collectStoredFileReferenceTokens(
  value: unknown,
  output: StoredFileReferenceTokens = createStoredFileReferenceTokens(),
  key = ''
) {
  if (typeof value === 'string') {
    if (/fileid$/i.test(key) && ObjectId.isValid(value)) {
      output.fileIds.add(value);
    }
    const publicId = getStoredFilePublicId(value);
    if (publicId) output.publicIds.add(publicId);
    return output;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectStoredFileReferenceTokens(item, output, key);
    return output;
  }

  if (!value || typeof value !== 'object') return output;
  for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
    collectStoredFileReferenceTokens(childValue, output, childKey);
  }
  return output;
}

export async function isStoredFileReferenced(
  fileId: string,
  userId: string,
  options: { excludeVoiceId?: string; excludeConversationId?: string } = {}
) {
  if (!ObjectId.isValid(fileId) || !ObjectId.isValid(userId)) return false;
  const file = await findStoredFileByIdForUser(fileId, userId);
  if (!file) return false;

  const db = await getDb();
  const publicUrl = buildPublicFileUrl(file);
  const voiceFilter: Filter<Record<string, unknown>> = {
    userId: new ObjectId(userId),
    ...(ObjectId.isValid(options.excludeVoiceId || '')
      ? { _id: { $ne: new ObjectId(options.excludeVoiceId) } }
      : {}),
    $or: [
      { sourceFileId: fileId },
      { promptFileId: fileId },
      { previewFileId: fileId },
    ],
  };
  const conversationFilter: Filter<Record<string, unknown>> = {
    userId: new ObjectId(userId),
    ...(ObjectId.isValid(options.excludeConversationId || '')
      ? { _id: { $ne: new ObjectId(options.excludeConversationId) } }
      : {}),
    $or: [
      { 'messages.parts.inlineData.fileId': fileId },
      { 'messages.parts.fileData.fileId': fileId },
      { 'messages.artifacts.url': publicUrl },
      { 'messages.tools.artifacts.url': publicUrl },
    ],
  };

  const references = await Promise.all([
    db.collection('voices').findOne(voiceFilter, { projection: { _id: 1 } }),
    db.collection('tts_history').findOne(
      { userId: new ObjectId(userId), $or: [{ audioFileId: fileId }, { audioUrl: publicUrl }] },
      { projection: { _id: 1 } }
    ),
    db.collection('subtitle_history').findOne(
      {
        userId: new ObjectId(userId),
        $or: [
          { fileId },
          { sentencesFileId: fileId },
          { fileUrl: publicUrl },
          { sentencesUrl: publicUrl },
        ],
      },
      { projection: { _id: 1 } }
    ),
    db.collection('ai_conversations').findOne(conversationFilter, { projection: { _id: 1 } }),
    db.collection('ai_user_settings').findOne(
      { userId: new ObjectId(userId), avatar: publicUrl },
      { projection: { _id: 1 } }
    ),
    db.collection('stored_files').findOne(
      { _id: { $ne: file._id }, userId: new ObjectId(userId), 'visualAssets.fileId': fileId },
      { projection: { _id: 1 } }
    ),
  ]);

  return references.some(Boolean);
}
