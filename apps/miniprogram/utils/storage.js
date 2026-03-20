/* global wx, console, module, require */

const {
  DEFAULT_AI_PROVIDER,
  DEFAULT_CODEX_SANDBOX_MODE,
  DEFAULT_COPILOT_PERMISSION_MODE,
  normalizeAiProvider,
  normalizeCodexSandboxMode,
  normalizeCopilotPermissionMode
} = require("./aiLaunch");
const { normalizeTerminalFontFamily, pickBtnColor, pickShellAccentColor } = require("./themeStyle");
const { normalizeUiLanguage } = require("./i18n");
const {
  DEFAULT_TERMINAL_RESUME_MINUTES,
  MIN_TERMINAL_RESUME_MINUTES,
  MAX_TERMINAL_RESUME_MINUTES
} = require("./terminalSessionState");
const {
  DEFAULT_TTS_SPEAKABLE_MAX_CHARS,
  MIN_TTS_SPEAKABLE_MAX_CHARS,
  MAX_TTS_SPEAKABLE_MAX_CHARS,
  DEFAULT_TTS_SEGMENT_MAX_CHARS,
  MIN_TTS_SEGMENT_MAX_CHARS,
  MAX_TTS_SEGMENT_MAX_CHARS
} = require("./ttsSettings");

/**
 * 小程序本地存储封装。
 * 约束：
 * 1. 全部走同步 API，保证页面进入时读取行为确定；
 * 2. 结构保持与 Web 端语义一致，便于后续对齐。
 */
const KEYS = {
  servers: "remoteconn.servers.v2",
  settings: "remoteconn.settings.v2",
  logs: "remoteconn.logs.v2",
  records: "remoteconn.records.v2",
  pluginPackages: "remoteconn.plugins.packages.v2",
  pluginRecords: "remoteconn.plugins.records.v2",
  pluginRuntimeLogs: "remoteconn.plugins.runtimeLogs.v2"
};

/**
 * 稳定备份 key 不随业务版本号变化：
 * 1. 正式 key 升级时，可直接从备份恢复；
 * 2. 即使未来继续升 v3/v4，也不需要把备份链条无限拉长。
 */
const BACKUP_KEYS = {
  servers: "remoteconn.backup.servers",
  settings: "remoteconn.backup.settings",
  logs: "remoteconn.backup.logs",
  records: "remoteconn.backup.records",
  pluginPackages: "remoteconn.backup.plugins.packages",
  pluginRecords: "remoteconn.backup.plugins.records",
  pluginRuntimeLogs: "remoteconn.backup.plugins.runtimeLogs"
};

/**
 * 历史 key 候选表：
 * 1. 只在当前正式 key 缺失时尝试；
 * 2. 明确列出已知/合理的旧命名，避免运行时“猜 key”。
 */
const LEGACY_KEYS = {
  servers: ["remoteconn.servers.v1", "remoteconn.servers"],
  settings: ["remoteconn.settings.v1", "remoteconn.settings"],
  logs: ["remoteconn.logs.v1", "remoteconn.logs"],
  records: ["remoteconn.records.v1", "remoteconn.records"],
  pluginPackages: ["remoteconn.plugins.packages.v1", "remoteconn.plugins.packages"],
  pluginRecords: ["remoteconn.plugins.records.v1", "remoteconn.plugins.records"],
  pluginRuntimeLogs: ["remoteconn.plugins.runtimeLogs.v1", "remoteconn.plugins.runtimeLogs"]
};

let storageBootstrapDone = false;
let storageBootstrapInProgress = false;
let syncServiceModule = null;

const DEFAULT_VOICE_RECORD_CATEGORY_FALLBACK = "未分类";
const DEFAULT_VOICE_RECORD_CATEGORIES = ["未分类", "优化", "新需求", "问题", "灵感"];
const DEFAULT_VOICE_RECORD_DEFAULT_CATEGORY = "优化";
const DEFAULT_TERMINAL_BUFFER_SNAPSHOT_MAX_LINES = 200;
const MIN_TERMINAL_BUFFER_SNAPSHOT_MAX_LINES = 20;
const MAX_TERMINAL_BUFFER_SNAPSHOT_MAX_LINES = 5000;

