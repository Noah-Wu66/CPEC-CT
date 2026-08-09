import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureStorageReady } from "@/lib/storage/server";
import { areRequiredStartupMigrationsComplete } from "@/lib/migrations/requiredStartupMigrations";
import { logError } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const checks: Record<"database" | "storage" | "migration", "ok" | "failed"> = {
    database: "failed",
    storage: "failed",
    migration: "failed",
  };
  try {
    await getDb().then((db) => db.command({ ping: 1 }));
    checks.database = "ok";
    await ensureStorageReady();
    checks.storage = "ok";
    if (!await areRequiredStartupMigrationsComplete()) {
      throw new Error("必要的数据迁移尚未完成");
    }
    checks.migration = "ok";
    return NextResponse.json(
      { status: "ok", checks },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    logError("readiness", "check dependencies", error);
    return NextResponse.json(
      { status: "unavailable", checks },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
