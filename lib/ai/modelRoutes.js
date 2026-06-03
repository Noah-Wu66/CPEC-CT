// MiniMax 官方国内版平台：对话 MiniMax-M3 与图像生成 image-01 共用同一密钥与域名
const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY;
const MINIMAX_BASE_URL = "https://api.minimaxi.com/v1";

export function resolveMinimaxProviderConfig() {
  if (!MINIMAX_API_KEY) {
    throw new Error("MINIMAX_API_KEY is not set");
  }
  return {
    baseUrl: MINIMAX_BASE_URL,
    apiKey: MINIMAX_API_KEY,
  };
}

// 图像生成与对话同源，复用同一配置。
export function resolveMinimaxImageProviderConfig() {
  return resolveMinimaxProviderConfig();
}
