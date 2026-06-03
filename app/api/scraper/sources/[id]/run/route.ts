import type { NextRequest } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { failJson, okJson } from "@/lib/api";
import { getScraperSourceForActor } from "@/lib/scraper/services/sources";
import { triggerScraperSourceRun } from "@/lib/scraper/services/runs";
import { toScraperActor } from "@/lib/scraper/types";

type Context = {
  params: Promise<{ id: string }>;
};

export async function POST(request: NextRequest, context: Context) {
  const auth = await requireApiSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const actor = toScraperActor(auth.user);
    const { id } = await context.params;
    const source = await getScraperSourceForActor(actor, id);
    if (!source.enabled) {
      throw new Error("这个任务配置已停用");
    }

    const result = await triggerScraperSourceRun(source, "manual", actor);
    return okJson({ data: result });
  } catch (error) {
    return failJson(error instanceof Error ? error.message : "执行失败", 400);
  }
}
