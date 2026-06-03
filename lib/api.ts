import type { NextRequest } from "next/server";
import type { ZodSchema } from "zod";

export function okJson(data: Record<string, unknown> = {}) {
  return Response.json({ ok: true, ...data });
}

export function failJson(message: string, status = 400) {
  return Response.json({ ok: false, message }, { status });
}

export async function parseJsonBody<T>(request: NextRequest, schema: ZodSchema<T>) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return {
      ok: false as const,
      message: "请求体格式错误"
    };
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false as const,
      message: parsed.error.issues[0]?.message ?? "请求参数无效"
    };
  }
  return {
    ok: true as const,
    data: parsed.data
  };
}
