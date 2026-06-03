import { AUTH_PROVIDERS, ROLES, SOURCE_APPS } from "@/types/domain";

export const APP_NAME = "智创 AI 工作台";
export const APP_TAGLINE = "AI 赋能数字融媒体创制";

export const SESSION_COOKIE_NAME = "studio_session";
export const SESSION_ROLE_COOKIE_NAME = "studio_role";
export const SESSION_IDLE_UPDATE_MINUTES = 10;

export const DEFAULT_SECURITY_SETTINGS = {
  sessionHours: 24
} as const;

export const ROLE_VALUES = ROLES;
export const AUTH_PROVIDER_VALUES = AUTH_PROVIDERS;
export const SOURCE_APP_VALUES = SOURCE_APPS;
