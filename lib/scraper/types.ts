import type { ObjectId } from "mongodb";
import type { Role, UserDoc } from "@/types/domain";

export const SCRAPER_SOURCE_KINDS = ["agent"] as const;
export const SCRAPER_RECORD_KINDS = ["search_result", "serp_result", "map_result", "scrape_result", "crawl_result"] as const;
export const SCRAPER_OUTPUT_FORMATS = ["markdown", "html", "raw_html", "links", "summary", "screenshot", "json"] as const;
export const SCRAPER_DELIVERY_MODES = ["sync", "async"] as const;
export const SCRAPER_SKILL_KEYS = ["xcrawl", "xcrawl-search", "xcrawl-map", "xcrawl-scrape", "xcrawl-crawl"] as const;

export const SCRAPER_RUN_STATUSES = ["queued", "running", "completed", "failed"] as const;
export const SCRAPER_RUN_TRIGGERS = ["manual"] as const;

export type ScraperSourceKind = (typeof SCRAPER_SOURCE_KINDS)[number];
export type ScraperRecordKind = (typeof SCRAPER_RECORD_KINDS)[number];
export type ScraperOutputFormat = (typeof SCRAPER_OUTPUT_FORMATS)[number];
export type ScraperDeliveryMode = (typeof SCRAPER_DELIVERY_MODES)[number];
export type ScraperSkillKey = (typeof SCRAPER_SKILL_KEYS)[number];
export type ScraperRunStatus = (typeof SCRAPER_RUN_STATUSES)[number];
export type ScraperRunTrigger = (typeof SCRAPER_RUN_TRIGGERS)[number];
export type ScraperSourceScope = "system" | "private";

export interface ScraperActor {
  id: string;
  email: string;
  role: Role;
}

export interface ScraperAgentSourceConfig {
  goal: string;
  model?: string;
  enabledSkills?: ScraperSkillKey[];
  defaultInputs?: Record<string, unknown>;
  constraints?: Record<string, unknown>;
}

export interface ScraperSourceDoc {
  _id?: ObjectId;
  kind: ScraperSourceKind;
  scope: ScraperSourceScope;
  name: string;
  ownerId?: ObjectId | null;
  enabled: boolean;
  config: ScraperAgentSourceConfig | Record<string, unknown>;
  lastRunAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ScraperRunDoc {
  _id?: ObjectId;
  sourceId: ObjectId;
  sourceKind: ScraperSourceKind;
  trigger: ScraperRunTrigger;
  status: ScraperRunStatus;
  requestedBy?: ObjectId | null;
  idempotencyKey?: string | null;
  errorMessage?: string | null;
  stats?: Record<string, unknown> | null;
  createdAt: Date;
  startedAt?: Date | null;
  completedAt?: Date | null;
  updatedAt: Date;
}

export interface ScraperRunArtifactDoc {
  _id?: ObjectId;
  runId: ObjectId;
  sourceId: ObjectId;
  artifactType: "request" | "response" | "model_request" | "model_response" | "tool_call";
  payload: Record<string, unknown>;
  createdAt: Date;
}

export interface ScraperRecordDoc {
  _id?: ObjectId;
  sourceId: ObjectId;
  runId: ObjectId;
  kind: ScraperRecordKind;
  title: string;
  url: string;
  publishedAt?: Date | null;
  dedupeKey: string;
  metrics: Record<string, number | null>;
  payload: Record<string, unknown>;
  firstSeenAt: Date;
  lastSeenAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ScraperResultView {
  id: string;
  kind: ScraperRecordKind;
  title: string;
  url: string;
  finalUrl: string;
  summary: string;
  jsonText: string;
  outputFormats: string;
  publishedAt: Date | null;
  statusCode: number | null;
  metricsText: string;
}

export interface ScraperSourceListItem {
  id: string;
  kind: ScraperSourceKind;
  name: string;
  scope: ScraperSourceScope;
  enabled: boolean;
  config: ScraperAgentSourceConfig | Record<string, unknown>;
  lastRunAt: Date | null;
}

export function toScraperActor(user: Pick<UserDoc, "_id" | "email" | "role">): ScraperActor {
  return {
    id: user._id.toString(),
    email: user.email,
    role: user.role
  };
}

export function isScraperAdminRole(role: Role) {
  // 单一角色体系：仅管理员可管理系统级采集任务。
  return role === "admin";
}

export function formatScraperSkillKey(kind: ScraperSkillKey) {
  const labels: Record<ScraperSkillKey, string> = {
    xcrawl: "XCrawl 默认入口",
    "xcrawl-search": "XCrawl Search",
    "xcrawl-map": "XCrawl Map",
    "xcrawl-crawl": "XCrawl Crawl",
    "xcrawl-scrape": "XCrawl Scrape"
  };

  return labels[kind] ?? kind;
}
