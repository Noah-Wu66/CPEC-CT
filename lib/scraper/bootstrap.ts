import {
  scraperRecordsCollection,
  scraperRunArtifactsCollection,
  scraperRunsCollection,
  scraperSourcesCollection
} from "@/lib/scraper/db";
import { SCRAPER_SOURCE_KINDS } from "@/lib/scraper/types";
import { logError } from "@/lib/logger";

let scraperBootstrapPromise: Promise<void> | null = null;
let scraperBootstrapReady = false;

export async function ensureScraperBootstrap() {
  if (scraperBootstrapReady) {
    return;
  }

  if (!scraperBootstrapPromise) {
    scraperBootstrapPromise = (async () => {
      try {
        await runScraperBootstrap();
        scraperBootstrapReady = true;
      } catch (error) {
        logError("scraper", "initialize bootstrap", error);
      } finally {
        if (!scraperBootstrapReady) {
          scraperBootstrapPromise = null;
        }
      }
    })();
  }

  await scraperBootstrapPromise;
}

async function runScraperBootstrap() {
  await Promise.all([ensureScraperIndexes(), cleanupDeprecatedScraperSources()]);
}

async function ensureScraperIndexes() {
  const [sources, runs, records, artifacts] = await Promise.all([
    scraperSourcesCollection(),
    scraperRunsCollection(),
    scraperRecordsCollection(),
    scraperRunArtifactsCollection()
  ]);

  await Promise.all([
    sources.createIndex({ kind: 1, scope: 1, ownerId: 1 }),
    runs.createIndex({ sourceId: 1, createdAt: -1 }),
    runs.createIndex(
      { idempotencyKey: 1 },
      {
        unique: true,
        partialFilterExpression: { idempotencyKey: { $type: "string" } }
      }
    ),
    records.createIndex({ sourceId: 1, dedupeKey: 1 }, { unique: true }),
    artifacts.createIndex({ runId: 1, createdAt: -1 })
  ]);
}

async function cleanupDeprecatedScraperSources() {
  const sources = await scraperSourcesCollection();
  await sources.deleteMany({
    scope: "system",
    kind: {
      $nin: [...SCRAPER_SOURCE_KINDS]
    }
  });
}
