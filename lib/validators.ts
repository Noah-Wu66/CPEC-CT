import { z } from "zod";

export const emailSchema = z
  .string()
  .trim()
  .min(1, "请输入邮箱")
  .max(120, "邮箱最多 120 个字符")
  .email("邮箱格式不正确")
  .transform((value) => value.toLowerCase());

export const passwordSchema = z
  .string()
  .min(8, "密码至少 8 位")
  .max(72, "密码最多 72 位");

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: z
    .string()
    .trim()
    .min(1, "请输入昵称")
    .max(40, "昵称最多 40 个字符")
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "请输入密码").max(72, "密码最多 72 位")
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
