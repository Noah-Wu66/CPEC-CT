import { createHash, randomBytes } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import {
  DEFAULT_SECURITY_SETTINGS,
  SESSION_COOKIE_NAME,
  SESSION_IDLE_UPDATE_MINUTES,
  SESSION_ROLE_COOKIE_NAME
} from "@/lib/constants";
import { sessionsCollection, usersCollection } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";
import type { LoginInput, RegisterInput } from "@/lib/validators";
import type { Role, SessionDoc, UserDoc } from "@/types/domain";

function hashToken(rawToken: string) {
  return createHash("sha256").update(rawToken).digest("hex");
}

function createRawToken() {
  return randomBytes(32).toString("hex");
}

function normalizeReturnTo(value: string) {
  const parsed = String(value ?? "").trim();
  if (!parsed || !parsed.startsWith("/") || parsed.startsWith("//") || parsed.includes("://")) {
    return "/";
  }
  return parsed;
}

export function buildLoginPath(returnTo = "/") {
  const normalizedReturnTo = normalizeReturnTo(returnTo);
  if (normalizedReturnTo === "/") {
    return "/login";
  }
  return `/login?return_to=${encodeURIComponent(normalizedReturnTo)}`;
}

export async function getSessionUserByToken(rawToken: string) {
  const sessions = await sessionsCollection();
  const users = await usersCollection();
  const now = new Date();

  const session = await sessions.findOne({
    tokenHash: hashToken(rawToken),
    expiresAt: { $gt: now }
  });

  if (!session) {
    return null;
  }

  const user = await users.findOne({ _id: session.userId });
  if (!user) {
    return null;
  }

  const sessionUpdates: Record<string, unknown> = {};

  if (now.getTime() - session.lastSeenAt.getTime() > SESSION_IDLE_UPDATE_MINUTES * 60 * 1000) {
    sessionUpdates.lastSeenAt = now;
  }

  if (session.role !== user.role) {
    sessionUpdates.role = user.role;
  }

  if (Object.keys(sessionUpdates).length > 0) {
    await sessions.updateOne({ _id: session._id }, { $set: sessionUpdates });
  }

  return {
    session: {
      ...session,
      ...sessionUpdates
    },
    user
  };
}

export async function createSession(user: UserDoc): Promise<{ rawToken: string; expiresAt: Date }> {
  const sessions = await sessionsCollection();
  const rawToken = createRawToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + DEFAULT_SECURITY_SETTINGS.sessionHours * 60 * 60 * 1000);

  const sessionDoc: SessionDoc = {
    _id: new ObjectId(),
    tokenHash: hashToken(rawToken),
    userId: user._id,
    role: user.role,
    createdAt: now,
    lastSeenAt: now,
    expiresAt
  };

  await sessions.insertOne(sessionDoc);

  return { rawToken, expiresAt };
}

export function syncSessionRoleCookie(response: NextResponse, user: Pick<UserDoc, "role">, expiresAt: Date) {
  response.cookies.set(SESSION_ROLE_COOKIE_NAME, user.role, {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt
  });
}

export function setSessionCookie(
  response: NextResponse,
  rawToken: string,
  expiresAt: Date,
  user?: Pick<UserDoc, "role">
) {
  response.cookies.set(SESSION_COOKIE_NAME, rawToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt
  });

  if (user) {
    syncSessionRoleCookie(response, user, expiresAt);
  }
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(0)
  });
  response.cookies.set(SESSION_ROLE_COOKIE_NAME, "", {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(0)
  });
}

export async function deleteSessionByToken(rawToken: string) {
  const sessions = await sessionsCollection();
  await sessions.deleteOne({ tokenHash: hashToken(rawToken) });
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

// 注册新用户。首位注册者自动成为管理员（便于数据采集模块的系统级任务管理）。
export async function registerUser(input: RegisterInput): Promise<UserDoc> {
  const users = await usersCollection();
  const existing = await users.findOne({ email: input.email });
  if (existing) {
    throw new AuthError("该邮箱已注册", 409);
  }

  const totalUsers = await users.countDocuments({});
  const role: Role = totalUsers === 0 ? "admin" : "user";
  const now = new Date();
  const passwordHash = await hashPassword(input.password);

  const user: UserDoc = {
    _id: new ObjectId(),
    email: input.email,
    displayName: input.displayName,
    passwordHash,
    role,
    status: "active",
    authProviders: ["password"],
    createdAt: now,
    updatedAt: now
  };

  await users.insertOne(user);
  return user;
}

export async function authenticateUser(input: LoginInput): Promise<UserDoc> {
  const users = await usersCollection();
  const user = await users.findOne({ email: input.email });
  if (!user) {
    throw new AuthError("邮箱或密码错误", 401);
  }
  if (user.status === "locked") {
    throw new AuthError("账号已被锁定，请联系管理员", 403);
  }
  const ok = await verifyPassword(input.password, user.passwordHash);
  if (!ok) {
    throw new AuthError("邮箱或密码错误", 401);
  }
  return user;
}

export async function requireApiSession(request: NextRequest) {
  const rawToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!rawToken) {
    return {
      ok: false as const,
      response: NextResponse.json({ ok: false, success: false, message: "未登录或登录已失效" }, { status: 401 })
    };
  }

  const current = await getSessionUserByToken(rawToken);
  if (!current) {
    const response = NextResponse.json({ ok: false, success: false, message: "会话已过期" }, { status: 401 });
    clearSessionCookie(response);
    return { ok: false as const, response };
  }

  return {
    ok: true as const,
    user: current.user,
    session: current.session,
    rawToken
  };
}

export async function getCurrentUserFromCookies() {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!rawToken) {
    return null;
  }

  return getSessionUserByToken(rawToken);
}

export async function requirePageSession() {
  const current = await getCurrentUserFromCookies();

  if (!current) {
    redirect(buildLoginPath() as never);
  }

  return current;
}