const OPS_SETTING_KEYS = new Set([
  "gatewayUrl",
  "gatewayToken",
  "hostKeyPolicy",
  "credentialMemoryPolicy",
  "gatewayConnectTimeoutMs",
  "waitForConnectedTimeoutMs",
  "terminalBufferMaxEntries",
  "terminalBufferMaxBytes",
  "maskSecrets"
]);

const DEFAULT_SETTINGS = {
  // ── 界面主题（用户可调）────────────────────────────────────────────────────
  uiLanguage: "zh-Hans",
  uiThemeMode: "dark",
  uiThemePreset: "tide",
  uiAccentColor: "#5bd2ff",
  uiBgColor: "#192b4d",
  uiTextColor: "#e6f0ff",
  uiBtnColor: pickBtnColor("#192b4d", "#e6f0ff"),

  // ── 连接与服务器默认参数（用户可调）────────────────────────────────────────
  autoReconnect: true,
  syncConfigEnabled: true,
  reconnectLimit: 3,
  backgroundSessionKeepAliveMinutes: DEFAULT_TERMINAL_RESUME_MINUTES,
  defaultAuthType: "password",
  aiDefaultProvider: DEFAULT_AI_PROVIDER,
  aiCodexSandboxMode: DEFAULT_CODEX_SANDBOX_MODE,
  aiCopilotPermissionMode: DEFAULT_COPILOT_PERMISSION_MODE,
  defaultPort: 22,
  defaultProjectPath: "~/workspace",
  defaultTimeoutSeconds: 20,
  defaultHeartbeatSeconds: 15,
  defaultTransportMode: "gateway",

  // ── 终端显示与缓冲 ─────────────────────────────────────────────────────────
  shellThemeMode: "dark",
  shellThemePreset: "tide",
  shellBgColor: "#192b4d",
  shellTextColor: "#e6f0ff",
  shellAccentColor: pickShellAccentColor("#192b4d", "#e6f0ff"),
  shellFontFamily: "JetBrains Mono",
  shellFontSize: 15,
  shellLineHeight: 1.4,
  shellActivationDebugOutline: true,
  showVoiceInputButton: true,
  ttsSpeakableMaxChars: DEFAULT_TTS_SPEAKABLE_MAX_CHARS,
  ttsSegmentMaxChars: DEFAULT_TTS_SEGMENT_MAX_CHARS,
  shellBufferMaxEntries: 5000,
  shellBufferMaxBytes: 4 * 1024 * 1024,
  shellBufferSnapshotMaxLines: DEFAULT_TERMINAL_BUFFER_SNAPSHOT_MAX_LINES,
  unicode11: true,

  // ── 日志 ───────────────────────────────────────────────────────────────────
  logRetentionDays: 30,
  voiceRecordCategories: DEFAULT_VOICE_RECORD_CATEGORIES.slice(),
  voiceRecordDefaultCategory: DEFAULT_VOICE_RECORD_DEFAULT_CATEGORY
};

const NUMBER_RULES = {
  reconnectLimit: { fallback: 3, min: 0, max: 10, integer: true },
  backgroundSessionKeepAliveMinutes: {
    fallback: DEFAULT_TERMINAL_RESUME_MINUTES,
    min: MIN_TERMINAL_RESUME_MINUTES,
    max: MAX_TERMINAL_RESUME_MINUTES,
    integer: true
  },
  defaultPort: { fallback: 22, min: 1, max: 65535, integer: true },
  defaultTimeoutSeconds: { fallback: 20, min: 5, max: 600, integer: true },
  defaultHeartbeatSeconds: { fallback: 15, min: 5, max: 600, integer: true },
  shellFontSize: { fallback: 15, min: 12, max: 22, integer: true },
  shellLineHeight: { fallback: 1.4, min: 1, max: 2, integer: false },
  ttsSpeakableMaxChars: {
    fallback: DEFAULT_TTS_SPEAKABLE_MAX_CHARS,
    min: MIN_TTS_SPEAKABLE_MAX_CHARS,
    max: MAX_TTS_SPEAKABLE_MAX_CHARS,
    integer: true
  },
  ttsSegmentMaxChars: {
    fallback: DEFAULT_TTS_SEGMENT_MAX_CHARS,
    min: MIN_TTS_SEGMENT_MAX_CHARS,
    max: MAX_TTS_SEGMENT_MAX_CHARS,
    integer: true
  },
  shellBufferMaxEntries: { fallback: 5000, min: 100, max: 200000, integer: true },
  shellBufferMaxBytes: { fallback: 4 * 1024 * 1024, min: 1024, max: 50 * 1024 * 1024, integer: true },
  shellBufferSnapshotMaxLines: {
    fallback: DEFAULT_TERMINAL_BUFFER_SNAPSHOT_MAX_LINES,
    min: MIN_TERMINAL_BUFFER_SNAPSHOT_MAX_LINES,
    max: MAX_TERMINAL_BUFFER_SNAPSHOT_MAX_LINES,
    integer: true
  },
  logRetentionDays: { fallback: 30, min: 1, max: 365, integer: true }
};

