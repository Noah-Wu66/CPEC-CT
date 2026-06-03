import { NextRequest, NextResponse } from "next/server";
import { clearSessionCookie, deleteSessionByToken } from "@/lib/auth";
import { SESSION_COOKIE_NAME } from "@/lib/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function clearStudioSession(request: NextRequest) {
  const rawToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (rawToken) {
    await deleteSessionByToken(rawToken);
  }
}

export async function GET(request: NextRequest) {
  await clearStudioSession(request);
  const response = NextResponse.redirect(new URL("/login", request.nextUrl.origin));
  clearSessionCookie(response);
  return response;
}

export async function POST(request: NextRequest) {
  await clearStudioSession(request);
  const response = NextResponse.json({ ok: true, success: true });
  clearSessionCookie(response);
  return response;
}
