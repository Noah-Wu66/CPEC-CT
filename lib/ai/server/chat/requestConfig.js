import {
  DEFAULT_WEB_SEARCH_SETTINGS,
  normalizeWebSearchSettings,
} from "@/lib/ai/shared/webSearch";

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function parseMaxTokens(value) {
  const maxTokens = Number.parseInt(value, 10);
  if (!Number.isFinite(maxTokens) || maxTokens <= 0) {
    throw new Error("maxTokens invalid");
  }
  return maxTokens;
}

export function clampMaxTokens(maxTokens, cap) {
  return Math.min(maxTokens, cap);
}

export function parseSystemPrompt(value) {
  return typeof value === "string" ? value : "";
}

export function parseWebSearchEnabled(value) {
  return parseWebSearchConfig(value).enabled;
}

export function parseWebSearchConfig(value) {
  if (value == null) {
    return {
      ...DEFAULT_WEB_SEARCH_SETTINGS,
      enabled: false,
    };
  }
  if (!isPlainObject(value)) {
    throw new Error("webSearch invalid");
  }

  if (typeof value.enabled !== "boolean") {
    throw new Error("webSearch.enabled invalid");
  }
  return normalizeWebSearchSettings(value, { defaultEnabled: false });
}


