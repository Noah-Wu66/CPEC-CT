import { MongoClient, ServerApiVersion, type Collection, type Db } from "mongodb";
import { getEnv } from "@/lib/env";
import { logError } from "@/lib/logger";
import type { SessionDoc, SystemStateDoc, UserDoc } from "@/types/domain";
import type { SubtitleHistory, TTSHistory, Voice } from "@/types/audio/database";
import type { StoredFileDoc } from "@/lib/storage/types";

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

export async function ensureMongoIndexes() {
  if (global.studioIndexesReady) {
    return;
  }

  if (!global.studioIndexesPromise) {
    global.studioIndexesPromise = (async () => {
      try {
        const db = await getDb();
        await Promise.all([
          db.collection<UserDoc>("users").createIndex({ email: 1 }, { unique: true }),
          db.collection<SessionDoc>("sessions").createIndex({ tokenHash: 1 }, { unique: true }),
          db.collection<SessionDoc>("sessions").createIndex({ userId: 1 }),
          db.collection<SystemStateDoc>("system_state").createIndex({ key: 1 }, { unique: true }),
          db.collection("voices").createIndex({ userId: 1, createdAt: -1 }),
          db.collection("voices").createIndex({ userId: 1, sourceFileId: 1 }),
          db.collection("voices").createIndex({ userId: 1, previewFileId: 1 }),
          db.collection("tts_history").createIndex({ userId: 1, createdAt: -1 }),
          db.collection("tts_history").createIndex({ userId: 1, audioFileId: 1 }),
          db.collection("subtitle_history").createIndex({ userId: 1, createdAt: -1 }),
          db.collection("subtitle_history").createIndex({ userId: 1, fileId: 1 }),
          db.collection("subtitle_history").createIndex({ userId: 1, sentencesFileId: 1 }),
          db.collection("ai_conversations").createIndex({ userId: 1, updatedAt: -1 }),
          db.collection("ai_conversations").createIndex({ userId: 1, pinned: -1, updatedAt: -1 }),
          db.collection("ai_user_settings").createIndex({ userId: 1 }, { unique: true }),
          db.collection<StoredFileDoc>("stored_files").createIndex({ publicId: 1 }, { unique: true }),
          db.collection<StoredFileDoc>("stored_files").createIndex({ relativePath: 1 }, { unique: true }),
          db.collection<StoredFileDoc>("stored_files").createIndex({ userId: 1, createdAt: -1 }),
          db.collection<StoredFileDoc>("stored_files").createIndex({ userId: 1, scope: 1, createdAt: -1 })
        ]);
        global.studioIndexesReady = true;
      } catch (error) {
        logError("mongo", "initialize indexes", error);
        throw error;
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

export async function storedFilesCollection(): Promise<Collection<StoredFileDoc>> {
  await ensureMongoIndexes();
  return (await getDb()).collection<StoredFileDoc>("stored_files");
}