const THEME_MODE_VALUES = new Set(["dark", "light"]);
const AUTH_TYPE_VALUES = new Set(["password", "key"]);
const HEX_COLOR_REGEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function normalizeServerTags(value) {
  const source = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  const seen = new Set();
  const next = [];
  source.forEach((entry) => {
    const normalized = String(entry || "").trim();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    next.push(normalized);
  });
  return next;
}

function normalizeVoiceRecordCategories(value) {
  const source = Array.isArray(value) ? value : [];
  const seen = new Set();
  const next = [];

  source.forEach((entry) => {
    const normalized = String(entry || "").trim();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    next.push(normalized);
  });

  if (!seen.has(DEFAULT_VOICE_RECORD_CATEGORY_FALLBACK)) {
    next.unshift(DEFAULT_VOICE_RECORD_CATEGORY_FALLBACK);
  }

  return next.slice(0, 10);
}

function normalizeVoiceRecordDefaultCategory(value, categories) {
  const normalized = String(value || "").trim();
  if (normalized && categories.includes(normalized)) {
    return normalized;
  }
  if (categories.includes(DEFAULT_VOICE_RECORD_DEFAULT_CATEGORY)) {
    return DEFAULT_VOICE_RECORD_DEFAULT_CATEGORY;
  }
  return categories[0] || DEFAULT_VOICE_RECORD_CATEGORY_FALLBACK;
}

function normalizeNumber(value, rule) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return rule.fallback;
  const normalized = rule.integer ? Math.round(parsed) : parsed;
  if (normalized < rule.min) return rule.min;
  if (normalized > rule.max) return rule.max;
  return normalized;
}

