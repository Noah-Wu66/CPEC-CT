import { resolveMinimaxProviderConfig } from "@/lib/ai/modelRoutes";
import { MINIMAX_M3_MODEL } from "@/lib/ai/shared/models";

/**
 * 通过 MiniMax 官方国内版平台调用 MiniMax-M3 进行一次非流式补全。
 * 供对话压缩、字幕翻译、数据采集智能体等后端复用。
 *
 * @param {object} opts
 * @param {string} [opts.system] 系统提示
 * @param {string} opts.prompt 用户输入
 * @param {string} [opts.model] 模型 ID，默认 MiniMax-M3
 * @param {number} [opts.maxTokens]
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<string>} 模型输出文本
 */
export async function requestMinimaxCompletion({
  system,
  prompt,
  model = MINIMAX_M3_MODEL,
  maxTokens = 8192,
  signal,
} = {}) {
  const { baseUrl, apiKey } = resolveMinimaxProviderConfig();

  const messages = [];
  if (typeof system === "string" && system.trim()) {
    messages.push({ role: "system", content: system });
  }
  messages.push({ role: "user", content: String(prompt ?? "") });

  const res = await fetch(`${baseUrl}/text/chatcompletion_v2`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      max_completion_tokens: maxTokens,
      // 默认自适应思考（官方推荐）
      thinking: { type: "adaptive" },
      temperature: 1,
      top_p: 0.95,
    }),
    signal,
  });

  if (!res.ok) {
    let message = `模型请求失败（${res.status}）`;
    try {
      const data = await res.json();
      if (data?.error?.message) message = data.error.message;
      else if (data?.message) message = data.message;
    } catch {
      /* ignore */
    }
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (Array.isArray(content)) {
    return content.map((part) => (typeof part === "string" ? part : part?.text || "")).join("").trim();
  }
  return typeof content === "string" ? content.trim() : "";
}
