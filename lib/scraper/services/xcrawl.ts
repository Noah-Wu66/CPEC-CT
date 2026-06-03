import { getScraperXcrawlEnv } from "@/lib/scraper/env";

const XCRAWL_BASE_URL = "https://run.xcrawl.com/v1";
type XcrawlResponse = Record<string, any>;

async function scraperXcrawlFetch(path: string, payload?: Record<string, unknown>, method = "POST") {
  const env = getScraperXcrawlEnv();
  const response = await fetch(`${XCRAWL_BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.apiKey}`
    },
    body: method === "GET" || !payload ? undefined : JSON.stringify(payload),
    cache: "no-store"
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(data?.message || `XCrawl 请求失败：${response.status}`);
  }

  return data as XcrawlResponse;
}

export function xcrawlSearch(payload: Record<string, unknown>): Promise<XcrawlResponse> {
  return scraperXcrawlFetch("/search", payload);
}

export function xcrawlMap(payload: Record<string, unknown>): Promise<XcrawlResponse> {
  return scraperXcrawlFetch("/map", payload);
}

export function xcrawlScrape(payload: Record<string, unknown>): Promise<XcrawlResponse> {
  return scraperXcrawlFetch("/scrape", payload);
}

export function xcrawlGetScrapeResult(scrapeId: string): Promise<XcrawlResponse> {
  return scraperXcrawlFetch(`/scrape/${scrapeId}`, undefined, "GET");
}

export function xcrawlCrawl(payload: Record<string, unknown>): Promise<XcrawlResponse> {
  return scraperXcrawlFetch("/crawl", payload);
}

export function xcrawlGetCrawlResult(crawlId: string): Promise<XcrawlResponse> {
  return scraperXcrawlFetch(`/crawl/${crawlId}`, undefined, "GET");
}
