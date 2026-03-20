/* global require, getApp, wx, console, module */

const {
  listPluginPackages,
  getPluginPackage,
  upsertPluginPackage,
  removePluginPackage,
  listPluginRecords,
  savePluginRecords,
  listPluginRuntimeLogs,
  savePluginRuntimeLogs,
  readPluginData,
  writePluginData
} = require("./storage");
const { onSessionEvent, sendToActiveSession } = require("./sessionBus");

const MAX_RUNTIME_LOGS = 300;
const SUPPORTED_PERMISSIONS = new Set([
  "commands.register",
  "session.read",
  "session.write",
  "ui.notice",
  "storage.read",
  "storage.write",
  "logs.read"
]);
const DEFAULT_APP_META = {
  version: "2.7.1",
  platform: "miniapp"
};

const state = {
  initialized: false,
  records: new Map(),
  runtime: new Map(),
  commands: new Map(),
  runtimeLogs: []
};

function nowIso() {
  return new Date().toISOString();
}

function toLogLine(level, pluginId, message) {
  const time = new Date().toLocaleTimeString("zh-CN", { hour12: false });
  return `[${time}] [${level}] [${pluginId}] ${message}`;
}

function pushRuntimeLog(level, pluginId, message) {
  const line = toLogLine(level, pluginId, message);
  state.runtimeLogs.unshift(line);
  if (state.runtimeLogs.length > MAX_RUNTIME_LOGS) {
    state.runtimeLogs.splice(MAX_RUNTIME_LOGS);
  }
  savePluginRuntimeLogs(state.runtimeLogs);
}

function createRecord(pluginId) {
  const now = nowIso();
  return {
    id: pluginId,
    enabled: false,
    status: "discovered",
    errorCount: 0,
    lastError: "",
    installedAt: now,
    updatedAt: now,
    lastLoadedAt: ""
  };
}

function persistRecords() {
  savePluginRecords(Array.from(state.records.values()));
}

function normalizeRecord(record) {
  const base = createRecord(String((record && record.id) || ""));
  return {
    ...base,
    ...(record || {}),
    id: String((record && record.id) || base.id),
    errorCount: Number((record && record.errorCount) || 0),
    enabled: Boolean(record && record.enabled)
  };
}

function safeParsePluginJson(raw) {
  const parsed = JSON.parse(String(raw || ""));
  const items = Array.isArray(parsed) ? parsed : [parsed];
  return items.map(validatePluginPackage);
}

function assertPermission(manifest, permission) {
  if (!manifest.permissions.includes(permission)) {
    throw new Error(`权限不足: ${permission}`);
  }
}

function validatePluginPackage(input) {
  const payload = input && typeof input === "object" ? input : {};
  const manifest = payload.manifest && typeof payload.manifest === "object" ? payload.manifest : {};
  const id = String(manifest.id || "").trim();
  if (!id) throw new Error("插件 manifest.id 不能为空");
  const name = String(manifest.name || "").trim();
  if (!name) throw new Error(`插件 ${id} 缺少 manifest.name`);
  const permissions = Array.isArray(manifest.permissions)
    ? manifest.permissions.map((item) => String(item || "").trim())
    : [];
  permissions.forEach((permission) => {
    if (!SUPPORTED_PERMISSIONS.has(permission)) {
      throw new Error(`插件 ${id} 使用了未支持权限: ${permission}`);
    }
  });
  const mainJs = String(payload.mainJs || "");
  if (!mainJs.trim()) {
    throw new Error(`插件 ${id} 缺少 mainJs`);
  }
  return {
    manifest: {
      id,
      name,
      version: String(manifest.version || "0.0.1"),
      minAppVersion: String(manifest.minAppVersion || "0.0.1"),
      description: String(manifest.description || ""),
      entry: "main.js",
      style: "styles.css",
      permissions
    },
    mainJs,
    stylesCss: String(payload.stylesCss || "")
  };
}

function getAppMeta() {
  try {
    const app = getApp();
    return {
      version: String((app && app.globalData && app.globalData.appVersion) || DEFAULT_APP_META.version),
      platform: "miniapp"
    };
  } catch {
    return DEFAULT_APP_META;
  }
}

function compareVersion(a, b) {
  const left = String(a || "0.0.0")
    .split(".")
    .map((item) => Number(item) || 0);
  const right = String(b || "0.0.0")
    .split(".")
    .map((item) => Number(item) || 0);
  const max = Math.max(left.length, right.length);
  for (let i = 0; i < max; i += 1) {
    const l = left[i] || 0;
    const r = right[i] || 0;
    if (l > r) return 1;
    if (l < r) return -1;
  }
  return 0;
}

