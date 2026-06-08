import OpenAI from "openai";
import { resolveBailianProviderConfig } from "@/lib/ai/modelRoutes";
import { QWEN_PLUS_MODEL } from "@/lib/ai/shared/models";

export const QWEN_PLUS_RECOMMENDED_MAX_COMPLETION_TOKENS = 65536;
export const QWEN_MT_PLUS_MODEL = "qwen-mt-plus";

export function createBailianOpenAIClient() {
  const { openAIBaseUrl, apiKey } = resolveBailianProviderConfig();
  return new OpenAI({
    apiKey,
    baseURL: openAIBaseUrl,
  });
}

export function getQwenMaxCompletionTokens() {
  return QWEN_PLUS_RECOMMENDED_MAX_COMPLETION_TOKENS;
}

/**
 * @param {Record<string, any>} [input]
 */
export function buildQwenChatRequest({
  model = QWEN_PLUS_MODEL,
  messages,
  stream = false,
  maxCompletionTokens = QWEN_PLUS_RECOMMENDED_MAX_COMPLETION_TOKENS,
  tools,
  toolChoice,
  extra = {},
} = {}) {
  const request = {
    model,
    messages: Array.isArray(messages) ? messages : [],
    max_completion_tokens: maxCompletionTokens,
    enable_thinking: true,
    ...extra,
  };

  if (stream) {
    request.stream = true;
    request.stream_options = { include_usage: true };
  }
  if (Array.isArray(tools) && tools.length > 0) {
    request.tools = tools;
  }
  if (toolChoice) {
    request.tool_choice = toolChoice;
  }

  return request;
}

/**
 * @param {Record<string, any>} [input]
 */
export async function requestBailianChatCompletion({
  system,
  prompt,
  model = QWEN_PLUS_MODEL,
  signal,
  extra = {},
} = {}) {
  const client = createBailianOpenAIClient();
  const messages = [];
  if (typeof system === "string" && system.trim()) {
    messages.push({ role: "system", content: system.trim() });
  }
  messages.push({ role: "user", content: String(prompt ?? "") });

  const response = await client.chat.completions.create(
    buildQwenChatRequest({
      model,
      messages,
      stream: false,
      extra,
    }),
    { signal }
  );

  return getOpenAIMessageText(response?.choices?.[0]?.message);
}

export function getOpenAIMessageText(message) {
  const content = message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (typeof part?.text === "string") return part.text;
        return "";
      })
      .join("")
      .trim();
  }
  return "";
}

export function getOpenAIReasoningText(deltaOrMessage) {
  const reasoning = deltaOrMessage?.reasoning_content ?? deltaOrMessage?.reasoning;
  return typeof reasoning === "string" ? reasoning : "";
}

export function normalizeOpenAIError(error) {
  if (error instanceof OpenAI.APIError) {
    const err = new Error(error.message || `模型请求失败（${error.status}）`);
    err.status = error.status;
    err.code = error.code;
    return err;
  }
  return error;
}
