import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

/**
 * 运维配置 schema（收敛版）。
 *
 * 优先级：Env > runtime.json > 代码内置默认值。
 * 敏感字段（GATEWAY_TOKEN / ASR_ACCESS_TOKEN / ASR_SECRET_KEY）只走 Env，不写入配置文件或仓库。
 *
 * 字段对照（按配置计划章节）：
 *   网关基础：GATEWAY_PORT / GATEWAY_HOST / GATEWAY_TOKEN / GATEWAY_CORS_ORIGIN / GATEWAY_LOG_LEVEL / GATEWAY_DEBUG_IO_HEX
 *   语音识别：ASR_PROVIDER / ASR_APP_ID / ASR_ACCESS_TOKEN / ASR_SECRET_KEY / ASR_RESOURCE_ID / ASR_CLUSTER / ASR_WS_URL / ASR_INCLUDE_RAW_RESULT / ASR_EMPTY_TEXT_WARN_LIMIT
 *   语音播报：TTS_PROVIDER / TTS_APP_ID / TTS_ACCESS_TOKEN / TTS_SECRET_ID / TTS_SECRET_KEY / TTS_REGION / TTS_CLUSTER / TTS_RESOURCE_ID / TTS_VOICE_DEFAULT / TTS_SPEED_DEFAULT / TTS_TIMEOUT_MS / TTS_CACHE_FILE_MAX_BYTES
 *   安全策略：RATE_LIMIT_POINTS / RATE_LIMIT_DURATION_SEC
 *   会话策略：ASSIST_TXN_TTL_MS / ASSIST_TXN_CACHE_LIMIT
 *   SSH 策略：SSH_READY_TIMEOUT_MS / SSH_KEEPALIVE_INTERVAL_MS / SSH_KEEPALIVE_COUNT_MAX / TERMINAL_RESUME_GRACE_DEFAULT_MS / TERMINAL_RESUME_GRACE_MAX_MS
 *   插件策略：PLUGIN_ONLOAD_TIMEOUT_MS / PLUGIN_ONUNLOAD_TIMEOUT_MS
 */
