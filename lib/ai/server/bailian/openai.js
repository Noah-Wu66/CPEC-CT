import OpenAI from "openai";
import { resolveBailianProviderConfig } from "@/lib/ai/modelRoutes";
import { DEFAULT_MODEL, DEEPSEEK_V4_PRO_MODEL, QWEN_MODEL } from "@/lib/ai/shared/models";

const DEEPSEEK_REASONING_EFFORTS = new Set(["high", "max"]);
const QWEN_REASONING_EFFORTS = new Set(["low", "medium", "xhigh"]);

export function createBailianOpenAIClient() {
  const { openAIBaseUrl, apiKey } = resolveBailianProviderConfig();
  return new OpenAI({
    apiKey,
    baseURL: openAIBaseUrl,
  });
}

function normalizeReasoningEffort(model, value) {
  const effort = typeof value === "string" ? value.trim() : "";
  if (model === QWEN_MODEL) {
    return QWEN_REASONING_EFFORTS.has(effort) ? effort : "";
  }
  if (model !== DEEPSEEK_V4_PRO_MODEL) return "";
  if (effort === "xhigh") return "max";
  if (effort === "low" || effort === "medium") return "high";
  return DEEPSEEK_REASONING_EFFORTS.has(effort) ? effort : "high";
}

/**
 * @param {Record<string, any>} [input]
 */
export function buildChatCompletionsRequest({
  model = DEFAULT_MODEL,
  messages,
  system,
  prompt,
  stream = false,
  reasoningEffort,
  tools,
  toolChoice,
  extra = {},
} = {}) {
  const requestMessages = [];

  if (typeof system === "string" && system.trim()) {
    requestMessages.push({ role: "system", content: system.trim() });
  }

  if (Array.isArray(messages)) {
    requestMessages.push(...messages);
  } else {
    requestMessages.push({ role: "user", content: String(prompt ?? "") });
  }

  const request = {
    model,
    messages: requestMessages,
    ...extra,
  };

  const reasoningEffortValue = normalizeReasoningEffort(model, reasoningEffort);
  if (reasoningEffortValue) {
    request.reasoning_effort = reasoningEffortValue;
  }
  if (model === QWEN_MODEL) {
    request.preserve_thinking = false;
  }

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
export async function requestBailianChatCompletionResponse({
  system,
  prompt,
  messages,
  model = DEFAULT_MODEL,
  signal,
  reasoningEffort,
  tools,
  toolChoice,
  extra = {},
} = {}) {
  const client = createBailianOpenAIClient();

  return client.chat.completions.create(
    buildChatCompletionsRequest({
      model,
      system,
      prompt,
      messages,
      stream: false,
      reasoningEffort,
      tools,
      toolChoice,
      extra,
    }),
    { signal }
  );
}

/**
 * @param {Record<string, any>} [input]
 */
export async function requestBailianChatCompletion(input = {}) {
  const response = await requestBailianChatCompletionResponse(input);
  return getChatCompletionOutputText(response);
}

function getContentText(content) {
  if (typeof content === "string") return content;
  return Array.isArray(content) ? content
    .map((part) => {
      if (typeof part === "string") return part;
      if (typeof part?.text === "string") return part.text;
      return "";
    })
    .join("") : "";
}

export function getChatCompletionMessage(response) {
  return response?.choices?.[0]?.message || null;
}

export function getChatCompletionOutputText(response) {
  return getContentText(getChatCompletionMessage(response)?.content).trim();
}

export function getChatCompletionToolCalls(response) {
  const calls = getChatCompletionMessage(response)?.tool_calls;
  return Array.isArray(calls) ? calls : [];
}

export function getChatCompletionCompletedUsage(eventOrResponse) {
  return eventOrResponse?.usage && typeof eventOrResponse.usage === "object" ? eventOrResponse.usage : null;
}

export function getChatCompletionChunkDelta(chunk) {
  return chunk?.choices?.[0]?.delta || {};
}

export function getChatCompletionChunkThoughtDelta(chunk) {
  const delta = getChatCompletionChunkDelta(chunk);
  return typeof delta?.reasoning_content === "string" ? delta.reasoning_content : "";
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
