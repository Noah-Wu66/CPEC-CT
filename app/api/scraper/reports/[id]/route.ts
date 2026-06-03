import type { NextRequest } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { failJson, okJson } from "@/lib/api";
import { deleteScraperRunReport } from "@/lib/scraper/services/runs";
import { toScraperActor } from "@/lib/scraper/types";

type Context = {
  params: Promise<{ id: string }>;
};

export async function DELETE(request: NextRequest, context: Context) {
  const auth = await requireApiSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const { id } = await context.params;
    await deleteScraperRunReport(toScraperActor(auth.user), id);
    return okJson({ success: true });
  } catch (error) {
    return failJson(error instanceof Error ? error.message : "删除失败", 400);
  }
}
