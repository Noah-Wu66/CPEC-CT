import { randomUUID } from 'node:crypto';
import { MongoServerError, ObjectId, type Db } from 'mongodb';
import { getDb } from '@/lib/db';
import { logError } from '@/lib/logger';
import { deleteStoredFile } from '@/lib/storage/server';
import type { StoredFileDoc } from '@/lib/storage/types';
import {
  collectStoredFileReferenceTokens,
  createStoredFileReferenceTokens,
  getStoredFilePublicId,
  type StoredFileReferenceTokens,
} from '@/lib/storage/references';

export const REQUIRED_MIGRATION_KEY = 'migration:qwen38-qwen-audio-plus-v1';
const LEGACY_QWEN_MODEL = 'qwen3.7-max';
const LEGACY_SPEECH_MODELS = [
  'speech-2.8-hd',
  'speech-2.8-turbo',
  'speech-2.6-hd',
  'speech-2.6-turbo',
];
const MIGRATION_LEASE_MS = 5 * 60 * 1000;
const MIGRATION_HEARTBEAT_MS = 30 * 1000;
const MIGRATION_WAIT_MS = 1000;

declare global {
  var requiredStartupMigrationsPromise: Promise<void> | undefined;
  var requiredStartupMigrationsReady: boolean | undefined;
}

type MigrationValue = {
  status: 'running' | 'failed' | 'completed';
  ownerToken?: string;
  startedAt?: Date;
  heartbeatAt?: Date;
  leaseExpiresAt?: Date;
  completedAt?: Date;
  failedAt?: Date;
  deletedConversations?: number;
  deletedVoices?: number;
  deletedFiles?: number;
  lastError?: string;
};

type OwnedReferenceGroup = {
  userId: ObjectId;
  tokens: StoredFileReferenceTokens;
};

type MigrationClaim = 'owned' | 'completed' | 'waiting';

function legacyVoiceFilter() {
  return {
    $or: [
      { provider: 'minimax' },
      { provider: { $exists: false } },
      { model: { $in: LEGACY_SPEECH_MODELS } },
    ],
  };
}

function isLegacyVoice(value: Record<string, unknown>) {
  return value.provider === 'minimax'
    || value.provider === undefined
    || LEGACY_SPEECH_MODELS.includes(String(value.model || ''));
}

function chunks<T>(items: T[], size = 500) {
  const groups: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    groups.push(items.slice(index, index + size));
  }
  return groups;
}

