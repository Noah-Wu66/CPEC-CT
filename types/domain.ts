import { ObjectId } from "mongodb";

// 单一角色体系：注册即为普通用户；首位注册用户自动成为管理员（用于数据采集系统级任务）。
export const ROLES = ["user", "admin"] as const;
export type Role = (typeof ROLES)[number];

export const AUTH_PROVIDERS = ["password"] as const;
export type AuthProvider = (typeof AUTH_PROVIDERS)[number];

export const SOURCE_APPS = ["ai", "audio", "scraper"] as const;
export type SourceApp = (typeof SOURCE_APPS)[number];

export interface UserDoc {
  _id: ObjectId;
  email: string;
  displayName: string;
  passwordHash: string;
  role: Role;
  status: "active" | "locked";
  authProviders: AuthProvider[];
  createdAt: Date;
  updatedAt: Date;
}

export interface SessionDoc {
  _id: ObjectId;
  tokenHash: string;
  userId: ObjectId;
  role: Role;
  expiresAt: Date;
  createdAt: Date;
  lastSeenAt: Date;
}

export interface SystemStateDoc {
  _id: ObjectId;
  key: string;
  value: unknown;
  updatedAt: Date;
}