function createRuntimeContext(pluginPackage, runtimeSlot) {
  const manifest = pluginPackage.manifest;
  return {
    app: getAppMeta(),
    commands: {
      register(command) {
        assertPermission(manifest, "commands.register");
        if (!command || typeof command !== "object") {
          throw new Error("命令定义非法");
        }
        const rawId = String(command.id || "").trim();
        if (!rawId) {
          throw new Error("命令 id 不能为空");
        }
        const fullId = `${manifest.id}:${rawId}`;
        const item = {
          id: fullId,
          title: String(command.title || rawId),
          when: command.when === "connected" ? "connected" : "always",
          handler: typeof command.handler === "function" ? command.handler : () => {}
        };
        state.commands.set(fullId, item);
        runtimeSlot.cleanupFns.push(() => state.commands.delete(fullId));
      }
    },
    session: {
      async send(input) {
        assertPermission(manifest, "session.write");
        await sendToActiveSession(String(input || ""), { source: "assist", txnId: createTxnId("plugin") });
      },
      on(eventName, handler) {
        assertPermission(manifest, "session.read");
        const off = onSessionEvent(eventName, handler);
        runtimeSlot.cleanupFns.push(off);
        return off;
      }
    },
    storage: {
      async get(key) {
        assertPermission(manifest, "storage.read");
        const data = readPluginData(manifest.id);
        return data[String(key || "")];
      },
      async set(key, value) {
        assertPermission(manifest, "storage.write");
        const data = readPluginData(manifest.id);
        data[String(key || "")] = value;
        writePluginData(manifest.id, data);
      }
    },
    ui: {
      showNotice(message, level = "info") {
        assertPermission(manifest, "ui.notice");
        const title = String(message || "").slice(0, 7) || "插件通知";
        wx.showToast({ title, icon: level === "error" ? "none" : "none" });
      }
    },
    logger: {
      info(...args) {
        pushRuntimeLog("info", manifest.id, args.join(" "));
      },
      warn(...args) {
        pushRuntimeLog("warn", manifest.id, args.join(" "));
      },
      error(...args) {
        pushRuntimeLog("error", manifest.id, args.join(" "));
      }
    }
  };
}

function loadPluginApi(mainJs, ctx) {
  const moduleRef = { exports: {} };
  const exportsRef = moduleRef.exports;
  const fn = new Function(
    "ctx",
    "module",
    "exports",
    `"use strict";
const window = undefined;
const document = undefined;
const localStorage = undefined;
${mainJs}
return module.exports;`
  );
  return fn(ctx, moduleRef, exportsRef) || moduleRef.exports;
}

function clearRuntimeById(pluginId) {
  const runtime = state.runtime.get(pluginId);
  if (!runtime) {
    return;
  }
  if (runtime.api && typeof runtime.api.onunload === "function") {
    try {
      runtime.api.onunload();
    } catch (error) {
      pushRuntimeLog("warn", pluginId, `onunload 异常: ${String((error && error.message) || error)}`);
    }
  }
  runtime.cleanupFns.forEach((off) => {
    try {
      off();
    } catch (error) {
      console.warn("[pluginRuntime.cleanup]", pluginId, error);
    }
  });
  state.runtime.delete(pluginId);
  Array.from(state.commands.keys()).forEach((commandId) => {
    if (commandId.startsWith(`${pluginId}:`)) {
      state.commands.delete(commandId);
    }
  });
}

function ensureSamplePlugin() {
  if (listPluginPackages().length > 0) {
    return;
  }
  upsertPluginPackage({
    manifest: {
      id: "codex-shortcuts",
      name: "Codex Shortcuts",
      version: "0.1.0",
      minAppVersion: "0.1.0",
      description: "提供常用 Codex 快捷命令",
      entry: "main.js",
      style: "styles.css",
      permissions: ["commands.register", "session.write", "ui.notice"]
    },
    mainJs: `
module.exports = {
  onload(ctx) {
    ctx.commands.register({
      id: "codex-doctor",
      title: "Codex Doctor",
      when: "connected",
      async handler() {
        await ctx.session.send("codex --doctor\\r");
      }
    });
    ctx.ui.showNotice("codex-shortcuts 已加载", "info");
  }
};
    `.trim(),
    stylesCss: ""
  });
}