function normalizeSettings(input) {
  const source = input && typeof input === "object" ? input : {};
  const next = { ...source };

  Object.keys(NUMBER_RULES).forEach((key) => {
    next[key] = normalizeNumber(next[key], NUMBER_RULES[key]);
  });

  next.uiLanguage = normalizeUiLanguage(next.uiLanguage);
  next.uiThemeMode = THEME_MODE_VALUES.has(next.uiThemeMode)
    ? next.uiThemeMode
    : DEFAULT_SETTINGS.uiThemeMode;
  next.shellThemeMode = THEME_MODE_VALUES.has(next.shellThemeMode)
    ? next.shellThemeMode
    : DEFAULT_SETTINGS.shellThemeMode;
  next.shellThemePreset = String(next.shellThemePreset || DEFAULT_SETTINGS.shellThemePreset);
  next.defaultAuthType = AUTH_TYPE_VALUES.has(next.defaultAuthType)
    ? next.defaultAuthType
    : DEFAULT_SETTINGS.defaultAuthType;
  next.aiDefaultProvider = normalizeAiProvider(next.aiDefaultProvider);
  next.aiCodexSandboxMode = normalizeCodexSandboxMode(next.aiCodexSandboxMode);
  next.aiCopilotPermissionMode = normalizeCopilotPermissionMode(next.aiCopilotPermissionMode);
  next.defaultTransportMode = String(next.defaultTransportMode || DEFAULT_SETTINGS.defaultTransportMode);
  next.defaultProjectPath = String(next.defaultProjectPath || DEFAULT_SETTINGS.defaultProjectPath);
  next.uiThemePreset = String(next.uiThemePreset || DEFAULT_SETTINGS.uiThemePreset);
  next.uiAccentColor = HEX_COLOR_REGEX.test(String(next.uiAccentColor || ""))
    ? String(next.uiAccentColor)
    : DEFAULT_SETTINGS.uiAccentColor;
  next.uiBgColor = HEX_COLOR_REGEX.test(String(next.uiBgColor || ""))
    ? String(next.uiBgColor)
    : DEFAULT_SETTINGS.uiBgColor;
  next.uiTextColor = HEX_COLOR_REGEX.test(String(next.uiTextColor || ""))
    ? String(next.uiTextColor)
    : DEFAULT_SETTINGS.uiTextColor;
  next.uiBtnColor = HEX_COLOR_REGEX.test(String(next.uiBtnColor || ""))
    ? String(next.uiBtnColor)
    : pickBtnColor(next.uiBgColor, next.uiTextColor);
  /**
   * 终端字体必须先经过“安全字体”归一：
   * 1. 避免把比例字体直接写入终端运行态；
   * 2. 老版本已保存的不安全字体在这里自动迁回安全等宽字体。
   */
  next.shellFontFamily = normalizeTerminalFontFamily(
    String(next.shellFontFamily || DEFAULT_SETTINGS.shellFontFamily)
  );
  next.shellBgColor = HEX_COLOR_REGEX.test(String(next.shellBgColor || ""))
    ? String(next.shellBgColor)
    : DEFAULT_SETTINGS.shellBgColor;
  next.shellTextColor = HEX_COLOR_REGEX.test(String(next.shellTextColor || ""))
    ? String(next.shellTextColor)
    : DEFAULT_SETTINGS.shellTextColor;
  next.shellAccentColor = HEX_COLOR_REGEX.test(String(next.shellAccentColor || ""))
    ? String(next.shellAccentColor)
    : pickShellAccentColor(next.shellBgColor, next.shellTextColor);
  next.shellActivationDebugOutline =
    next.shellActivationDebugOutline === undefined
      ? DEFAULT_SETTINGS.shellActivationDebugOutline
      : !!next.shellActivationDebugOutline;
  /**
   * 语音输入按钮默认显示：
   * 1. 老版本没有该字段时自动补 true；
   * 2. 统一收敛为布尔值，避免 storage 里残留字符串/数字脏值。
   */
  next.showVoiceInputButton =
    next.showVoiceInputButton === undefined ? DEFAULT_SETTINGS.showVoiceInputButton : !!next.showVoiceInputButton;
  next.unicode11 = !!next.unicode11;
  next.autoReconnect = !!next.autoReconnect;
  // 云端同步开关默认开启，兼容现有“本地 + Gateway”双写行为。
  next.syncConfigEnabled =
    next.syncConfigEnabled === undefined ? DEFAULT_SETTINGS.syncConfigEnabled : !!next.syncConfigEnabled;
  next.voiceRecordCategories = normalizeVoiceRecordCategories(next.voiceRecordCategories);
  next.voiceRecordDefaultCategory = normalizeVoiceRecordDefaultCategory(
    next.voiceRecordDefaultCategory,
    next.voiceRecordCategories
  );

  return next;
}

function sanitizeUserSettings(input) {
  if (!input || typeof input !== "object") return {};
  const next = {};
  Object.keys(input).forEach((key) => {
    if (OPS_SETTING_KEYS.has(key)) return;
    next[key] = input[key];
  });
  return next;
}

function listStorageKeys() {
  try {
    const info = wx.getStorageInfoSync();
    return Array.isArray(info && info.keys) ? info.keys : [];
  } catch {
    return [];
  }
}

function readRaw(key) {
  try {
    const value = wx.getStorageSync(key);
    const keys = listStorageKeys();
    const found = keys.includes(key) || !(value === undefined || value === null || value === "");
    return { found, value };
  } catch (error) {
    console.warn("[storage.read.raw]", key, error);
    return { found: false, value: undefined };
  }
}

function writeRaw(key, value) {
  try {
    wx.setStorageSync(key, value);
    return true;
  } catch (error) {
    console.error("[storage.write.raw]", key, error);
    return false;
  }
}

