import type { Express, Request, Response, NextFunction } from "express";
import { RateLimiterMemory } from "rate-limiter-flexible";
import { logger } from "../logger";
import { miniprogramTtsSynthesizeBodySchema } from "./schema";
import { TtsService } from "./service";
import { TtsServiceError } from "./provider";

interface SyncAuthedRequest extends Request {
  syncUser?: {
    userId: string;
    openid: string;
  };
}

const ttsService = new TtsService();
const userLimiter = new RateLimiterMemory({
  points: 20,
  duration: 600
});
const ipLimiter = new RateLimiterMemory({
  points: 60,
  duration: 600
});

function resolvePublicBaseUrl(req: Request): string {
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "")
    .split(",")
    .at(0)
    ?.trim();
  const forwardedHost = String(req.headers["x-forwarded-host"] || "")
    .split(",")
    .at(0)
    ?.trim();
  const host = forwardedHost || req.get("host") || "127.0.0.1:8787";
  const protocol = forwardedProto || req.protocol || "http";
  return `${protocol}://${host}`;
}

function sendTtsError(res: Response, error: unknown) {
  if (error && typeof error === "object" && "msBeforeNext" in error) {
    res.status(429).json({
      ok: false,
      code: "TTS_RATE_LIMITED",
      message: "语音播报过于频繁，请稍后重试"
    });
    return;
  }
  const status = error instanceof TtsServiceError ? error.status : 500;
  const code = error instanceof TtsServiceError ? error.code : "TTS_INTERNAL_ERROR";
  const message = error instanceof Error ? error.message : "TTS 内部错误";
  res.status(status).json({
    ok: false,
    code,
    message
  });
}

async function checkTtsRateLimit(userId: string, ip: string): Promise<void> {
  await Promise.all([
    userLimiter.consume(userId || "unknown_user", 1),
    ipLimiter.consume(ip || "unknown_ip", 1)
  ]);
}

export function registerMiniprogramTtsRoutes(
  app: Express,
  requireSyncUser: (req: SyncAuthedRequest, res: Response, next: NextFunction) => void
): void {
  app.post("/api/miniprogram/tts/synthesize", requireSyncUser, async (req: SyncAuthedRequest, res) => {
    const userId = String(req.syncUser?.userId || "").trim();
    if (!userId) {
      res.status(401).json({ ok: false, code: "SYNC_TOKEN_INVALID", message: "同步令牌无效" });
      return;
    }
    const parsed = miniprogramTtsSynthesizeBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, code: "INVALID_BODY", message: "TTS 参数不合法" });
      return;
    }
    try {
      await checkTtsRateLimit(userId, req.socket.remoteAddress ?? "unknown");
      const payload = await ttsService.synthesizeForUser(resolvePublicBaseUrl(req), userId, parsed.data);
      res.json(payload);
    } catch (error) {
      logger.warn(
        {
          uid: userId,
          ip: req.socket.remoteAddress ?? "unknown",
          err: error
        },
        "小程序 TTS 合成失败"
      );
      sendTtsError(res, error);
    }
  });

  app.get("/api/miniprogram/tts/status/:cacheKey", async (req, res) => {
    const cacheKey = String(req.params.cacheKey || "").trim();
    const ticket = String(req.query.ticket || "").trim();
    if (!cacheKey || !ticket) {
      res.status(400).json({ ok: false, code: "TTS_TICKET_INVALID", message: "缺少音频票据" });
      return;
    }
    try {
      ttsService.verifyAudioAccess(cacheKey, ticket);
      const status = await ttsService.getSynthesisStatus(cacheKey);
      if (status.state === "ready") {
        res.json({ ok: true, status: "ready" });
        return;
      }
      if (status.state === "pending") {
        res.json({ ok: true, status: "pending" });
        return;
      }
      if (status.state === "error") {
        res.json({
          ok: false,
          status: "error",
          code: status.code,
          message: status.message
        });
        return;
      }
      res.json({
        ok: false,
        status: "missing",
        message: "音频仍在生成，请稍后重试"
      });
    } catch (error) {
      logger.warn(
        {
          cacheKey,
          err: error
        },
        "小程序 TTS 状态查询失败"
      );
      sendTtsError(res, error);
    }
  });

  app.get("/api/miniprogram/tts/audio/:cacheKey", async (req, res) => {
    const cacheKey = String(req.params.cacheKey || "").trim();
    const ticket = String(req.query.ticket || "").trim();
    if (!cacheKey || !ticket) {
      res.status(400).json({ ok: false, code: "TTS_TICKET_INVALID", message: "缺少音频票据" });
      return;
    }
    try {
      ttsService.verifyAudioAccess(cacheKey, ticket);
      const cached = await ttsService.resolveCachedAudio(cacheKey);
      if (!cached) {
        res.status(404).json({ ok: false, code: "TTS_AUDIO_NOT_FOUND", message: "音频缓存不存在" });
        return;
      }
      res.setHeader("Content-Type", cached.entry.contentType);
      res.setHeader("Content-Length", String(cached.entry.bytes));
      res.setHeader("Cache-Control", "private, max-age=300");
      res.sendFile(cached.audioPath);
    } catch (error) {
      logger.warn(
        {
          cacheKey,
          err: error
        },
        "小程序 TTS 音频读取失败"
      );
      sendTtsError(res, error);
    }
  });
}
