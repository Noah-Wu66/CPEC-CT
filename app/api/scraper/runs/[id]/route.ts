import type { NextRequest } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { failJson, okJson } from "@/lib/api";
import { getScraperRunById } from "@/lib/scraper/services/runs";
import { toScraperActor } from "@/lib/scraper/types";

type Context = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, context: Context) {
  const auth = await requireApiSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const { id } = await context.params;
    const run = await getScraperRunById(toScraperActor(auth.user), id);
    return okJson({ data: run });
  } catch (error) {
    return failJson(error instanceof Error ? error.message : "读取失败", 400);
  }
}
