import { Filter, ObjectId } from "mongodb";
import { ensureScraperBootstrap } from "@/lib/scraper/bootstrap";
import { scraperRecordsCollection, scraperRunArtifactsCollection, scraperRunsCollection, scraperSourcesCollection } from "@/lib/scraper/db";
import type { ScraperActor, ScraperRunDoc, ScraperRunTrigger, ScraperSourceDoc } from "@/lib/scraper/types";
import { isScraperAdminRole, SCRAPER_SOURCE_KINDS } from "@/lib/scraper/types";
import { executeScraperSource } from "@/lib/scraper/source-runners";
import type { AgentProgressEvent } from "@/lib/scraper/agent/runner";

function isDuplicateKeyError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && Number((error as { code?: number }).code) === 11000;
}

export interface ScraperRunReportRecord {
  id: string;
  kind: string;
  title: string;
  url: string;
  summary: string;
  markdown: string;
}

export interface ScraperRunReportItem {
  id: string;
  status: string;
  sourceName: string;
  goal: string;
  finalText: string;
  toolCalls: number;
  errorMessage: string | null;
  createdAt: Date;
  completedAt: Date | null;
  canDelete: boolean;
  records: ScraperRunReportRecord[];
}

function canDeleteScraperRun(actor: ScraperActor, run: ScraperRunDoc, source: ScraperSourceDoc) {
  if (isScraperAdminRole(actor.role)) {
    return true;
  }

  if (run.requestedBy && String(run.requestedBy) === actor.id) {
    return true;
  }

  return source.scope === "private" && String(source.ownerId) === actor.id;
}

async function getAccessibleScraperRun(actor: ScraperActor, runId: string) {
  await ensureScraperBootstrap();
  const runs = await scraperRunsCollection();
  const run = await runs.findOne({ _id: new ObjectId(runId) });
  if (!run) {
    throw new Error("任务不存在");
  }

  const sources = await scraperSourcesCollection();
  const source = await sources.findOne({ _id: run.sourceId });
  if (!source) {
    throw new Error("任务配置不存在");
  }

  if (source.scope === "private" && String(source.ownerId) !== actor.id && !isScraperAdminRole(actor.role)) {
    throw new Error("没有权限查看这个任务");
  }

  return {
    run,
    source,
    canDelete: canDeleteScraperRun(actor, run, source)
  };
}

export async function createScraperRun(
  source: ScraperSourceDoc,
  trigger: ScraperRunTrigger,
  requestedBy?: string | null,
  idempotencyKey?: string | null
) {
  const runs = await scraperRunsCollection();
  const now = new Date();
  const result = await runs.insertOne({
    sourceId: source._id!,
    sourceKind: source.kind,
    trigger,
    status: "running",
    requestedBy: requestedBy ? new ObjectId(requestedBy) : null,
    errorMessage: null,
    stats: null,
    createdAt: now,
    startedAt: now,
    completedAt: null,
    updatedAt: now,
    ...(idempotencyKey ? { idempotencyKey } : {})
  });

  const run = await runs.findOne({ _id: result.insertedId });
  if (!run) {
    throw new Error("创建任务失败");
  }

  return run;
}

export async function addScraperRunArtifact(input: {
  runId: string | ObjectId;
  sourceId: string | ObjectId;
  artifactType: "request" | "response" | "model_request" | "model_response" | "tool_call";
  payload: Record<string, unknown>;
}) {
  const artifacts = await scraperRunArtifactsCollection();
  await artifacts.insertOne({
    runId: typeof input.runId === "string" ? new ObjectId(input.runId) : input.runId,
    sourceId: typeof input.sourceId === "string" ? new ObjectId(input.sourceId) : input.sourceId,
    artifactType: input.artifactType,
    payload: input.payload,
    createdAt: new Date()
  });
}

