/* global module */

/**
 * 小程序终端续接状态纯函数：
 * 1. 负责“后台保活分钟数”的收敛；
 * 2. 负责终端续接快照的规范化与过期判断；
 * 3. 不依赖 wx，便于单元测试覆盖。
 */
const TERMINAL_SESSION_SNAPSHOT_VERSION = 1;
const DEFAULT_TERMINAL_RESUME_MINUTES = 15;
const MIN_TERMINAL_RESUME_MINUTES = 1;
const MAX_TERMINAL_RESUME_MINUTES = 60;
const MIN_TERMINAL_RESUME_GRACE_MS = MIN_TERMINAL_RESUME_MINUTES * 60 * 1000;
const MAX_TERMINAL_RESUME_GRACE_MS = MAX_TERMINAL_RESUME_MINUTES * 60 * 1000;

const VALID_TERMINAL_SESSION_STATUS = new Set([
  "connecting",
  "auth_pending",
  "connected",
  "resumable",
  "disconnected",
  "error"
]);
const VALID_ACTIVE_AI_PROVIDER = new Set(["", "codex", "copilot"]);
const VALID_CODEX_SANDBOX_MODE = new Set(["read-only", "workspace-write", "danger-full-access"]);

function normalizeCodexSandboxMode(value) {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  return VALID_CODEX_SANDBOX_MODE.has(normalized) ? normalized : "workspace-write";
}

function normalizeTerminalResumeMinutes(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_TERMINAL_RESUME_MINUTES;
  const normalized = Math.round(parsed);
  if (normalized < MIN_TERMINAL_RESUME_MINUTES) return MIN_TERMINAL_RESUME_MINUTES;
  if (normalized > MAX_TERMINAL_RESUME_MINUTES) return MAX_TERMINAL_RESUME_MINUTES;
  return normalized;
}

function normalizeTerminalResumeGraceMs(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_TERMINAL_RESUME_MINUTES * 60 * 1000;
  }
  const normalized = Math.round(parsed);
  if (normalized < MIN_TERMINAL_RESUME_GRACE_MS) return MIN_TERMINAL_RESUME_GRACE_MS;
  if (normalized > MAX_TERMINAL_RESUME_GRACE_MS) return MAX_TERMINAL_RESUME_GRACE_MS;
  return normalized;
}

function resolveTerminalResumeGraceMs(settings) {
  const minutes = normalizeTerminalResumeMinutes(
    settings && typeof settings === "object" ? settings.backgroundSessionKeepAliveMinutes : undefined
  );
  return minutes * 60 * 1000;
}

function normalizeTerminalSessionStatus(value) {
  const normalized = String(value || "").trim();
  if (!VALID_TERMINAL_SESSION_STATUS.has(normalized)) {
    return "disconnected";
  }
  return normalized;
}

function isTerminalSessionSnapshotExpired(snapshot, now = Date.now()) {
  if (!snapshot || typeof snapshot !== "object") return true;
  if (String(snapshot.status || "") !== "resumable") return false;
  const expiresAt = Number(snapshot.resumeExpiresAt);
  if (!Number.isFinite(expiresAt)) return true;
  return expiresAt <= now;
}

function normalizeTerminalSessionSnapshot(input, now = Date.now()) {
  const source = input && typeof input === "object" ? input : null;
  if (!source) return null;

  const version = Number(source.version);
  if (version !== TERMINAL_SESSION_SNAPSHOT_VERSION) {
    return null;
  }

  const serverId = String(source.serverId || "").trim();
  const sessionId = String(source.sessionId || "").trim();
  const sessionKey = String(source.sessionKey || "").trim();
  if (!serverId || !sessionId || !sessionKey) {
    return null;
  }

  const status = normalizeTerminalSessionStatus(source.status);
  const activeAiProvider = VALID_ACTIVE_AI_PROVIDER.has(String(source.activeAiProvider || "").trim())
    ? String(source.activeAiProvider || "").trim()
    : "";
  const codexSandboxMode =
    activeAiProvider === "codex" ? normalizeCodexSandboxMode(source.codexSandboxMode) : "";
  const savedAt = Number(source.savedAt);
  const resumeGraceMs = normalizeTerminalResumeGraceMs(source.resumeGraceMs);
  const resumeExpiresAt = status === "resumable" ? Number(source.resumeExpiresAt) : 0;

  const snapshot = {
    version: TERMINAL_SESSION_SNAPSHOT_VERSION,
    serverId,
    serverLabel: String(source.serverLabel || "").trim(),
    sessionId,
    sessionKey,
    status,
    activeAiProvider,
    codexSandboxMode,
    resumeGraceMs,
    resumeExpiresAt: Number.isFinite(resumeExpiresAt) ? Math.round(resumeExpiresAt) : 0,
    savedAt: Number.isFinite(savedAt) ? Math.round(savedAt) : now
  };

  if (isTerminalSessionSnapshotExpired(snapshot, now)) {
    return null;
  }

  return snapshot;
}

