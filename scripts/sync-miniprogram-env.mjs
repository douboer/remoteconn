import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const MINI_ROOT = path.join(ROOT, "apps/miniprogram");
const ENV_PATH = path.join(MINI_ROOT, ".env");
const OUTPUT_PATH = path.join(MINI_ROOT, "utils/opsEnv.js");

function stripQuotes(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function parseEnv(text) {
  const out = {};
  const lines = String(text || "").split(/\r?\n/);
  for (const lineRaw of lines) {
    const line = lineRaw.trim();
    if (!line || line.startsWith("#")) continue;
    const normalized = line.startsWith("export ") ? line.slice(7).trim() : line;
    const eq = normalized.indexOf("=");
    if (eq <= 0) continue;
    const key = normalized.slice(0, eq).trim();
    if (!key) continue;
    out[key] = stripQuotes(normalized.slice(eq + 1));
  }
  return out;
}

function getValue(env, key, fallback = "") {
  return Object.prototype.hasOwnProperty.call(env, key) ? String(env[key]) : fallback;
}

function toNumber(raw, fallback) {
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function toBool(raw, fallback) {
  const v = String(raw || "").trim().toLowerCase();
  if (!v) return fallback;
  if (["1", "true", "yes", "on"].includes(v)) return true;
  if (["0", "false", "no", "off"].includes(v)) return false;
  return fallback;
}

function buildOps(env) {
  return {
    gatewayUrl: getValue(env, "GATEWAY_URL"),
    gatewayToken: getValue(env, "GATEWAY_TOKEN"),
    hostKeyPolicy: getValue(env, "HOST_KEY_POLICY", "strict"),
    credentialMemoryPolicy: getValue(env, "CREDENTIAL_MEMORY_POLICY", "remember"),
    gatewayConnectTimeoutMs: toNumber(getValue(env, "GATEWAY_CONNECT_TIMEOUT_MS", "12000"), 12000),
    waitForConnectedTimeoutMs: toNumber(getValue(env, "WAIT_FOR_CONNECTED_TIMEOUT_MS", "15000"), 15000),
    terminalBufferMaxEntries: toNumber(getValue(env, "TERMINAL_BUFFER_MAX_ENTRIES", "5000"), 5000),
    terminalBufferMaxBytes: toNumber(getValue(env, "TERMINAL_BUFFER_MAX_BYTES", String(4 * 1024 * 1024)), 4 * 1024 * 1024),
    maskSecrets: toBool(getValue(env, "MASK_SECRETS", "true"), true)
  };
}

function writeOpsModule(ops) {
  const content = `/**\n * Auto-generated from apps/miniprogram/.env\n * Do not edit manually. Run: node scripts/sync-miniprogram-env.mjs\n */\nmodule.exports = ${JSON.stringify(
    ops,
    null,
    2
  )};\n`;
  fs.writeFileSync(OUTPUT_PATH, content, "utf8");
}

function main() {
  if (!fs.existsSync(ENV_PATH)) {
    throw new Error(
      `缺少 .env 文件: ${ENV_PATH}\n请先从 apps/miniprogram/.env.example 复制一份，并至少填写 GATEWAY_URL 与 GATEWAY_TOKEN。`
    );
  }
  const raw = fs.readFileSync(ENV_PATH, "utf8");
  const env = parseEnv(raw);
  const ops = buildOps(env);
  writeOpsModule(ops);
  console.log("[sync-miniprogram-env] 已生成 apps/miniprogram/utils/opsEnv.js");
}

main();