function hydrateStorageKey(logicalKey) {
  const primaryKey = KEYS[logicalKey];
  const backupKey = BACKUP_KEYS[logicalKey];
  const primary = readRaw(primaryKey);

  if (primary.found) {
    if (backupKey) {
      const backup = readRaw(backupKey);
      if (!backup.found) {
        writeRaw(backupKey, primary.value);
      }
    }
    return;
  }

  if (backupKey) {
    const backup = readRaw(backupKey);
    if (backup.found) {
      writeRaw(primaryKey, backup.value);
      console.info("[storage.restore.backup]", logicalKey, backupKey, "->", primaryKey);
      return;
    }
  }

  const legacyKeys = Array.isArray(LEGACY_KEYS[logicalKey]) ? LEGACY_KEYS[logicalKey] : [];
  for (let i = 0; i < legacyKeys.length; i += 1) {
    const legacyKey = legacyKeys[i];
    const legacy = readRaw(legacyKey);
    if (!legacy.found) continue;
    writeRaw(primaryKey, legacy.value);
    if (backupKey) {
      writeRaw(backupKey, legacy.value);
    }
    console.info("[storage.restore.legacy]", logicalKey, legacyKey, "->", primaryKey);
    return;
  }
}

function ensureStorageBootstrapped() {
  if (storageBootstrapDone || storageBootstrapInProgress) return;
  storageBootstrapInProgress = true;
  try {
    Object.keys(KEYS).forEach((logicalKey) => {
      hydrateStorageKey(logicalKey);
    });
    storageBootstrapDone = true;
  } finally {
    storageBootstrapInProgress = false;
  }
}

function read(key, fallback) {
  ensureStorageBootstrapped();
  try {
    const { found, value } = readRaw(key);
    if (!found) return fallback;
    return value === undefined || value === null || value === "" ? fallback : value;
  } catch (error) {
    console.warn("[storage.read]", key, error);
    return fallback;
  }
}

function write(key, value) {
  ensureStorageBootstrapped();
  writeRaw(key, value);

  const logicalKey = Object.keys(KEYS).find((name) => KEYS[name] === key);
  if (!logicalKey) return;

  const backupKey = BACKUP_KEYS[logicalKey];
  if (!backupKey) return;

  if (!writeRaw(backupKey, value)) {
    console.error("[storage.write.backup]", key, backupKey);
  }
}

function nowIso() {
  return new Date().toISOString();
}

function loadSyncService() {
  if (syncServiceModule) return syncServiceModule;
  try {
    syncServiceModule = require("./syncService");
  } catch {
    syncServiceModule = null;
  }
  return syncServiceModule;
}

function notifySync(method, ...args) {
  const service = loadSyncService();
  if (!service || typeof service[method] !== "function") return;
  try {
    service[method](...args);
  } catch (error) {
    console.warn(`[storage.sync.${method}]`, error);
  }
}

function normalizeJumpHost(input) {
  const source = input && typeof input === "object" ? input : {};
  const authType =
    source.authType === "privateKey" || source.authType === "certificate" ? source.authType : "password";
  return {
    enabled: source.enabled === true,
    host: String(source.host || "").trim(),
    port: Number(source.port) || 22,
    username: String(source.username || "").trim(),
    authType
  };
}

function normalizeServerAuthType(value) {
  return value === "privateKey" || value === "certificate" ? value : "password";
}

function normalizeServerRecord(server) {
  const source = server && typeof server === "object" ? server : {};
  // 服务器对象要在本地先归一化成“同步可直接上传”的形状。
  // 历史数据里可能残留 authType="key"、null 字段或字符串数字，若原样上传会被网关 schema 拒绝。
  return {
    ...source,
    id: String(source.id || ""),
    name: String(source.name || ""),
    tags: normalizeServerTags(source.tags),
    host: String(source.host || "").trim(),
    port: Number(source.port) || 22,
    username: String(source.username || "").trim(),
    authType: normalizeServerAuthType(source.authType),
    password: String(source.password || ""),
    privateKey: String(source.privateKey || ""),
    passphrase: String(source.passphrase || ""),
    certificate: String(source.certificate || ""),
    projectPath: String(source.projectPath || ""),
    timeoutSeconds: Number(source.timeoutSeconds) || 15,
    heartbeatSeconds: Number(source.heartbeatSeconds) || 10,
    transportMode: String(source.transportMode || "gateway"),
    jumpHost: normalizeJumpHost(source.jumpHost),
    jumpPassword: String(source.jumpPassword || ""),
    jumpPrivateKey: String(source.jumpPrivateKey || ""),
    jumpPassphrase: String(source.jumpPassphrase || ""),
    jumpCertificate: String(source.jumpCertificate || ""),
    sortOrder: Number(source.sortOrder) || 0,
    lastConnectedAt: String(source.lastConnectedAt || ""),
    updatedAt: String(source.updatedAt || source.lastConnectedAt || nowIso())
  };
}