export async function markScraperRunCompleted(runId: string | ObjectId, stats?: Record<string, unknown> | null) {
  const runs = await scraperRunsCollection();
  await runs.updateOne(
    { _id: typeof runId === "string" ? new ObjectId(runId) : runId },
    {
      $set: {
        status: "completed",
        stats: stats ?? null,
        updatedAt: new Date(),
        completedAt: new Date()
      }
    }
  );
}

export async function markScraperRunFailed(runId: string | ObjectId, errorMessage: string) {
  const runs = await scraperRunsCollection();
  await runs.updateOne(
    { _id: typeof runId === "string" ? new ObjectId(runId) : runId },
    {
      $set: {
        status: "failed",
        errorMessage,
        updatedAt: new Date(),
        completedAt: new Date()
      }
    }
  );
}

export async function listScraperRuns(actor: ScraperActor, limit = 200) {
  await ensureScraperBootstrap();
  const sources = await scraperSourcesCollection();
  const sourceQuery: Filter<ScraperSourceDoc> = isScraperAdminRole(actor.role)
    ? { kind: { $in: [...SCRAPER_SOURCE_KINDS] } }
    : {
        kind: { $in: [...SCRAPER_SOURCE_KINDS] },
        $or: [{ scope: "system" }, { ownerId: new ObjectId(actor.id) }]
      };

  const ownedSourceIds = await sources.find(sourceQuery).map((item) => item._id).toArray();
  const runs = await scraperRunsCollection();
  const docs =
    ownedSourceIds.length > 0
      ? await runs.find({ sourceId: { $in: ownedSourceIds } }, { sort: { createdAt: -1 }, limit }).toArray()
      : [];

  const sourceMap = new Map(
    (await sources.find({ _id: { $in: ownedSourceIds } }).toArray()).map((item) => [String(item._id), item])
  );

  return docs.map((item) => ({
    id: String(item._id),
    status: item.status,
    trigger: item.trigger,
    sourceKind: item.sourceKind,
    sourceName: sourceMap.get(String(item.sourceId))?.name || String(item.sourceId),
    createdAt: item.createdAt,
    completedAt: item.completedAt ?? null,
    stats: item.stats ?? null,
    errorMessage: item.errorMessage ?? null
  }));
}

export async function listScraperRunReports(actor: ScraperActor, limit = 50) {
  await ensureScraperBootstrap();
  const sources = await scraperSourcesCollection();
  const sourceQuery: Filter<ScraperSourceDoc> = isScraperAdminRole(actor.role)
    ? { kind: { $in: [...SCRAPER_SOURCE_KINDS] } }
    : {
        kind: { $in: [...SCRAPER_SOURCE_KINDS] },
        $or: [{ scope: "system" }, { ownerId: new ObjectId(actor.id) }]
      };

  const ownedSources = await sources.find(sourceQuery).toArray();
  const sourceMap = new Map(ownedSources.map((s) => [String(s._id), s]));
  const ownedSourceIds = ownedSources.map((s) => s._id);

  if (ownedSourceIds.length === 0) return [];

  const runs = await scraperRunsCollection();
  const runDocs = await runs.find({ sourceId: { $in: ownedSourceIds } }, { sort: { createdAt: -1 }, limit }).toArray();
  if (runDocs.length === 0) return [];

  const records = await scraperRecordsCollection();
  const runIds = runDocs.map((r) => r._id!);
  const allRecords = await records.find({ runId: { $in: runIds } }, { sort: { createdAt: 1 } }).toArray();

  const recordsByRun = new Map<string, typeof allRecords>();
  for (const rec of allRecords) {
    const key = String(rec.runId);
    const list = recordsByRun.get(key) || [];
    list.push(rec);
    recordsByRun.set(key, list);
  }

  return runDocs.map((run): ScraperRunReportItem => {
    const source = sourceMap.get(String(run.sourceId));
    const goal = typeof source?.config?.goal === "string" ? source.config.goal : "";
    return {
      id: String(run._id),
      status: run.status,
      sourceName: source?.name || "",
      goal,
      finalText: typeof run.stats?.finalText === "string" ? run.stats.finalText : "",
      toolCalls: typeof run.stats?.toolCalls === "number" ? run.stats.toolCalls : 0,
      errorMessage: run.errorMessage ?? null,
      createdAt: run.createdAt,
      completedAt: run.completedAt ?? null,
      canDelete: source ? canDeleteScraperRun(actor, run, source) : isScraperAdminRole(actor.role),
      records: (recordsByRun.get(String(run._id)) || []).map((rec) => ({
        id: String(rec._id),
        kind: rec.kind,
        title: rec.title,
        url: rec.url,
        summary: typeof rec.payload?.summary === "string" ? rec.payload.summary : "",
        markdown: typeof rec.payload?.markdown === "string" ? rec.payload.markdown : ""
      }))
    };
  });
}