const schema = z.object({
  // ── 网关基础 ─────────────────────────────────────────────────────────────
  /** 监听端口（别名 PORT 向下兼容） */
  GATEWAY_PORT: z.string().optional(),
  PORT: z.string().optional(),
  /** 监听地址 */
  GATEWAY_HOST: z.string().optional().default("0.0.0.0"),
  /** @deprecated 请使用 GATEWAY_HOST */
  HOST: z.string().optional(),
  /** 访问令牌，仅 Env，不可写文件 */
  GATEWAY_TOKEN: z.string().min(8).default("remoteconn-dev-token"),
  /** CORS Access-Control-Allow-Origin */
  GATEWAY_CORS_ORIGIN: z.string().optional().default("*"),
  /** 日志级别 */
  GATEWAY_LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  /** 原始 IO 十六进制调试，1 时输出原始帧转储 */
  GATEWAY_DEBUG_IO_HEX: z.string().optional().default("0"),

  // ── 小程序同步（配置持久化）───────────────────────────────────────────────
  /** 微信小程序 AppID，用于 code2Session */
  MINIPROGRAM_APP_ID: z.string().optional().default(""),
  /** 微信小程序 AppSecret，仅 Env */
  MINIPROGRAM_APP_SECRET: z.string().optional().default(""),
  /** 同步 SQLite 文件路径 */
  SYNC_SQLITE_PATH: z.string().optional().default("data/remoteconn-sync.db"),
  /** 同步敏感字段加密主密钥，仅 Env */
  SYNC_SECRET_CURRENT: z.string().optional().default(""),
  /** 当前加密密钥版本 */
  SYNC_SECRET_VERSION: z.string().optional().default("1"),
  /** 同步登录 token 有效期（秒） */
  SYNC_TOKEN_TTL_SEC: z.string().optional().default("604800"),

  // ── 语音识别（通用）───────────────────────────────────────────────────────
  /** 语音供应商标识 */
  ASR_PROVIDER: z.string().optional().default("volcengine"),
  /** 语音服务 App ID */
  ASR_APP_ID: z.string().optional(),
  /** 语音服务 Access Token，仅 Env */
  ASR_ACCESS_TOKEN: z.string().optional(),
  /** 语音服务 Secret Key，仅 Env */
  ASR_SECRET_KEY: z.string().optional(),
  /** 语音资源标识（ASR 2.0 小时版默认值） */
  ASR_RESOURCE_ID: z.string().optional().default("volc.seedasr.sauc.duration"),
  /** 集群参数（可选） */
  ASR_CLUSTER: z.string().optional(),
  /** WebSocket 接入地址 */
  ASR_WS_URL: z
    .string()
    .url()
    .optional()
    .default("wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async"),
  /** 是否在 result 帧携带上游原始 payload（默认关闭，减少传输体积） */
  ASR_INCLUDE_RAW_RESULT: z.string().optional().default("0"),
  /** 单连接内“空文本结果”告警上限，避免日志风暴 */
  ASR_EMPTY_TEXT_WARN_LIMIT: z.string().optional().default("3"),

  // ── 语音播报（TTS）───────────────────────────────────────────────────────
  /** TTS 供应商标识 */
  TTS_PROVIDER: z.string().optional().default("tencent"),
  /** TTS App ID（当前腾讯云短文本合成保留配置位，未直接参与签名） */
  TTS_APP_ID: z.string().optional(),
  /** TTS Access Token（Volcengine 使用） */
  TTS_ACCESS_TOKEN: z.string().optional(),
  /** TTS Secret ID，仅 Env */
  TTS_SECRET_ID: z.string().optional(),
  /** TTS Secret Key，仅 Env */
  TTS_SECRET_KEY: z.string().optional(),
  /** TTS 地域 */
  TTS_REGION: z.string().optional().default("ap-guangzhou"),
  /** TTS 集群（Volcengine 使用） */
  TTS_CLUSTER: z.string().optional().default("volcano_tts"),
  /** TTS 资源标识（火山 HTTP Chunked/SSE 单向流式 V3 默认值） */
  TTS_RESOURCE_ID: z.string().optional().default("volc.service_type.10029"),
  /** 默认音色别名 */
  TTS_VOICE_DEFAULT: z.string().optional().default("female_v1"),
  /** 默认语速 */
  TTS_SPEED_DEFAULT: z.string().optional().default("1"),
  /** 单次 TTS 请求超时（毫秒） */
  TTS_TIMEOUT_MS: z.string().optional().default("30000"),
  /** 单个 TTS 音频缓存文件的最大大小（字节） */
  TTS_CACHE_FILE_MAX_BYTES: z
    .string()
    .optional()
    .default(String(8 * 1024 * 1024)),

  // ── 安全策略（限流）────────────────────────────────────────────────────────
  /** 单 IP 在窗口期内最大请求次数 */
  RATE_LIMIT_POINTS: z.string().optional().default("30"),
  /** 限流计数器重置周期（秒） */
  RATE_LIMIT_DURATION_SEC: z.string().optional().default("60"),

  // ── 会话策略（assist 事务去重缓存）──────────────────────────────────────────
  /** 同一事务 ID 在此时间内视为重复（毫秒） */
  ASSIST_TXN_TTL_MS: z.string().optional().default("30000"),
  /** LRU 缓存最大条目数 */
  ASSIST_TXN_CACHE_LIMIT: z.string().optional().default("512"),

  // ── SSH 策略 ─────────────────────────────────────────────────────────────
  /** 等待 SSH ready 事件的超时时间（毫秒） */
  SSH_READY_TIMEOUT_MS: z.string().optional().default("15000"),
  /** 心跳包发送间隔（毫秒） */
  SSH_KEEPALIVE_INTERVAL_MS: z.string().optional().default("10000"),
  /** 连续无响应超过此次数后断开连接 */
  SSH_KEEPALIVE_COUNT_MAX: z.string().optional().default("3"),
  /** 终端续接驻留默认窗口（毫秒） */
  TERMINAL_RESUME_GRACE_DEFAULT_MS: z.string().optional().default("20000"),
  /** 终端续接驻留最大窗口（毫秒） */
  TERMINAL_RESUME_GRACE_MAX_MS: z.string().optional().default("3600000"),

  // ── 插件运行时策略 ────────────────────────────────────────────────────────
  /** 单个插件 onLoad 钩子最长执行时间（毫秒） */
  PLUGIN_ONLOAD_TIMEOUT_MS: z.string().optional().default("3000"),
  /** 单个插件 onUnload 钩子最长执行时间（毫秒） */
  PLUGIN_ONUNLOAD_TIMEOUT_MS: z.string().optional().default("3000"),

  // ── 向下兼容别名（旧字段，下一个版本窗口删除）────────────────────────────
  /** @deprecated 请使用 GATEWAY_CORS_ORIGIN */
  CORS_ORIGIN: z.string().optional(),
  /** @deprecated 请使用 GATEWAY_DEBUG_IO_HEX */
  DEBUG_IO_HEX: z.string().optional()
});