function createTxnId(prefix) {
  return `${prefix || "plugin"}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function ensureBootstrapped() {
  if (state.initialized) {
    return;
  }

  state.runtimeLogs = listPluginRuntimeLogs();
  ensureSamplePlugin();

  state.records.clear();
  const storedRecords = listPluginRecords();
  storedRecords.forEach((record) => {
    const normalized = normalizeRecord(record);
    if (normalized.id) {
      state.records.set(normalized.id, normalized);
    }
  });

  listPluginPackages().forEach((pluginPackage) => {
    const pluginId = String((pluginPackage && pluginPackage.manifest && pluginPackage.manifest.id) || "");
    if (!pluginId) return;
    if (!state.records.has(pluginId)) {
      state.records.set(pluginId, createRecord(pluginId));
    }
  });
  persistRecords();

  state.initialized = true;

  const enabledIds = Array.from(state.records.values())
    .filter((record) => record.enabled)
    .map((record) => record.id);
  for (const pluginId of enabledIds) {
    try {
      await enable(pluginId);
    } catch (error) {
      pushRuntimeLog("error", pluginId, `自动启用失败: ${String((error && error.message) || error)}`);
    }
  }
}

function listRecords() {
  return Array.from(state.records.values());
}

function listRuntimeLogs() {
  return state.runtimeLogs.slice();
}

function listCommands(sessionState) {
  return Array.from(state.commands.values()).filter((command) => {
    if (command.when === "connected") {
      return sessionState === "connected";
    }
    return true;
  });
}

async function importJson(raw) {
  await ensureBootstrapped();
  const packages = safeParsePluginJson(raw);
  packages.forEach((pluginPackage) => {
    upsertPluginPackage(pluginPackage);
    const pluginId = pluginPackage.manifest.id;
    const record = state.records.get(pluginId) || createRecord(pluginId);
    record.status = "validated";
    record.lastError = "";
    record.updatedAt = nowIso();
    state.records.set(pluginId, record);
  });
  persistRecords();
}

async function exportJson() {
  await ensureBootstrapped();
  return JSON.stringify(listPluginPackages(), null, 2);
}

async function enable(pluginId) {
  await ensureBootstrapped();
  const id = String(pluginId || "").trim();
  if (!id) {
    throw new Error("插件 id 不能为空");
  }

  const pluginPackage = getPluginPackage(id);
  if (!pluginPackage) {
    throw new Error("插件不存在");
  }

  const appMeta = getAppMeta();
  if (compareVersion(appMeta.version, pluginPackage.manifest.minAppVersion || "0.0.1") < 0) {
    throw new Error(`当前版本 ${appMeta.version} 低于插件最低要求 ${pluginPackage.manifest.minAppVersion}`);
  }

  const record = state.records.get(id) || createRecord(id);
  if (record.errorCount >= 3) {
    throw new Error("插件已熔断，请先重载后再启用");
  }

  clearRuntimeById(id);
  record.status = "loading";
  record.lastError = "";
  record.updatedAt = nowIso();
  state.records.set(id, record);
  persistRecords();

  const runtimeSlot = {
    pluginId: id,
    cleanupFns: [],
    api: null
  };

  try {
    const ctx = createRuntimeContext(pluginPackage, runtimeSlot);
    runtimeSlot.api = loadPluginApi(pluginPackage.mainJs, ctx);
    if (runtimeSlot.api && typeof runtimeSlot.api.onload === "function") {
      await Promise.resolve(runtimeSlot.api.onload(ctx));
    }
    state.runtime.set(id, runtimeSlot);

    record.enabled = true;
    record.status = "active";
    record.lastError = "";
    record.lastLoadedAt = nowIso();
    record.updatedAt = nowIso();
    state.records.set(id, record);
    persistRecords();
    pushRuntimeLog("info", id, "插件已启用");
  } catch (error) {
    clearRuntimeById(id);
    record.enabled = false;
    record.status = "failed";
    record.errorCount = Number(record.errorCount || 0) + 1;
    record.lastError = String((error && error.message) || error);
    record.updatedAt = nowIso();
    state.records.set(id, record);
    persistRecords();
    pushRuntimeLog("error", id, `启用失败: ${record.lastError}`);
    throw error;
  }
}

async function disable(pluginId) {
  await ensureBootstrapped();
  const id = String(pluginId || "").trim();
  if (!id) {
    throw new Error("插件 id 不能为空");
  }
  clearRuntimeById(id);
  const record = state.records.get(id) || createRecord(id);
  record.enabled = false;
  if (record.status !== "failed") {
    record.status = "stopped";
  }
  record.updatedAt = nowIso();
  state.records.set(id, record);
  persistRecords();
  pushRuntimeLog("info", id, "插件已禁用");
}

async function reload(pluginId) {
  await ensureBootstrapped();
  const id = String(pluginId || "").trim();
  const record = state.records.get(id) || createRecord(id);
  record.errorCount = 0;
  record.lastError = "";
  record.updatedAt = nowIso();
  state.records.set(id, record);
  persistRecords();
  await disable(id);
  await enable(id);
}

async function remove(pluginId) {
  await ensureBootstrapped();
  const id = String(pluginId || "").trim();
  await disable(id);
  removePluginPackage(id);
  state.records.delete(id);
  persistRecords();
  pushRuntimeLog("info", id, "插件已移除");
}

async function runCommand(commandId) {
  await ensureBootstrapped();
  const command = state.commands.get(String(commandId || ""));
  if (!command) {
    throw new Error("命令不存在");
  }
  await Promise.resolve(command.handler());
}

module.exports = {
  ensureBootstrapped,
  listRecords,
  listRuntimeLogs,
  listCommands,
  importJson,
  exportJson,
  enable,
  disable,
  reload,
  remove,
  runCommand
};
