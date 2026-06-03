import type { NextRequest } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { failJson, okJson, parseJsonBody } from "@/lib/api";
import { deleteScraperSource, getScraperSourceDetailForActor, updateScraperSource } from "@/lib/scraper/services/sources";
import { toScraperActor } from "@/lib/scraper/types";
import { updateScraperSourceSchema } from "@/lib/scraper/validators";

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
    const source = await getScraperSourceDetailForActor(toScraperActor(auth.user), id);
    return okJson({ data: source });
  } catch (error) {
    return failJson(error instanceof Error ? error.message : "读取失败", 400);
  }
}

export async function PATCH(request: NextRequest, context: Context) {
  const auth = await requireApiSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  const parsed = await parseJsonBody(request, updateScraperSourceSchema);
  if (!parsed.ok) {
    return failJson(parsed.message);
  }

  try {
    const { id } = await context.params;
    const source = await updateScraperSource(toScraperActor(auth.user), id, parsed.data);
    return okJson({ data: source });
  } catch (error) {
    return failJson(error instanceof Error ? error.message : "更新失败", 400);
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  const auth = await requireApiSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const { id } = await context.params;
    await deleteScraperSource(toScraperActor(auth.user), id);
    return okJson({ success: true });
  } catch (error) {
    return failJson(error instanceof Error ? error.message : "删除失败", 400);
  }
}