const runtimeFileSchema = z.object({
  // ── 网关基础（非敏感）───────────────────────────────────────────────────────
  GATEWAY_PORT: z.union([z.string(), z.number()]).optional(),
  PORT: z.union([z.string(), z.number()]).optional(),
  GATEWAY_HOST: z.string().optional(),
  HOST: z.string().optional(),
  GATEWAY_CORS_ORIGIN: z.string().optional(),
  GATEWAY_LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).optional(),
  GATEWAY_DEBUG_IO_HEX: z.union([z.string(), z.number(), z.boolean()]).optional(),
  ASR_INCLUDE_RAW_RESULT: z.union([z.string(), z.number(), z.boolean()]).optional(),
  ASR_EMPTY_TEXT_WARN_LIMIT: z.union([z.string(), z.number()]).optional(),
  TTS_PROVIDER: z.string().optional(),
  TTS_APP_ID: z.string().optional(),
  TTS_ACCESS_TOKEN: z.string().optional(),
  TTS_REGION: z.string().optional(),
  TTS_CLUSTER: z.string().optional(),
  TTS_RESOURCE_ID: z.string().optional(),
  TTS_VOICE_DEFAULT: z.string().optional(),
  TTS_SPEED_DEFAULT: z.union([z.string(), z.number()]).optional(),
  TTS_TIMEOUT_MS: z.union([z.string(), z.number()]).optional(),
  TTS_CACHE_FILE_MAX_BYTES: z.union([z.string(), z.number()]).optional(),

  // ── 小程序同步（非敏感）───────────────────────────────────────────────────
  MINIPROGRAM_APP_ID: z.string().optional(),
  SYNC_SQLITE_PATH: z.string().optional(),
  SYNC_SECRET_VERSION: z.union([z.string(), z.number()]).optional(),
  SYNC_TOKEN_TTL_SEC: z.union([z.string(), z.number()]).optional(),

  // ── 安全策略（限流）────────────────────────────────────────────────────────
  RATE_LIMIT_POINTS: z.union([z.string(), z.number()]).optional(),
  RATE_LIMIT_DURATION_SEC: z.union([z.string(), z.number()]).optional(),

  // ── 会话策略 ─────────────────────────────────────────────────────────────
  ASSIST_TXN_TTL_MS: z.union([z.string(), z.number()]).optional(),
  ASSIST_TXN_CACHE_LIMIT: z.union([z.string(), z.number()]).optional(),

  // ── SSH 策略 ─────────────────────────────────────────────────────────────
  SSH_READY_TIMEOUT_MS: z.union([z.string(), z.number()]).optional(),
  SSH_KEEPALIVE_INTERVAL_MS: z.union([z.string(), z.number()]).optional(),
  SSH_KEEPALIVE_COUNT_MAX: z.union([z.string(), z.number()]).optional(),
  TERMINAL_RESUME_GRACE_DEFAULT_MS: z.union([z.string(), z.number()]).optional(),
  TERMINAL_RESUME_GRACE_MAX_MS: z.union([z.string(), z.number()]).optional(),

  // ── 插件运行时策略 ────────────────────────────────────────────────────────
  PLUGIN_ONLOAD_TIMEOUT_MS: z.union([z.string(), z.number()]).optional(),
  PLUGIN_ONUNLOAD_TIMEOUT_MS: z.union([z.string(), z.number()]).optional(),

  // ── 向下兼容别名 ─────────────────────────────────────────────────────────
  CORS_ORIGIN: z.string().optional(),
  DEBUG_IO_HEX: z.union([z.string(), z.number(), z.boolean()]).optional()
});

type RuntimeFileConfig = z.infer<typeof runtimeFileSchema>;

