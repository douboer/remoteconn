const DEFAULT_OPS_CONFIG = {
  gatewayUrl: "",
  gatewayToken: "",
  hostKeyPolicy: "strict",
  credentialMemoryPolicy: "remember",
  gatewayConnectTimeoutMs: 12000,
  waitForConnectedTimeoutMs: 15000,
  terminalBufferMaxEntries: 5000,
  terminalBufferMaxBytes: 4 * 1024 * 1024,
  maskSecrets: true
};

const OPS_ENV_PATHS = [
  "/.env",
  ".env",
  "./.env",
  "../.env",
  "../../.env",
  "miniprogram/.env",
  "apps/miniprogram/.env",
  "/apps/miniprogram/.env"
];

function toSafeNumber(value, fallback, min) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  if (typeof min === "number" && parsed < min) return fallback;
  return parsed;
}

function stripQuotes(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function parseBoolean(value, fallback) {
  const input = String(value || "").trim().toLowerCase();
  if (!input) return fallback;
  if (input === "1" || input === "true" || input === "yes" || input === "on") return true;
  if (input === "0" || input === "false" || input === "no" || input === "off") return false;
  return fallback;
}

function readTextByPaths(paths) {
  if (typeof wx === "undefined" || typeof wx.getFileSystemManager !== "function") {
    return "";
  }

  const fs = wx.getFileSystemManager();
  for (let i = 0; i < paths.length; i += 1) {
    const path = paths[i];
    try {
      const raw = fs.readFileSync(path, "utf8");
      if (!raw) continue;
      return String(raw);
    } catch (error) {
      // continue
    }
  }
  return "";
}

function parseEnvMap(rawText) {
  const text = String(rawText || "");
  const lines = text.split(/\r?\n/);
  const envMap = {};
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line || line.startsWith("#")) continue;
    const normalized = line.startsWith("export ") ? line.slice(7).trim() : line;
    const eqIndex = normalized.indexOf("=");
    if (eqIndex <= 0) continue;
    const key = normalized.slice(0, eqIndex).trim();
    if (!key) continue;
    const value = stripQuotes(normalized.slice(eqIndex + 1));
    envMap[key] = value;
  }
  return envMap;
}

function mapOpsFields(source) {
  const envMap = source && typeof source === "object" ? source : {};
  const next = {};
  if (Object.prototype.hasOwnProperty.call(envMap, "GATEWAY_URL")) {
    next.gatewayUrl = envMap.GATEWAY_URL;
  }
  if (Object.prototype.hasOwnProperty.call(envMap, "gatewayUrl")) {
    next.gatewayUrl = envMap.gatewayUrl;
  }
  if (Object.prototype.hasOwnProperty.call(envMap, "GATEWAY_TOKEN")) {
    next.gatewayToken = envMap.GATEWAY_TOKEN;
  }
  if (Object.prototype.hasOwnProperty.call(envMap, "gatewayToken")) {
    next.gatewayToken = envMap.gatewayToken;
  }
  if (Object.prototype.hasOwnProperty.call(envMap, "HOST_KEY_POLICY")) {
    next.hostKeyPolicy = envMap.HOST_KEY_POLICY;
  }
  if (Object.prototype.hasOwnProperty.call(envMap, "hostKeyPolicy")) {
    next.hostKeyPolicy = envMap.hostKeyPolicy;
  }
  if (Object.prototype.hasOwnProperty.call(envMap, "CREDENTIAL_MEMORY_POLICY")) {
    next.credentialMemoryPolicy = envMap.CREDENTIAL_MEMORY_POLICY;
  }
  if (Object.prototype.hasOwnProperty.call(envMap, "credentialMemoryPolicy")) {
    next.credentialMemoryPolicy = envMap.credentialMemoryPolicy;
  }
  if (Object.prototype.hasOwnProperty.call(envMap, "GATEWAY_CONNECT_TIMEOUT_MS")) {
    next.gatewayConnectTimeoutMs = envMap.GATEWAY_CONNECT_TIMEOUT_MS;
  }
  if (Object.prototype.hasOwnProperty.call(envMap, "gatewayConnectTimeoutMs")) {
    next.gatewayConnectTimeoutMs = envMap.gatewayConnectTimeoutMs;
  }
  if (Object.prototype.hasOwnProperty.call(envMap, "WAIT_FOR_CONNECTED_TIMEOUT_MS")) {
    next.waitForConnectedTimeoutMs = envMap.WAIT_FOR_CONNECTED_TIMEOUT_MS;
  }
  if (Object.prototype.hasOwnProperty.call(envMap, "waitForConnectedTimeoutMs")) {
    next.waitForConnectedTimeoutMs = envMap.waitForConnectedTimeoutMs;
  }
  if (Object.prototype.hasOwnProperty.call(envMap, "TERMINAL_BUFFER_MAX_ENTRIES")) {
    next.terminalBufferMaxEntries = envMap.TERMINAL_BUFFER_MAX_ENTRIES;
  }
  if (Object.prototype.hasOwnProperty.call(envMap, "terminalBufferMaxEntries")) {
    next.terminalBufferMaxEntries = envMap.terminalBufferMaxEntries;
  }
  if (Object.prototype.hasOwnProperty.call(envMap, "TERMINAL_BUFFER_MAX_BYTES")) {
    next.terminalBufferMaxBytes = envMap.TERMINAL_BUFFER_MAX_BYTES;
  }
  if (Object.prototype.hasOwnProperty.call(envMap, "terminalBufferMaxBytes")) {
    next.terminalBufferMaxBytes = envMap.terminalBufferMaxBytes;
  }
  if (Object.prototype.hasOwnProperty.call(envMap, "MASK_SECRETS")) {
    const parsedMask = parseBoolean(envMap.MASK_SECRETS, undefined);
    if (parsedMask !== undefined) {
      next.maskSecrets = parsedMask;
    }
  }
  if (Object.prototype.hasOwnProperty.call(envMap, "maskSecrets")) {
    next.maskSecrets = parseBoolean(envMap.maskSecrets, undefined);
  }
  return next;
}

