import type { ScraperRecordDoc, ScraperResultView } from "@/lib/scraper/types";

function safeStringify(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

function shortText(value: string, maxLength = 120) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
}

function getPagePayload(record: ScraperRecordDoc) {
  return {
    metadata: (record.payload.metadata ?? {}) as Record<string, unknown>,
    markdown: typeof record.payload.markdown === "string" ? record.payload.markdown : "",
    html: typeof record.payload.html === "string" ? record.payload.html : "",
    rawHtml: typeof record.payload.rawHtml === "string" ? record.payload.rawHtml : "",
    summary: typeof record.payload.summary === "string" ? record.payload.summary : "",
    extractedJson: record.payload.extractedJson ?? null,
    links: Array.isArray(record.payload.links) ? record.payload.links : [],
    finalUrl: typeof record.payload.finalUrl === "string" ? record.payload.finalUrl : "",
    statusCode: typeof record.payload.statusCode === "number" ? record.payload.statusCode : null
  };
}

export function toScraperResultView(record: ScraperRecordDoc): ScraperResultView {
  const page = getPagePayload(record);
  const outputFormats = [
    page.markdown ? "markdown" : "",
    page.html ? "html" : "",
    page.rawHtml ? "raw_html" : "",
    page.summary ? "summary" : "",
    page.links.length > 0 ? "links" : "",
    page.extractedJson ? "json" : ""
  ]
    .filter(Boolean)
    .join(", ");

  const finalUrl =
    page.finalUrl ||
    (typeof record.payload.finalUrl === "string" ? record.payload.finalUrl : "") ||
    record.url;

  const summary =
    page.summary ||
    shortText(page.markdown || page.html || page.rawHtml || (typeof record.payload.snippet === "string" ? record.payload.snippet : ""));

  return {
    id: String(record._id),
    kind: record.kind,
    title: record.title,
    url: record.url,
    finalUrl,
    summary,
    jsonText: page.extractedJson ? shortText(safeStringify(page.extractedJson), 160) : "",
    outputFormats,
    publishedAt: record.publishedAt ?? null,
    statusCode: page.statusCode,
    metricsText: shortText(safeStringify(record.metrics), 120)
  };
}

export function toScraperExportRow(record: ScraperRecordDoc) {
  const view = toScraperResultView(record);

  return {
    类型: view.kind,
    标题: view.title,
    原始链接: view.url,
    最终链接: view.finalUrl,
    发布时间: view.publishedAt
      ? new Intl.DateTimeFormat("zh-CN", {
          dateStyle: "short",
          timeStyle: "short",
          timeZone: "Asia/Shanghai"
        }).format(view.publishedAt)
      : "",
    状态码: view.statusCode ?? "",
    输出格式: view.outputFormats,
    摘要: view.summary,
    JSON提取: view.jsonText,
    指标: view.metricsText
  };
}
