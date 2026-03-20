import type { Express, Request, Response, NextFunction } from "express";
import { config } from "../config";
import { logger } from "../logger";
import { verifySyncToken } from "./crypto";
import { SyncRepository } from "./repository";
import {
  syncLoginBodySchema,
  syncRecordsPayloadSchema,
  syncSettingsPayloadSchema,
  syncServersPayloadSchema
} from "./schema";
import { loginMiniprogramUser } from "./userService";
import { registerMiniprogramTtsRoutes } from "../tts/routes";

interface SyncAuthedRequest extends Request {
  syncUser?: {
    userId: string;
    openid: string;
  };
}

function ensureSyncEnabled(res: Response): boolean {
  if (config.sync.enabled) {
    return true;
  }
  logger.warn(
    {
      hasAppId: Boolean(config.sync.miniprogramAppId),
      hasAppSecret: Boolean(config.sync.miniprogramAppSecret),
      hasSecretCurrent: Boolean(config.sync.secretCurrent)
    },
    "小程序同步服务未启用"
  );
  res.status(503).json({
    ok: false,
    code: "SYNC_DISABLED",
    message: "小程序同步服务未配置"
  });
  return false;
}

function requireGatewayToken(req: Request, res: Response): boolean {
  const token = String(req.headers["x-gateway-token"] || "");
  if (token === config.gatewayToken) {
    return true;
  }
  logger.warn(
    {
      path: req.path,
      hasToken: Boolean(token)
    },
    "小程序同步登录缺少有效 gateway token"
  );
  res.status(401).json({
    ok: false,
    code: "AUTH_FAILED",
    message: "gateway token 无效"
  });
  return false;
}

function requireSyncUser(req: SyncAuthedRequest, res: Response, next: NextFunction): void {
  if (!ensureSyncEnabled(res)) return;
  const auth = String(req.headers.authorization || "");
  const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : "";
  if (!token) {
    logger.warn({ path: req.path }, "小程序同步请求缺少 Bearer token");
    res.status(401).json({ ok: false, code: "SYNC_TOKEN_MISSING", message: "缺少同步令牌" });
    return;
  }
  try {
    const payload = verifySyncToken(token);
    req.syncUser = {
      userId: payload.uid,
      openid: payload.oid
    };
    next();
  } catch (error) {
    logger.warn(
      {
        path: req.path,
        err: error
      },
      "小程序同步请求鉴权失败"
    );
    res.status(401).json({
      ok: false,
      code: "SYNC_TOKEN_INVALID",
      message: error instanceof Error ? error.message : "同步令牌无效"
    });
  }
}

export function registerSyncRoutes(app: Express): void {
  const repository = new SyncRepository();
  registerMiniprogramTtsRoutes(app, requireSyncUser);

  app.post("/api/miniprogram/auth/login", async (req, res) => {
    if (!ensureSyncEnabled(res) || !requireGatewayToken(req, res)) return;
    const parsed = syncLoginBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        ok: false,
        code: "INVALID_BODY",
        message: "登录参数不合法"
      });
      return;
    }
    try {
      const result = await loginMiniprogramUser(parsed.data.code, repository);
      res.json({
        ok: true,
        token: result.token,
        expiresAt: result.expiresAt,
        user: {
          id: result.user.id
        }
      });
    } catch (error) {
      logger.warn({ err: error }, "小程序同步登录失败");
      res.status(502).json({
        ok: false,
        code: "WECHAT_LOGIN_FAILED",
        message: error instanceof Error ? error.message : "微信登录失败"
      });
    }
  });

  app.get("/api/miniprogram/sync/bootstrap", requireSyncUser, (req: SyncAuthedRequest, res) => {
    const userId = req.syncUser?.userId;
    if (!userId) {
      res.status(401).json({ ok: false, code: "SYNC_TOKEN_INVALID", message: "同步令牌无效" });
      return;
    }
    res.json({
      ok: true,
      settings: repository.getSettings(userId),
      servers: repository.listServers(userId),
      records: repository.listRecords(userId)
    });
  });

  app.get("/api/miniprogram/sync/settings", requireSyncUser, (req: SyncAuthedRequest, res) => {
    const userId = req.syncUser?.userId;
    if (!userId) {
      res.status(401).json({ ok: false, code: "SYNC_TOKEN_INVALID", message: "同步令牌无效" });
      return;
    }
    res.json({ ok: true, settings: repository.getSettings(userId) });
  });

  app.put("/api/miniprogram/sync/settings", requireSyncUser, (req: SyncAuthedRequest, res) => {
    const userId = req.syncUser?.userId;
    if (!userId) {
      res.status(401).json({ ok: false, code: "SYNC_TOKEN_INVALID", message: "同步令牌无效" });
      return;
    }
    const parsed = syncSettingsPayloadSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, code: "INVALID_BODY", message: "settings 参数不合法" });
      return;
    }
    repository.upsertSettings(userId, parsed.data);
    res.json({ ok: true, settings: repository.getSettings(userId) });
  });

  app.get("/api/miniprogram/sync/servers", requireSyncUser, (req: SyncAuthedRequest, res) => {
    const userId = req.syncUser?.userId;
    if (!userId) {
      res.status(401).json({ ok: false, code: "SYNC_TOKEN_INVALID", message: "同步令牌无效" });
      return;
    }
    res.json({ ok: true, servers: repository.listServers(userId) });
  });

  app.put("/api/miniprogram/sync/servers", requireSyncUser, (req: SyncAuthedRequest, res) => {
    const userId = req.syncUser?.userId;
    if (!userId) {
      res.status(401).json({ ok: false, code: "SYNC_TOKEN_INVALID", message: "同步令牌无效" });
      return;
    }
    const parsed = syncServersPayloadSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, code: "INVALID_BODY", message: "servers 参数不合法" });
      return;
    }
    repository.upsertServers(userId, parsed.data.servers);
    res.json({ ok: true, servers: repository.listServers(userId) });
  });

  app.get("/api/miniprogram/sync/records", requireSyncUser, (req: SyncAuthedRequest, res) => {
    const userId = req.syncUser?.userId;
    if (!userId) {
      res.status(401).json({ ok: false, code: "SYNC_TOKEN_INVALID", message: "同步令牌无效" });
      return;
    }
    res.json({ ok: true, records: repository.listRecords(userId) });
  });

  app.put("/api/miniprogram/sync/records", requireSyncUser, (req: SyncAuthedRequest, res) => {
    const userId = req.syncUser?.userId;
    if (!userId) {
      res.status(401).json({ ok: false, code: "SYNC_TOKEN_INVALID", message: "同步令牌无效" });
      return;
    }
    const parsed = syncRecordsPayloadSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, code: "INVALID_BODY", message: "records 参数不合法" });
      return;
    }
    repository.upsertRecords(userId, parsed.data.records);
    res.json({ ok: true, records: repository.listRecords(userId) });
  });
}
