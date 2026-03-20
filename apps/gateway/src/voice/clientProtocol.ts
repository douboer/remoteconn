import { z } from "zod";
import type { RawData } from "ws";

const startPayloadSchema = z
  .object({
    user: z.record(z.string(), z.unknown()).optional(),
    audio: z
      .object({
        format: z.enum(["pcm", "wav", "ogg", "mp3"]).optional(),
        codec: z.enum(["raw", "opus"]).optional(),
        rate: z.number().int().positive().optional(),
        bits: z.number().int().positive().optional(),
        channel: z.number().int().positive().optional(),
        language: z.string().min(2).max(16).optional()
      })
      .optional(),
    request: z.record(z.string(), z.unknown()).optional()
  })
  .optional();

const controlFrameSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("start"), payload: startPayloadSchema }),
  z.object({ type: z.literal("stop") }),
  z.object({ type: z.literal("cancel") }),
  z.object({ type: z.literal("ping") })
]);

export type VoiceClientControlFrame = z.infer<typeof controlFrameSchema>;
export type VoiceClientFrame = VoiceClientControlFrame | { type: "audio"; payload: Buffer };

function rawToBuffer(raw: RawData): Buffer {
  if (Buffer.isBuffer(raw)) {
    return raw;
  }
  if (raw instanceof ArrayBuffer) {
    return Buffer.from(raw);
  }
  if (Array.isArray(raw)) {
    const chunks = raw.map((chunk) => (Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    return Buffer.concat(chunks);
  }
  return Buffer.from(raw);
}

/**
 * 前端协议：
 * - 文本帧：JSON 控制消息（start/stop/cancel/ping）
 * - 二进制帧：原始音频分片（PCM16LE）
 */
export function parseVoiceClientFrame(raw: RawData, isBinary: boolean): VoiceClientFrame {
  if (!isBinary) {
    const text = typeof raw === "string" ? raw : rawToBuffer(raw).toString("utf8");
    return controlFrameSchema.parse(JSON.parse(text));
  }

  const asBuffer = rawToBuffer(raw);
  if (asBuffer.length === 0) {
    throw new Error("audio frame is empty");
  }
  return {
    type: "audio",
    payload: asBuffer
  };
}

export function safeSendVoiceFrame(ws: { send: (data: string) => void }, frame: unknown): void {
  ws.send(JSON.stringify(frame));
}
