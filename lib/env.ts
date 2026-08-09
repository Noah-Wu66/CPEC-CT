import { z } from "zod";

const mongoUriSchema = z.string().trim().min(1).refine(
  (value) => value.startsWith("mongodb://") || value.startsWith("mongodb+srv://"),
  { message: "必须是 mongodb:// 或 mongodb+srv:// 连接地址" }
);

const runtimeEnvSchema = z.object({
  MONGO_URI: mongoUriSchema,
  DASHSCOPE_API_KEY: z.string().trim().min(1),
  FIRECRAWL_API_KEY: z.string().trim().min(1),
});

let cachedEnv: ReturnType<typeof buildEnv> | null = null;

function buildEnv() {
  const parsed = runtimeEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("；");
    throw new Error(`运行环境变量无效：${missing}`);
  }

  return {
    mongoUri: parsed.data.MONGO_URI,
    dashscopeApiKey: parsed.data.DASHSCOPE_API_KEY,
    firecrawlApiKey: parsed.data.FIRECRAWL_API_KEY,
  } as const;
}

export function getEnv() {
  cachedEnv ||= buildEnv();
  return cachedEnv;
}

export function validateRuntimeEnv() {
  return getEnv();
}
