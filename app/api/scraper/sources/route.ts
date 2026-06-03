import type { NextRequest } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { failJson, okJson, parseJsonBody } from "@/lib/api";
import { createScraperSource, listScraperSources } from "@/lib/scraper/services/sources";
import { toScraperActor } from "@/lib/scraper/types";
import { createScraperSourceSchema } from "@/lib/scraper/validators";

export async function GET(request: NextRequest) {
  const auth = await requireApiSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const sources = await listScraperSources(toScraperActor(auth.user));
    return okJson({ data: sources });
  } catch (error) {
    return failJson(error instanceof Error ? error.message : "读取失败", 400);
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireApiSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  const parsed = await parseJsonBody(request, createScraperSourceSchema);
  if (!parsed.ok) {
    return failJson(parsed.message);
  }

  try {
    const source = await createScraperSource(toScraperActor(auth.user), {
      kind: parsed.data.kind,
      name: parsed.data.name,
      config: parsed.data.config
    });
    return okJson({ data: source });
  } catch (error) {
    return failJson(error instanceof Error ? error.message : "创建失败", 400);
  }
}
