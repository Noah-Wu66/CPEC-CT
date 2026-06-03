import type { Role } from "@/types/domain";
import { getSessionUserByToken } from "@/lib/auth";
import { SESSION_COOKIE_NAME } from "@/lib/constants";

export interface SessionPayload {
  userId: string;
  email: string;
  expiresAt: Date;
  role: Role;
}

export async function verifyToken(token: string): Promise<SessionPayload | null> {
  const current = await getSessionUserByToken(token);
  if (!current) {
    return null;
  }

  return {
    userId: current.user._id.toString(),
    email: current.user.email,
    expiresAt: current.session.expiresAt,
    role: current.user.role
  };
}

export async function getSession(request: Request): Promise<SessionPayload | null> {
  const cookiesObj = (request as { cookies?: { get?: (name: string) => { value?: string } | undefined } }).cookies;
  let token = cookiesObj?.get?.(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    token = request.headers.get("cookie")?.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`))?.[1];
  }

  if (!token) {
    return null;
  }

  return verifyToken(token);
}