function readOpsConfigFromBundledModule() {
  try {
    const bundled = require("./opsEnv.js");
    return mapOpsFields(bundled);
  } catch (error) {
    return {};
  }
}

function readOpsConfigFromExtConfig() {
  if (typeof wx === "undefined" || typeof wx.getExtConfigSync !== "function") {
    return {};
  }
  try {
    const ext = wx.getExtConfigSync() || {};
    const source =
      ext.remoteconnOps || ext.remoteConnOps || ext.remoteconn || ext.REMOTECONN_OPS || ext;
    return mapOpsFields(source);
  } catch (error) {
    return {};
  }
}

function readOpsConfigFromGlobal() {
  if (typeof globalThis === "undefined") return {};
  const source = globalThis.__REMOTE_CONN_OPS__;
  if (!source || typeof source !== "object") return {};
  return mapOpsFields(source);
}

function readOpsConfigFromEnvFile() {
  const raw = readTextByPaths(OPS_ENV_PATHS);
  if (!raw) return {};
  const envMap = parseEnvMap(raw);
  return mapOpsFields(envMap);
}

function readOpsConfig() {
  // 优先级：全局注入 > extConfig > 生成模块 > .env 文件读盘
  return {
    ...readOpsConfigFromEnvFile(),
    ...readOpsConfigFromBundledModule(),
    ...readOpsConfigFromExtConfig(),
    ...readOpsConfigFromGlobal()
  };
}

/**
 * 运维配置不暴露给设置页用户编辑。
 */
function getOpsConfig() {
  const source = readOpsConfig();
  return {
    gatewayUrl: String(source.gatewayUrl || DEFAULT_OPS_CONFIG.gatewayUrl).trim(),
    gatewayToken: String(source.gatewayToken || DEFAULT_OPS_CONFIG.gatewayToken).trim(),
    hostKeyPolicy: String(source.hostKeyPolicy || DEFAULT_OPS_CONFIG.hostKeyPolicy),
    credentialMemoryPolicy: String(
      source.credentialMemoryPolicy || DEFAULT_OPS_CONFIG.credentialMemoryPolicy
    ),
    gatewayConnectTimeoutMs: toSafeNumber(
      source.gatewayConnectTimeoutMs,
      DEFAULT_OPS_CONFIG.gatewayConnectTimeoutMs,
      1000
    ),
    waitForConnectedTimeoutMs: toSafeNumber(
      source.waitForConnectedTimeoutMs,
      DEFAULT_OPS_CONFIG.waitForConnectedTimeoutMs,
      1000
    ),
    terminalBufferMaxEntries: toSafeNumber(
      source.terminalBufferMaxEntries,
      DEFAULT_OPS_CONFIG.terminalBufferMaxEntries,
      100
    ),
    terminalBufferMaxBytes: toSafeNumber(
      source.terminalBufferMaxBytes,
      DEFAULT_OPS_CONFIG.terminalBufferMaxBytes,
      1024
    ),
    maskSecrets: source.maskSecrets === undefined ? DEFAULT_OPS_CONFIG.maskSecrets : !!source.maskSecrets
  };
}

function isOpsConfigReady(config) {
  const resolved = config || getOpsConfig();
  return Boolean(String(resolved.gatewayUrl || "").trim()) && Boolean(String(resolved.gatewayToken || "").trim());
}

module.exports = {
  DEFAULT_OPS_CONFIG,
  getOpsConfig,
  isOpsConfigReady
};
