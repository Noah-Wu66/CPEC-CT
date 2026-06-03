import type { NextRequest } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { createAgentProgressStream } from "@/lib/scraper/agent/progress-stream";
import { createScraperSource, getScraperSourceForActor } from "@/lib/scraper/services/sources";
import { triggerScraperSourceRun } from "@/lib/scraper/services/runs";
import { toScraperActor } from "@/lib/scraper/types";

const AVAILABLE_SKILLS = ["xcrawl", "xcrawl-search", "xcrawl-map", "xcrawl-scrape", "xcrawl-crawl"];
const DEFAULT_MODEL = "MiniMax-M3";

export async function POST(request: NextRequest) {
  const auth = await requireApiSession(request);
  if (!auth.ok) {
    return new Response(JSON.stringify({ ok: false, message: "未登录" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: { goal?: string; name?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, message: "无效的请求" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const goal = typeof body.goal === "string" ? body.goal.trim() : "";
  if (!goal) {
    return new Response(JSON.stringify({ ok: false, message: "请输入采集目标" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const actor = toScraperActor(auth.user);

  let sourceDoc;
  try {
    const createdSource = await createScraperSource(actor, {
      kind: "agent",
      name: typeof body.name === "string" && body.name.trim() ? body.name.trim() : "智能采集任务",
      config: {
        goal,
        model: DEFAULT_MODEL,
        enabledSkills: AVAILABLE_SKILLS,
        defaultInputs: {},
        constraints: { maxToolCalls: 50, allowAsync: true },
      },
    });
    sourceDoc = await getScraperSourceForActor(actor, createdSource.id);
  } catch (error) {
    return new Response(
      JSON.stringify({ ok: false, message: error instanceof Error ? error.message : "创建任务失败" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  return createAgentProgressStream((send) => triggerScraperSourceRun(sourceDoc, "manual", actor, null, send));
}
