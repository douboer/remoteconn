/* global wx, console, setTimeout, clearTimeout, require, module, getApp */

const { ensureSyncAuthToken, resolveSyncBaseUrl, requestJson } = require("./syncAuth");
const { emitSyncConfigApplied } = require("./syncConfigBus");
const {
  getSettings,
  saveSettings,
  listServers,
  saveServers,
  listRecords,
  saveRecords
} = require("./storage");

const DELETED_SERVERS_KEY = "remoteconn.sync.deleted.servers.v1";
const DELETED_RECORDS_KEY = "remoteconn.sync.deleted.records.v1";
const TOMBSTONE_LIMIT = 500;

let bootstrapPromise = null;
let settingsTimer = null;
let serversTimer = null;
let recordsTimer = null;

function logSync(level, message, extra) {
  if (level === "info") return;
  const payload = extra && typeof extra === "object" ? extra : {};
  const writer = level === "warn" ? console.warn : level === "error" ? console.error : console.info;
  writer("[sync]", message, payload);
}

/**
 * 云端同步总开关：
 * 1. 默认开启，保持既有“本地 + 云端”双写行为；
 * 2. 用户关闭后，仅暂停配置类数据上云，不影响本地保存与终端会话；
 * 3. 读取 settings 时统一走 storage 归一化，避免旧版本缺字段导致误判。
 */
function isSyncConfigEnabled() {
  const settings = getSettings();
  return settings.syncConfigEnabled !== false;
}

/**
 * 定向清理排队中的同步定时器。
 * 说明：
 * 1. 用户关闭同步后，不应继续执行已经排队但尚未触发的上传；
 * 2. 这里不做网络取消，仅清理本地 200ms 防抖队列。
 */
function clearScheduledTimer(timerName) {
  if (timerName === "settingsTimer" && settingsTimer) {
    clearTimeout(settingsTimer);
    settingsTimer = null;
  }
  if (timerName === "serversTimer" && serversTimer) {
    clearTimeout(serversTimer);
    serversTimer = null;
  }
  if (timerName === "recordsTimer" && recordsTimer) {
    clearTimeout(recordsTimer);
    recordsTimer = null;
  }
}

/**
 * 一次性清理全部排队任务。
 * 说明：
 * 1. 用于“关闭同步”或“重新打开同步前先清空旧队列”；
 * 2. 只处理本地防抖队列，不会中断已经发出的网络请求。
 */
function clearAllScheduledTimers() {
  clearScheduledTimer("settingsTimer");
  clearScheduledTimer("serversTimer");
  clearScheduledTimer("recordsTimer");
}

