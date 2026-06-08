function readRequiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`缺少环境变量：${name}`);
  }
  return value.trim();
}

export function getScraperXcrawlEnv() {
  return {
    apiKey: readRequiredEnv("XCRAWL_API_KEY")
  };
}

export function getScraperModelEnv() {
  return {
    apiKey: readRequiredEnv("DASHSCOPE_API_KEY"),
    model: "qwen3.7-plus"
  };
}
