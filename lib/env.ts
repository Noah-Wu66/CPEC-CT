const REQUIRED_ENV = ["MONGO_URI"] as const;

type RequiredEnvName = (typeof REQUIRED_ENV)[number];

function readRequiredEnv(name: RequiredEnvName): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

// 用于签发会话 JWT 的密钥。开发环境缺省时回退到一个固定值，生产环境务必配置。
export function getAuthSecret(): string {
  const value = process.env.AUTH_SECRET;
  if (value && value.trim()) {
    return value.trim();
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("Missing required env: AUTH_SECRET");
  }
  return "dev-insecure-auth-secret-change-me";
}

export function getEnv() {
  return {
    mongoUri: readRequiredEnv("MONGO_URI")
  };
}
