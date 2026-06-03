import { NextResponse } from "next/server";
import { getCurrentUserFromCookies } from "@/lib/auth";
import { sanitizeUser } from "@/lib/serializers";

export async function GET() {
  const current = await getCurrentUserFromCookies();
  if (!current) {
    return NextResponse.json({ ok: false, success: false, user: null }, { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    success: true,
    user: sanitizeUser(current.user)
  });
}
