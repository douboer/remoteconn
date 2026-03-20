import http from "node:http";
import { randomUUID } from "node:crypto";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { WebSocket, WebSocketServer, type RawData } from "ws";
import { config } from "./config";
import { logger } from "./logger";
import { registerSyncRoutes } from "./sync/routes";
import { checkConnectionRate } from "./security/rateLimit";
import { createSshSession, type ActiveSshSession } from "./ssh/sshSession";
import { createAssistTxnDeduper } from "./ws/assistTxnDeduper";
import { parseInboundFrame, safeSend } from "./ws/protocol";
import { parseVoiceClientFrame, safeSendVoiceFrame } from "./voice/clientProtocol";
import { extractAsrText } from "./voice/asrText";
import { inferAsrJsonFinal, parseLooseJsonPayloads } from "./voice/upstreamPayload";
import {
  createTerminalFrameCaptureRecorder,
  type TerminalFrameCaptureRecorder
} from "./debug/terminalFrameCapture";
import { createTerminalCaptureArmStore } from "./debug/terminalCaptureArm";
import {
  buildAudioOnlyRequestFrame,
  buildFullClientRequestFrame,
  isFinalServerResponse,
  parseVolcServerFrame,
  type VolcFullClientRequestPayload
} from "./voice/volcAsrProtocol";

type DisconnectActor = "client" | "server" | "network_or_unknown";

interface DisconnectLogDetail {
  actor: DisconnectActor;
  reasonCode: string;
  reasonText: string;
}

interface ResumeSessionEntry {
  key: string;
  ip: string;
  host: string;
  port: number;
  username: string;
  resumeGraceMs: number;
  session: ActiveSshSession;
  ws: WebSocket | null;
  detachedTimer: NodeJS.Timeout | null;
  pendingFrames: Array<{ type: "stdout" | "stderr"; data: string }>;
  pendingBytes: number;
  stdinSeq: number;
  closed: boolean;
  frameCapture: TerminalFrameCaptureRecorder | null;
}

const RESUME_PENDING_MAX_BYTES = 64 * 1024;
const VOICE_UPSTREAM_FINALIZE_GRACE_MS = 1_200;

/**
 * 统一断开原因归类：
 * 1) reasonCode：机器可检索字段；
 * 2) actor：粗粒度责任归因（客户端/服务端/网络或未知）；
 * 3) reasonText：面向人类阅读的诊断说明。
 */
function buildDisconnectLogDetail(reasonCode?: string, actorHint?: DisconnectActor): DisconnectLogDetail {
  const normalizedReason = reasonCode?.trim() || "unknown";

  const mappedReason = (() => {
    switch (normalizedReason) {
      case "manual":
      case "switch":
      case "host_key_rejected":
      case "client_disconnect":
        return { actor: "client" as const, reasonText: "客户端主动触发断开" };
      case "auth_failed":
        return { actor: "server" as const, reasonText: "服务端鉴权失败后主动断开" };
      case "rate_limit":
        return { actor: "server" as const, reasonText: "服务端限流触发断开" };
      case "shell_closed":
        return { actor: "server" as const, reasonText: "远端 shell 已关闭" };
      case "connection_closed":
        return { actor: "server" as const, reasonText: "SSH 底层连接已关闭" };
      case "ws_error":
        return { actor: "server" as const, reasonText: "服务端 WebSocket 处理异常" };
      case "ws_closed":
        return {
          actor: "network_or_unknown" as const,
          reasonText: "WebSocket 已关闭（需结合 close code 继续判定）"
        };
      case "ws_peer_normal_close":
        return { actor: "client" as const, reasonText: "客户端正常关闭 WebSocket" };
      default:
        return null;
    }
  })();

  if (mappedReason) {
    return {
      actor: actorHint ?? mappedReason.actor,
      reasonCode: normalizedReason,
      reasonText: mappedReason.reasonText
    };
  }

  if (normalizedReason.startsWith("ws_close_")) {
    return {
      actor: actorHint ?? "network_or_unknown",
      reasonCode: normalizedReason,
      reasonText: "WebSocket 关闭（建议结合 close code 排查客户端/网络链路）"
    };
  }

  if (normalizedReason.startsWith("client_")) {
    return {
      actor: actorHint ?? "client",
      reasonCode: normalizedReason,
      reasonText: "客户端触发断开"
    };
  }

  if (normalizedReason.startsWith("server_")) {
    return {
      actor: actorHint ?? "server",
      reasonCode: normalizedReason,
      reasonText: "服务端触发断开"
    };
  }

  return {
    actor: actorHint ?? "network_or_unknown",
    reasonCode: normalizedReason,
    reasonText: "未归类断开原因（建议结合上下文日志排查）"
  };
}

function safeSendIfOpen(ws: WebSocket | null, frame: unknown): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    return;
  }
  try {
    safeSend(ws, frame);
  } catch {
    // 连接关闭竞争窗口中允许静默失败。
  }
}

function safeSendVoiceIfOpen(ws: WebSocket | null, frame: unknown): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    return;
  }
  try {
    safeSendVoiceFrame(ws, frame);
  } catch {
    // 连接关闭竞争窗口中允许静默失败。
  }
}

function rawDataToBuffer(raw: RawData): Buffer {
  if (Buffer.isBuffer(raw)) {
    return raw;
  }
  if (raw instanceof ArrayBuffer) {
    return Buffer.from(raw);
  }
  if (Array.isArray(raw)) {
    const parts = raw.map((item) => (Buffer.isBuffer(item) ? item : Buffer.from(item)));
    return Buffer.concat(parts);
  }
  return Buffer.from(raw);
}

function isIgnorableUpstreamFrameParseError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return error.message.startsWith("invalid volc frame:");
}