function createServerSeed() {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  const settings = getSettings();
  const defaultAuthType = settings.defaultAuthType === "key" ? "privateKey" : "password";
  return {
    id: `srv-${ts}-${rand}`,
    name: "",
    tags: [],
    host: "",
    port: Number(settings.defaultPort) || 22,
    username: "",
    authType: defaultAuthType,
    password: "",
    privateKey: "",
    passphrase: "",
    certificate: "",
    projectPath: settings.defaultProjectPath || "",
    timeoutSeconds: Number(settings.defaultTimeoutSeconds) || 15,
    heartbeatSeconds: Number(settings.defaultHeartbeatSeconds) || 10,
    transportMode: settings.defaultTransportMode || "gateway",
    jumpHost: normalizeJumpHost(),
    sortOrder: ts,
    lastConnectedAt: "",
    updatedAt: nowIso()
  };
}

function listServers() {
  const rows = read(KEYS.servers, []);
  return Array.isArray(rows)
    ? rows
        .map((item) => normalizeServerRecord({ ...createServerSeed(), ...item }))
        .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
    : [];
}

function saveServers(next, options) {
  write(KEYS.servers, Array.isArray(next) ? next : []);
  const extra = options && typeof options === "object" ? options : {};
  if (!extra.silentSync) {
    notifySync("scheduleServersSync");
  }
}

function upsertServer(server, options) {
  const extra = options && typeof options === "object" ? options : {};
  const rows = listServers();
  const index = rows.findIndex((item) => item.id === server.id);
  const updatedAt = extra.preserveUpdatedAt ? String(server.updatedAt || nowIso()) : nowIso();
  if (index >= 0) {
    rows[index] = normalizeServerRecord({ ...rows[index], ...server, updatedAt });
  } else {
    rows.push(normalizeServerRecord({ ...createServerSeed(), ...server, updatedAt }));
  }
  saveServers(rows, extra);
  return rows;
}

function removeServer(serverId, options) {
  const extra = options && typeof options === "object" ? options : {};
  const rows = listServers().filter((item) => item.id !== serverId);
  saveServers(rows, extra);
  if (!extra.silentSync) {
    notifySync("markServerDeleted", serverId, nowIso());
  }
  return rows;
}

function markServerConnected(serverId) {
  const rows = listServers();
  const index = rows.findIndex((item) => item.id === serverId);
  if (index >= 0) {
    rows[index].lastConnectedAt = nowIso();
    rows[index].updatedAt = nowIso();
    saveServers(rows);
  }
}

function getSettings() {
  return normalizeSettings({ ...DEFAULT_SETTINGS, ...sanitizeUserSettings(read(KEYS.settings, {})) });
}

function saveSettings(next, options) {
  const extra = options && typeof options === "object" ? options : {};
  const previous = getSettings();
  const updatedAt = extra.preserveUpdatedAt
    ? String(next && next.updatedAt ? next.updatedAt : nowIso())
    : nowIso();
  const normalized = normalizeSettings({ ...previous, ...sanitizeUserSettings(next || {}), updatedAt });
  write(KEYS.settings, normalized);
  if (!extra.silentSync) {
    /**
     * 重新打开云端同步时，先强制跑一次 bootstrap：
     * 1. 先把云端最新视图合并回本地；
     * 2. 再补推当前合并结果，避免直接用“关闭期间的本地快照”覆盖远端。
     */
    if (!previous.syncConfigEnabled && normalized.syncConfigEnabled) {
      notifySync("resumeSyncConfig");
    } else {
      notifySync("scheduleSettingsSync");
    }
  }
}

