import type { NextRequest } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { createAgentProgressStream } from "@/lib/scraper/agent/progress-stream";
import { getScraperSourceForActor } from "@/lib/scraper/services/sources";
import { triggerScraperSourceRun } from "@/lib/scraper/services/runs";
import { toScraperActor } from "@/lib/scraper/types";

type Context = {
  params: Promise<{ id: string }>;
};

export async function POST(request: NextRequest, context: Context) {
  const auth = await requireApiSession(request);
  if (!auth.ok) {
    return new Response(JSON.stringify({ ok: false, message: "未登录" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let source;
  try {
    const actor = toScraperActor(auth.user);
    const { id } = await context.params;
    source = await getScraperSourceForActor(actor, id);
    if (!source.enabled) {
      throw new Error("这个任务配置已停用");
    }
  } catch (error) {
    return new Response(
      JSON.stringify({ ok: false, message: error instanceof Error ? error.message : "执行失败" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const actor = toScraperActor(auth.user);
  return createAgentProgressStream((send) => triggerScraperSourceRun(source, "manual", actor, null, send));
}