function normalizeAsrErrorMessage(payload: unknown): string {
  if (!payload) {
    return "语音识别服务返回错误";
  }
  if (typeof payload === "string") {
    return payload;
  }
  if (Buffer.isBuffer(payload)) {
    const text = payload.toString("utf8").trim();
    return text || "语音识别服务返回错误";
  }
  if (typeof payload === "object") {
    const maybeMessage = (payload as Record<string, unknown>).message;
    if (typeof maybeMessage === "string" && maybeMessage.trim()) {
      return maybeMessage;
    }
    try {
      return JSON.stringify(payload);
    } catch {
      return "语音识别服务返回错误";
    }
  }
  return String(payload);
}

function maskSecret(value: string): string {
  const raw = String(value ?? "");
  if (!raw) {
    return "(empty)";
  }
  if (raw.length <= 8) {
    return `${raw.slice(0, 1)}***${raw.slice(-1)}`;
  }
  return `${raw.slice(0, 4)}***${raw.slice(-4)}`;
}

function normalizeHeaderValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  return value ?? "";
}

function summarizeAsrPayloadShape(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object") {
    return { payloadType: typeof payload };
  }
  if (Array.isArray(payload)) {
    return { payloadType: "array", length: payload.length };
  }
  const root = payload as Record<string, unknown>;
  const result = root.result;
  const resultRecord =
    result && typeof result === "object" && !Array.isArray(result)
      ? (result as Record<string, unknown>)
      : null;
  const payloadMsg = root.payload_msg;
  const payloadMsgRecord =
    payloadMsg && typeof payloadMsg === "object" && !Array.isArray(payloadMsg)
      ? (payloadMsg as Record<string, unknown>)
      : null;
  return {
    payloadType: "object",
    rootKeys: Object.keys(root),
    hasResult: result !== undefined,
    resultType: Array.isArray(result) ? "array" : typeof result,
    resultKeys: resultRecord ? Object.keys(resultRecord) : [],
    hasPayloadMsg: payloadMsg !== undefined,
    payloadMsgType: Array.isArray(payloadMsg) ? "array" : typeof payloadMsg,
    payloadMsgKeys: payloadMsgRecord ? Object.keys(payloadMsgRecord) : []
  };
}

function toAsrPayloadPreview(payload: unknown, maxChars = 512): string {
  try {
    const raw = typeof payload === "string" ? payload : JSON.stringify(payload);
    if (!raw) {
      return "(empty)";
    }
    if (raw.length <= maxChars) {
      return raw;
    }
    return `${raw.slice(0, maxChars)}...`;
  } catch {
    return "(unserializable)";
  }
}

function readHttpBodyPreview(
  stream: NodeJS.ReadableStream,
  maxBytes = 8192
): Promise<{ text: string; truncated: boolean }> {
  return new Promise((resolve) => {
    let kept = 0;
    let truncated = false;
    const chunks: Buffer[] = [];

    const done = (): void => {
      const text = Buffer.concat(chunks).toString("utf8").trim();
      resolve({ text, truncated });
    };

    stream.on("data", (chunk: unknown) => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk ?? ""), "utf8");
      if (kept >= maxBytes) {
        truncated = true;
        return;
      }
      const remain = maxBytes - kept;
      if (buf.length <= remain) {
        chunks.push(buf);
        kept += buf.length;
        return;
      }
      chunks.push(buf.subarray(0, remain));
      kept += remain;
      truncated = true;
    });

    stream.once("end", done);
    stream.once("close", done);
    stream.once("error", () => done());
  });
}

function buildAsrRequestPayload(rawPayload: unknown): VolcFullClientRequestPayload {
  const input = (rawPayload && typeof rawPayload === "object" ? rawPayload : {}) as {
    user?: Record<string, unknown>;
    audio?: {
      format?: "pcm" | "wav" | "ogg" | "mp3";
      codec?: "raw" | "opus";
      rate?: number;
      bits?: number;
      channel?: number;
      language?: string;
    };
    request?: Record<string, unknown>;
  };

  const audio = input.audio ?? {};
  const rawRequest = input.request ?? {};
  const modelName =
    typeof rawRequest.model_name === "string" && rawRequest.model_name.trim()
      ? rawRequest.model_name
      : "bigmodel";
  const normalizedRequest = {
    enable_itn: true,
    enable_punc: true,
    show_utterances: false,
    result_type: "full",
    ...rawRequest,
    model_name: modelName
  } as Record<string, unknown> & { model_name: string };

  return {
    ...(input.user ? { user: input.user } : {}),
    audio: {
      format: audio.format ?? "pcm",
      codec: audio.codec ?? "raw",
      rate: audio.rate ?? 16000,
      bits: audio.bits ?? 16,
      channel: audio.channel ?? 1,
      ...(audio.language ? { language: audio.language } : {})
    },
    request: normalizedRequest
  };
}

function canResumeFromClose(reasonCode: string): boolean {
  /**
   * 说明：
   * - 浏览器刷新/页面重载时，服务端有概率收到 1006（未携带 close frame）；
   * - 将 1006 纳入短时续接，避免“刷新服务器页导致 SSH 立即断开”。
   */
  return [
    "ws_peer_normal_close",
    "ws_close_1000",
    "ws_close_1001",
    "ws_close_1005",
    "ws_close_1006"
  ].includes(reasonCode);
}

/**
 * 续接驻留窗口收敛：
 * 1. 客户端可按连接声明期望时长；
 * 2. 服务端仍用默认值兜底，并用最大值做硬上限；
 * 3. 最终值至少保留 1 秒，避免异常配置导致“刚挂起就过期”。
 */
function resolveResumeGraceMs(requestedMs?: number): number {
  const fallback = Math.max(1000, config.terminalResumeGraceDefaultMs);
  const max = Math.max(fallback, config.terminalResumeGraceMaxMs);
  if (!Number.isFinite(requestedMs)) {
    return fallback;
  }
  const normalized = Math.round(Number(requestedMs));
  if (normalized <= 0) {
    return fallback;
  }
  return Math.max(1000, Math.min(normalized, max));
}

function isSameResumeTarget(
  entry: ResumeSessionEntry,
  target: { ip: string; host: string; port: number; username: string }
): boolean {
  return (
    entry.ip === target.ip &&
    entry.host === target.host &&
    entry.port === target.port &&
    entry.username === target.username
  );
}

