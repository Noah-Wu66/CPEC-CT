import { upsertScraperRecord } from "@/lib/scraper/services/records";
import {
  xcrawlCrawl,
  xcrawlGetCrawlResult,
  xcrawlGetScrapeResult,
  xcrawlMap,
  xcrawlScrape,
  xcrawlSearch
} from "@/lib/scraper/services/xcrawl";
import {
  buildPagePayload,
  buildScraperDedupeKey,
  cleanObject,
  normalizeScrapeJson,
  normalizeUrlArray,
  parseIsoDate,
  pickBestTitle,
  pickBestUrl
} from "@/lib/scraper/source-runners/helpers";
import type { ScraperDeliveryMode, ScraperRunDoc, ScraperSourceDoc } from "@/lib/scraper/types";

const XCRAWL_POLL_INTERVAL_MS = 3000;
const XCRAWL_POLL_TIMEOUT_MS = 12 * 60 * 1000;

function mergeAdvancedParams<T extends Record<string, unknown>>(base: T, config: Record<string, any>) {
  const advancedParams =
    config.advancedParams && typeof config.advancedParams === "object" && !Array.isArray(config.advancedParams)
      ? (config.advancedParams as Record<string, unknown>)
      : {};

  return {
    ...base,
    ...advancedParams
  };
}

function buildRequestConfig(config: Record<string, any>) {
  return cleanObject({
    device: config.device || "desktop",
    locale: config.locale || "zh-CN,zh;q=0.9",
    cookies: config.cookiesJson || undefined,
    headers: config.headersJson || undefined
  });
}

function buildProxyConfig(config: Record<string, any>) {
  if (!config.proxyLocation) {
    return undefined;
  }

  return cleanObject({
    location: config.proxyLocation,
    sticky_session: config.stickySession || undefined
  });
}

function buildJsonExtraction(config: Record<string, any>) {
  if (!config.jsonPrompt && !config.jsonSchema) {
    return undefined;
  }

  return cleanObject({
    prompt: config.jsonPrompt || undefined,
    json_schema: config.jsonSchema || undefined
  });
}

