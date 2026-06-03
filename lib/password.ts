import { randomBytes, scrypt, timingSafeEqual } from "crypto";

const KEY_LENGTH = 64;

function scryptAsync(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, (err, derivedKey) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(derivedKey);
    });
  });
}

// 返回 "salt:hash" 形式的字符串，使用 Node 内置 scrypt，无需额外依赖。
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derivedKey = await scryptAsync(password, salt);
  return `${salt.toString("hex")}:${derivedKey.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (typeof stored !== "string" || !stored.includes(":")) {
    return false;
  }
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) {
    return false;
  }

  try {
    const salt = Buffer.from(saltHex, "hex");
    const expected = Buffer.from(hashHex, "hex");
    const derivedKey = await scryptAsync(password, salt);
    if (derivedKey.length !== expected.length) {
      return false;
    }
    return timingSafeEqual(derivedKey, expected);
  } catch {
    return false;
  }
}
