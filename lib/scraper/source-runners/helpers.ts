import { safeJsonParse, sha256 } from "@/lib/scraper/utils";

export function buildScraperDedupeKey(parts: Array<string | number | null | undefined>) {
  return sha256(
    parts
      .filter((item) => item !== null && item !== undefined && item !== "")
      .map((item) => String(item))
      .join("::")
  );
}

export function cleanObject(input: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined && value !== null && value !== "")
  );
}

export function normalizeUrlArray(payload: any) {
  if (Array.isArray(payload?.data)) {
    return payload.data;
  }
  if (Array.isArray(payload?.data?.urls)) {
    return payload.data.urls;
  }
  if (Array.isArray(payload?.data?.results)) {
    return payload.data.results;
  }
  if (Array.isArray(payload?.results)) {
    return payload.results;
  }
  if (Array.isArray(payload?.urls)) {
    return payload.urls;
  }
  return [];
}

export function normalizeScrapeJson(raw: any) {
  if (!raw) {
    return null;
  }
  if (typeof raw === "string") {
    return safeJsonParse(raw, null);
  }
  return raw;
}

export function parseIsoDate(value: unknown) {
  if (!value || typeof value !== "string") {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function pickBestUrl(item: any) {
  const candidates = [item?.finalUrl, item?.final_url, item?.url, item?.link, item?.source, item?.redirect_link, item?.profile_url];
  const value = candidates.find((candidate) => typeof candidate === "string" && candidate.trim());
  return typeof value === "string" ? value.trim() : "";
}

export function pickBestTitle(item: any, fallback = "") {
  const candidates = [item?.title, item?.name, item?.headline, item?.text, item?.snippet, item?.query];
  const value = candidates.find((candidate) => typeof candidate === "string" && candidate.trim());
  return typeof value === "string" ? value.trim() : fallback;
}

export function buildPagePayload(data: any) {
  const extractedJson = normalizeScrapeJson(data?.json);
  const metadata = (data?.metadata && typeof data.metadata === "object" ? data.metadata : {}) as Record<string, unknown>;

  return {
    metadata,
    markdown: typeof data?.markdown === "string" ? data.markdown : "",
    html: typeof data?.html === "string" ? data.html : "",
    rawHtml: typeof data?.raw_html === "string" ? data.raw_html : "",
    summary: typeof data?.summary === "string" ? data.summary : "",
    extractedJson,
    links: Array.isArray(data?.links) ? data.links : [],
    screenshot: data?.screenshot ?? data?.screenshot_url ?? null,
    finalUrl: typeof data?.url === "string" ? data.url : typeof metadata.url === "string" ? metadata.url : "",
    statusCode:
      typeof metadata.status_code === "number"
        ? metadata.status_code
        : typeof data?.status_code === "number"
          ? data.status_code
          : null,
    raw: data
  };
}