function normalizeRecord(item) {
  const source = item && typeof item === "object" ? item : {};
  const createdAt = String(source.createdAt || nowIso());
  const discarded = source.discarded === true;
  const processed = !discarded && source.processed === true;
  return {
    id: String(source.id || `rec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
    content: String(source.content || "").trim(),
    serverId: String(source.serverId || ""),
    createdAt,
    updatedAt: String(source.updatedAt || createdAt),
    category:
      String(source.category || DEFAULT_VOICE_RECORD_CATEGORY_FALLBACK).trim() ||
      DEFAULT_VOICE_RECORD_CATEGORY_FALLBACK,
    contextLabel: String(source.contextLabel || ""),
    processed,
    discarded
  };
}

function dropExpiredLogs(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const retentionDays = getSettings().logRetentionDays;
  const ttlMs = Number(retentionDays) * 24 * 60 * 60 * 1000;
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) return list;

  const now = Date.now();
  return list.filter((item) => {
    const startAt = +new Date(item.startAt || 0);
    if (!Number.isFinite(startAt) || startAt <= 0) return true;
    return now - startAt <= ttlMs;
  });
}

function listLogs() {
  const rows = read(KEYS.logs, []);
  const cleaned = dropExpiredLogs(rows);
  if (Array.isArray(rows) && cleaned.length !== rows.length) {
    write(KEYS.logs, cleaned);
  }
  return Array.isArray(cleaned)
    ? cleaned.slice().sort((a, b) => +new Date(b.startAt) - +new Date(a.startAt))
    : [];
}

function appendLog(entry) {
  const rows = listLogs();
  rows.unshift({
    id: entry.id || `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    startAt: entry.startAt || nowIso(),
    endAt: entry.endAt || "",
    serverId: entry.serverId || "",
    status: entry.status || "connected",
    summary: entry.summary || ""
  });
  write(KEYS.logs, rows);
}

function listRecords() {
  const rows = read(KEYS.records, []);
  if (!Array.isArray(rows)) return [];
  let dirty = false;
  const normalized = rows
    .map((item) => {
      const next = normalizeRecord(item);
      if (
        !item ||
        item.updatedAt !== next.updatedAt ||
        item.category !== next.category ||
        item.contextLabel !== next.contextLabel ||
        item.processed !== next.processed ||
        item.discarded !== next.discarded ||
        item.content !== next.content ||
        item.serverId !== next.serverId
      ) {
        dirty = true;
      }
      return next;
    })
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  if (dirty) {
    write(KEYS.records, normalized);
  }
  return normalized;
}

function saveRecords(next, options) {
  write(KEYS.records, Array.isArray(next) ? next.map((item) => normalizeRecord(item)) : []);
  const extra = options && typeof options === "object" ? options : {};
  if (!extra.silentSync) {
    notifySync("scheduleRecordsSync");
  }
}

function addRecord(content, serverId, options) {
  const text = String(content || "").trim();
  if (!text) return null;
  const rows = listRecords();
  const extra = options && typeof options === "object" ? options : {};
  const timestamp = nowIso();
  const discarded = extra.discarded === true;
  const processed = !discarded && extra.processed === true;
  const next = {
    id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    content: text,
    serverId: serverId || "",
    createdAt: timestamp,
    updatedAt: timestamp,
    category:
      String(extra.category || DEFAULT_VOICE_RECORD_CATEGORY_FALLBACK).trim() ||
      DEFAULT_VOICE_RECORD_CATEGORY_FALLBACK,
    contextLabel: String(extra.contextLabel || ""),
    processed,
    discarded
  };
  rows.unshift(next);
  saveRecords(rows);
  return next;
}

function updateRecord(payload) {
  const source = payload && typeof payload === "object" ? payload : {};
  const recordId = String(source.id || "").trim();
  const content = String(source.content || "").trim();
  if (!recordId || !content) return null;
  const rows = listRecords();
  const index = rows.findIndex((item) => item.id === recordId);
  if (index < 0) return null;
  const current = rows[index];
  let nextProcessed = Object.prototype.hasOwnProperty.call(source, "processed")
    ? source.processed === true
    : current.processed === true;
  let nextDiscarded = Object.prototype.hasOwnProperty.call(source, "discarded")
    ? source.discarded === true
    : current.discarded === true;
  /**
   * 闪念终态互斥规则与 normalizeRecord 保持一致：
   * 1. 只要本次结果里 discarded 为 true，就强制关掉 processed；
   * 2. 否则若 processed 为 true，再回头关掉 discarded；
   * 3. 这样“已废弃”不会被历史 processed 残值反向吞掉。
   */
  if (nextDiscarded) {
    nextProcessed = false;
  } else if (nextProcessed) {
    nextDiscarded = false;
  }
  const next = {
    ...current,
    content,
    category:
      String(source.category || current.category || DEFAULT_VOICE_RECORD_CATEGORY_FALLBACK).trim() ||
      DEFAULT_VOICE_RECORD_CATEGORY_FALLBACK,
    processed: nextProcessed,
    discarded: nextDiscarded,
    updatedAt: nowIso()
  };
  rows[index] = next;
  saveRecords(rows);
  return next;
}

