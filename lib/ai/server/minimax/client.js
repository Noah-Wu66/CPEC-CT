import { resolveMinimaxProviderConfig } from "@/lib/ai/modelRoutes";
import { MINIMAX_M3_MODEL } from "@/lib/ai/shared/models";
import {
  MINIMAX_ANTHROPIC_MESSAGES_PATH,
  buildMinimaxThinking,
  createMinimaxAnthropicHeaders,
  getMinimaxMaxTokens,
  getAnthropicTextFromContent,
  readAnthropicErrorMessage,
} from "@/lib/ai/server/minimax/anthropic";

/**
 * 通过 MiniMax Anthropic 兼容接口调用 MiniMax-M3 进行一次非流式补全。
 * 供对话压缩、字幕翻译、数据采集智能体等后端复用。
 *
 * @param {object} opts
 * @param {string} [opts.system] 系统提示
 * @param {string} opts.prompt 用户输入
 * @param {string} [opts.model] 模型 ID，默认 MiniMax-M3
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<string>} 模型输出文本
 */
export async function requestMinimaxCompletion({
  system,
  prompt,
  model = MINIMAX_M3_MODEL,
  signal,
} = {}) {
  const { baseUrl, apiKey } = resolveMinimaxProviderConfig();

  const res = await fetch(`${baseUrl}${MINIMAX_ANTHROPIC_MESSAGES_PATH}`, {
    method: "POST",
    headers: createMinimaxAnthropicHeaders(apiKey),
    body: JSON.stringify({
      model,
      ...(typeof system === "string" && system.trim() ? { system } : {}),
      messages: [{ role: "user", content: String(prompt ?? "") }],
      max_tokens: getMinimaxMaxTokens(),
      thinking: buildMinimaxThinking(),
      temperature: 1,
    }),
    signal,
  });

  if (!res.ok) {
    let message = `模型请求失败（${res.status}）`;
    try {
      const data = await res.json();
      message = readAnthropicErrorMessage(data, res.status);
    } catch {
      /* ignore */
    }
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }

  const data = await res.json();
  return getAnthropicTextFromContent(data?.content);
}
