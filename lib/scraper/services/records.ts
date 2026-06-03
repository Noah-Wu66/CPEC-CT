import { ObjectId } from "mongodb";
import { scraperRecordsCollection } from "@/lib/scraper/db";
import { ensureScraperBootstrap } from "@/lib/scraper/bootstrap";
import type { ScraperRecordDoc, ScraperRecordKind } from "@/lib/scraper/types";

export async function upsertScraperRecord(input: {
  sourceId: string | ObjectId;
  runId: string | ObjectId;
  kind: ScraperRecordKind;
  title: string;
  url: string;
  publishedAt?: Date | null;
  dedupeKey: string;
  metrics?: Record<string, number | null>;
  payload?: Record<string, unknown>;
}) {
  await ensureScraperBootstrap();
  const records = await scraperRecordsCollection();
  const now = new Date();
  const sourceObjectId = typeof input.sourceId === "string" ? new ObjectId(input.sourceId) : input.sourceId;
  const runObjectId = typeof input.runId === "string" ? new ObjectId(input.runId) : input.runId;

  const patch: Partial<ScraperRecordDoc> = {
    runId: runObjectId,
    kind: input.kind,
    title: input.title,
    url: input.url,
    publishedAt: input.publishedAt ?? null,
    metrics: input.metrics ?? {},
    payload: input.payload ?? {},
    lastSeenAt: now,
    updatedAt: now
  };

  await records.updateOne(
    { sourceId: sourceObjectId, dedupeKey: input.dedupeKey },
    {
      $set: patch,
      $setOnInsert: {
        sourceId: sourceObjectId,
        dedupeKey: input.dedupeKey,
        firstSeenAt: now,
        createdAt: now
      }
    },
    { upsert: true }
  );
}

export async function listScraperRecords(filter: {
  sourceIds?: string[];
  kinds?: string[];
  q?: string;
  limit?: number;
}) {
  await ensureScraperBootstrap();
  const records = await scraperRecordsCollection();
  const query: Record<string, unknown> = {};

  if (filter.sourceIds && filter.sourceIds.length > 0) {
    query.sourceId = { $in: filter.sourceIds.map((item) => new ObjectId(item)) };
  }

  if (filter.kinds && filter.kinds.length > 0) {
    query.kind = { $in: filter.kinds };
  }

  if (filter.q) {
    query.$or = [{ title: { $regex: filter.q, $options: "i" } }, { url: { $regex: filter.q, $options: "i" } }];
  }

  return records.find(query, { sort: { publishedAt: -1, updatedAt: -1 }, limit: filter.limit ?? 200 }).toArray();
}
