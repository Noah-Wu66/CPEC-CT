import { Filter, ObjectId } from "mongodb";
import { ensureScraperBootstrap } from "@/lib/scraper/bootstrap";
import { scraperSourcesCollection } from "@/lib/scraper/db";
import type { ScraperActor, ScraperSourceDoc, ScraperSourceKind, ScraperSourceListItem } from "@/lib/scraper/types";
import { isScraperAdminRole, SCRAPER_SOURCE_KINDS } from "@/lib/scraper/types";

export interface CreateScraperSourceInput {
  kind: ScraperSourceKind;
  name: string;
  config: Record<string, unknown>;
}

export interface UpdateScraperSourceInput {
  name?: string;
  enabled?: boolean;
  config?: Record<string, unknown>;
}

function buildSourceAccessQuery(actor: ScraperActor): Filter<ScraperSourceDoc> {
  if (isScraperAdminRole(actor.role)) {
    return {};
  }

  return {
    $or: [{ scope: "system" }, { ownerId: new ObjectId(actor.id) }]
  };
}

function serializeSourceItem(source: ScraperSourceDoc): ScraperSourceListItem {
  return {
    id: String(source._id),
    kind: source.kind,
    name: source.name,
    scope: source.scope,
    enabled: source.enabled,
    config: source.config,
    lastRunAt: source.lastRunAt ?? null
  };
}

export async function listScraperSources(actor: ScraperActor) {
  await ensureScraperBootstrap();
  const sources = await scraperSourcesCollection();

  const docs = (await sources.find(buildSourceAccessQuery(actor)).sort({ scope: 1, createdAt: 1 }).toArray()).filter((item) =>
    SCRAPER_SOURCE_KINDS.includes(item.kind as ScraperSourceKind)
  );

  return docs.map((item) => serializeSourceItem(item));
}

export async function getScraperSourceForActor(actor: ScraperActor, sourceId: string) {
  await ensureScraperBootstrap();
  const sources = await scraperSourcesCollection();
  const source = await sources.findOne({ _id: new ObjectId(sourceId) });
  if (!source) {
    throw new Error("任务配置不存在");
  }

  if (!SCRAPER_SOURCE_KINDS.includes(source.kind as ScraperSourceKind)) {
    throw new Error("旧版任务配置已经停用");
  }

  if (source.scope === "private" && String(source.ownerId) !== actor.id && !isScraperAdminRole(actor.role)) {
    throw new Error("没有权限访问这个任务配置");
  }

  return source;
}

export async function getScraperSourceDetailForActor(actor: ScraperActor, sourceId: string) {
  const source = await getScraperSourceForActor(actor, sourceId);
  return serializeSourceItem(source);
}

export async function createScraperSource(actor: ScraperActor, input: CreateScraperSourceInput) {
  await ensureScraperBootstrap();
  const name = input.name.trim();
  if (!name) {
    throw new Error("任务名称不能为空");
  }

  const now = new Date();
  const sources = await scraperSourcesCollection();
  const result = await sources.insertOne({
    kind: input.kind,
    name,
    scope: "private",
    ownerId: new ObjectId(actor.id),
    enabled: true,
    config: input.config,
    lastRunAt: null,
    createdAt: now,
    updatedAt: now
  });

  return getScraperSourceDetailForActor(actor, String(result.insertedId));
}

export async function updateScraperSource(actor: ScraperActor, sourceId: string, input: UpdateScraperSourceInput) {
  const source = await getScraperSourceForActor(actor, sourceId);
  if (source.scope === "system" && !isScraperAdminRole(actor.role)) {
    throw new Error("只有管理员能修改系统任务配置");
  }

  const patch: Partial<ScraperSourceDoc> = {
    updatedAt: new Date()
  };

  if (typeof input.name === "string") {
    const name = input.name.trim();
    if (!name) {
      throw new Error("任务名称不能为空");
    }
    patch.name = name;
  }

  if (typeof input.enabled === "boolean") {
    patch.enabled = input.enabled;
  }

  if (input.config) {
    patch.config = input.config;
  }

  const sources = await scraperSourcesCollection();
  await sources.updateOne({ _id: source._id }, { $set: patch });
  return getScraperSourceDetailForActor(actor, sourceId);
}

export async function deleteScraperSource(actor: ScraperActor, sourceId: string) {
  const source = await getScraperSourceForActor(actor, sourceId);
  if (source.scope === "system") {
    throw new Error("系统任务配置不能删除");
  }

  const sources = await scraperSourcesCollection();
  await sources.deleteOne({ _id: source._id });
}