function buildOutputConfig(config: Record<string, any>, fallbackFormats: string[]) {
  const formats = Array.isArray(config.formats) && config.formats.length > 0 ? config.formats : fallbackFormats;

  return cleanObject({
    formats,
    screenshot: formats.includes("screenshot") ? config.screenshotMode || undefined : undefined,
    json: buildJsonExtraction(config)
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readTaskStatus(payload: Record<string, unknown>) {
  return String(payload.status || "").trim().toLowerCase();
}

async function waitForXcrawlTask<T extends Record<string, unknown>>(input: {
  taskId: string;
  label: string;
  fetchResult: (taskId: string) => Promise<T>;
}) {
  const startedAt = Date.now();

  while (true) {
    const result = await input.fetchResult(input.taskId);
    const status = readTaskStatus(result);

    if (status === "completed") {
      return result;
    }

    if (status === "failed") {
      throw new Error(String(result.error || `${input.label} 任务失败`));
    }

    if (Date.now() - startedAt >= XCRAWL_POLL_TIMEOUT_MS) {
      throw new Error(`${input.label} 结果轮询超时`);
    }

    await sleep(XCRAWL_POLL_INTERVAL_MS);
  }
}

async function storeDiscoveryRecord(
  source: ScraperSourceDoc,
  run: ScraperRunDoc,
  kind: "search_result" | "serp_result" | "map_result",
  item: any,
  extraPayload: Record<string, unknown> = {}
) {
  const url = typeof item === "string" ? item : pickBestUrl(item);
  if (!url) {
    return false;
  }

  const title = typeof item === "string" ? item : pickBestTitle(item, url);
  await upsertScraperRecord({
    sourceId: source._id!,
    runId: run._id!,
    kind,
    title,
    url,
    publishedAt: parseIsoDate(item?.publishedAt || item?.published_at || item?.date || item?.date_utc),
    dedupeKey: buildScraperDedupeKey([String(source._id), kind, url]),
    metrics: {
      rank: typeof item?.position === "number" ? item.position : typeof item?.rank === "number" ? item.rank : null
    },
    payload: {
      ...extraPayload,
      raw: item
    }
  });

  return true;
}

async function storePageCaptureRecord(
  source: ScraperSourceDoc,
  run: ScraperRunDoc,
  kind: "scrape_result" | "crawl_result",
  input: {
    url: string;
    title?: string;
    publishedAt?: unknown;
    data: any;
  }
) {
  const pagePayload = buildPagePayload(input.data);
  const extractedJson = normalizeScrapeJson(pagePayload.extractedJson);
  const title =
    input.title ||
    pickBestTitle(extractedJson || {}, "") ||
    (typeof pagePayload.metadata.title === "string" ? pagePayload.metadata.title : "") ||
    input.url ||
    source.name;

  await upsertScraperRecord({
    sourceId: source._id!,
    runId: run._id!,
    kind,
    title,
    url: input.url,
    publishedAt: parseIsoDate(
      String(
        input.publishedAt ||
          (extractedJson && (extractedJson.publishedAt || extractedJson.publishDate)) ||
          pagePayload.metadata.published_at ||
          ""
      )
    ),
    dedupeKey: buildScraperDedupeKey([String(source._id), kind, input.url]),
    metrics: {},
    payload: {
      metadata: pagePayload.metadata,
      markdown: pagePayload.markdown,
      html: pagePayload.html,
      rawHtml: pagePayload.rawHtml,
      summary: pagePayload.summary,
      extractedJson,
      links: pagePayload.links,
      screenshot: pagePayload.screenshot,
      finalUrl: pagePayload.finalUrl,
      statusCode: pagePayload.statusCode,
      raw: pagePayload.raw
    }
  });
}

export async function runSearch(source: ScraperSourceDoc, run: ScraperRunDoc) {
  const config = source.config as Record<string, any>;
  const payload = mergeAdvancedParams(
    cleanObject({
      query: config.query || config.q,
      location: config.location || undefined,
      language: config.language || undefined,
      limit: typeof config.limit === "number" ? config.limit : Number(config.limit || 10)
    }),
    config
  );

  const response = await xcrawlSearch(payload);
  const items = normalizeUrlArray(response);
  let total = 0;

  for (const item of items) {
    const stored = await storeDiscoveryRecord(source, run, "search_result", item);
    if (stored) {
      total += 1;
    }
  }

  return {
    requestPayload: payload,
    responsePayload: response,
    stats: { total }
  };
}

export async function runMap(source: ScraperSourceDoc, run: ScraperRunDoc) {
  const config = source.config as Record<string, any>;
  const payload = mergeAdvancedParams(
    cleanObject({
      url: config.url,
      filter: config.filter || undefined,
      limit: typeof config.limit === "number" ? config.limit : Number(config.limit || 500),
      include_subdomains: typeof config.includeSubdomains === "boolean" ? config.includeSubdomains : undefined,
      ignore_query_parameters:
        typeof config.ignoreQueryParameters === "boolean" ? config.ignoreQueryParameters : undefined
    }),
    config
  );

  const response = await xcrawlMap(payload);
  const items = normalizeUrlArray(response);
  let total = 0;

  for (const item of items) {
    const stored = await storeDiscoveryRecord(source, run, "map_result", item);
    if (stored) {
      total += 1;
    }
  }

  return {
    requestPayload: payload,
    responsePayload: response,
    stats: { total }
  };
}

export async function runScrape(source: ScraperSourceDoc, run: ScraperRunDoc) {
  const config = source.config as Record<string, any>;
  const deliveryMode = (config.deliveryMode || "sync") as ScraperDeliveryMode;

  const payload = mergeAdvancedParams(
    cleanObject({
      url: config.url,
      mode: deliveryMode,
      request: buildRequestConfig(config),
      proxy: buildProxyConfig(config),
      js_render: cleanObject({
        enabled: true,
        wait_until: config.waitUntil || "networkidle"
      }),
      output: buildOutputConfig(config, ["markdown", "summary", "json"])
    }),
    config
  );

  const started = await xcrawlScrape(payload);
  const finalResponse =
    deliveryMode === "async"
      ? await waitForXcrawlTask({
          taskId: String(started.scrape_id || ""),
          label: "XCrawl Scrape",
          fetchResult: xcrawlGetScrapeResult
        })
      : started;

  await storePageCaptureRecord(source, run, "scrape_result", {
    url: String(finalResponse?.url || config.url || ""),
    title: typeof finalResponse?.data?.metadata?.title === "string" ? finalResponse.data.metadata.title : undefined,
    data: finalResponse?.data || {}
  });

  return {
    requestPayload: payload,
    responsePayload: deliveryMode === "async" ? { task: started, result: finalResponse } : finalResponse,
    stats: {
      total: 1,
      deliveryMode,
      taskId: deliveryMode === "async" ? String(started.scrape_id || "") : null
    }
  };
}

export async function runCrawl(source: ScraperSourceDoc, run: ScraperRunDoc) {
  const config = source.config as Record<string, any>;
  const payload = mergeAdvancedParams(
    cleanObject({
      url: config.url,
      crawler: cleanObject({
        limit: typeof config.limit === "number" ? config.limit : Number(config.limit || 100),
        include: Array.isArray(config.include) ? config.include : undefined,
        exclude: Array.isArray(config.exclude) ? config.exclude : undefined,
        max_depth: typeof config.maxDepth === "number" ? config.maxDepth : Number(config.maxDepth || 3),
        include_subdomains: typeof config.includeSubdomains === "boolean" ? config.includeSubdomains : undefined,
        include_entire_domain: typeof config.includeEntireDomain === "boolean" ? config.includeEntireDomain : undefined,
        include_external_links: typeof config.includeExternalLinks === "boolean" ? config.includeExternalLinks : undefined
      }),
      request: buildRequestConfig(config),
      proxy: buildProxyConfig(config),
      js_render: cleanObject({
        enabled: true,
        wait_until: config.waitUntil || "networkidle"
      }),
      output: buildOutputConfig(config, ["markdown", "summary", "json"])
    }),
    config
  );

  const started = await xcrawlCrawl(payload);
  const finalResponse = await waitForXcrawlTask({
    taskId: String(started.crawl_id || ""),
    label: "XCrawl Crawl",
    fetchResult: xcrawlGetCrawlResult
  });

  const pages = Array.isArray(finalResponse?.data) ? finalResponse.data : [];
  let total = 0;

  for (const page of pages) {
    const url = String(page?.url || page?.page_url || "");
    if (!url) {
      continue;
    }

    await storePageCaptureRecord(source, run, "crawl_result", {
      url,
      title: typeof page?.metadata?.title === "string" ? page.metadata.title : undefined,
      publishedAt: page?.metadata?.published_at,
      data: page
    });
    total += 1;
  }

  return {
    requestPayload: payload,
    responsePayload: {
      task: started,
      result: finalResponse
    },
    stats: {
      total,
      taskId: String(started.crawl_id || "")
    }
  };
}