function searchRecords(input) {
  const source = input && typeof input === "object" ? input : {};
  const keyword = String(source.keyword || "")
    .trim()
    .toLowerCase();
  const category = String(source.category || "").trim();
  return listRecords().filter((item) => {
    if (category && item.category !== category) return false;
    if (!keyword) return true;
    return [item.content, item.category, item.contextLabel, item.createdAt]
      .join(" ")
      .toLowerCase()
      .includes(keyword);
  });
}

function removeRecord(recordId, options) {
  const extra = options && typeof options === "object" ? options : {};
  const rows = listRecords().filter((item) => item.id !== recordId);
  saveRecords(rows, extra);
  if (!extra.silentSync) {
    notifySync("markRecordDeleted", recordId, nowIso());
  }
  return rows;
}

function listPluginPackages() {
  const rows = read(KEYS.pluginPackages, []);
  return Array.isArray(rows) ? rows : [];
}

function getPluginPackage(pluginId) {
  const id = String(pluginId || "");
  return listPluginPackages().find((item) => item && item.manifest && item.manifest.id === id) || null;
}

function savePluginPackages(next) {
  write(KEYS.pluginPackages, Array.isArray(next) ? next : []);
}

function upsertPluginPackage(pluginPackage) {
  if (!pluginPackage || !pluginPackage.manifest || !pluginPackage.manifest.id) {
    throw new Error("插件包格式非法");
  }
  const rows = listPluginPackages();
  const index = rows.findIndex(
    (item) => item && item.manifest && item.manifest.id === pluginPackage.manifest.id
  );
  if (index >= 0) {
    rows[index] = pluginPackage;
  } else {
    rows.push(pluginPackage);
  }
  savePluginPackages(rows);
}

function removePluginPackage(pluginId) {
  const id = String(pluginId || "");
  const rows = listPluginPackages().filter((item) => item && item.manifest && item.manifest.id !== id);
  savePluginPackages(rows);
}

function listPluginRecords() {
  const rows = read(KEYS.pluginRecords, []);
  return Array.isArray(rows) ? rows : [];
}

function savePluginRecords(next) {
  write(KEYS.pluginRecords, Array.isArray(next) ? next : []);
}

function listPluginRuntimeLogs() {
  const rows = read(KEYS.pluginRuntimeLogs, []);
  return Array.isArray(rows) ? rows : [];
}

function savePluginRuntimeLogs(next) {
  write(KEYS.pluginRuntimeLogs, Array.isArray(next) ? next : []);
}

function readPluginData(pluginId) {
  const id = String(pluginId || "").trim();
  if (!id) return {};
  return read(`remoteconn.plugins.data.${id}.v2`, {});
}

function writePluginData(pluginId, value) {
  const id = String(pluginId || "").trim();
  if (!id) return;
  write(`remoteconn.plugins.data.${id}.v2`, value && typeof value === "object" ? value : {});
}

module.exports = {
  createServerSeed,
  listServers,
  saveServers,
  upsertServer,
  removeServer,
  markServerConnected,
  getSettings,
  saveSettings,
  listLogs,
  appendLog,
  listRecords,
  addRecord,
  updateRecord,
  saveRecords,
  searchRecords,
  removeRecord,
  listPluginPackages,
  getPluginPackage,
  savePluginPackages,
  upsertPluginPackage,
  removePluginPackage,
  listPluginRecords,
  savePluginRecords,
  listPluginRuntimeLogs,
  savePluginRuntimeLogs,
  readPluginData,
  writePluginData,
  DEFAULT_VOICE_RECORD_CATEGORY_FALLBACK,
  DEFAULT_VOICE_RECORD_CATEGORIES,
  DEFAULT_VOICE_RECORD_DEFAULT_CATEGORY,
  DEFAULT_TERMINAL_BUFFER_SNAPSHOT_MAX_LINES,
  MIN_TERMINAL_BUFFER_SNAPSHOT_MAX_LINES,
  MAX_TERMINAL_BUFFER_SNAPSHOT_MAX_LINES,
  normalizeVoiceRecordCategories,
  normalizeVoiceRecordDefaultCategory
};
