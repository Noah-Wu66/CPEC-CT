import { MongoClient, ServerApiVersion, type Collection, type Db } from "mongodb";
import { getEnv } from "@/lib/env";
import { logError } from "@/lib/logger";
import type { SessionDoc, SystemStateDoc, UserDoc } from "@/types/domain";
import type { SubtitleHistory, TTSHistory, Voice } from "@/types/audio/database";

declare global {
  var mongoClientPromise: Promise<MongoClient> | undefined;
  var studioIndexesPromise: Promise<void> | undefined;
  var studioIndexesReady: boolean | undefined;
}

function getClientPromise() {
  if (!global.mongoClientPromise) {
    const client = new MongoClient(getEnv().mongoUri, {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true
      }
    });

    global.mongoClientPromise = client.connect();
  }

  return global.mongoClientPromise;
}

export async function getDb(): Promise<Db> {
  const client = await getClientPromise();
  return client.db();
}

const LEGACY_CONVERSATION_MODELS = [
  "qwen3.7-plus",
  "wan2.7-image-pro",
  "MiniMax-M3",
  "image-01",
];

const INVALID_EMAIL_FILTER = {
  $or: [
    { email: { $exists: false } },
    { email: null },
    { email: "" },
    { email: { $not: { $type: "string" } } },
  ],
};

const INVALID_TOKEN_HASH_FILTER = {
  $or: [
    { tokenHash: { $exists: false } },
    { tokenHash: null },
    { tokenHash: "" },
    { tokenHash: { $not: { $type: "string" } } },
  ],
};

const INVALID_URL_FILTER = {
  $or: [
    { url: { $exists: false } },
    { url: null },
    { url: "" },
    { url: { $not: { $type: "string" } } },
  ],
};

async function dropIndexIfExists(collection: Collection, indexName: string) {
  try {
    await collection.dropIndex(indexName);
  } catch {
    // 索引不存在时忽略
  }
}

async function purgeLegacyStudioData(db: Db) {
  const users = db.collection<UserDoc>("users");
  const sessions = db.collection<SessionDoc>("sessions");
  const conversations = db.collection("ai_conversations");
  const blobFiles = db.collection("ai_blob_files");

  await Promise.all([
    users.deleteMany(INVALID_EMAIL_FILTER),
    sessions.deleteMany(INVALID_TOKEN_HASH_FILTER),
    conversations.deleteMany({ model: { $in: LEGACY_CONVERSATION_MODELS } }),
    blobFiles.deleteMany(INVALID_URL_FILTER),
  ]);

  await Promise.all([
    dropIndexIfExists(users, "email_1"),
    dropIndexIfExists(sessions, "tokenHash_1"),
    dropIndexIfExists(blobFiles, "url_1"),
  ]);
}

export async function ensureMongoIndexes() {
  if (global.studioIndexesReady) {
    return;
  }

  if (!global.studioIndexesPromise) {
    global.studioIndexesPromise = (async () => {
      try {
        const db = await getDb();
        await purgeLegacyStudioData(db);
        await Promise.all([
          db.collection<UserDoc>("users").createIndex({ email: 1 }, { unique: true }),
          db.collection<SessionDoc>("sessions").createIndex({ tokenHash: 1 }, { unique: true }),
          db.collection<SessionDoc>("sessions").createIndex({ userId: 1 }),
          db.collection<SystemStateDoc>("system_state").createIndex({ key: 1 }, { unique: true }),
          db.collection("voices").createIndex({ userId: 1, createdAt: -1 }),
          db.collection("tts_history").createIndex({ userId: 1, createdAt: -1 }),
          db.collection("subtitle_history").createIndex({ userId: 1, createdAt: -1 }),
          db.collection("ai_conversations").createIndex({ userId: 1, updatedAt: -1 }),
          db.collection("ai_conversations").createIndex({ userId: 1, pinned: -1, updatedAt: -1 }),
          db.collection("ai_user_settings").createIndex({ userId: 1 }, { unique: true }),
          db.collection("ai_blob_files").createIndex({ url: 1 }, { unique: true }),
          db.collection("ai_blob_files").createIndex({ userId: 1, createdAt: -1 }),
          db.collection("ai_blob_files").createIndex({ userId: 1, kind: 1, createdAt: -1 })
        ]);
        global.studioIndexesReady = true;
      } catch (error) {
        logError("mongo", "initialize indexes", error);
      } finally {
        if (!global.studioIndexesReady) {
          global.studioIndexesPromise = undefined;
        }
      }
    })();
  }

  await global.studioIndexesPromise;
}

export async function usersCollection(): Promise<Collection<UserDoc>> {
  await ensureMongoIndexes();
  return (await getDb()).collection<UserDoc>("users");
}

export async function sessionsCollection(): Promise<Collection<SessionDoc>> {
  await ensureMongoIndexes();
  return (await getDb()).collection<SessionDoc>("sessions");
}

export async function voicesCollection(): Promise<Collection<Voice>> {
  await ensureMongoIndexes();
  return (await getDb()).collection<Voice>("voices");
}

export async function ttsHistoryCollection(): Promise<Collection<TTSHistory>> {
  await ensureMongoIndexes();
  return (await getDb()).collection<TTSHistory>("tts_history");
}

export async function subtitleHistoryCollection(): Promise<Collection<SubtitleHistory>> {
  await ensureMongoIndexes();
  return (await getDb()).collection<SubtitleHistory>("subtitle_history");
}

export async function systemStateCollection(): Promise<Collection<SystemStateDoc>> {
  await ensureMongoIndexes();
  return (await getDb()).collection<SystemStateDoc>("system_state");
}
