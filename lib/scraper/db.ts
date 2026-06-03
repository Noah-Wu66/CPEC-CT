import type { Collection } from "mongodb";
import { getDb } from "@/lib/db";
import type { ScraperRecordDoc, ScraperRunArtifactDoc, ScraperRunDoc, ScraperSourceDoc } from "@/lib/scraper/types";

export async function scraperSourcesCollection(): Promise<Collection<ScraperSourceDoc>> {
  return (await getDb()).collection<ScraperSourceDoc>("scraper_sources");
}

export async function scraperRunsCollection(): Promise<Collection<ScraperRunDoc>> {
  return (await getDb()).collection<ScraperRunDoc>("scraper_runs");
}

export async function scraperRunArtifactsCollection(): Promise<Collection<ScraperRunArtifactDoc>> {
  return (await getDb()).collection<ScraperRunArtifactDoc>("scraper_run_artifacts");
}

export async function scraperRecordsCollection(): Promise<Collection<ScraperRecordDoc>> {
  return (await getDb()).collection<ScraperRecordDoc>("scraper_records");
}