function resolveRuntimeConfigPath(): string | null {
  const fromEnv = process.env.GATEWAY_RUNTIME_CONFIG_PATH?.trim();
  if (fromEnv) return fromEnv;

  const candidates = [
    path.resolve(process.cwd(), "config/runtime.json"),
    "/etc/remoteconn/gateway.runtime.json"
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function scalarToString(value: string | number | boolean): string {
  if (typeof value === "boolean") {
    return value ? "1" : "0";
  }
  return String(value);
}

function loadRuntimeFileConfig(): RuntimeFileConfig {
  const runtimePath = resolveRuntimeConfigPath();
  if (!runtimePath) return {};

  try {
    const raw = readFileSync(runtimePath, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    return runtimeFileSchema.parse(parsed);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`invalid runtime config at ${runtimePath}: ${reason}`);
  }
}

function toEnvLikeRecord(runtime: RuntimeFileConfig): Record<string, string> {
  const entries = Object.entries(runtime)
    .filter((entry): entry is [string, string | number | boolean] => entry[1] !== undefined)
    .map(([key, value]) => [key, scalarToString(value)]);
  return Object.fromEntries(entries);
}

/**
 * 轻量 .env 解析（不引入 dotenv 依赖）：
 * - 仅做 K=V 解析与引号去除；
 * - 支持 `export KEY=VALUE`；
 * - 不覆盖已存在的 process.env（由合并顺序保证）。
 */
function parseDotEnv(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  const lines = content.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const normalized = line.startsWith("export ") ? line.slice("export ".length).trim() : line;
    const idx = normalized.indexOf("=");
    if (idx <= 0) {
      continue;
    }
    const key = normalized.slice(0, idx).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      continue;
    }
    let value = normalized.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function loadDotEnvConfig(): Record<string, string> {
  const fromEnv = process.env.GATEWAY_ENV_FILE?.trim();
  const candidates = [
    fromEnv,
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "apps/gateway/.env")
  ].filter((item): item is string => Boolean(item));

  for (const file of candidates) {
    if (!existsSync(file)) {
      continue;
    }
    try {
      const raw = readFileSync(file, "utf-8");
      return parseDotEnv(raw);
    } catch {
      // 读取失败时跳过，继续尝试其他候选路径。
    }
  }
  return {};
}

const runtimeFileConfig = loadRuntimeFileConfig();
const dotenvConfig = loadDotEnvConfig();
const mergedInput = {
  ...toEnvLikeRecord(runtimeFileConfig),
  ...dotenvConfig,
  ...process.env
};

const env = schema.parse(mergedInput);

function isTtsEnabled(ttsProvider: string): boolean {
  const provider = String(ttsProvider || "")
    .trim()
    .toLowerCase();
  if (provider === "volcengine") {
    return Boolean((env.TTS_APP_ID ?? "").trim() && (env.TTS_ACCESS_TOKEN ?? "").trim());
  }
  if (provider === "tencent") {
    return Boolean((env.TTS_SECRET_ID ?? "").trim() && (env.TTS_SECRET_KEY ?? "").trim());
  }
  return false;
}

function parseBool(value: string): boolean {
  return /^(1|true|yes|on)$/i.test(value.trim());
}

function parsePositiveInt(value: string, fallback: number): number {
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const config = {
  // ── 网关基础 ─────────────────────────────────────────────────────────────
  port: parsePositiveInt(env.GATEWAY_PORT ?? env.PORT ?? "8787", 8787),
  host: env.GATEWAY_HOST ?? env.HOST ?? "0.0.0.0",
  gatewayToken: env.GATEWAY_TOKEN,
  /** 兼容旧字段 CORS_ORIGIN */
  corsOrigin: env.GATEWAY_CORS_ORIGIN !== "*" ? env.GATEWAY_CORS_ORIGIN : (env.CORS_ORIGIN ?? "*"),
  logLevel: env.GATEWAY_LOG_LEVEL,
  /** 兼容旧字段 DEBUG_IO_HEX */
  debugIoHex: parseBool(
    env.GATEWAY_DEBUG_IO_HEX !== "0" ? env.GATEWAY_DEBUG_IO_HEX : (env.DEBUG_IO_HEX ?? "0")
  ),

  // ── 小程序同步（配置持久化）───────────────────────────────────────────────
  sync: {
    miniprogramAppId: (env.MINIPROGRAM_APP_ID ?? "").trim(),
    miniprogramAppSecret: (env.MINIPROGRAM_APP_SECRET ?? "").trim(),
    sqlitePath: (env.SYNC_SQLITE_PATH ?? "data/remoteconn-sync.db").trim(),
    secretCurrent: (env.SYNC_SECRET_CURRENT ?? "").trim(),
    secretVersion: parsePositiveInt(env.SYNC_SECRET_VERSION ?? "1", 1),
    tokenTtlSec: parsePositiveInt(env.SYNC_TOKEN_TTL_SEC ?? "604800", 604800),
    enabled: Boolean(
      (env.MINIPROGRAM_APP_ID ?? "").trim() &&
      (env.MINIPROGRAM_APP_SECRET ?? "").trim() &&
      (env.SYNC_SECRET_CURRENT ?? "").trim()
    )
  },

  // ── 安全策略 ─────────────────────────────────────────────────────────────
  rateLimitPoints: parsePositiveInt(env.RATE_LIMIT_POINTS, 30),
  rateLimitDurationSec: parsePositiveInt(env.RATE_LIMIT_DURATION_SEC, 60),

  // ── 会话策略 ─────────────────────────────────────────────────────────────
  assistTxnTtlMs: parsePositiveInt(env.ASSIST_TXN_TTL_MS, 30000),
  assistTxnCacheLimit: parsePositiveInt(env.ASSIST_TXN_CACHE_LIMIT, 512),

  // ── SSH 策略 ─────────────────────────────────────────────────────────────
  sshReadyTimeoutMs: parsePositiveInt(env.SSH_READY_TIMEOUT_MS, 15000),
  sshKeepaliveIntervalMs: parsePositiveInt(env.SSH_KEEPALIVE_INTERVAL_MS, 10000),
  sshKeepaliveCountMax: parsePositiveInt(env.SSH_KEEPALIVE_COUNT_MAX, 3),
  terminalResumeGraceDefaultMs: parsePositiveInt(env.TERMINAL_RESUME_GRACE_DEFAULT_MS, 20000),
  terminalResumeGraceMaxMs: parsePositiveInt(env.TERMINAL_RESUME_GRACE_MAX_MS, 60 * 60 * 1000),

  // ── 语音识别（通用）───────────────────────────────────────────────────────
  asr: {
    provider: (env.ASR_PROVIDER ?? "volcengine").trim(),
    appId: (env.ASR_APP_ID ?? "").trim(),
    accessToken: (env.ASR_ACCESS_TOKEN ?? "").trim(),
    secretKey: (env.ASR_SECRET_KEY ?? "").trim(),
    resourceId: (env.ASR_RESOURCE_ID ?? "volc.seedasr.sauc.duration").trim(),
    cluster: (env.ASR_CLUSTER ?? "").trim(),
    wsUrl: (env.ASR_WS_URL ?? "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async").trim(),
    includeRawResult: parseBool(env.ASR_INCLUDE_RAW_RESULT ?? "0"),
    emptyTextWarnLimit: parsePositiveInt(env.ASR_EMPTY_TEXT_WARN_LIMIT ?? "3", 3)
  },

  // ── 语音播报（TTS）───────────────────────────────────────────────────────
  tts: {
    provider: (env.TTS_PROVIDER ?? "tencent").trim(),
    appId: (env.TTS_APP_ID ?? "").trim(),
    accessToken: (env.TTS_ACCESS_TOKEN ?? "").trim(),
    secretId: (env.TTS_SECRET_ID ?? "").trim(),
    secretKey: (env.TTS_SECRET_KEY ?? "").trim(),
    region: (env.TTS_REGION ?? "ap-guangzhou").trim() || "ap-guangzhou",
    cluster: (env.TTS_CLUSTER ?? "volcano_tts").trim() || "volcano_tts",
    resourceId: (env.TTS_RESOURCE_ID ?? "volc.service_type.10029").trim() || "volc.service_type.10029",
    voiceDefault: (env.TTS_VOICE_DEFAULT ?? "female_v1").trim() || "female_v1",
    speedDefault: Number(env.TTS_SPEED_DEFAULT ?? "1") || 1,
    timeoutMs: parsePositiveInt(env.TTS_TIMEOUT_MS ?? "30000", 30000),
    cacheFileMaxBytes: parsePositiveInt(
      env.TTS_CACHE_FILE_MAX_BYTES ?? String(8 * 1024 * 1024),
      8 * 1024 * 1024
    ),
    enabled: isTtsEnabled(env.TTS_PROVIDER ?? "tencent")
  },

  // ── 插件运行时策略 ────────────────────────────────────────────────────────
  pluginOnloadTimeoutMs: parsePositiveInt(env.PLUGIN_ONLOAD_TIMEOUT_MS, 3000),
  pluginOnunloadTimeoutMs: parsePositiveInt(env.PLUGIN_ONUNLOAD_TIMEOUT_MS, 3000)
};
