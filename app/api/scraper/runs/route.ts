import type { NextRequest } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { failJson, okJson } from "@/lib/api";
import { listScraperRuns } from "@/lib/scraper/services/runs";
import { toScraperActor } from "@/lib/scraper/types";

export async function GET(request: NextRequest) {
  const auth = await requireApiSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const runs = await listScraperRuns(toScraperActor(auth.user));
    return okJson({ data: runs });
  } catch (error) {
    return failJson(error instanceof Error ? error.message : "读取失败", 400);
  }
}