function readArrayStorage(key) {
  try {
    const raw = wx.getStorageSync(key);
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function writeArrayStorage(key, value) {
  try {
    wx.setStorageSync(key, Array.isArray(value) ? value : []);
  } catch {
    // ignore
  }
}

function upsertTombstone(key, id, deletedAt) {
  const rows = readArrayStorage(key).filter((item) => item && item.id !== id);
  rows.unshift({ id, deletedAt: String(deletedAt || new Date().toISOString()) });
  writeArrayStorage(key, rows.slice(0, TOMBSTONE_LIMIT));
}

function clearTombstones(key, ids) {
  const removed = new Set(Array.isArray(ids) ? ids : []);
  if (removed.size === 0) return;
  const rows = readArrayStorage(key).filter((item) => item && !removed.has(item.id));
  writeArrayStorage(key, rows);
}

function getServerTombstones() {
  return readArrayStorage(DELETED_SERVERS_KEY);
}

function getRecordTombstones() {
  return readArrayStorage(DELETED_RECORDS_KEY);
}

function buildSettingsPayload() {
  const settings = getSettings();
  const updatedAt = String(settings.updatedAt || new Date().toISOString());
  return {
    updatedAt,
    data: settings
  };
}

function buildServersPayload() {
  const rows = listServers().map((item) => ({ ...item, deletedAt: null }));
  const tombstones = getServerTombstones().map((item) => ({
    id: item.id,
    name: "",
    tags: [],
    host: "",
    port: 22,
    username: "",
    authType: "password",
    password: "",
    privateKey: "",
    passphrase: "",
    certificate: "",
    projectPath: "",
    timeoutSeconds: 15,
    heartbeatSeconds: 10,
    transportMode: "gateway",
    jumpHost: {
      enabled: false,
      host: "",
      port: 22,
      username: "",
      authType: "password"
    },
    jumpPassword: "",
    jumpPrivateKey: "",
    jumpPassphrase: "",
    jumpCertificate: "",
    sortOrder: 0,
    lastConnectedAt: "",
    updatedAt: item.deletedAt,
    deletedAt: item.deletedAt
  }));
  return rows.concat(tombstones);
}

function buildRecordsPayload() {
  const rows = listRecords().map((item) => ({ ...item, deletedAt: null }));
  const tombstones = getRecordTombstones().map((item) => ({
    id: item.id,
    content: "",
    serverId: "",
    category: "未分类",
    contextLabel: "",
    processed: false,
    discarded: false,
    createdAt: item.deletedAt,
    updatedAt: item.deletedAt,
    deletedAt: item.deletedAt
  }));
  return rows.concat(tombstones);
}

function indexById(rows) {
  const map = {};
  (Array.isArray(rows) ? rows : []).forEach((item) => {
    if (!item || !item.id) return;
    map[item.id] = item;
  });
  return map;
}

function pickLatest(current, candidate) {
  // bootstrap 合并时，本地存在而远端缺项是正常情况；这里必须先兜底 null。
  if (!current) return candidate;
  if (!candidate) return current;
  const currentUpdated = +new Date(current.updatedAt || current.deletedAt || 0);
  const candidateUpdated = +new Date(candidate.updatedAt || candidate.deletedAt || 0);
  return candidateUpdated >= currentUpdated ? candidate : current;
}

/**
 * 闪念终态（已处理 / 已废弃）当前没有“恢复普通态”的 UI：
 * 1. 只要一侧已经进入终态，就不应被另一侧的普通态刷回；
 * 2. 终态之间的切换仍按 updatedAt 取较新值；
 * 3. 删除 tombstone 继续走通用时间比较，避免破坏删除同步。
 */
function pickLatestRecord(current, candidate) {
  if (!current) return candidate;
  if (!candidate) return current;
  if (current.deletedAt || candidate.deletedAt) {
    return pickLatest(current, candidate);
  }

  const currentTerminal = current.discarded === true || current.processed === true;
  const candidateTerminal = candidate.discarded === true || candidate.processed === true;
  if (currentTerminal && !candidateTerminal) return current;
  if (candidateTerminal && !currentTerminal) return candidate;

  return pickLatest(current, candidate);
}

function mergeServers(remoteRows) {
  const localRows = listServers();
  const localMap = indexById(listServers().map((item) => ({ ...item, deletedAt: null })));
  const tombstones = getServerTombstones();
  const remoteMap = indexById(remoteRows);
  tombstones.forEach((item) => {
    remoteMap[item.id] = pickLatest(remoteMap[item.id], {
      id: item.id,
      deletedAt: item.deletedAt,
      updatedAt: item.deletedAt
    });
  });
  const allIds = new Set([...Object.keys(localMap), ...Object.keys(remoteMap)]);
  const merged = [];
  const clearedTombstones = [];
  allIds.forEach((id) => {
    const localItem = localMap[id] || null;
    const remoteItem = remoteMap[id] || null;
    const winner = pickLatest(localItem, remoteItem);
    if (!winner) return;
    if (winner.deletedAt) {
      clearedTombstones.push(id);
      return;
    }
    merged.push({ ...winner, deletedAt: null });
    clearedTombstones.push(id);
  });
  saveServers(merged, { silentSync: true });
  clearTombstones(DELETED_SERVERS_KEY, clearedTombstones);
  logSync("info", "服务器合并完成", {
    localCount: localRows.length,
    remoteCount: Array.isArray(remoteRows) ? remoteRows.length : 0,
    mergedCount: merged.length,
    tombstoneCount: tombstones.length
  });
}

function mergeRecords(remoteRows) {
  const localRows = listRecords();
  const localMap = indexById(listRecords().map((item) => ({ ...item, deletedAt: null })));
  const tombstones = getRecordTombstones();
  const remoteMap = indexById(remoteRows);
  tombstones.forEach((item) => {
    remoteMap[item.id] = pickLatest(remoteMap[item.id], {
      id: item.id,
      deletedAt: item.deletedAt,
      updatedAt: item.deletedAt
    });
  });
  const allIds = new Set([...Object.keys(localMap), ...Object.keys(remoteMap)]);
  const merged = [];
  const clearedTombstones = [];
  allIds.forEach((id) => {
    const localItem = localMap[id] || null;
    const remoteItem = remoteMap[id] || null;
    const winner = pickLatestRecord(localItem, remoteItem);
    if (!winner) return;
    if (winner.deletedAt) {
      clearedTombstones.push(id);
      return;
    }
    merged.push({ ...winner, deletedAt: null });
    clearedTombstones.push(id);
  });
  saveRecords(merged, { silentSync: true });
  clearTombstones(DELETED_RECORDS_KEY, clearedTombstones);
  logSync("info", "闪念合并完成", {
    localCount: localRows.length,
    remoteCount: Array.isArray(remoteRows) ? remoteRows.length : 0,
    mergedCount: merged.length,
    tombstoneCount: tombstones.length
  });
}

function mergeSettings(remotePayload) {
  if (!remotePayload || !remotePayload.updatedAt || !remotePayload.data) {
    logSync("info", "服务端未返回设置，跳过本地设置合并");
    return;
  }
  const local = getSettings() || {};
  const localUpdated = +new Date(local.updatedAt || 0);
  const remoteUpdated = +new Date(remotePayload.updatedAt || 0);
  if (Number.isFinite(localUpdated) && localUpdated > remoteUpdated) {
    logSync("info", "本地设置更新时间更新，保留本地设置", {
      localUpdatedAt: local.updatedAt || "",
      remoteUpdatedAt: remotePayload.updatedAt
    });
    return;
  }
  saveSettings(
    { ...remotePayload.data, updatedAt: remotePayload.updatedAt },
    { preserveUpdatedAt: true, silentSync: true }
  );
  logSync("info", "设置合并完成", {
    remoteUpdatedAt: remotePayload.updatedAt
  });
}

async function authedRequest(path, options) {
  const token = await ensureSyncAuthToken();
  const baseUrl = resolveSyncBaseUrl();
  if (!baseUrl) {
    throw new Error("sync base url missing");
  }
  return requestJson(`${baseUrl}${path}`, {
    method: (options && options.method) || "GET",
    data: options && options.data,
    header: {
      "content-type": "application/json",
      Authorization: `Bearer ${token}`
    }
  });
}

async function pushSettingsNow() {
  const payload = buildSettingsPayload();
  logSync("info", "开始上传设置", {
    updatedAt: payload.updatedAt
  });
  await authedRequest("/api/miniprogram/sync/settings", {
    method: "PUT",
    data: payload
  });
  logSync("info", "设置上传完成", {
    updatedAt: payload.updatedAt
  });
}

async function pushServersNow() {
  const payload = buildServersPayload();
  logSync("info", "开始上传服务器列表", {
    count: payload.length,
    tombstoneCount: getServerTombstones().length
  });
  const response = await authedRequest("/api/miniprogram/sync/servers", {
    method: "PUT",
    data: { servers: payload }
  });
  if (response && Array.isArray(response.servers)) {
    mergeServers(response.servers);
  }
  logSync("info", "服务器列表上传完成", {
    uploadedCount: payload.length,
    remoteCount: response && Array.isArray(response.servers) ? response.servers.length : 0
  });
}

async function pushRecordsNow() {
  const payload = buildRecordsPayload();
  logSync("info", "开始上传闪念列表", {
    count: payload.length,
    tombstoneCount: getRecordTombstones().length
  });
  const response = await authedRequest("/api/miniprogram/sync/records", {
    method: "PUT",
    data: { records: payload }
  });
  if (response && Array.isArray(response.records)) {
    mergeRecords(response.records);
  }
  logSync("info", "闪念列表上传完成", {
    uploadedCount: payload.length,
    remoteCount: response && Array.isArray(response.records) ? response.records.length : 0
  });
}

function scheduleTask(timerName, task) {
  /**
   * 关闭同步后，新的排队请求应立刻失效，并顺手清掉同名旧定时器，
   * 避免用户刚关掉开关，200ms 防抖里的旧任务仍继续上云。
   */
  if (!isSyncConfigEnabled()) {
    clearScheduledTimer(timerName);
    logSync("info", "同步总开关关闭，跳过任务入队", { timerName });
    return;
  }
  clearScheduledTimer(timerName);
  logSync("info", "同步任务已入队", { timerName });

  const timeout = setTimeout(async () => {
    try {
      /**
       * 定时器真正触发时再次检查开关，确保“先排队、后关闭”的任务不会继续执行。
       */
      if (!isSyncConfigEnabled()) {
        logSync("info", "同步总开关关闭，跳过任务执行", { timerName });
        return;
      }
      logSync("info", "同步任务开始执行", { timerName });
      await task();
      logSync("info", "同步任务执行完成", { timerName });
    } catch (error) {
      logSync("warn", "同步任务执行失败", {
        timerName,
        error: error instanceof Error ? error.message : String(error || "")
      });
    } finally {
      if (timerName === "settingsTimer") settingsTimer = null;
      if (timerName === "serversTimer") serversTimer = null;
      if (timerName === "recordsTimer") recordsTimer = null;
    }
  }, 200);

  if (timerName === "settingsTimer") settingsTimer = timeout;
  if (timerName === "serversTimer") serversTimer = timeout;
  if (timerName === "recordsTimer") recordsTimer = timeout;
}

/**
 * 拉取一次云端 bootstrap，并把结果合并回本地。
 * options.force=true 时忽略历史缓存，重新发起拉取。
 */
async function ensureSyncBootstrap(options) {
  const extra = options && typeof options === "object" ? options : {};
  /**
   * 启动 bootstrap 只同步配置类数据，用户明确关闭后应直接跳过。
   */
  if (!isSyncConfigEnabled()) {
    logSync("info", "同步总开关关闭，跳过启动 bootstrap");
    return Promise.resolve(null);
  }
  if (extra.force) {
    bootstrapPromise = null;
  }
  if (bootstrapPromise) return bootstrapPromise;
  const opsBaseUrl = resolveSyncBaseUrl();
  if (!opsBaseUrl) {
    logSync("warn", "未配置同步基地址，跳过启动 bootstrap");
    return Promise.resolve(null);
  }
  bootstrapPromise = (async () => {
    try {
      logSync("info", "开始执行启动 bootstrap", { baseUrl: opsBaseUrl });
      const payload = await authedRequest("/api/miniprogram/sync/bootstrap", { method: "GET" });
      if (!payload || payload.ok !== true) return null;
      mergeSettings(payload.settings || null);
      mergeServers(Array.isArray(payload.servers) ? payload.servers : []);
      mergeRecords(Array.isArray(payload.records) ? payload.records : []);
      logSync("info", "启动 bootstrap 完成", {
        hasSettings: Boolean(payload.settings),
        serverCount: Array.isArray(payload.servers) ? payload.servers.length : 0,
        recordCount: Array.isArray(payload.records) ? payload.records.length : 0
      });
      /**
       * 启动 bootstrap 是“异步合并回本地”的：
       * 1. 首页/底栏可能已经先渲染了旧本地快照；
       * 2. 合并完成后必须主动广播一次，让当前可见页立刻重读 storage；
       * 3. 否则用户会看到“同步已完成，但必须重新进页面才显示”的假象。
       */
      emitSyncConfigApplied({
        source: extra.force ? "bootstrap.force" : "bootstrap",
        hasSettings: Boolean(payload.settings),
        serverCount: Array.isArray(payload.servers) ? payload.servers.length : 0,
        recordCount: Array.isArray(payload.records) ? payload.records.length : 0,
        appliedAt: Date.now()
      });
      return payload;
    } catch (error) {
      logSync("warn", "启动 bootstrap 失败", {
        error: error instanceof Error ? error.message : String(error || "")
      });
      return null;
    } finally {
      const app = typeof getApp === "function" ? getApp() : null;
      if (app && app.globalData) {
        app.globalData.syncBootstrappedAt = Date.now();
      }
    }
  })();
  return bootstrapPromise;
}

/**
 * 重新打开同步后的恢复流程：
 * 1. 先强制拉取一次最新云端配置，按 updatedAt/逐项 merge 规则合并；
 * 2. 再把当前合并后的本地结果重新排队上传，避免直接用“关闭期间的本地旧视图”覆盖云端。
 * 3. 若 bootstrap 失败，则退化为仅恢复本地补推，保证用户不会因为一次拉取失败而一直无法恢复同步。
 */
async function resumeSyncConfig() {
  if (!isSyncConfigEnabled()) {
    logSync("info", "同步总开关关闭，跳过恢复同步");
    clearAllScheduledTimers();
    return null;
  }
  clearAllScheduledTimers();
  let bootstrapPayload = null;
  try {
    bootstrapPayload = await ensureSyncBootstrap({ force: true });
  } catch (error) {
    logSync("warn", "恢复同步前 bootstrap 抛出异常，改为直接补推本地数据", {
      error: error instanceof Error ? error.message : String(error || "")
    });
  }
  scheduleSettingsSync();
  scheduleServersSync();
  scheduleRecordsSync();
  return bootstrapPayload;
}

function scheduleSettingsSync() {
  scheduleTask("settingsTimer", pushSettingsNow);
}

function scheduleServersSync() {
  scheduleTask("serversTimer", pushServersNow);
}

function scheduleRecordsSync() {
  scheduleTask("recordsTimer", pushRecordsNow);
}

function markServerDeleted(id, deletedAt) {
  if (!id) return;
  upsertTombstone(DELETED_SERVERS_KEY, id, deletedAt);
  logSync("info", "已记录服务器删除 tombstone", { id, deletedAt });
  scheduleServersSync();
}

function markRecordDeleted(id, deletedAt) {
  if (!id) return;
  upsertTombstone(DELETED_RECORDS_KEY, id, deletedAt);
  logSync("info", "已记录闪念删除 tombstone", { id, deletedAt });
  scheduleRecordsSync();
}

module.exports = {
  ensureSyncBootstrap,
  resumeSyncConfig,
  scheduleSettingsSync,
  scheduleServersSync,
  scheduleRecordsSync,
  markServerDeleted,
  markRecordDeleted,
  __test__: {
    clearAllScheduledTimers,
    clearScheduledTimer,
    isSyncConfigEnabled,
    pickLatest,
    pickLatestRecord
  }
};
