export const MINIMAX_ANTHROPIC_MESSAGES_PATH = "/messages";
export const MINIMAX_M3_MAX_TOKENS = 524288;

export function getMinimaxMaxTokens() {
  return MINIMAX_M3_MAX_TOKENS;
}

export function buildMinimaxThinking() {
  return {
    type: "adaptive",
  };
}

export function normalizeAnthropicJsonSchema(value) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeAnthropicJsonSchema(item));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const next = {};
  for (const [key, raw] of Object.entries(value)) {
    if (key === "type" && typeof raw === "string") {
      next[key] = raw.toLowerCase();
      continue;
    }
    next[key] = normalizeAnthropicJsonSchema(raw);
  }
  return next;
}

export function getAnthropicTextFromContent(content) {
  if (typeof content === "string") {
    return content.trim();
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .map((block) => {
      if (typeof block === "string") return block;
      if (block?.type === "text" && typeof block.text === "string") return block.text;
      return "";
    })
    .join("")
    .trim();
}

export function readAnthropicErrorMessage(data, status) {
  return (
    (data && typeof data === "object" && (data.error?.message || data.message)) ||
    (typeof data === "string" ? data : "") ||
    `模型请求失败（${status}）`
  );
}

export function createMinimaxAnthropicHeaders(apiKey) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
}