async function addCursorReferences(
  cursor: AsyncIterable<Record<string, unknown>>,
  output: StoredFileReferenceTokens,
  shouldInclude: (document: Record<string, unknown>) => boolean = () => true
) {
  for await (const document of cursor) {
    if (shouldInclude(document)) collectStoredFileReferenceTokens(document, output);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeUserId(value: unknown) {
  if (value instanceof ObjectId) return value;
  if (typeof value === 'string' && ObjectId.isValid(value)) return new ObjectId(value);
  return null;
}

function getOwnedReferenceGroup(groups: Map<string, OwnedReferenceGroup>, value: unknown) {
  const userId = normalizeUserId(value);
  if (!userId) return null;
  const key = userId.toHexString();
  let group = groups.get(key);
  if (!group) {
    group = { userId, tokens: createStoredFileReferenceTokens() };
    groups.set(key, group);
  }
  return group;
}

function addExplicitFileId(value: unknown, output: StoredFileReferenceTokens) {
  if (typeof value === 'string' && ObjectId.isValid(value)) output.fileIds.add(value);
}

function addExplicitStoredFileUrl(value: unknown, output: StoredFileReferenceTokens) {
  if (typeof value !== 'string' || value !== value.trim() || !value.startsWith('/files/')) return;
  const publicId = getStoredFilePublicId(value);
  if (publicId) output.publicIds.add(publicId);
}

function addExplicitAttachment(value: unknown, output: StoredFileReferenceTokens) {
  if (!isRecord(value)) return;
  addExplicitFileId(value.fileId, output);
  addExplicitStoredFileUrl(value.url, output);
}

function addExplicitArtifactUrls(value: unknown, output: StoredFileReferenceTokens) {
  if (!Array.isArray(value)) return;
  for (const artifact of value) {
    if (isRecord(artifact)) addExplicitStoredFileUrl(artifact.url, output);
  }
}

function collectConversationCandidateReferences(value: unknown, output: StoredFileReferenceTokens) {
  if (!Array.isArray(value)) return;
  for (const message of value) {
    if (!isRecord(message)) continue;
    if (Array.isArray(message.parts)) {
      for (const part of message.parts) {
        if (!isRecord(part)) continue;
        addExplicitAttachment(part.inlineData, output);
        addExplicitAttachment(part.fileData, output);
      }
    }
    addExplicitArtifactUrls(message.artifacts, output);
    if (Array.isArray(message.tools)) {
      for (const tool of message.tools) {
        if (isRecord(tool)) addExplicitArtifactUrls(tool.artifacts, output);
      }
    }
  }
}

function collectVoiceCandidateReferences(value: Record<string, unknown>, output: StoredFileReferenceTokens) {
  addExplicitFileId(value.sourceFileId, output);
  addExplicitFileId(value.promptFileId, output);
  addExplicitFileId(value.previewFileId, output);
  addExplicitStoredFileUrl(value.sourceAudioUrl, output);
  addExplicitStoredFileUrl(value.promptAudioUrl, output);
  addExplicitStoredFileUrl(value.previewAudioUrl, output);
}

async function resolvePublicIds(db: Db, publicIds: Set<string>) {
  const fileIds = new Set<string>();
  for (const group of chunks(Array.from(publicIds))) {
    const files = await db.collection<StoredFileDoc>('stored_files')
      .find({ publicId: { $in: group } }, { projection: { _id: 1 } })
      .toArray();
    for (const file of files) fileIds.add(file._id.toString());
  }
  return fileIds;
}

async function loadOwnedStoredFilesByIds(db: Db, userId: ObjectId, ids: Set<string>) {
  const files = new Map<string, StoredFileDoc>();
  const validIds = Array.from(ids).filter((id) => ObjectId.isValid(id));
  for (const group of chunks(validIds)) {
    const documents = await db.collection<StoredFileDoc>('stored_files')
      .find({ userId, _id: { $in: group.map((id) => new ObjectId(id)) } })
      .toArray();
    for (const document of documents) files.set(document._id.toString(), document);
  }
  return files;
}

async function loadOwnedStoredFiles(db: Db, group: OwnedReferenceGroup) {
  const files = await loadOwnedStoredFilesByIds(db, group.userId, group.tokens.fileIds);
  for (const publicIds of chunks(Array.from(group.tokens.publicIds))) {
    const documents = await db.collection<StoredFileDoc>('stored_files')
      .find({ userId: group.userId, publicId: { $in: publicIds } })
      .toArray();
    for (const document of documents) files.set(document._id.toString(), document);
  }
  return files;
}

async function collectCandidateFiles(db: Db) {
  const ownedReferences = new Map<string, OwnedReferenceGroup>();
  for await (const conversation of db.collection('ai_conversations').find(
    { model: LEGACY_QWEN_MODEL },
    { projection: { userId: 1, messages: 1 } }
  )) {
    const group = getOwnedReferenceGroup(ownedReferences, conversation.userId);
    if (group) collectConversationCandidateReferences(conversation.messages, group.tokens);
  }
  for await (const voice of db.collection('voices').find(legacyVoiceFilter(), {
    projection: {
      userId: 1,
      sourceFileId: 1,
      promptFileId: 1,
      previewFileId: 1,
      sourceAudioUrl: 1,
      promptAudioUrl: 1,
      previewAudioUrl: 1,
    },
  })) {
    const group = getOwnedReferenceGroup(ownedReferences, voice.userId);
    if (group) collectVoiceCandidateReferences(voice, group.tokens);
  }

  const candidateFiles = new Map<string, StoredFileDoc>();
  for (const group of ownedReferences.values()) {
    const ownedFiles = await loadOwnedStoredFiles(db, group);
    for (const [id, file] of ownedFiles) candidateFiles.set(id, file);
  }

  let added = true;
  while (added) {
    added = false;
    const childIdsByOwner = new Map<string, OwnedReferenceGroup>();
    for (const file of candidateFiles.values()) {
      const ownerGroup = getOwnedReferenceGroup(childIdsByOwner, file.userId);
      if (!ownerGroup) continue;
      for (const asset of file.visualAssets || []) {
        if (ObjectId.isValid(asset.fileId) && !candidateFiles.has(asset.fileId)) {
          ownerGroup.tokens.fileIds.add(asset.fileId);
        }
      }
    }
    if (childIdsByOwner.size === 0) break;
    for (const group of childIdsByOwner.values()) {
      const children = await loadOwnedStoredFilesByIds(db, group.userId, group.tokens.fileIds);
      for (const [id, child] of children) {
        if (!candidateFiles.has(id)) {
          candidateFiles.set(id, child);
          added = true;
        }
      }
    }
  }
  return candidateFiles;
}

async function collectRetainedReferences(db: Db, candidateFiles: Map<string, StoredFileDoc>) {
  const retainedTokens = createStoredFileReferenceTokens();

  await addCursorReferences(
    db.collection('ai_conversations')
      .find({ model: { $ne: LEGACY_QWEN_MODEL } }, { projection: { messages: 1 } }) as AsyncIterable<Record<string, unknown>>,
    retainedTokens
  );
  await addCursorReferences(
    db.collection('voices').find({}, {
      projection: { provider: 1, model: 1, sourceFileId: 1, promptFileId: 1, previewFileId: 1, sourceAudioUrl: 1, promptAudioUrl: 1, previewAudioUrl: 1 },
    }) as AsyncIterable<Record<string, unknown>>,
    retainedTokens,
    (voice) => !isLegacyVoice(voice)
  );
  await addCursorReferences(
    db.collection('tts_history').find({}, { projection: { audioFileId: 1, audioUrl: 1 } }) as AsyncIterable<Record<string, unknown>>,
    retainedTokens
  );
  await addCursorReferences(
    db.collection('subtitle_history').find({}, {
      projection: { fileId: 1, fileUrl: 1, sentencesFileId: 1, sentencesUrl: 1 },
    }) as AsyncIterable<Record<string, unknown>>,
    retainedTokens
  );
  await addCursorReferences(
    db.collection('ai_user_settings').find({}, { projection: { avatar: 1 } }) as AsyncIterable<Record<string, unknown>>,
    retainedTokens
  );

  for await (const file of db.collection<StoredFileDoc>('stored_files')
    .find({}, { projection: { _id: 1, visualAssets: 1 } })) {
    if (!candidateFiles.has(file._id.toString())) {
      collectStoredFileReferenceTokens(file.visualAssets || [], retainedTokens);
    }
  }

  const publicFileIds = await resolvePublicIds(db, retainedTokens.publicIds);
  for (const id of publicFileIds) retainedTokens.fileIds.add(id);

  // 若候选父文件被其他保留记录引用，它生成的可视化子文件也必须一并保留。
  let changed = true;
  while (changed) {
    changed = false;
    for (const [id, file] of candidateFiles) {
      if (!retainedTokens.fileIds.has(id)) continue;
      for (const asset of file.visualAssets || []) {
        if (ObjectId.isValid(asset.fileId) && !retainedTokens.fileIds.has(asset.fileId)) {
          retainedTokens.fileIds.add(asset.fileId);
          changed = true;
        }
      }
    }
  }
  return retainedTokens.fileIds;
}

function storedFileDepth(id: string, files: Map<string, StoredFileDoc>, visiting = new Set<string>()): number {
  if (visiting.has(id)) return 0;
  const file = files.get(id);
  if (!file?.visualAssets?.length) return 0;
  const nextVisiting = new Set(visiting).add(id);
  return 1 + Math.max(0, ...file.visualAssets.map((asset) => storedFileDepth(asset.fileId, files, nextVisiting)));
}

function createRunningMigrationValue(ownerToken: string, startedAt: Date, now = new Date()): MigrationValue {
  return {
    status: 'running',
    ownerToken,
    startedAt,
    heartbeatAt: now,
    leaseExpiresAt: new Date(now.getTime() + MIGRATION_LEASE_MS),
  };
}

async function claimMigration(db: Db, ownerToken: string, startedAt: Date): Promise<MigrationClaim> {
  const collection = db.collection('system_state');
  const now = new Date();
  const value = createRunningMigrationValue(ownerToken, startedAt, now);
  const claimed = await collection.findOneAndUpdate(
    {
      key: REQUIRED_MIGRATION_KEY,
      $or: [
        { 'value.status': { $nin: ['running', 'completed'] } },
        { 'value.status': 'running', 'value.leaseExpiresAt': { $exists: false } },
        { 'value.status': 'running', 'value.leaseExpiresAt': { $lte: now } },
      ],
    },
    { $set: { value, updatedAt: now } },
    { returnDocument: 'after' }
  );
  if (claimed) return 'owned';

  try {
    await collection.insertOne({
      _id: new ObjectId(),
      key: REQUIRED_MIGRATION_KEY,
      value,
      updatedAt: now,
    });
    return 'owned';
  } catch (error) {
    if (!(error instanceof MongoServerError) || error.code !== 11000) throw error;
  }

  const current = await collection.findOne(
    { key: REQUIRED_MIGRATION_KEY },
    { projection: { value: 1 } }
  );
  return (current?.value as MigrationValue | undefined)?.status === 'completed' ? 'completed' : 'waiting';
}

function startMigrationHeartbeat(db: Db, ownerToken: string) {
  const timer = setInterval(() => {
    const now = new Date();
    void db.collection('system_state').updateOne(
      {
        key: REQUIRED_MIGRATION_KEY,
        'value.status': 'running',
        'value.ownerToken': ownerToken,
      },
      {
        $set: {
          'value.heartbeatAt': now,
          'value.leaseExpiresAt': new Date(now.getTime() + MIGRATION_LEASE_MS),
          updatedAt: now,
        },
      }
    ).catch((error) => logError('migration', `${REQUIRED_MIGRATION_KEY}:heartbeat`, error));
  }, MIGRATION_HEARTBEAT_MS);
  timer.unref();
  return () => clearInterval(timer);
}

async function writeOwnedTerminalValue(db: Db, ownerToken: string, value: MigrationValue) {
  const result = await db.collection('system_state').updateOne(
    {
      key: REQUIRED_MIGRATION_KEY,
      'value.status': 'running',
      'value.ownerToken': ownerToken,
    },
    { $set: { value: { ...value, ownerToken }, updatedAt: new Date() } }
  );
  return result.matchedCount === 1;
}

async function isMigrationCompleted(db: Db) {
  const state = await db.collection('system_state').findOne(
    { key: REQUIRED_MIGRATION_KEY },
    { projection: { value: 1 } }
  );
  return (state?.value as MigrationValue | undefined)?.status === 'completed';
}

async function dropLegacyPromptFileIndex(db: Db) {
  try {
    await db.collection('voices').dropIndex('userId_1_promptFileId_1');
  } catch (error) {
    if (error instanceof MongoServerError && (error.code === 27 || error.codeName === 'IndexNotFound')) return;
    throw error;
  }
}

async function runOwnedMigration(db: Db, ownerToken: string, startedAt: Date) {
  const stopHeartbeat = startMigrationHeartbeat(db, ownerToken);
  try {
    const candidateFiles = await collectCandidateFiles(db);
    const retainedFileIds = await collectRetainedReferences(db, candidateFiles);
    const deletableFiles = Array.from(candidateFiles.entries())
      .filter(([id]) => !retainedFileIds.has(id))
      .sort(([leftId], [rightId]) => storedFileDepth(leftId, candidateFiles) - storedFileDepth(rightId, candidateFiles));

    let deletedFiles = 0;
    for (const [id, file] of deletableFiles) {
      if (await deleteStoredFile(id, file.userId.toString())) deletedFiles += 1;
    }

    const deletedConversations = await db.collection('ai_conversations').deleteMany({ model: LEGACY_QWEN_MODEL });
    const deletedVoices = await db.collection('voices').deleteMany(legacyVoiceFilter());
    await dropLegacyPromptFileIndex(db);
    const [remainingConversations, remainingVoices] = await Promise.all([
      db.collection('ai_conversations').countDocuments({ model: LEGACY_QWEN_MODEL }, { limit: 1 }),
      db.collection('voices').countDocuments(legacyVoiceFilter(), { limit: 1 }),
    ]);
    if (remainingConversations !== 0 || remainingVoices !== 0) {
      throw new Error('旧模型数据清理后仍存在残留记录');
    }

    const completed = await writeOwnedTerminalValue(db, ownerToken, {
      status: 'completed',
      startedAt,
      completedAt: new Date(),
      deletedConversations: deletedConversations.deletedCount,
      deletedVoices: deletedVoices.deletedCount,
      deletedFiles,
    });
    if (!completed) throw new Error('迁移所有权已失效，无法写入完成标记');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    let completedByAnotherOwner = false;
    try {
      const failed = await writeOwnedTerminalValue(db, ownerToken, {
        status: 'failed',
        startedAt,
        failedAt: new Date(),
        lastError: message.slice(0, 2000),
      });
      if (!failed) completedByAnotherOwner = await isMigrationCompleted(db);
    } catch (statusError) {
      logError('migration', `${REQUIRED_MIGRATION_KEY}:write-failed-state`, statusError);
    }
    logError('migration', REQUIRED_MIGRATION_KEY, error);
    if (completedByAnotherOwner) return;
    throw error;
  } finally {
    stopHeartbeat();
  }
}

async function runMigration() {
  const db = await getDb();
  const ownerToken = randomUUID();
  const startedAt = new Date();

  while (true) {
    const claim = await claimMigration(db, ownerToken, startedAt);
    if (claim === 'completed') return;
    if (claim === 'owned') {
      await runOwnedMigration(db, ownerToken, startedAt);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, MIGRATION_WAIT_MS));
  }
}

export async function runRequiredStartupMigrations() {
  if (global.requiredStartupMigrationsReady) return;
  if (!global.requiredStartupMigrationsPromise) {
    global.requiredStartupMigrationsPromise = runMigration()
      .then(() => {
        global.requiredStartupMigrationsReady = true;
      })
      .finally(() => {
        if (!global.requiredStartupMigrationsReady) global.requiredStartupMigrationsPromise = undefined;
      });
  }
  await global.requiredStartupMigrationsPromise;
}

export async function areRequiredStartupMigrationsComplete() {
  if (global.requiredStartupMigrationsReady) return true;
  const state = await (await getDb()).collection('system_state').findOne(
    { key: REQUIRED_MIGRATION_KEY },
    { projection: { value: 1 } }
  );
  return (state?.value as MigrationValue | undefined)?.status === 'completed';
}
