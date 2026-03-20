import { z } from "zod";

/**
 * v1 只开放 Codex 终端播报场景，避免接口泛化过早。
 */
export const miniprogramTtsSynthesizeBodySchema = z.object({
  text: z.string().trim().min(1).max(500),
  scene: z.literal("codex_terminal"),
  voice: z.string().trim().min(1).max(64).optional(),
  speed: z.number().min(0.8).max(1.2).optional()
});

export type MiniprogramTtsSynthesizeBody = z.infer<typeof miniprogramTtsSynthesizeBodySchema>;
