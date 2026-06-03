import { z } from "zod";

export const createScraperSourceSchema = z.object({
  kind: z.literal("agent"),
  name: z.string().trim().min(1, "任务名称不能为空"),
  config: z.record(z.string(), z.unknown()).default({})
});

export const updateScraperSourceSchema = z.object({
  name: z.string().trim().min(1, "任务名称不能为空").optional(),
  enabled: z.boolean().optional(),
  config: z.record(z.string(), z.unknown()).optional()
});
