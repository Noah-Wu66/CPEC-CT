import type { NextRequest } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { failJson } from "@/lib/api";
import { buildScraperFlatWorkbook } from "@/lib/scraper/services/export";
import { listScraperRecords } from "@/lib/scraper/services/records";
import { listScraperSources } from "@/lib/scraper/services/sources";
import { toScraperActor } from "@/lib/scraper/types";

export async function GET(request: NextRequest) {
  const auth = await requireApiSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const actor = toScraperActor(auth.user);
    const sources = await listScraperSources(actor);
    const allowedSourceIds = new Set(sources.map((item) => item.id));
    const requestedSourceIds = request.nextUrl.searchParams.getAll("sourceId");
    const sourceIds =
      requestedSourceIds.length > 0
        ? requestedSourceIds.filter((item) => allowedSourceIds.has(item))
        : Array.from(allowedSourceIds);

    const records = await listScraperRecords({
      sourceIds,
      kinds: request.nextUrl.searchParams.getAll("kind"),
      q: request.nextUrl.searchParams.get("q") || "",
      limit: Number(request.nextUrl.searchParams.get("limit") || 1000)
    });

    const buffer = buildScraperFlatWorkbook(records);
    return new Response(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="scraper-records.xlsx"'
      }
    });
  } catch (error) {
    return failJson(error instanceof Error ? error.message : "导出失败", 400);
  }
}
