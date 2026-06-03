import { runAgentSource, type AgentProgressEvent } from "@/lib/scraper/agent/runner";
import type { ScraperRunDoc, ScraperSourceDoc } from "@/lib/scraper/types";

export async function executeScraperSource(source: ScraperSourceDoc, run: ScraperRunDoc, onProgress?: (event: AgentProgressEvent) => void) {
  switch (source.kind) {
    case "agent":
      return runAgentSource(source, run, onProgress);
    default:
      throw new Error("暂不支持这个任务类型");
  }
}