function clearResumeEntryTimer(entry: ResumeSessionEntry): void {
  if (entry.detachedTimer) {
    clearTimeout(entry.detachedTimer);
    entry.detachedTimer = null;
  }
}

function pushPendingFrame(
  entry: ResumeSessionEntry,
  frame: { type: "stdout" | "stderr"; data: string }
): void {
  entry.pendingFrames.push(frame);
  entry.pendingBytes += Buffer.byteLength(frame.data, "utf8");
  while (entry.pendingBytes > RESUME_PENDING_MAX_BYTES && entry.pendingFrames.length > 0) {
    const shifted = entry.pendingFrames.shift();
    if (!shifted) {
      break;
    }
    entry.pendingBytes = Math.max(0, entry.pendingBytes - Buffer.byteLength(shifted.data, "utf8"));
  }
}

function flushPendingFrames(entry: ResumeSessionEntry): void {
  if (!entry.ws || entry.ws.readyState !== WebSocket.OPEN || entry.pendingFrames.length === 0) {
    return;
  }
  for (const frame of entry.pendingFrames) {
    safeSendIfOpen(entry.ws, { type: frame.type, payload: { data: frame.data } });
  }
  entry.pendingFrames = [];
  entry.pendingBytes = 0;
}

export function createGatewayServer(): http.Server {
  const app = express();
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigin === "*" ? true : config.corsOrigin }));
  app.use(express.json({ limit: "1mb" }));
  app.use(pinoHttp({ logger }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "remoteconn-gateway", ts: new Date().toISOString() });
  });

  app.get("/version", (_req, res) => {
    res.json({ version: "2.4.0", now: new Date().toISOString() });
  });

  registerSyncRoutes(app);

  const server = http.createServer(app);
  // 生产默认关闭 WebSocket 压缩，避免终端/语音高频小包触发无谓 CPU 消耗。
  const wss = new WebSocketServer({ noServer: true, perMessageDeflate: false });
  const asrWss = new WebSocketServer({ noServer: true, perMessageDeflate: false });
  const assistTxnTtlMs = config.assistTxnTtlMs;
  const assistTxnCacheLimit = config.assistTxnCacheLimit;
  const resumeSessions = new Map<string, ResumeSessionEntry>();
  const captureArmStore = createTerminalCaptureArmStore();

  app.post("/debug/terminal-captures/arm", (req, res) => {
    const tokenByQuery = String(req.query?.token || "");
    const token = String(req.headers["x-gateway-token"] || tokenByQuery);
    if (token !== config.gatewayToken) {
      res.status(401).json({ ok: false, error: "token 无效" });
      return;
    }
    try {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const rule = captureArmStore.arm({
        captureDir: String(body.captureDir || ""),
        ttlMs: Number(body.ttlMs) || 5 * 60 * 1000,
        ip: body.ip,
        clientSessionKey: body.clientSessionKey,
        host: body.host,
        port: body.port,
        username: body.username
      });
      res.json({ ok: true, rule, activeRules: captureArmStore.list() });
    } catch (error) {
      res.status(400).json({
        ok: false,
        error: error instanceof Error ? error.message : String(error || "arm failed")
      });
    }
  });

  /**
   * 统一升级路由，避免多 WebSocketServer(path=...) 在同一 HTTP server 上互相抢占 upgrade 事件。
   */
  server.on("upgrade", (req, socket, head) => {
    let pathname = "";
    try {
      const requestUrl = new URL(req.url ?? "", "http://gateway.local");
      pathname = requestUrl.pathname;
    } catch {
      socket.destroy();
      return;
    }

    const upgrade = (target: WebSocketServer): void => {
      target.handleUpgrade(req, socket, head, (client) => {
        target.emit("connection", client, req);
      });
    };

    if (pathname === "/ws/terminal") {
      upgrade(wss);
      return;
    }
    if (pathname === "/ws/asr") {
      upgrade(asrWss);
      return;
    }

    socket.write("HTTP/1.1 404 Not Found\\r\\n\\r\\n");
    socket.destroy();
  });

  wss.on("connection", async (ws, req) => {
    const ip = req.socket.remoteAddress ?? "unknown";
    const url = new URL(req.url ?? "", "http://gateway.local");
    const tokenByQuery = url.searchParams.get("token") ?? "";
    const token = String(req.headers["x-gateway-token"] || tokenByQuery);
    let disconnectDetail: DisconnectLogDetail | null = null;

    /**
     * 仅在“新信息更明确”时覆盖当前断开原因：
     * - 首次写入直接采纳；
     * - 当前是 unknown/network_or_unknown 且新值是 client/server 时允许覆盖；
     * - 避免同一连接在多处 close 回调里反复改写原因，导致日志不稳定。
     */
    const rememberDisconnect = (reasonCode?: string, actorHint?: DisconnectActor): DisconnectLogDetail => {
      const next = buildDisconnectLogDetail(reasonCode, actorHint);
      if (!disconnectDetail) {
        disconnectDetail = next;
        return disconnectDetail;
      }
      const currentWeak =
        disconnectDetail.reasonCode === "unknown" || disconnectDetail.actor === "network_or_unknown";
      const nextStrong = next.actor === "client" || next.actor === "server";
      if (currentWeak && nextStrong) {
        disconnectDetail = next;
      }
      return disconnectDetail;
    };

    if (token !== config.gatewayToken) {
      const detail = rememberDisconnect("auth_failed", "server");
      logger.warn(
        {
          ip,
          disconnectActor: detail.actor,
          disconnectReasonCode: detail.reasonCode,
          disconnectReasonText: detail.reasonText
        },
        "拒绝终端连接"
      );
      safeSendIfOpen(ws, {
        type: "error",
        payload: {
          code: "AUTH_FAILED",
          message: "token 无效"
        }
      });
      ws.close();
      return;
    }

    try {
      await checkConnectionRate(ip);
    } catch {
      const detail = rememberDisconnect("rate_limit", "server");
      logger.warn(
        {
          ip,
          disconnectActor: detail.actor,
          disconnectReasonCode: detail.reasonCode,
          disconnectReasonText: detail.reasonText
        },
        "拒绝终端连接"
      );
      safeSendIfOpen(ws, {
        type: "error",
        payload: {
          code: "RATE_LIMIT",
          message: "连接过于频繁，请稍后重试"
        }
      });
      ws.close();
      return;
    }

    logger.info({ ip }, "新的终端连接");

    let session: ActiveSshSession | null = null;
    let heartbeat: NodeJS.Timeout | undefined;
    let stdinSeq = 0;
    let resumeEntry: ResumeSessionEntry | null = null;
    let frameCapture: TerminalFrameCaptureRecorder | null = null;
    const isDuplicateAssistTxn = createAssistTxnDeduper({
      ttlMs: assistTxnTtlMs,
      cacheLimit: assistTxnCacheLimit
    });

    const stopHeartbeat = (): void => {
      if (heartbeat) {
        clearInterval(heartbeat);
        heartbeat = undefined;
      }
    };

    const cleanupResumeEntry = (entry: ResumeSessionEntry | null): void => {
      if (!entry) {
        return;
      }
      clearResumeEntryTimer(entry);
      entry.ws = null;
      if (resumeSessions.get(entry.key) === entry) {
        resumeSessions.delete(entry.key);
      }
    };

    const attachResumeEntry = (entry: ResumeSessionEntry): void => {
      clearResumeEntryTimer(entry);
      entry.ws = ws;
      session = entry.session;
      stdinSeq = entry.stdinSeq;
      resumeEntry = entry;
      frameCapture = entry.frameCapture;
      safeSendIfOpen(ws, { type: "control", payload: { action: "connected", resumed: true } });
      flushPendingFrames(entry);
      heartbeat = setInterval(() => {
        safeSendIfOpen(ws, { type: "control", payload: { action: "ping" } });
      }, config.sshKeepaliveIntervalMs);
    };

    ws.on("message", async (raw) => {
      try {
        const frame = parseInboundFrame(raw.toString("utf8"));

        if (frame.type === "control" && frame.payload.action === "ping") {
          safeSendIfOpen(ws, {
            type: "control",
            payload: {
              action: "pong"
            }
          });
          return;
        }

        if (frame.type === "control" && frame.payload.action === "pong") {
          return;
        }

        if (frame.type === "control" && frame.payload.action === "disconnect") {
          const detail = rememberDisconnect(frame.payload.reason ?? "client_disconnect", "client");
          logger.info(
            {
              ip,
              disconnectActor: detail.actor,
              disconnectReasonCode: detail.reasonCode,
              disconnectReasonText: detail.reasonText
            },
            "收到客户端断开请求"
          );
          cleanupResumeEntry(resumeEntry);
          session?.close(frame.payload.reason ?? "client_disconnect");
          ws.close();
          return;
        }

        if (frame.type === "init") {
          if (session) {
            safeSendIfOpen(ws, {
              type: "error",
              payload: {
                code: "ALREADY_INITIALIZED",
                message: "会话已初始化"
              }
            });
            return;
          }

          const resumeKey = String(frame.payload.clientSessionKey ?? "").trim();
          const resumeGraceMs = resolveResumeGraceMs(frame.payload.resumeGraceMs);
          if (resumeKey) {
            const existing = resumeSessions.get(resumeKey);
            if (
              existing &&
              !existing.closed &&
              existing.ws === null &&
              isSameResumeTarget(existing, {
                ip,
                host: frame.payload.host,
                port: frame.payload.port,
                username: frame.payload.username
              })
            ) {
              existing.resumeGraceMs = resumeGraceMs;
              attachResumeEntry(existing);
              logger.info({ ip, resumeKey }, "终端会话续接成功");
              return;
            }
            if (existing && !existing.closed) {
              existing.closed = true;
              clearResumeEntryTimer(existing);
              existing.ws = null;
              resumeSessions.delete(resumeKey);
              existing.session.close("resume_replaced");
              logger.warn({ ip, resumeKey }, "检测到会话键冲突，已替换旧会话");
            }
          }

          const armedCaptureRule = captureArmStore.take({
            ip,
            clientSessionKey: resumeKey,
            host: frame.payload.host,
            port: frame.payload.port,
            username: frame.payload.username
          });

          frameCapture = createTerminalFrameCaptureRecorder({
            ip,
            host: frame.payload.host,
            port: frame.payload.port,
            username: frame.payload.username,
            clientSessionKey: resumeKey,
            captureDir: armedCaptureRule?.captureDir
          });
          if (frameCapture) {
            logger.info(
              { ip, captureFile: frameCapture.filePath, armedRuleId: armedCaptureRule?.id || "" },
              "终端帧录制已开启"
            );
          }

          session = await createSshSession({
            host: frame.payload.host,
            port: frame.payload.port,
            username: frame.payload.username,
            credential: frame.payload.credential,
            jumpHost: frame.payload.jumpHost,
            knownHostFingerprint: frame.payload.knownHostFingerprint,
            pty: frame.payload.pty,
            onHostFingerprint({ fingerprint, hostPort }) {
              safeSendIfOpen(resumeEntry?.ws ?? ws, {
                type: "control",
                payload: {
                  action: "connected",
                  fingerprint,
                  fingerprintHostPort: hostPort
                }
              });
            },
            onStdout(data) {
              (resumeEntry?.frameCapture ?? frameCapture)?.record("stdout", data);
              if (resumeEntry) {
                if (resumeEntry.ws) {
                  safeSendIfOpen(resumeEntry.ws, { type: "stdout", payload: { data } });
                } else {
                  pushPendingFrame(resumeEntry, { type: "stdout", data });
                }
                return;
              }
              safeSendIfOpen(ws, { type: "stdout", payload: { data } });
            },
            onStderr(data) {
              (resumeEntry?.frameCapture ?? frameCapture)?.record("stderr", data);
              if (resumeEntry) {
                if (resumeEntry.ws) {
                  safeSendIfOpen(resumeEntry.ws, { type: "stderr", payload: { data } });
                } else {
                  pushPendingFrame(resumeEntry, { type: "stderr", data });
                }
                return;
              }
              safeSendIfOpen(ws, { type: "stderr", payload: { data } });
            },
            onClose(reason) {
              (resumeEntry?.frameCapture ?? frameCapture)?.close(reason);
              const detail = rememberDisconnect(reason, "server");
              logger.info(
                {
                  ip,
                  disconnectActor: detail.actor,
                  disconnectReasonCode: detail.reasonCode,
                  disconnectReasonText: detail.reasonText
                },
                "SSH 会话断开"
              );
              if (resumeEntry) {
                resumeEntry.closed = true;
                cleanupResumeEntry(resumeEntry);
              }
              safeSendIfOpen(resumeEntry?.ws ?? ws, {
                type: "control",
                payload: { action: "disconnect", reason }
              });
            }
          });

          if (resumeKey) {
            resumeEntry = {
              key: resumeKey,
              ip,
              host: frame.payload.host,
              port: frame.payload.port,
              username: frame.payload.username,
              resumeGraceMs,
              session,
              ws,
              detachedTimer: null,
              pendingFrames: [],
              pendingBytes: 0,
              stdinSeq: 0,
              closed: false,
              frameCapture
            };
            resumeSessions.set(resumeKey, resumeEntry);
          }

          // 会话真正建立（shell ready）后发送 connected，供前端切换到可输入状态。
          safeSendIfOpen(ws, { type: "control", payload: { action: "connected" } });

          // 心跳：由网关定期向客户端发 ping，客户端不响应时将会被底层断开。
          heartbeat = setInterval(() => {
            safeSendIfOpen(ws, { type: "control", payload: { action: "ping" } });
          }, config.sshKeepaliveIntervalMs);

          return;
        }

        if (frame.type === "stdin") {
          stdinSeq += 1;
          if (resumeEntry) {
            resumeEntry.stdinSeq = stdinSeq;
          }
          const source = frame.payload.meta?.source;
          const txnId = frame.payload.meta?.txnId;
          if (isDuplicateAssistTxn(source, txnId)) {
            return;
          }
          (resumeEntry?.frameCapture ?? frameCapture)?.record("stdin", frame.payload.data);
          session?.write(frame.payload.data, stdinSeq);
          return;
        }

        if (frame.type === "resize") {
          session?.resize(frame.payload.cols, frame.payload.rows);
        }
      } catch (error) {
        logger.warn({ error, ip }, "处理 WS 消息失败");
        safeSendIfOpen(ws, {
          type: "error",
          payload: {
            code: "BAD_REQUEST",
            message: (error as Error).message
          }
        });
      }
    });

    ws.on("close", (code, rawReason) => {
      if (!disconnectDetail) {
        if (code === 1000) {
          rememberDisconnect("ws_peer_normal_close", "client");
        } else {
          rememberDisconnect(`ws_close_${code}`, "network_or_unknown");
        }
      }
      const detail = disconnectDetail ?? buildDisconnectLogDetail("unknown");
      stopHeartbeat();

      const canPark =
        Boolean(resumeEntry?.key) &&
        Boolean(session) &&
        !resumeEntry?.closed &&
        canResumeFromClose(detail.reasonCode);

      if (canPark && resumeEntry && session) {
        const parkedEntry = resumeEntry;
        parkedEntry.ws = null;
        parkedEntry.stdinSeq = stdinSeq;
        clearResumeEntryTimer(parkedEntry);
        parkedEntry.detachedTimer = setTimeout(() => {
          if (parkedEntry.closed) {
            cleanupResumeEntry(parkedEntry);
            return;
          }
          parkedEntry.closed = true;
          cleanupResumeEntry(parkedEntry);
          parkedEntry.session.close("resume_timeout");
          logger.info({ ip, resumeKey: parkedEntry.key }, "终端续接超时，已关闭驻留 SSH 会话");
        }, parkedEntry.resumeGraceMs);
        session = null;
        logger.info(
          {
            ip,
            wsCloseCode: code,
            wsCloseReason: rawReason.toString("utf8") || null,
            disconnectActor: detail.actor,
            disconnectReasonCode: detail.reasonCode,
            disconnectReasonText: detail.reasonText,
            resumeKey: parkedEntry.key,
            resumeGraceMs: parkedEntry.resumeGraceMs
          },
          "终端连接关闭（会话驻留等待续接）"
        );
        return;
      }

      cleanupResumeEntry(resumeEntry);
      session?.close("ws_closed");
      session = null;
      logger.info(
        {
          ip,
          wsCloseCode: code,
          wsCloseReason: rawReason.toString("utf8") || null,
          disconnectActor: detail.actor,
          disconnectReasonCode: detail.reasonCode,
          disconnectReasonText: detail.reasonText
        },
        "终端连接关闭"
      );
    });

    ws.on("error", (error) => {
      const detail = rememberDisconnect("ws_error", "server");
      logger.warn(
        {
          ip,
          error,
          disconnectActor: detail.actor,
          disconnectReasonCode: detail.reasonCode,
          disconnectReasonText: detail.reasonText
        },
        "ws 错误"
      );
      stopHeartbeat();
      cleanupResumeEntry(resumeEntry);
      session?.close("ws_error");
      session = null;
    });
  });

  asrWss.on("connection", async (ws, req) => {
    const ip = req.socket.remoteAddress ?? "unknown";
    const voiceConnLogger = logger.child({
      loggerName: "com.remoteconn.gateway",
      module: "voice",
      ip
    });
    const url = new URL(req.url ?? "", "http://gateway.local");
    const tokenByQuery = url.searchParams.get("token") ?? "";
    const token = String(req.headers["x-gateway-token"] || tokenByQuery);

    if (token !== config.gatewayToken) {
      voiceConnLogger.warn({ event: "auth_failed" }, "拒绝语音连接：token 无效");
      safeSendVoiceIfOpen(ws, {
        type: "error",
        payload: {
          code: "AUTH_FAILED",
          message: "token 无效"
        }
      });
      ws.close();
      return;
    }

    try {
      await checkConnectionRate(ip);
    } catch {
      voiceConnLogger.warn({ event: "rate_limited" }, "拒绝语音连接：触发限流");
      safeSendVoiceIfOpen(ws, {
        type: "error",
        payload: {
          code: "RATE_LIMIT",
          message: "连接过于频繁，请稍后重试"
        }
      });
      ws.close();
      return;
    }

    if (!config.asr.appId || !config.asr.accessToken || !config.asr.resourceId || !config.asr.wsUrl) {
      voiceConnLogger.error({ event: "config_missing" }, "语音服务配置缺失");
      safeSendVoiceIfOpen(ws, {
        type: "error",
        payload: {
          code: "ASR_CONFIG_MISSING",
          message: "语音服务配置缺失，请检查网关环境变量"
        }
      });
      ws.close();
      return;
    }

    let upstream: WebSocket | null = null;
    let startSent = false;
    let stopSent = false;
    let readySent = false;
    let handshakeFailureNotified = false;
    const connectId = randomUUID();
    const voiceLogger = voiceConnLogger.child({ connectId });
    let clientAudioFrameCount = 0;
    let clientAudioBytes = 0;
    let upstreamResponseCount = 0;
    let upstreamNonEmptyTextCount = 0;
    let upstreamEmptyTextWarnLogged = 0;
    let upstreamEmptyTextWarnSuppressed = 0;
    let upstreamJsonTextFrameCount = 0;
    let upstreamFallbackJsonFrameCount = 0;
    let pendingFinalizeTimer: NodeJS.Timeout | null = null;

    const closeUpstream = (reason = "proxy_closed"): void => {
      if (pendingFinalizeTimer) {
        clearTimeout(pendingFinalizeTimer);
        pendingFinalizeTimer = null;
      }
      if (!upstream) {
        return;
      }
      if (upstream.readyState === WebSocket.OPEN || upstream.readyState === WebSocket.CONNECTING) {
        upstream.close(1000, reason);
      }
      upstream = null;
    };

    const sendFinalStopBeforeClose = (reason: string): void => {
      if (!upstream || upstream.readyState !== WebSocket.OPEN || !startSent || stopSent) {
        closeUpstream(reason);
        return;
      }

      try {
        upstream.send(buildAudioOnlyRequestFrame(Buffer.alloc(0), true));
        stopSent = true;
        voiceLogger.warn(
          {
            event: "upstream_finalize_on_client_close",
            reason,
            clientAudioFrameCount,
            clientAudioBytes
          },
          "检测到客户端异常收尾，已补发 stop 结束包"
        );
      } catch (error) {
        voiceLogger.warn(
          { event: "upstream_finalize_send_failed", reason, error },
          "补发 stop 失败，直接关闭上游"
        );
        closeUpstream(reason);
        return;
      }

      if (pendingFinalizeTimer) {
        clearTimeout(pendingFinalizeTimer);
      }
      pendingFinalizeTimer = setTimeout(() => {
        pendingFinalizeTimer = null;
        closeUpstream(reason);
      }, VOICE_UPSTREAM_FINALIZE_GRACE_MS);
    };

    const forwardJsonPayloadIfMeaningful = (params: {
      payload: unknown;
      source: "json_text" | "json_binary_fallback";
      sequence: number | null;
      flags: number;
    }): void => {
      if (params.payload && typeof params.payload === "object" && !Array.isArray(params.payload)) {
        const keys = Object.keys(params.payload as Record<string, unknown>);
        if (keys.length === 0) {
          voiceLogger.info(
            {
              event: "upstream_empty_json_payload_ignored",
              source: params.source,
              sequence: params.sequence
            },
            "忽略空 JSON 上游帧"
          );
          return;
        }
      }

      forwardAsrPayload({
        payload: params.payload,
        flags: params.flags,
        sequence: params.sequence,
        isFinal: inferAsrJsonFinal(params.payload),
        source: params.source
      });
    };

    try {
      const upstreamUrl = new URL(config.asr.wsUrl);
      if (config.asr.cluster && !upstreamUrl.searchParams.has("cluster")) {
        upstreamUrl.searchParams.set("cluster", config.asr.cluster);
      }

      const headers: Record<string, string> = {
        "X-Api-App-Key": config.asr.appId,
        "X-Api-Access-Key": config.asr.accessToken,
        "X-Api-Resource-Id": config.asr.resourceId,
        "X-Api-Connect-Id": connectId
      };
      if (config.asr.cluster) {
        headers["X-Api-Cluster"] = config.asr.cluster;
      }

      voiceLogger.info(
        {
          event: "upstream_connect_prepare",
          upstreamUrl: upstreamUrl.toString(),
          upstreamPath: upstreamUrl.pathname,
          asrUpstreamHeaders: {
            "X-Api-App-Key": headers["X-Api-App-Key"],
            "X-Api-Access-Key": maskSecret(headers["X-Api-Access-Key"] ?? ""),
            "X-Api-Resource-Id": headers["X-Api-Resource-Id"],
            "X-Api-Connect-Id": headers["X-Api-Connect-Id"]
          },
          resourceIdMatchesSeedAsr2Duration: headers["X-Api-Resource-Id"] === "volc.seedasr.sauc.duration"
        },
        "语音上游建连参数（已打码）"
      );

      // 语音链路以小包高频传输为主，禁用压缩可显著降低 CPU 抖动与时延尾部。
      upstream = new WebSocket(upstreamUrl, { headers, perMessageDeflate: false });
    } catch (error) {
      voiceLogger.error({ event: "upstream_init_failed", error }, "连接语音上游失败");
      safeSendVoiceIfOpen(ws, {
        type: "error",
        payload: {
          code: "ASR_UPSTREAM_INIT_FAILED",
          message: "语音服务初始化失败"
        }
      });
      ws.close();
      return;
    }

    voiceLogger.info({ event: "connection_opened" }, "新的语音连接");

    upstream.on("upgrade", (res) => {
      if (readySent) {
        return;
      }
      const rawLogId = res.headers["x-tt-logid"];
      const logId = Array.isArray(rawLogId) ? (rawLogId[0] ?? "") : (rawLogId ?? "");
      voiceLogger.info(
        {
          event: "upstream_handshake_ok",
          statusCode: res.statusCode,
          ttLogId: logId,
          upgradeHeaders: {
            "x-tt-logid": logId,
            "x-tt-trace-id": normalizeHeaderValue(res.headers["x-tt-trace-id"]),
            connection: normalizeHeaderValue(res.headers.connection),
            upgrade: normalizeHeaderValue(res.headers.upgrade)
          }
        },
        "语音上游握手成功"
      );
      safeSendVoiceIfOpen(ws, {
        type: "ready",
        payload: {
          connectId,
          logId
        }
      });
      readySent = true;
    });

    upstream.on("open", () => {
      if (readySent) {
        return;
      }
      safeSendVoiceIfOpen(ws, {
        type: "ready",
        payload: { connectId }
      });
      readySent = true;
    });

    upstream.on("unexpected-response", async (_request, response) => {
      handshakeFailureNotified = true;
      const rawLogId = response.headers["x-tt-logid"];
      const logId = Array.isArray(rawLogId) ? (rawLogId[0] ?? "") : (rawLogId ?? "");
      const body = await readHttpBodyPreview(response, 8192);
      voiceLogger.warn(
        {
          event: "upstream_handshake_failed",
          statusCode: response.statusCode,
          statusMessage: response.statusMessage ?? "",
          ttLogId: logId,
          responseHeaders: response.headers,
          responseBodyPreview: body.text || "(empty)",
          responseBodyTruncated: body.truncated
        },
        "语音上游握手失败响应"
      );
      safeSendVoiceIfOpen(ws, {
        type: "error",
        payload: {
          code: "ASR_UPSTREAM_HANDSHAKE_FAILED",
          message:
            `语音上游握手失败: HTTP ${response.statusCode ?? 0} ${response.statusMessage ?? ""}`.trim(),
          details: {
            statusCode: response.statusCode ?? 0,
            ttLogId: logId
          }
        }
      });
    });

    ws.on("message", (raw, isBinary) => {
      try {
        const frame = parseVoiceClientFrame(raw, isBinary);
        if (frame.type === "ping") {
          safeSendVoiceIfOpen(ws, { type: "pong" });
          return;
        }

        if (!upstream || upstream.readyState !== WebSocket.OPEN) {
          throw new Error("语音上游未就绪");
        }

        if (frame.type === "start") {
          if (startSent) {
            return;
          }
          const payload = buildAsrRequestPayload(frame.payload);
          upstream.send(buildFullClientRequestFrame(payload));
          startSent = true;
          stopSent = false;
          voiceLogger.info(
            {
              event: "round_start",
              requestModel: payload.request.model_name
            },
            "语音轮次开始"
          );
          return;
        }

        if (frame.type === "audio") {
          if (!startSent || stopSent) {
            return;
          }
          clientAudioFrameCount += 1;
          clientAudioBytes += frame.payload.length;
          upstream.send(buildAudioOnlyRequestFrame(frame.payload, false));
          return;
        }

        if (frame.type === "stop") {
          if (!startSent || stopSent) {
            return;
          }
          stopSent = true;
          upstream.send(buildAudioOnlyRequestFrame(Buffer.alloc(0), true));
          voiceLogger.info(
            {
              event: "round_stop",
              clientAudioFrameCount,
              clientAudioBytes
            },
            "语音轮次停止"
          );
          return;
        }

        if (frame.type === "cancel") {
          closeUpstream("client_cancel");
          voiceLogger.info({ event: "round_cancel" }, "语音轮次取消");
          if (ws.readyState === WebSocket.OPEN) {
            ws.close(1000, "cancel");
          }
        }
      } catch (error) {
        voiceLogger.warn({ event: "client_frame_handle_failed", error }, "处理语音消息失败");
        safeSendVoiceIfOpen(ws, {
          type: "error",
          payload: {
            code: "ASR_BAD_REQUEST",
            message: (error as Error).message
          }
        });
      }
    });

    const forwardAsrPayload = (params: {
      payload: unknown;
      flags: number;
      sequence: number | null;
      isFinal: boolean;
      source: "volc_binary" | "json_text" | "json_binary_fallback";
    }): void => {
      upstreamResponseCount += 1;
      const text = extractAsrText(params.payload);
      if (text) {
        upstreamNonEmptyTextCount += 1;
      }

      if (params.isFinal) {
        const payloadShape = summarizeAsrPayloadShape(params.payload);
        voiceLogger.info(
          {
            event: "upstream_result_final",
            flags: params.flags,
            sequence: params.sequence,
            source: params.source,
            textLength: text.length,
            upstreamResponseCount,
            upstreamNonEmptyTextCount,
            payloadShape
          },
          "语音上游结果摘要"
        );
      }

      if (!text) {
        const overWarnLimit = upstreamEmptyTextWarnLogged >= config.asr.emptyTextWarnLimit;
        if (overWarnLimit && !params.isFinal) {
          upstreamEmptyTextWarnSuppressed += 1;
        } else {
          upstreamEmptyTextWarnLogged += 1;
          const payloadShape = summarizeAsrPayloadShape(params.payload);
          voiceLogger.warn(
            {
              event: "upstream_result_empty_text",
              flags: params.flags,
              sequence: params.sequence,
              source: params.source,
              textLength: 0,
              upstreamResponseCount,
              upstreamNonEmptyTextCount,
              upstreamEmptyTextWarnLogged,
              upstreamEmptyTextWarnSuppressed,
              payloadShape,
              payloadPreview: toAsrPayloadPreview(params.payload)
            },
            "语音上游返回结果但未提取到文本"
          );
        }
      }

      const resultPayload: Record<string, unknown> = {
        text,
        isFinal: params.isFinal,
        sequence: params.sequence
      };
      if (config.asr.includeRawResult) {
        // 生产默认关闭，按需打开用于排障。
        resultPayload.result = params.payload;
      }

      safeSendVoiceIfOpen(ws, {
        type: "result",
        payload: resultPayload
      });

      if (!params.isFinal) {
        return;
      }

      safeSendVoiceIfOpen(ws, {
        type: "round_end",
        payload: {
          connectId
        }
      });
      voiceLogger.info(
        {
          event: "round_end",
          source: params.source,
          sequence: params.sequence,
          textLength: text.length,
          upstreamEmptyTextWarnLogged,
          upstreamEmptyTextWarnSuppressed
        },
        "语音轮次结束"
      );
      closeUpstream("round_done");
    };

    upstream.on("message", (raw, isBinary) => {
      try {
        if (!isBinary) {
          const text = typeof raw === "string" ? raw : rawDataToBuffer(raw).toString("utf8");
          const jsonPayloads = parseLooseJsonPayloads(text);
          if (jsonPayloads.length > 0) {
            upstreamJsonTextFrameCount += 1;
            if (upstreamJsonTextFrameCount <= 2 || jsonPayloads.length > 1) {
              voiceLogger.info(
                {
                  event: "upstream_text_frame_parsed",
                  payloadCount: jsonPayloads.length,
                  frameCount: upstreamJsonTextFrameCount
                },
                "收到上游文本帧，按 JSON 兼容解析"
              );
            }
            for (const payload of jsonPayloads) {
              forwardJsonPayloadIfMeaningful({
                payload,
                flags: 0,
                sequence: null,
                source: "json_text"
              });
            }
            return;
          }
          voiceLogger.info(
            {
              event: "upstream_text_frame_ignored",
              length: text.length,
              preview: text.slice(0, 200)
            },
            "收到上游文本帧（已忽略）"
          );
          return;
        }
        const parsed = parseVolcServerFrame(rawDataToBuffer(raw));
        if (parsed.kind === "server_response") {
          forwardAsrPayload({
            payload: parsed.payload,
            flags: parsed.flags,
            sequence: parsed.sequence,
            isFinal: isFinalServerResponse(parsed.flags),
            source: "volc_binary"
          });
          return;
        }

        if (parsed.kind === "error") {
          safeSendVoiceIfOpen(ws, {
            type: "error",
            payload: {
              code: `ASR_${parsed.errorCode}`,
              message: normalizeAsrErrorMessage(parsed.payload)
            }
          });
          return;
        }

        safeSendVoiceIfOpen(ws, {
          type: "event",
          payload: {
            messageType: parsed.messageType
          }
        });
      } catch (error) {
        if (isIgnorableUpstreamFrameParseError(error)) {
          const rawBuffer = rawDataToBuffer(raw);
          const fallbackText = rawBuffer.toString("utf8");
          const jsonPayloads = parseLooseJsonPayloads(fallbackText);
          if (jsonPayloads.length > 0) {
            upstreamFallbackJsonFrameCount += 1;
            if (upstreamFallbackJsonFrameCount <= 2 || jsonPayloads.length > 1) {
              voiceLogger.info(
                {
                  event: "upstream_frame_fallback_json",
                  frameLength: rawBuffer.length,
                  payloadCount: jsonPayloads.length,
                  frameCount: upstreamFallbackJsonFrameCount
                },
                "语音上游返回非标准帧，已按 JSON 兼容解析"
              );
            }
            for (const payload of jsonPayloads) {
              forwardJsonPayloadIfMeaningful({
                payload,
                flags: 0,
                sequence: null,
                source: "json_binary_fallback"
              });
            }
            return;
          }
          voiceLogger.warn(
            {
              event: "upstream_frame_ignored_invalid",
              error: (error as Error).message,
              frameLength: rawBuffer.length,
              payloadPreview: fallbackText.slice(0, 200)
            },
            "语音上游返回非标准帧，已忽略"
          );
          return;
        }
        voiceLogger.warn({ event: "upstream_frame_parse_failed", error }, "解析语音上游消息失败");
        safeSendVoiceIfOpen(ws, {
          type: "error",
          payload: {
            code: "ASR_PARSE_FAILED",
            message: (error as Error).message
          }
        });
      }
    });

    upstream.on("error", (error) => {
      const detail = error instanceof Error ? error.message : String(error);
      voiceLogger.warn(
        { event: "upstream_error", error: detail, handshakeFailureNotified },
        "语音上游连接错误"
      );
      if (handshakeFailureNotified) {
        return;
      }
      safeSendVoiceIfOpen(ws, {
        type: "error",
        payload: {
          code: "ASR_UPSTREAM_ERROR",
          message: `语音上游连接异常: ${detail}`
        }
      });
    });

    upstream.on("close", (code, reason) => {
      const reasonText = reason.toString("utf8") || `upstream_close_${code}`;
      voiceLogger.info({ event: "upstream_close", code, reason: reasonText }, "语音上游连接关闭");
      safeSendVoiceIfOpen(ws, {
        type: "closed",
        payload: {
          code,
          reason: reasonText
        }
      });
      if (ws.readyState === WebSocket.OPEN) {
        ws.close(1000, "asr_done");
      }
      upstream = null;
    });

    ws.on("close", () => {
      voiceLogger.info(
        {
          event: "connection_closed",
          startSent,
          stopSent,
          clientAudioFrameCount,
          clientAudioBytes,
          upstreamResponseCount,
          upstreamNonEmptyTextCount,
          upstreamEmptyTextWarnLogged,
          upstreamEmptyTextWarnSuppressed,
          upstreamJsonTextFrameCount,
          upstreamFallbackJsonFrameCount
        },
        "语音连接关闭"
      );
      sendFinalStopBeforeClose("client_closed");
    });

    ws.on("error", (error) => {
      voiceLogger.warn({ event: "connection_error", error }, "语音连接异常");
      sendFinalStopBeforeClose("client_error");
    });
  });

  return server;
}