export async function getScraperRunById(actor: ScraperActor, runId: string) {
  const { run, source } = await getAccessibleScraperRun(actor, runId);

  const artifacts = await scraperRunArtifactsCollection();
  const items = await artifacts.find({ runId: run._id! }, { sort: { createdAt: 1 } }).toArray();

  return {
    run,
    source,
    artifacts: items
  };
}

export async function deleteScraperRunReport(actor: ScraperActor, runId: string) {
  const { run, canDelete } = await getAccessibleScraperRun(actor, runId);
  if (!canDelete) {
    throw new Error("没有权限删除这条采集报告");
  }

  const runs = await scraperRunsCollection();
  const records = await scraperRecordsCollection();
  const artifacts = await scraperRunArtifactsCollection();

  await Promise.all([
    runs.deleteOne({ _id: run._id! }),
    records.deleteMany({ runId: run._id! }),
    artifacts.deleteMany({ runId: run._id! })
  ]);
}

export async function triggerScraperSourceRun(
  source: ScraperSourceDoc,
  trigger: ScraperRunTrigger,
  actor?: ScraperActor | null,
  idempotencyKey?: string | null,
  onProgress?: (event: AgentProgressEvent) => void
) {
  let run: ScraperRunDoc;
  try {
    run = await createScraperRun(source, trigger, actor?.id ?? null, idempotencyKey);
  } catch (error) {
    if (!idempotencyKey || !isDuplicateKeyError(error)) {
      throw error;
    }

    const runs = await scraperRunsCollection();
    const existing = await runs.findOne({ idempotencyKey });
    if (!existing) {
      throw error;
    }

    return {
      runId: String(existing._id),
      status: existing.status,
      stats: existing.stats ?? null
    };
  }

  try {
    const result = await executeScraperSource(source, run, onProgress);

    if (Array.isArray(result.artifacts)) {
      for (const artifact of result.artifacts) {
        await addScraperRunArtifact({
          runId: run._id!,
          sourceId: source._id!,
          artifactType: artifact.artifactType,
          payload: artifact.payload
        });
      }
    }

    if (result.requestPayload) {
      await addScraperRunArtifact({
        runId: run._id!,
        sourceId: source._id!,
        artifactType: "request",
        payload: result.requestPayload
      });
    }

    if (result.responsePayload) {
      await addScraperRunArtifact({
        runId: run._id!,
        sourceId: source._id!,
        artifactType: "response",
        payload: result.responsePayload
      });
    }

    await markScraperRunCompleted(run._id!, result.stats ?? null);
    await updateScraperSourceRunTimestamps(source._id!);
    return { runId: String(run._id), status: "completed", stats: result.stats ?? null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "任务执行失败";
    await markScraperRunFailed(run._id!, message);
    throw error;
  }
}

async function updateScraperSourceRunTimestamps(sourceId: ObjectId) {
  const sources = await scraperSourcesCollection();
  await sources.updateOne({ _id: sourceId }, { $set: { lastRunAt: new Date(), updatedAt: new Date() } });
}