function buildTerminalSessionSnapshot(input, now = Date.now()) {
  const source = input && typeof input === "object" ? input : {};
  const status = normalizeTerminalSessionStatus(source.status);
  const resumeGraceMs = normalizeTerminalResumeGraceMs(source.resumeGraceMs);
  const resumeExpiresAt =
    status === "resumable"
      ? now + resumeGraceMs
      : Math.max(0, Math.round(Number(source.resumeExpiresAt) || 0));

  return normalizeTerminalSessionSnapshot(
    {
      version: TERMINAL_SESSION_SNAPSHOT_VERSION,
      serverId: String(source.serverId || "").trim(),
      serverLabel: String(source.serverLabel || "").trim(),
      sessionId: String(source.sessionId || "").trim(),
      sessionKey: String(source.sessionKey || "").trim(),
      status,
      activeAiProvider: VALID_ACTIVE_AI_PROVIDER.has(String(source.activeAiProvider || "").trim())
        ? String(source.activeAiProvider || "").trim()
        : "",
      codexSandboxMode:
        String(source.activeAiProvider || "").trim() === "codex"
          ? normalizeCodexSandboxMode(source.codexSandboxMode)
          : "",
      resumeGraceMs,
      resumeExpiresAt,
      savedAt: now
    },
    now
  );
}

function isTerminalSessionHighlighted(snapshot, serverId, now = Date.now()) {
  const normalized = normalizeTerminalSessionSnapshot(snapshot, now);
  if (!normalized || normalized.serverId !== String(serverId || "").trim()) {
    return false;
  }
  return normalized.status === "connected" || normalized.status === "resumable";
}

/**
 * AI 高亮态比普通连接态更严格：
 * 1. 目标服务器必须仍处于“已连接 / 可续接”窗口；
 * 2. 同一快照里还要明确记录了 AI 前台 provider；
 * 3. 这样列表页和终端页才能只在“真的有 AI 会话”时点亮 AI 按钮。
 */
function isTerminalSessionAiHighlighted(snapshot, serverId, now = Date.now()) {
  const normalized = normalizeTerminalSessionSnapshot(snapshot, now);
  if (!normalized || normalized.serverId !== String(serverId || "").trim()) {
    return false;
  }
  if (!normalized.activeAiProvider) {
    return false;
  }
  return normalized.status === "connected" || normalized.status === "resumable";
}

function isTerminalSessionConnecting(snapshot, serverId, now = Date.now()) {
  const normalized = normalizeTerminalSessionSnapshot(snapshot, now);
  if (!normalized || normalized.serverId !== String(serverId || "").trim()) {
    return false;
  }
  return normalized.status === "connecting" || normalized.status === "auth_pending";
}

module.exports = {
  TERMINAL_SESSION_SNAPSHOT_VERSION,
  DEFAULT_TERMINAL_RESUME_MINUTES,
  MIN_TERMINAL_RESUME_MINUTES,
  MAX_TERMINAL_RESUME_MINUTES,
  normalizeTerminalResumeMinutes,
  normalizeTerminalResumeGraceMs,
  resolveTerminalResumeGraceMs,
  normalizeCodexSandboxMode,
  normalizeTerminalSessionStatus,
  normalizeTerminalSessionSnapshot,
  buildTerminalSessionSnapshot,
  isTerminalSessionSnapshotExpired,
  isTerminalSessionAiHighlighted,
  isTerminalSessionHighlighted,
  isTerminalSessionConnecting
};
