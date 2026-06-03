import { NextRequest, NextResponse } from "next/server";
import { AuthError, createSession, registerUser, setSessionCookie } from "@/lib/auth";
import { sanitizeUser } from "@/lib/serializers";
import { registerSchema } from "@/lib/validators";
import { logError } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, success: false, message: "请求格式错误" }, { status: 400 });
  }

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "提交信息不合法";
    return NextResponse.json({ ok: false, success: false, message }, { status: 400 });
  }

  try {
    const user = await registerUser(parsed.data);
    const session = await createSession(user);
    const response = NextResponse.json({ ok: true, success: true, user: sanitizeUser(user) });
    setSessionCookie(response, session.rawToken, session.expiresAt, user);
    return response;
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ ok: false, success: false, message: error.message }, { status: error.status });
    }
    logError("auth", "register", error);
    return NextResponse.json({ ok: false, success: false, message: "注册失败，请稍后再试" }, { status: 500 });
  }
}
