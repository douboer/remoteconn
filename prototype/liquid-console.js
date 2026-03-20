const APP_VERSION = "0.1.0";

const STORAGE_KEYS = {
  servers: "remoteconn_servers_v4",
  global: "remoteconn_global_v3",
  actionLogs: "remoteconn_action_logs_v1",
  sessionLogs: "remoteconn_session_logs_v1",
  knownHosts: "remoteconn_known_hosts_v1",
  credentials: "remoteconn_credentials_v1",
  pluginPackages: "remoteconn_plugin_packages_v1",
  pluginRecords: "remoteconn_plugin_records_v1",
};

const PERMISSION_WHITELIST = new Set([
  "commands.register",
  "session.read",
  "session.write",
  "ui.notice",
  "ui.statusbar",
  "storage.read",
  "storage.write",
  "logs.read",
]);

const SESSION_STATES = [
  "idle",
  "connecting",
  "auth_pending",
  "connected",
  "reconnecting",
  "disconnected",
  "error",
];

const SESSION_TRANSITIONS = {
  idle: new Set(["connecting", "disconnected"]),
  connecting: new Set(["auth_pending", "error", "disconnected"]),
  auth_pending: new Set(["connected", "error", "disconnected"]),
  connected: new Set(["reconnecting", "disconnected", "error"]),
  reconnecting: new Set(["connected", "error", "disconnected"]),
  disconnected: new Set(["connecting", "idle"]),
  error: new Set(["connecting", "disconnected"]),
};

const themePresets = {
  tide: {
    label: "潮汐蓝",
    accentColor: "#5bd2ff",
    bgColor: "#192b4d",
    textColor: "#e6f0ff",
    liquidAlpha: 0.64,
    blurRadius: 22,
    motionDuration: 14,
  },
  mint: {
    label: "薄荷流",
    accentColor: "#53ffcb",
    bgColor: "#102b34",
    textColor: "#ecfff7",
    liquidAlpha: 0.7,
    blurRadius: 24,
    motionDuration: 16,
  },
  sunrise: {
    label: "晨曦橙",
    accentColor: "#ffb86c",
    bgColor: "#2e223b",
    textColor: "#fff4df",
    liquidAlpha: 0.58,
    blurRadius: 20,
    motionDuration: 12,
  },
};

const defaultServers = [
  {
    id: "srv-1",
    name: "生产主机",
    username: "ops",
    host: "172.16.10.8",
    port: 22,
    tags: ["prod", "beijing"],
    authType: "privateKey",
    timeout: 20,
    heartbeat: 15,
    transportMode: "web",
    projectPath: "~/workspace/remoteconn",
    projectCandidates: "~/workspace/remoteconn,~/workspace/common",
    autoStartCodex: false,
    credentialRefId: "cred-1",
    lastConnectedAt: "2026-02-19 08:31:00",
  },
  {
    id: "srv-2",
    name: "预发环境",
    username: "devops",
    host: "10.20.1.45",
    port: 22,
    tags: ["staging", "shanghai"],
    authType: "password",
    timeout: 25,
    heartbeat: 20,
    transportMode: "web",
    projectPath: "~/workspace/staging",
    projectCandidates: "~/workspace/staging",
    autoStartCodex: false,
    credentialRefId: "cred-2",
    lastConnectedAt: "2026-02-18 23:10:00",
  },
  {
    id: "srv-3",
    name: "个人实验机",
    username: "gavin",
    host: "192.168.31.12",
    port: 2222,
    tags: ["lab"],
    authType: "certificate",
    timeout: 18,
    heartbeat: 12,
    transportMode: "ios",
    projectPath: "~/projects/lab",
    projectCandidates: "~/projects/lab,~/projects/demo",
    autoStartCodex: false,
    credentialRefId: "cred-3",
    lastConnectedAt: "2026-02-17 14:02:00",
  },
];

const defaultCredentials = {
  "cred-1": {
    id: "cred-1",
    type: "privateKey",
    password: "",
    privateKey: "~/.ssh/id_ed25519",
    passphrase: "",
    certPath: "",
    createdAt: "2026-02-19 08:20:00",
    updatedAt: "2026-02-19 08:31:00",
  },
  "cred-2": {
    id: "cred-2",
    type: "password",
    password: "",
    privateKey: "",
    passphrase: "",
    certPath: "",
    createdAt: "2026-02-18 23:00:00",
    updatedAt: "2026-02-18 23:10:00",
  },
  "cred-3": {
    id: "cred-3",
    type: "certificate",
    password: "",
    privateKey: "~/.ssh/lab_key",
    passphrase: "",
    certPath: "~/.ssh/lab_key-cert.pub",
    createdAt: "2026-02-17 13:50:00",
    updatedAt: "2026-02-17 14:02:00",
  },
};

const defaultGlobalConfig = {
  fontFamily: "JetBrains Mono",
  fontSize: 15,
  lineHeight: 1.4,
  cursorStyle: "block",
  unicode11: true,
  autoReconnect: true,
  reconnectLimit: 3,
  themePreset: "tide",
  accentColor: "#5bd2ff",
  bgColor: "#192b4d",
  textColor: "#e6f0ff",
  liquidAlpha: 0.64,
  blurRadius: 22,
  motionDuration: 14,
  hostKeyPolicy: "strict",
  logRetentionDays: 30,
  maskSecrets: true,
  credentialMemoryPolicy: "remember",
};

const samplePluginPackages = [
  {
    manifest: {
      id: "codex-shortcuts",
      name: "Codex Shortcuts",
      version: "0.1.0",
      minAppVersion: "0.1.0",
      description: "提供常用 Codex 快捷命令",
      entry: "main.js",
      style: "styles.css",
      permissions: ["commands.register", "session.read", "session.write", "ui.notice", "storage.read", "storage.write"],
      author: "RemoteConn",
    },
    mainJs: `
module.exports = {
  async onload(ctx) {
    const count = Number((await ctx.storage.get("boot_count")) || 0) + 1;
    await ctx.storage.set("boot_count", count);
    ctx.logger.info("插件启动次数", String(count));

    ctx.commands.register({
      id: "git-status",
      title: "Git 状态",
      when: "connected",
      async handler() {
        await ctx.session.send("git status -sb");
      },
    });

    ctx.commands.register({
      id: "codex-doctor",
      title: "Codex Doctor",
      when: "connected",
      async handler() {
        await ctx.session.send("codex --doctor");
      },
    });

    ctx.session.on("connected", ({ serverName }) => {
      ctx.ui.showNotice("插件已接入会话：" + serverName, "info");
    });
  },
  async onunload() {
    return true;
  },
};
`,
    stylesCss: `
.command-chip[data-plugin-id="codex-shortcuts"] {
  border-color: rgba(95, 228, 255, 0.65);
}
`,
  },
  {
    manifest: {
      id: "latency-watcher",
      name: "Latency Watcher",
      version: "0.1.0",
      minAppVersion: "0.1.0",
      description: "当延迟过高时给出提示",
      entry: "main.js",
      style: "styles.css",
      permissions: ["session.read", "ui.notice", "logs.read"],
      author: "RemoteConn",
    },
    mainJs: `
module.exports = {
  onload(ctx) {
    ctx.session.on("latency", ({ latency }) => {
      if (latency > 180) {
        ctx.ui.showNotice("当前延迟较高：" + latency + "ms", "warn");
      }
    });
  },
};
`,
    stylesCss: `
.state-pill.state-connected {
  text-shadow: 0 0 8px rgba(121, 243, 189, 0.4);
}
`,
  },
];

const dom = {
  screens: document.querySelectorAll(".screen"),
  serverList: document.getElementById("serverList"),
  serverSearch: document.getElementById("serverSearch"),
  serverSort: document.getElementById("serverSort"),
  serverForm: document.getElementById("serverForm"),
  authTypeSelect: document.getElementById("authTypeSelect"),
  authFields: document.getElementById("authFields"),
  consoleServerName: document.getElementById("consoleServerName"),
  globalForm: document.getElementById("globalForm"),
  themePresetSelect: document.getElementById("themePresetSelect"),
  contrastHint: document.getElementById("contrastHint"),
  terminalOutput: document.getElementById("terminalOutput"),
  terminalInput: document.getElementById("terminalInput"),
  sessionStateBadge: document.getElementById("sessionStateBadge"),
  latencyValue: document.getElementById("latencyValue"),
  pluginCommandBar: document.getElementById("pluginCommandBar"),
  saveServerBtn: document.getElementById("saveServerBtn"),
  saveGlobalBtn: document.getElementById("saveGlobalBtn"),
  codexDialog: document.getElementById("codexDialog"),
  globalDialog: document.getElementById("globalDialog"),
  hostKeyDialog: document.getElementById("hostKeyDialog"),
  globalSnapshot: document.getElementById("globalSnapshot"),
  hostKeySummary: document.getElementById("hostKeySummary"),
  hostKeyFingerprint: document.getElementById("hostKeyFingerprint"),
  hostKeyRemember: document.getElementById("hostKeyRemember"),
  sessionLogList: document.getElementById("sessionLogList"),
  sessionLogDetail: document.getElementById("sessionLogDetail"),
  logServerFilter: document.getElementById("logServerFilter"),
  logStatusFilter: document.getElementById("logStatusFilter"),
  logDateFrom: document.getElementById("logDateFrom"),
  logDateTo: document.getElementById("logDateTo"),
  pluginPackageInput: document.getElementById("pluginPackageInput"),
  pluginList: document.getElementById("pluginList"),
  pluginRuntimeLog: document.getElementById("pluginRuntimeLog"),
  toast: document.getElementById("toast"),
};

const appState = {
  currentView: "servermanager",
  viewHistory: ["servermanager"],
  servers: [],
  credentials: {},
  knownHosts: {},
  globalConfig: { ...defaultGlobalConfig },
  selectedServerId: null,
  selectedServerIds: new Set(),
  search: "",
  sortBy: "recent",
  actionLogs: [],
  sessionLogs: [],
  selectedSessionLogId: null,
  terminalLines: [],
  sessionState: "idle",
  currentTransport: null,
  reconnectAttempts: 0,
  reconnectTimer: null,
  reconnectReason: "",
  currentSessionLogId: null,
  sessionMeta: null,
  pendingHostKeyDecision: null,
  pluginRuntimeLogs: [],
};

class TinyEmitter {
  constructor() {
    this.listeners = new Map();
  }

  on(eventName, listener) {
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, new Set());
    }
    this.listeners.get(eventName).add(listener);
    return () => this.off(eventName, listener);
  }

  off(eventName, listener) {
    const bucket = this.listeners.get(eventName);
    if (!bucket) return;
    bucket.delete(listener);
    if (bucket.size === 0) {
      this.listeners.delete(eventName);
    }
  }

  emit(eventName, payload) {
    const bucket = this.listeners.get(eventName);
    if (!bucket) return;
    bucket.forEach((listener) => {
      try {
        listener(payload);
      } catch (error) {
        console.error("事件处理异常", error);
      }
    });
  }
}

/**
 * 传输层抽象：这里用 MockTransport 模拟 iOS Native / Web 网关 / 小程序网关三种模式。
 * 真实接入时只需要保持 connect/exec/disconnect/on 这四类能力一致即可替换。
 */
class MockTransport {
  constructor(mode = "web") {
    this.mode = mode;
    this.connected = false;
    this.currentPath = "~";
    this.emitter = new TinyEmitter();
    this.latencyTimer = null;
    this.heartbeatTimer = null;
    this.server = null;
    this.codexInstalled = true;
  }

  on(eventName, listener) {
    return this.emitter.on(eventName, listener);
  }

  async connect({ server }) {
    this.server = server;
    this.codexInstalled = !server.host.includes("10.20.1.45");

    await sleep(220 + Math.floor(Math.random() * 160));
    this.connected = true;
    this.currentPath = "~";

    this.latencyTimer = window.setInterval(() => {
      if (!this.connected) return;
      const base = this.mode === "ios" ? 34 : this.mode === "miniapp" ? 78 : 52;
      const jitter = Math.floor(Math.random() * 130);
      this.emitter.emit("latency", { latency: base + jitter });
    }, 2000);

    this.heartbeatTimer = window.setInterval(() => {
      if (!this.connected) return;
      this.emitter.emit("stdout", { text: `[心跳] ${formatDateTime(new Date(), true)} channel alive` });
    }, Math.max(6000, (server.heartbeat || 15) * 1000));

    return {
      welcome: [
        `连接模式: ${this.mode.toUpperCase()}`,
        `登录到 ${server.username}@${server.host}:${server.port}`,
        "Last login: Thu Feb 19 08:35:11 2026",
      ],
    };
  }

  async exec(command) {
    if (!this.connected) {
      const error = new Error("连接已断开，无法执行命令");
      this.emitter.emit("error", { error });
      throw error;
    }

    const cleaned = String(command || "").trim();
    if (!cleaned) {
      return { code: 0, stdout: "", stderr: "" };
    }

    this.emitter.emit("stdout", { text: `$ ${cleaned}` });
    await sleep(80 + Math.floor(Math.random() * 120));

    if (cleaned.startsWith("cd ")) {
      const rawPath = cleaned.slice(3).trim();
      const path = rawPath.replace(/^['"]|['"]$/g, "");
      if (path.includes("missing") || path.includes("不存在")) {
        const stderr = "cd: no such file or directory";
        this.emitter.emit("stderr", { text: stderr });
        return { code: 1, stdout: "", stderr };
      }
      this.currentPath = path;
      const stdout = `切换目录成功: ${path}`;
      this.emitter.emit("stdout", { text: stdout });
      return { code: 0, stdout, stderr: "" };
    }

    if (cleaned === "command -v codex") {
      if (!this.codexInstalled) {
        const stderr = "codex: command not found";
        this.emitter.emit("stderr", { text: stderr });
        return { code: 1, stdout: "", stderr };
      }
      const stdout = "/usr/local/bin/codex";
      this.emitter.emit("stdout", { text: stdout });
      return { code: 0, stdout, stderr: "" };
    }

    if (cleaned.startsWith("codex")) {
      if (!this.codexInstalled) {
        const stderr = "codex: command not found";
        this.emitter.emit("stderr", { text: stderr });
        return { code: 127, stdout: "", stderr };
      }
      const stdout = "Codex 已启动，等待任务输入...";
      this.emitter.emit("stdout", { text: stdout });
      return { code: 0, stdout, stderr: "" };
    }

    if (cleaned === "clear") {
      return { code: 0, stdout: "", stderr: "" };
    }

    if (cleaned === "git status -sb") {
      const stdout = "## main...origin/main\n M prototype/liquid-console.js\n M prototype/liquid-console.html";
      this.emitter.emit("stdout", { text: stdout });
      return { code: 0, stdout, stderr: "" };
    }

    if (cleaned === "codex --doctor") {
      const stdout = "[doctor] environment ok\n[doctor] plugin runtime ready\n[doctor] transport healthy";
      this.emitter.emit("stdout", { text: stdout });
      return { code: 0, stdout, stderr: "" };
    }

    const stdout = `执行完成: ${cleaned}`;
    this.emitter.emit("stdout", { text: stdout });
    return { code: 0, stdout, stderr: "" };
  }

  disconnect(reason = "manual") {
    if (!this.connected) return;
    this.connected = false;
    if (this.latencyTimer) {
      window.clearInterval(this.latencyTimer);
      this.latencyTimer = null;
    }
    if (this.heartbeatTimer) {
      window.clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.emitter.emit("disconnect", { reason });
  }
}

/**
 * Web 平台无法直接访问 ~/.remoteconn，这里使用 PluginFsAdapter 抽象一层“虚拟插件目录”。
 * 这样未来替换为 iOS 本地文件系统或桌面文件系统时，不需要重写插件管理逻辑。
 */
class PluginFsAdapter {
  constructor() {
    this.cache = new Map();
  }

  loadPackages() {
    const saved = loadJson(STORAGE_KEYS.pluginPackages, []);
    if (Array.isArray(saved)) {
      saved.forEach((pkg) => {
        if (pkg?.manifest?.id) {
          this.cache.set(pkg.manifest.id, pkg);
        }
      });
    }

    samplePluginPackages.forEach((pkg) => {
      if (!this.cache.has(pkg.manifest.id)) {
        this.cache.set(pkg.manifest.id, pkg);
      }
    });

    this.persist();
    return this.listPackages();
  }

  listPackages() {
    return Array.from(this.cache.values()).sort((a, b) =>
      String(a.manifest?.name || "").localeCompare(String(b.manifest?.name || ""), "zh-CN")
    );
  }

  getPackage(pluginId) {
    return this.cache.get(pluginId) || null;
  }

  upsertPackage(pluginPackage) {
    this.cache.set(pluginPackage.manifest.id, pluginPackage);
    this.persist();
  }

  removePackage(pluginId) {
    this.cache.delete(pluginId);
    this.persist();
  }

  exportPackages() {
    return this.listPackages();
  }

  persist() {
    saveJson(STORAGE_KEYS.pluginPackages, Array.from(this.cache.values()));
  }
}

/**
 * 插件运行时管理器，负责加载、权限校验、生命周期调用、命令注册和错误隔离。
 * 关键原则：单插件崩溃不影响 SSH 主链路。
 */
class PluginManager {
  constructor(fsAdapter) {
    this.fsAdapter = fsAdapter;
    this.records = new Map();
    this.runtime = new Map();
    this.commands = new Map();
    this.sessionHandlers = new Map();
  }

  bootstrap() {
    this.fsAdapter.loadPackages();
    this.loadRecords();
    this.renderPluginList();
    this.renderPluginRuntimeLog();

    // 自动恢复已启用插件
    const records = Array.from(this.records.values()).filter((item) => item.enabled);
    records.forEach((record) => {
      this.enable(record.id).catch((error) => {
        this.logRuntime("error", record.id, `自动加载失败: ${error.message}`);
      });
    });
  }

  loadRecords() {
    const stored = loadJson(STORAGE_KEYS.pluginRecords, []);
    if (Array.isArray(stored)) {
      stored.forEach((record) => {
        if (record?.id) {
          this.records.set(record.id, { ...record });
        }
      });
    }

    this.fsAdapter.listPackages().forEach((pkg) => {
      if (!this.records.has(pkg.manifest.id)) {
        this.records.set(pkg.manifest.id, {
          id: pkg.manifest.id,
          enabled: false,
          status: "discovered",
          errorCount: 0,
          lastError: "",
          installedAt: formatDateTime(new Date()),
          updatedAt: formatDateTime(new Date()),
          lastLoadedAt: "",
        });
      }
    });

    this.persistRecords();
  }

  persistRecords() {
    saveJson(STORAGE_KEYS.pluginRecords, Array.from(this.records.values()));
  }

  refresh() {
    this.fsAdapter.loadPackages();
    this.loadRecords();
    this.renderPluginList();
  }

  validatePackage(pluginPackage) {
    if (!pluginPackage || typeof pluginPackage !== "object") {
      throw new Error("插件包必须是对象");
    }

    const { manifest, mainJs, stylesCss } = pluginPackage;
    if (!manifest || typeof manifest !== "object") {
      throw new Error("缺少 manifest");
    }

    const required = ["id", "name", "version", "minAppVersion", "description", "entry", "style", "permissions"];
    required.forEach((field) => {
      if (!(field in manifest)) {
        throw new Error(`manifest 缺少字段: ${field}`);
      }
    });

    if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(manifest.id)) {
      throw new Error("插件 id 不符合规范");
    }

    if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) {
      throw new Error("version 必须是 SemVer 格式，例如 0.1.0");
    }

    if (!/^\d+\.\d+\.\d+$/.test(manifest.minAppVersion)) {
      throw new Error("minAppVersion 必须是 SemVer 格式");
    }

    if (manifest.entry !== "main.js" || manifest.style !== "styles.css") {
      throw new Error("entry/style 目前仅支持 main.js 与 styles.css");
    }

    if (!Array.isArray(manifest.permissions)) {
      throw new Error("permissions 必须是数组");
    }

    manifest.permissions.forEach((permission) => {
      if (!PERMISSION_WHITELIST.has(permission)) {
        throw new Error(`未知权限: ${permission}`);
      }
    });

    if (typeof mainJs !== "string" || !mainJs.trim()) {
      throw new Error("mainJs 不能为空");
    }

    if (typeof stylesCss !== "string") {
      throw new Error("stylesCss 必须是字符串");
    }

    if (/^\s*\*/m.test(stylesCss) || /^\s*(body|html)\s*[{,]/m.test(stylesCss)) {
      throw new Error("styles.css 禁止使用全局选择器（* / body / html）");
    }

    return {
      manifest: { ...manifest },
      mainJs,
      stylesCss,
    };
  }

  installPackage(pluginPackage) {
    const valid = this.validatePackage(pluginPackage);
    this.fsAdapter.upsertPackage(valid);

    const record = this.records.get(valid.manifest.id) || {
      id: valid.manifest.id,
      enabled: false,
      status: "discovered",
      errorCount: 0,
      lastError: "",
      installedAt: formatDateTime(new Date()),
      updatedAt: formatDateTime(new Date()),
      lastLoadedAt: "",
    };

    record.updatedAt = formatDateTime(new Date());
    record.status = "validated";
    record.lastError = "";
    this.records.set(valid.manifest.id, record);
    this.persistRecords();
    this.renderPluginList();
    this.logRuntime("info", valid.manifest.id, "插件包校验通过并写入虚拟目录");
  }

  async enable(pluginId) {
    const pluginPackage = this.fsAdapter.getPackage(pluginId);
    if (!pluginPackage) {
      throw new Error("插件不存在");
    }

    const validPackage = this.validatePackage(pluginPackage);
    const record = this.ensureRecord(pluginId);

    if (record.errorCount >= 3) {
      throw new Error("插件已触发熔断，请先重载后再启用");
    }

    if (this.runtime.has(pluginId)) {
      await this.disable(pluginId, false);
    }

    record.status = "loading";
    record.lastError = "";
    this.persistRecords();
    this.renderPluginList();

    const runtime = {
      pluginId,
      manifest: validPackage.manifest,
      cleanupFns: [],
      api: null,
      styleNode: null,
    };

    try {
      runtime.styleNode = this.mountStyle(validPackage.manifest, validPackage.stylesCss);
      const ctx = this.createPluginContext(validPackage.manifest, runtime);
      runtime.api = this.loadPluginApi(validPackage.mainJs, ctx);

      if (runtime.api && typeof runtime.api.onload === "function") {
        await runWithTimeout(Promise.resolve(runtime.api.onload(ctx)), 3000, "onload 超时");
      }

      this.runtime.set(pluginId, runtime);
      record.enabled = true;
      record.status = "active";
      record.lastLoadedAt = formatDateTime(new Date());
      record.lastError = "";
      this.persistRecords();
      this.renderPluginList();
      this.renderCommandBar();
      this.logRuntime("info", pluginId, "插件已启用");
    } catch (error) {
      if (runtime.styleNode) {
        runtime.styleNode.remove();
      }
      record.enabled = false;
      record.status = "failed";
      record.errorCount += 1;
      record.lastError = error.message;
      this.persistRecords();
      this.renderPluginList();
      this.renderCommandBar();
      this.logRuntime("error", pluginId, `加载失败: ${error.message}`);
      throw error;
    }
  }

  async disable(pluginId, updateUi = true) {
    const runtime = this.runtime.get(pluginId);
    const record = this.ensureRecord(pluginId);

    if (runtime) {
      if (runtime.api && typeof runtime.api.onunload === "function") {
        try {
          await runWithTimeout(Promise.resolve(runtime.api.onunload()), 3000, "onunload 超时");
        } catch (error) {
          this.logRuntime("warn", pluginId, `onunload 执行异常: ${error.message}`);
        }
      }

      runtime.cleanupFns.forEach((cleanup) => {
        try {
          cleanup();
        } catch (error) {
          console.error("插件清理失败", error);
        }
      });

      if (runtime.styleNode) {
        runtime.styleNode.remove();
      }
    }

    this.runtime.delete(pluginId);

    Array.from(this.commands.keys())
      .filter((commandId) => commandId.startsWith(`${pluginId}:`))
      .forEach((commandId) => {
        this.commands.delete(commandId);
      });

    this.sessionHandlers.delete(pluginId);

    record.enabled = false;
    if (record.status !== "failed") {
      record.status = "stopped";
    }
    this.persistRecords();

    if (updateUi) {
      this.renderPluginList();
      this.renderCommandBar();
    }

    this.logRuntime("info", pluginId, "插件已禁用");
  }

  async reload(pluginId) {
    const record = this.ensureRecord(pluginId);
    record.errorCount = 0;
    record.lastError = "";
    this.persistRecords();

    await this.disable(pluginId, false);
    await this.enable(pluginId);
    this.logRuntime("info", pluginId, "插件已重载");
  }

  async remove(pluginId) {
    await this.disable(pluginId, false);
    this.fsAdapter.removePackage(pluginId);
    this.records.delete(pluginId);
    this.persistRecords();
    this.renderPluginList();
    this.renderCommandBar();
    this.logRuntime("info", pluginId, "插件包已移除");
  }

  createPluginContext(manifest, runtime) {
    const assertPermission = (permission) => {
      if (!manifest.permissions.includes(permission)) {
        throw new Error(`权限不足: ${permission}`);
      }
    };

    const pluginId = manifest.id;

    return {
      app: {
        version: APP_VERSION,
        platform: this.resolvePlatformTag(),
      },
      commands: {
        register: (command) => {
          assertPermission("commands.register");

          if (!command || typeof command !== "object") {
            throw new Error("command 必须是对象");
          }
          if (!command.id || !command.title || typeof command.handler !== "function") {
            throw new Error("command 需要 id/title/handler");
          }

          const commandId = `${pluginId}:${command.id}`;
          this.commands.set(commandId, {
            id: commandId,
            pluginId,
            title: command.title,
            when: command.when || "always",
            handler: command.handler,
          });

          const cleanup = () => {
            this.commands.delete(commandId);
            this.renderCommandBar();
          };
          runtime.cleanupFns.push(cleanup);
          this.renderCommandBar();
        },
      },
      session: {
        on: (eventName, handler) => {
          assertPermission("session.read");
          if (typeof handler !== "function") {
            throw new Error("session.on handler 必须是函数");
          }
          if (!this.sessionHandlers.has(pluginId)) {
            this.sessionHandlers.set(pluginId, []);
          }
          const wrapped = (payload) => {
            try {
              handler(payload);
            } catch (error) {
              this.logRuntime("error", pluginId, `会话事件异常: ${error.message}`);
            }
          };
          this.sessionHandlers.get(pluginId).push({ eventName, handler: wrapped });

          const cleanup = () => {
            const handlers = this.sessionHandlers.get(pluginId) || [];
            this.sessionHandlers.set(
              pluginId,
              handlers.filter((item) => item.handler !== wrapped)
            );
          };
          runtime.cleanupFns.push(cleanup);
        },
        send: async (input) => {
          assertPermission("session.write");
          await runRemoteCommand(String(input || ""), {
            source: `plugin:${pluginId}`,
          });
        },
      },
      storage: {
        get: async (key) => {
          assertPermission("storage.read");
          const namespace = loadJson(`remoteconn_plugin_data_${pluginId}`, {});
          return namespace?.[key];
        },
        set: async (key, value) => {
          assertPermission("storage.write");
          const namespace = loadJson(`remoteconn_plugin_data_${pluginId}`, {});
          namespace[key] = value;
          saveJson(`remoteconn_plugin_data_${pluginId}`, namespace);
        },
      },
      ui: {
        showNotice: (message, level = "info") => {
          assertPermission("ui.notice");
          const prefix = level === "warn" ? "[警告]" : level === "error" ? "[错误]" : "[提示]";
          showToast(`${prefix} ${message}`);
        },
      },
      logger: {
        info: (...args) => this.logRuntime("info", pluginId, args.join(" ")),
        warn: (...args) => this.logRuntime("warn", pluginId, args.join(" ")),
        error: (...args) => this.logRuntime("error", pluginId, args.join(" ")),
      },
    };
  }

  loadPluginApi(mainJs, ctx) {
    const module = { exports: {} };
    const exportsRef = module.exports;

    const factory = new Function(
      "ctx",
      "module",
      "exports",
      `"use strict";
const window = undefined;
const document = undefined;
const localStorage = undefined;
const globalThis = undefined;
${mainJs}
return module.exports;`
    );

    const output = factory(ctx, module, exportsRef);
    return output || module.exports;
  }

  mountStyle(manifest, stylesCss) {
    const styleEl = document.createElement("style");
    styleEl.dataset.pluginId = manifest.id;
    styleEl.textContent = stylesCss;
    document.head.append(styleEl);
    return styleEl;
  }

  emitSessionEvent(eventName, payload) {
    this.sessionHandlers.forEach((items, pluginId) => {
      items
        .filter((item) => item.eventName === eventName)
        .forEach((item) => {
          try {
            item.handler(payload);
          } catch (error) {
            this.logRuntime("error", pluginId, `事件 ${eventName} 处理失败: ${error.message}`);
          }
        });
    });
  }

  async runCommand(commandId) {
    const command = this.commands.get(commandId);
    if (!command) {
      throw new Error("命令不存在");
    }

    try {
      await Promise.resolve(command.handler());
    } catch (error) {
      this.logRuntime("error", command.pluginId, `命令执行失败: ${error.message}`);
      throw error;
    }
  }

  listCommands() {
    return Array.from(this.commands.values());
  }

  listPluginItems() {
    return this.fsAdapter.listPackages().map((pkg) => {
      const record = this.ensureRecord(pkg.manifest.id);
      return {
        package: pkg,
        record,
      };
    });
  }

  ensureRecord(pluginId) {
    if (!this.records.has(pluginId)) {
      this.records.set(pluginId, {
        id: pluginId,
        enabled: false,
        status: "discovered",
        errorCount: 0,
        lastError: "",
        installedAt: formatDateTime(new Date()),
        updatedAt: formatDateTime(new Date()),
        lastLoadedAt: "",
      });
    }
    return this.records.get(pluginId);
  }

  resolvePlatformTag() {
    const current = findCurrentServer();
    return current?.transportMode || "web";
  }

  logRuntime(level, pluginId, message) {
    const line = `[${formatDateTime(new Date(), true)}] [${level.toUpperCase()}] [${pluginId}] ${message}`;
    appState.pluginRuntimeLogs.unshift(line);
    while (appState.pluginRuntimeLogs.length > 200) {
      appState.pluginRuntimeLogs.pop();
    }
    this.renderPluginRuntimeLog();
  }

  renderPluginRuntimeLog() {
    if (!dom.pluginRuntimeLog) return;
    dom.pluginRuntimeLog.innerHTML = appState.pluginRuntimeLogs
      .map((line) => `<p>${escapeHtml(line)}</p>`)
      .join("");
  }

  renderCommandBar() {
    if (!dom.pluginCommandBar) return;
    const commands = this.listCommands().filter((command) => {
      if (command.when === "connected") {
        return appState.sessionState === "connected";
      }
      return true;
    });

    if (commands.length === 0) {
      dom.pluginCommandBar.innerHTML = `<span class="hint-text">暂无插件命令</span>`;
      return;
    }

    dom.pluginCommandBar.innerHTML = commands
      .map(
        (command) =>
          `<button class="command-chip" type="button" data-action="plugin-command-run" data-command-id="${escapeAttr(
            command.id
          )}" data-plugin-id="${escapeAttr(command.pluginId)}">${escapeHtml(command.title)}</button>`
      )
      .join("");
  }

  renderPluginList() {
    if (!dom.pluginList) return;
    const rows = this.listPluginItems();

    if (rows.length === 0) {
      dom.pluginList.innerHTML = `<p class="hint-text">尚未安装插件</p>`;
      return;
    }

    dom.pluginList.innerHTML = rows
      .map(({ package: pkg, record }) => {
        const permissions = (pkg.manifest.permissions || []).join(", ");
        const enableBtn = record.enabled
          ? `<button class="ghost-btn" type="button" data-action="plugin-disable" data-plugin-id="${escapeAttr(
              pkg.manifest.id
            )}">禁用</button>`
          : `<button class="text-btn" type="button" data-action="plugin-enable" data-plugin-id="${escapeAttr(
              pkg.manifest.id
            )}">启用</button>`;

        return `
          <article class="plugin-item">
            <div class="plugin-item-top">
              <div>
                <div class="plugin-item-title">${escapeHtml(pkg.manifest.name)}</div>
                <div class="plugin-item-meta">${escapeHtml(pkg.manifest.id)} · v${escapeHtml(pkg.manifest.version)}</div>
              </div>
              <span class="state-pill state-${escapeHtml(record.status || "idle")}">${escapeHtml(record.status || "unknown")}</span>
            </div>
            <div class="plugin-item-meta">权限：${escapeHtml(permissions || "无")}</div>
            <div class="plugin-item-meta">最后错误：${escapeHtml(record.lastError || "- ")}</div>
            <div class="plugin-item-actions">
              ${enableBtn}
              <button class="text-btn" type="button" data-action="plugin-reload" data-plugin-id="${escapeAttr(pkg.manifest.id)}">重载</button>
              <button class="ghost-btn" type="button" data-action="plugin-remove" data-plugin-id="${escapeAttr(pkg.manifest.id)}">移除</button>
            </div>
          </article>
        `;
      })
      .join("");
  }
}

const pluginFsAdapter = new PluginFsAdapter();
const pluginManager = new PluginManager(pluginFsAdapter);

init();

function init() {
  bootstrapData();
  bindEvents();

  if (appState.servers.length === 0) {
    appState.servers = structuredClone(defaultServers);
  }
  appState.selectedServerId = appState.servers[0]?.id || null;

  hydrateServerForm(findCurrentServer());
  hydrateGlobalForm(appState.globalConfig);
  applyTheme(appState.globalConfig, true);
  renderServerList();
  renderTerminal();
  renderSessionState();
  renderLogFilters();
  renderSessionLogs();
  pluginManager.bootstrap();

  appendActionLog("系统", "servermanager 已作为默认首页载入");
  appendTerminal("系统", "RemoteConn 终端已就绪，点击“连接”建立 SSH 会话");
}

function bootstrapData() {
  appState.servers = loadJson(STORAGE_KEYS.servers, structuredClone(defaultServers));
  appState.globalConfig = {
    ...defaultGlobalConfig,
    ...loadJson(STORAGE_KEYS.global, {}),
  };

  appState.actionLogs = loadJson(STORAGE_KEYS.actionLogs, []);
  appState.sessionLogs = loadJson(STORAGE_KEYS.sessionLogs, []);
  appState.knownHosts = loadJson(STORAGE_KEYS.knownHosts, {});

  if (appState.globalConfig.credentialMemoryPolicy === "remember") {
    appState.credentials = loadJson(STORAGE_KEYS.credentials, structuredClone(defaultCredentials));
  } else {
    appState.credentials = structuredClone(defaultCredentials);
  }

  // 数据兜底，避免历史脏数据导致 UI 报错。
  appState.servers = Array.isArray(appState.servers) ? appState.servers : structuredClone(defaultServers);
  appState.actionLogs = Array.isArray(appState.actionLogs) ? appState.actionLogs : [];
  appState.sessionLogs = Array.isArray(appState.sessionLogs) ? appState.sessionLogs : [];

  enforceLogRetention();
}

function bindEvents() {
  document.addEventListener("click", handleActionClick);

  dom.serverSearch.addEventListener("input", (event) => {
    appState.search = event.target.value.trim().toLowerCase();
    renderServerList();
  });

  dom.serverSort.addEventListener("change", (event) => {
    appState.sortBy = event.target.value;
    renderServerList();
  });

  dom.authTypeSelect.addEventListener("change", (event) => {
    renderAuthFields(event.target.value, collectServerFormData({ persistCredential: false }));
  });

  dom.themePresetSelect.addEventListener("change", (event) => {
    applyThemePreset(event.target.value);
  });

  dom.saveServerBtn.addEventListener("click", () => saveCurrentServer());
  dom.saveGlobalBtn.addEventListener("click", () => saveGlobalConfig());

  dom.globalForm.addEventListener("input", (event) => {
    const watched = [
      "accentColor",
      "bgColor",
      "textColor",
      "liquidAlpha",
      "blurRadius",
      "motionDuration",
      "fontFamily",
      "fontSize",
      "lineHeight",
    ];

    if (watched.includes(event.target.name)) {
      const preview = collectGlobalFormData();
      applyTheme(preview, false);
    }
  });

  dom.terminalInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      executeTerminalInput();
    }
  });
}

function handleActionClick(event) {
  const trigger = event.target.closest("[data-action]");
  if (!trigger) {
    const tabTrigger = event.target.closest("[data-tab-target]");
    if (tabTrigger) {
      switchTab(tabTrigger);
    }
    return;
  }

  const action = trigger.dataset.action;

  if (action === "server-activate") {
    saveCurrentServer(false);
    appState.selectedServerId = trigger.dataset.id;
    hydrateServerForm(findCurrentServer());
    renderServerList();
    appendActionLog("服务器", `切换到 ${findCurrentServer()?.name || "未命名"}`);
    return;
  }

  if (action === "server-toggle-select") {
    const id = trigger.dataset.id;
    if (!id) return;
    if (trigger.checked) {
      appState.selectedServerIds.add(id);
    } else {
      appState.selectedServerIds.delete(id);
    }
    return;
  }

  if (action === "close-modal") {
    const dialog = trigger.closest("dialog");
    dialog?.close();
    return;
  }

  const actionMap = {
    "server-create": createServer,
    "server-delete": deleteServers,
    "server-select-all": selectAllServers,
    "server-test": testConnection,
    "navigate-config": () => navigateTo("config"),
    "navigate-manager": () => navigateTo("servermanager"),
    "open-console": openConsole,
    "go-back": goBack,
    "open-log": openLogWindow,
    "open-global-dialog": openGlobalDialog,
    "open-codex-dialog": openCodexDialog,
    "run-codex": () => runCodex(trigger.dataset.sandbox),
    "clear-console": clearConsole,
    "terminal-send": executeTerminalInput,
    "session-reconnect": reconnectSessionManually,
    "session-disconnect": () => disconnectCurrentSession("用户主动断开", true),
    "logs-apply-filter": renderSessionLogs,
    "logs-export": exportSessionLogs,
    "hostkey-trust": () => settleHostKeyDecision(true),
    "hostkey-cancel": () => settleHostKeyDecision(false),
    "theme-auto-contrast": autoOptimizeThemeBackground,
    "theme-reset": resetThemePreset,
    "restore-global-defaults": restoreGlobalDefaults,
    "clear-known-hosts": clearKnownHosts,
    "clear-credentials": clearCredentials,
    "plugins-refresh": () => pluginManager.refresh(),
    "plugins-install-sample": installSamplePlugins,
    "plugins-import-json": importPluginFromInput,
    "plugins-export": exportPluginPackages,
    "plugin-enable": () => togglePlugin(trigger.dataset.pluginId, true),
    "plugin-disable": () => togglePlugin(trigger.dataset.pluginId, false),
    "plugin-reload": () => reloadPlugin(trigger.dataset.pluginId),
    "plugin-remove": () => removePlugin(trigger.dataset.pluginId),
    "plugin-command-run": () => runPluginCommand(trigger.dataset.commandId),
  };

  const handler = actionMap[action];
  if (handler) {
    Promise.resolve(handler()).catch((error) => {
      console.error(error);
      showToast(`操作失败: ${error.message}`);
    });
  }
}

function navigateTo(viewName, pushHistory = true) {
  if (!viewName || viewName === appState.currentView) {
    return;
  }

  if (pushHistory) {
    appState.viewHistory.push(viewName);
  }

  appState.currentView = viewName;
  dom.screens.forEach((screen) => {
    screen.classList.toggle("is-active", screen.dataset.screen === viewName);
  });

  if (viewName === "console") {
    updateServerLabels();
    renderTerminal();
    pluginManager.renderCommandBar();
  }

  if (viewName === "log") {
    renderLogFilters();
    renderSessionLogs();
  }

  if (viewName === "config") {
    pluginManager.renderPluginList();
    pluginManager.renderPluginRuntimeLog();
  }
}

function goBack() {
  if (appState.viewHistory.length <= 1) {
    showToast("当前已经是首页");
    return;
  }

  appState.viewHistory.pop();
  const previous = appState.viewHistory[appState.viewHistory.length - 1] || "servermanager";
  navigateTo(previous, false);
}

function createServer() {
  saveCurrentServer(false);

  const now = formatDateTime(new Date());
  const credentialRefId = upsertCredential("password", {
    password: "",
    privateKey: "",
    passphrase: "",
    certPath: "",
  });

  const draft = {
    ...structuredClone(defaultServers[0]),
    id: `srv-${Date.now()}`,
    name: "新服务器",
    host: "",
    username: "",
    tags: ["new"],
    authType: "password",
    transportMode: "web",
    projectPath: "~/workspace/remoteconn",
    projectCandidates: "~/workspace/remoteconn",
    autoStartCodex: false,
    credentialRefId,
    lastConnectedAt: now,
  };

  appState.servers.unshift(draft);
  appState.selectedServerId = draft.id;
  persistServers();
  renderServerList();
  hydrateServerForm(draft);
  appendActionLog("服务器", "已创建新服务器草稿");
  showToast("已新建服务器");
}

function deleteServers() {
  const toDelete = new Set(appState.selectedServerIds);

  if (toDelete.size === 0 && appState.selectedServerId) {
    toDelete.add(appState.selectedServerId);
  }

  if (toDelete.size === 0) {
    showToast("没有可删除的服务器");
    return;
  }

  appState.servers = appState.servers.filter((server) => !toDelete.has(server.id));
  appState.selectedServerIds.clear();

  if (appState.servers.length === 0) {
    const fallback = structuredClone(defaultServers[0]);
    fallback.id = `srv-${Date.now()}`;
    appState.servers = [fallback];
  }

  appState.selectedServerId = appState.servers[0].id;
  persistServers();
  renderServerList();
  hydrateServerForm(findCurrentServer());
  appendActionLog("服务器", `已删除 ${toDelete.size} 台服务器`);
  showToast("删除完成");
}

function selectAllServers() {
  appState.selectedServerIds = new Set(appState.servers.map((server) => server.id));
  renderServerList();
  appendActionLog("服务器", "已全选服务器");
  showToast("已全选");
}

async function testConnection() {
  const server = collectServerFormData({ persistCredential: false });
  if (!server.host || !server.username) {
    showToast("请先填写主机地址和用户名");
    return;
  }

  showToast("测试连接中...");
  await sleep(300);

  const fingerprint = computeHostFingerprint(server.host, server.port);
  appendActionLog("连接测试", `${server.username}@${server.host}:${server.port} 指纹 ${fingerprint.slice(0, 22)}...`);
  showToast("连接测试通过");
}

function renderServerList() {
  if (!dom.serverList) return;

  const visibleServers = getSortedServers().filter((server) => {
    if (!appState.search) return true;
    const scope = `${server.name} ${server.host} ${server.tags.join(" ")}`.toLowerCase();
    return scope.includes(appState.search);
  });

  if (visibleServers.length === 0) {
    dom.serverList.innerHTML = `<p class="server-item-meta">没有匹配的服务器</p>`;
    return;
  }

  dom.serverList.innerHTML = visibleServers
    .map((server) => {
      const checked = appState.selectedServerIds.has(server.id) ? "checked" : "";
      return `
        <article class="server-item ${server.id === appState.selectedServerId ? "is-active" : ""}" data-action="server-activate" data-id="${escapeAttr(
        server.id
      )}">
          <div class="server-item-top">
            <strong>${escapeHtml(server.name)}</strong>
            <span>${escapeHtml(server.authType)}</span>
          </div>
          <div class="server-item-meta">${escapeHtml(server.username)}@${escapeHtml(server.host)}:${server.port}</div>
          <div class="server-item-meta">${escapeHtml(server.tags.join(", ") || "- ")} · ${escapeHtml(server.transportMode)}</div>
          <div class="server-item-meta">最近连接：${escapeHtml(server.lastConnectedAt || "未连接")}</div>
          <label class="server-item-check">
            <input type="checkbox" data-action="server-toggle-select" data-id="${escapeAttr(server.id)}" ${checked} />
            选择
          </label>
        </article>
      `;
    })
    .join("");
}

function getSortedServers() {
  const copy = [...appState.servers];
  if (appState.sortBy === "name") {
    copy.sort((a, b) => String(a.name).localeCompare(String(b.name), "zh-CN"));
    return copy;
  }

  if (appState.sortBy === "host") {
    copy.sort((a, b) => String(a.host).localeCompare(String(b.host), "zh-CN"));
    return copy;
  }

  copy.sort((a, b) => {
    const ta = new Date(a.lastConnectedAt || 0).getTime() || 0;
    const tb = new Date(b.lastConnectedAt || 0).getTime() || 0;
    return tb - ta;
  });
  return copy;
}

function saveCurrentServer(showSavedToast = true) {
  const server = collectServerFormData({ persistCredential: true });
  const idx = appState.servers.findIndex((item) => item.id === server.id);

  if (idx === -1) {
    appState.servers.unshift(server);
    appState.selectedServerId = server.id;
  } else {
    appState.servers[idx] = server;
  }

  persistServers();
  renderServerList();
  updateServerLabels();
  appendActionLog("服务器", `已保存 ${server.name}`);

  if (showSavedToast) {
    showToast("服务器配置已保存");
  }
}

function collectServerFormData({ persistCredential = true } = {}) {
  const current = findCurrentServer() || defaultServers[0];
  const form = dom.serverForm;
  const authType = form.elements.namedItem("authType")?.value || current.authType;

  const credentialPayload = {
    password: form.elements.namedItem("password")?.value ?? "",
    privateKey: form.elements.namedItem("privateKey")?.value ?? "",
    passphrase: form.elements.namedItem("passphrase")?.value ?? "",
    certPath: form.elements.namedItem("certPath")?.value ?? "",
  };

  const credentialRefId = persistCredential
    ? upsertCredential(authType, credentialPayload, current.credentialRefId)
    : current.credentialRefId || "";

  const normalizedTags = String(form.elements.namedItem("tags")?.value || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

  return {
    id: appState.selectedServerId || current.id || `srv-${Date.now()}`,
    name: form.elements.namedItem("name").value.trim() || "未命名服务器",
    username: form.elements.namedItem("username").value.trim() || "root",
    host: form.elements.namedItem("host").value.trim() || "127.0.0.1",
    port: Number(form.elements.namedItem("port").value || 22),
    tags: normalizedTags,
    authType,
    timeout: Number(form.elements.namedItem("timeout").value || 20),
    heartbeat: Number(form.elements.namedItem("heartbeat").value || 15),
    transportMode: form.elements.namedItem("transportMode").value || "web",
    projectPath: form.elements.namedItem("projectPath").value.trim() || "~/workspace/remoteconn",
    projectCandidates: form.elements.namedItem("projectCandidates").value.trim(),
    autoStartCodex: Boolean(form.elements.namedItem("autoStartCodex")?.checked),
    credentialRefId,
    lastConnectedAt: current.lastConnectedAt || "未连接",
  };
}

function hydrateServerForm(server) {
  if (!server) return;

  const form = dom.serverForm;
  form.elements.namedItem("name").value = server.name || "";
  form.elements.namedItem("username").value = server.username || "";
  form.elements.namedItem("host").value = server.host || "";
  form.elements.namedItem("port").value = String(server.port || 22);
  form.elements.namedItem("tags").value = Array.isArray(server.tags) ? server.tags.join(",") : "";
  form.elements.namedItem("authType").value = server.authType || "password";
  form.elements.namedItem("timeout").value = String(server.timeout || 20);
  form.elements.namedItem("heartbeat").value = String(server.heartbeat || 15);
  form.elements.namedItem("transportMode").value = server.transportMode || "web";
  form.elements.namedItem("projectPath").value = server.projectPath || "~/workspace/remoteconn";
  form.elements.namedItem("projectCandidates").value = server.projectCandidates || "";
  form.elements.namedItem("autoStartCodex").checked = Boolean(server.autoStartCodex);

  const credential = getCredentialByRef(server.credentialRefId);
  renderAuthFields(server.authType, {
    password: credential.password || "",
    privateKey: credential.privateKey || "",
    passphrase: credential.passphrase || "",
    certPath: credential.certPath || "",
  });

  updateServerLabels();
}

/**
 * 认证字段随认证类型动态切换，避免用户看到不相关字段导致误填。
 */
function renderAuthFields(authType, sourceCredential) {
  const credential = sourceCredential || { password: "", privateKey: "", passphrase: "", certPath: "" };

  const templates = {
    password: `
      <label class="field">
        <span>登录密码</span>
        <input name="password" type="password" value="${escapeAttr(credential.password || "")}" placeholder="输入 SSH 密码" />
      </label>
    `,
    privateKey: `
      <label class="field">
        <span>私钥路径</span>
        <input name="privateKey" type="text" value="${escapeAttr(credential.privateKey || "")}" placeholder="~/.ssh/id_ed25519" />
      </label>
      <label class="field">
        <span>私钥口令</span>
        <input name="passphrase" type="password" value="${escapeAttr(credential.passphrase || "")}" />
      </label>
    `,
    certificate: `
      <label class="field">
        <span>私钥路径</span>
        <input name="privateKey" type="text" value="${escapeAttr(credential.privateKey || "")}" placeholder="~/.ssh/id_ed25519" />
      </label>
      <label class="field">
        <span>证书路径</span>
        <input name="certPath" type="text" value="${escapeAttr(credential.certPath || "")}" placeholder="~/.ssh/id_ed25519-cert.pub" />
      </label>
    `,
  };

  dom.authFields.innerHTML = templates[authType] || templates.password;
}

function upsertCredential(type, payload, existingId = "") {
  const now = formatDateTime(new Date());
  const credentialId = existingId || `cred-${Date.now()}`;

  const next = {
    id: credentialId,
    type,
    password: payload.password || "",
    privateKey: payload.privateKey || "",
    passphrase: payload.passphrase || "",
    certPath: payload.certPath || "",
    createdAt: appState.credentials[credentialId]?.createdAt || now,
    updatedAt: now,
  };

  appState.credentials[credentialId] = next;
  persistCredentials();
  return credentialId;
}

function getCredentialByRef(credentialRefId) {
  if (!credentialRefId) return {};
  return appState.credentials[credentialRefId] || {};
}

function persistCredentials() {
  if (appState.globalConfig.credentialMemoryPolicy === "remember") {
    saveJson(STORAGE_KEYS.credentials, appState.credentials);
  }
}

function persistServers() {
  saveJson(STORAGE_KEYS.servers, appState.servers);
}

function saveGlobalConfig() {
  appState.globalConfig = collectGlobalFormData();
  saveJson(STORAGE_KEYS.global, appState.globalConfig);
  applyTheme(appState.globalConfig, true);
  enforceLogRetention();
  appendActionLog("全局", "全局配置已保存");
  showToast("全局配置已保存");

  if (appState.globalConfig.credentialMemoryPolicy === "session") {
    localStorage.removeItem(STORAGE_KEYS.credentials);
  } else {
    persistCredentials();
  }
}

function collectGlobalFormData() {
  const form = dom.globalForm;
  return {
    fontFamily: form.elements.namedItem("fontFamily").value,
    fontSize: Number(form.elements.namedItem("fontSize").value || 15),
    lineHeight: Number(form.elements.namedItem("lineHeight").value || 1.4),
    cursorStyle: form.elements.namedItem("cursorStyle").value,
    unicode11: Boolean(form.elements.namedItem("unicode11").checked),
    autoReconnect: Boolean(form.elements.namedItem("autoReconnect").checked),
    reconnectLimit: Number(form.elements.namedItem("reconnectLimit").value || 3),
    themePreset: form.elements.namedItem("themePreset").value,
    accentColor: form.elements.namedItem("accentColor").value,
    bgColor: form.elements.namedItem("bgColor").value,
    textColor: form.elements.namedItem("textColor").value,
    liquidAlpha: Number(form.elements.namedItem("liquidAlpha").value || 0.64),
    blurRadius: Number(form.elements.namedItem("blurRadius").value || 22),
    motionDuration: Number(form.elements.namedItem("motionDuration").value || 14),
    hostKeyPolicy: form.elements.namedItem("hostKeyPolicy").value,
    logRetentionDays: Number(form.elements.namedItem("logRetentionDays").value || 30),
    maskSecrets: Boolean(form.elements.namedItem("maskSecrets").checked),
    credentialMemoryPolicy: form.elements.namedItem("credentialMemoryPolicy").value,
  };
}

function hydrateGlobalForm(config) {
  const form = dom.globalForm;
  form.elements.namedItem("fontFamily").value = config.fontFamily;
  form.elements.namedItem("fontSize").value = String(config.fontSize);
  form.elements.namedItem("lineHeight").value = String(config.lineHeight);
  form.elements.namedItem("cursorStyle").value = config.cursorStyle;
  form.elements.namedItem("unicode11").checked = Boolean(config.unicode11);
  form.elements.namedItem("autoReconnect").checked = Boolean(config.autoReconnect);
  form.elements.namedItem("reconnectLimit").value = String(config.reconnectLimit || 3);
  form.elements.namedItem("themePreset").value = config.themePreset;
  form.elements.namedItem("accentColor").value = config.accentColor;
  form.elements.namedItem("bgColor").value = config.bgColor;
  form.elements.namedItem("textColor").value = config.textColor;
  form.elements.namedItem("liquidAlpha").value = String(config.liquidAlpha);
  form.elements.namedItem("blurRadius").value = String(config.blurRadius || 22);
  form.elements.namedItem("motionDuration").value = String(config.motionDuration || 14);
  form.elements.namedItem("hostKeyPolicy").value = config.hostKeyPolicy;
  form.elements.namedItem("logRetentionDays").value = String(config.logRetentionDays);
  form.elements.namedItem("maskSecrets").checked = Boolean(config.maskSecrets);
  form.elements.namedItem("credentialMemoryPolicy").value = config.credentialMemoryPolicy || "remember";
}

function restoreGlobalDefaults() {
  appState.globalConfig = structuredClone(defaultGlobalConfig);
  hydrateGlobalForm(appState.globalConfig);
  applyTheme(appState.globalConfig, true);
  saveJson(STORAGE_KEYS.global, appState.globalConfig);
  appendActionLog("全局", "已恢复默认配置");
  showToast("已恢复默认设置");
}

function applyThemePreset(presetKey) {
  const preset = themePresets[presetKey];
  if (!preset) return;

  const form = dom.globalForm;
  form.elements.namedItem("accentColor").value = preset.accentColor;
  form.elements.namedItem("bgColor").value = preset.bgColor;
  form.elements.namedItem("textColor").value = preset.textColor;
  form.elements.namedItem("liquidAlpha").value = String(preset.liquidAlpha);
  form.elements.namedItem("blurRadius").value = String(preset.blurRadius);
  form.elements.namedItem("motionDuration").value = String(preset.motionDuration);

  const preview = collectGlobalFormData();
  applyTheme(preview, false);
  appendActionLog("主题", `已切换到 ${preset.label}`);
  showToast(`主题：${preset.label}`);
}

/**
 * 主题应用引擎：负责把全局配置映射为 CSS 变量，并给出 WCAG 对比度提示。
 */
function applyTheme(config, updateHint = false) {
  const root = document.documentElement;
  const accent = normalizeHex(config.accentColor, "#5bd2ff");
  const bg = normalizeHex(config.bgColor, "#192b4d");
  const text = normalizeHex(config.textColor, "#e6f0ff");
  const alpha = clamp(Number(config.liquidAlpha || 0.64), 0.35, 0.95);

  const border = hexToRgba(accent, 0.24);
  const surface = hexToRgba(blendHex(bg, "#0a1222", 0.52), alpha);
  const bottom = hexToRgba(blendHex(bg, "#0a1222", 0.26), 0.96);

  root.style.setProperty("--bg", bg);
  root.style.setProperty("--accent", accent);
  root.style.setProperty("--text", text);
  root.style.setProperty("--surface", surface);
  root.style.setProperty("--surface-border", border);
  root.style.setProperty("--bottom-bar", bottom);
  root.style.setProperty("--blur-radius", `${clamp(Number(config.blurRadius || 22), 0, 40)}px`);
  root.style.setProperty("--motion-duration", `${clamp(Number(config.motionDuration || 14), 6, 30)}s`);

  const contrast = calcContrastRatio(text, bg);
  if (updateHint && dom.contrastHint) {
    const status = contrast >= 4.5 ? "对比度良好" : contrast >= 3 ? "对比度一般" : "对比度偏低";
    dom.contrastHint.textContent = `${status}（WCAG 对比度 ${contrast.toFixed(2)}）`;
  }

  dom.terminalOutput.style.fontFamily = `${config.fontFamily}, monospace`;
  dom.terminalOutput.style.fontSize = `${clamp(Number(config.fontSize || 15), 12, 22)}px`;
  dom.terminalOutput.style.lineHeight = String(clamp(Number(config.lineHeight || 1.4), 1, 2));
}

function autoOptimizeThemeBackground() {
  const formData = collectGlobalFormData();
  const candidate = pickBestBackground(formData.textColor, formData.accentColor);
  dom.globalForm.elements.namedItem("bgColor").value = candidate;
  applyTheme(collectGlobalFormData(), true);
  appendActionLog("主题", `已自动优化背景为 ${candidate}`);
  showToast("已按对比度自动优化背景");
}

function resetThemePreset() {
  const preset = themePresets[appState.globalConfig.themePreset] || themePresets.tide;
  dom.globalForm.elements.namedItem("accentColor").value = preset.accentColor;
  dom.globalForm.elements.namedItem("bgColor").value = preset.bgColor;
  dom.globalForm.elements.namedItem("textColor").value = preset.textColor;
  dom.globalForm.elements.namedItem("liquidAlpha").value = String(preset.liquidAlpha);
  dom.globalForm.elements.namedItem("blurRadius").value = String(preset.blurRadius);
  dom.globalForm.elements.namedItem("motionDuration").value = String(preset.motionDuration);
  applyTheme(collectGlobalFormData(), true);
  showToast("主题预设已恢复");
}

function clearKnownHosts() {
  appState.knownHosts = {};
  saveJson(STORAGE_KEYS.knownHosts, appState.knownHosts);
  appendActionLog("安全", "已清空 known_hosts");
  showToast("已清除主机指纹");
}

function clearCredentials() {
  appState.credentials = {};
  localStorage.removeItem(STORAGE_KEYS.credentials);
  appendActionLog("安全", "已清除本地凭据");
  showToast("已清除本地凭据");
}

function openConsole() {
  saveCurrentServer(false);
  navigateTo("console");
  connectSelectedServer().catch((error) => {
    handleSessionError(error);
  });
}

async function connectSelectedServer({ isReconnect = false } = {}) {
  const server = findCurrentServer();
  if (!server) {
    throw new Error("当前没有可连接服务器");
  }

  if (appState.currentTransport) {
    disconnectCurrentSession("切换会话", true);
  }

  appState.reconnectReason = "";
  transitionSessionState(isReconnect ? "reconnecting" : "connecting", "开始建立连接");
  const sessionLog = createSessionLog(server);
  appState.currentSessionLogId = sessionLog.id;

  const fingerprint = computeHostFingerprint(server.host, server.port);
  const trusted = await verifyHostKey(server, fingerprint);
  if (!trusted) {
    throw new Error("用户取消主机指纹确认");
  }

  transitionSessionState("auth_pending", "认证中");
  await sleep(150);

  const credential = getCredentialByRef(server.credentialRefId);
  if (!credential || !credential.id) {
    throw new Error("未找到凭据，请先保存认证信息");
  }

  if (server.authType === "password" && !credential.password) {
    throw new Error("密码认证缺少密码");
  }

  if ((server.authType === "privateKey" || server.authType === "certificate") && !credential.privateKey) {
    throw new Error("私钥认证缺少私钥路径");
  }

  const transport = new MockTransport(server.transportMode || "web");
  const offFns = [];

  offFns.push(
    transport.on("stdout", ({ text }) => {
      appendTerminal("SSH", text);
      pluginManager.emitSessionEvent("stdout", { text, serverName: server.name });
    })
  );

  offFns.push(
    transport.on("stderr", ({ text }) => {
      appendTerminal("ERR", text);
      pluginManager.emitSessionEvent("stderr", { text, serverName: server.name });
    })
  );

  offFns.push(
    transport.on("latency", ({ latency }) => {
      dom.latencyValue.textContent = `${latency} ms`;
      updateSessionLatency(latency);
      pluginManager.emitSessionEvent("latency", { latency, serverName: server.name });
    })
  );

  offFns.push(
    transport.on("disconnect", ({ reason }) => {
      appState.currentTransport = null;
      appState.sessionMeta = null;
      dom.latencyValue.textContent = "-- ms";
      finalizeSessionLog(reason === "manual" ? "disconnected" : "error", reason);

      if (reason === "manual") {
        transitionSessionState("disconnected", "会话已断开");
        appendTerminal("系统", "连接已断开");
        pluginManager.emitSessionEvent("disconnected", { reason, serverName: server.name });
        return;
      }

      appendTerminal("系统", `连接中断: ${reason}`);
      pluginManager.emitSessionEvent("disconnected", { reason, serverName: server.name });

      if (appState.globalConfig.autoReconnect && appState.reconnectAttempts < appState.globalConfig.reconnectLimit) {
        scheduleReconnect(reason);
      } else {
        transitionSessionState("error", "连接中断");
      }
    })
  );

  const result = await transport.connect({ server, credential });
  appState.currentTransport = transport;
  appState.sessionMeta = {
    serverId: server.id,
    serverName: server.name,
    offFns,
  };

  transitionSessionState("connected", "连接成功");
  appendActionLog("连接", `连接到 ${server.name}`);
  appendTerminal("系统", result.welcome.join("\n"));
  pluginManager.emitSessionEvent("connected", { serverName: server.name, serverId: server.id });
  updateSessionLogStatus("connected");
  server.lastConnectedAt = formatDateTime(new Date());
  persistServers();
  renderServerList();

  appState.reconnectAttempts = 0;
  pluginManager.renderCommandBar();

  if (server.autoStartCodex) {
    await runCodex("workspace-write");
  }
}

function scheduleReconnect(reason) {
  appState.reconnectAttempts += 1;
  const delayMs = Math.min(4000, 800 * appState.reconnectAttempts);
  appState.reconnectReason = reason;
  transitionSessionState("reconnecting", `自动重连(${appState.reconnectAttempts}/${appState.globalConfig.reconnectLimit})`);
  showToast(`连接中断，${Math.round(delayMs / 1000)} 秒后重连`);

  if (appState.reconnectTimer) {
    window.clearTimeout(appState.reconnectTimer);
  }

  appState.reconnectTimer = window.setTimeout(() => {
    connectSelectedServer({ isReconnect: true }).catch((error) => {
      handleSessionError(error);
    });
  }, delayMs);
}

async function reconnectSessionManually() {
  if (!findCurrentServer()) {
    showToast("当前没有服务器");
    return;
  }
  disconnectCurrentSession("manual reconnect", true);
  await connectSelectedServer({ isReconnect: true });
}

function disconnectCurrentSession(reason = "manual", manual = true) {
  if (appState.reconnectTimer) {
    window.clearTimeout(appState.reconnectTimer);
    appState.reconnectTimer = null;
  }

  if (!appState.currentTransport) {
    if (manual) {
      transitionSessionState("disconnected", "未建立连接");
    }
    return;
  }

  appState.currentTransport.disconnect(manual ? "manual" : reason);
}

function transitionSessionState(nextState, reason = "") {
  if (!SESSION_STATES.includes(nextState)) {
    return;
  }

  const current = appState.sessionState;
  const allowed = SESSION_TRANSITIONS[current] || new Set();
  if (current !== nextState && !allowed.has(nextState)) {
    console.warn(`非法状态跳转: ${current} -> ${nextState}`);
  }

  appState.sessionState = nextState;
  renderSessionState(reason);
}

function renderSessionState(reason = "") {
  const state = appState.sessionState;
  dom.sessionStateBadge.className = `state-pill state-${state}`;
  dom.sessionStateBadge.textContent = reason ? `${state} · ${reason}` : state;
}

function handleSessionError(error) {
  const message = error instanceof Error ? error.message : String(error);
  transitionSessionState("error", message);
  appendTerminal("错误", message);
  appendActionLog("连接", `失败: ${message}`);
  finalizeSessionLog("error", message);
  showToast(`连接失败: ${message}`);
}

async function verifyHostKey(server, fingerprint) {
  const key = `${server.host}:${server.port}`;
  const stored = appState.knownHosts[key];
  const policy = appState.globalConfig.hostKeyPolicy;

  if (stored && stored !== fingerprint) {
    throw new Error("主机指纹变更，已拒绝连接");
  }

  if (policy === "trustFirstUse") {
    if (!stored) {
      appState.knownHosts[key] = fingerprint;
      saveJson(STORAGE_KEYS.knownHosts, appState.knownHosts);
      appendActionLog("安全", `首次信任 ${key}`);
    }
    return true;
  }

  if (policy === "strict") {
    if (!stored) {
      const accepted = await requestHostKeyDecision(server, fingerprint, true);
      if (accepted) {
        appState.knownHosts[key] = fingerprint;
        saveJson(STORAGE_KEYS.knownHosts, appState.knownHosts);
      }
      return accepted;
    }
    return true;
  }

  const accepted = await requestHostKeyDecision(server, fingerprint, false);
  if (accepted && dom.hostKeyRemember.checked) {
    appState.knownHosts[key] = fingerprint;
    saveJson(STORAGE_KEYS.knownHosts, appState.knownHosts);
  }
  return accepted;
}

function requestHostKeyDecision(server, fingerprint, strictHint) {
  dom.hostKeySummary.textContent = `${server.username}@${server.host}:${server.port} · ${strictHint ? "严格模式：首次连接需确认" : "手动确认模式"}`;
  dom.hostKeyFingerprint.textContent = `SHA256:${fingerprint}`;
  dom.hostKeyRemember.checked = true;
  dom.hostKeyDialog.showModal();

  return new Promise((resolve) => {
    appState.pendingHostKeyDecision = {
      resolve,
    };
  });
}

function settleHostKeyDecision(accepted) {
  const pending = appState.pendingHostKeyDecision;
  appState.pendingHostKeyDecision = null;
  dom.hostKeyDialog.close();
  if (pending?.resolve) {
    pending.resolve(Boolean(accepted));
  }
}

function openCodexDialog() {
  if (appState.sessionState !== "connected") {
    showToast("请先建立连接再启动 Codex");
    return;
  }
  dom.codexDialog.showModal();
}

/**
 * Codex 模式编排：
 * 1) cd 到项目目录；2) 检测 codex；3) 启动 codex。
 */
async function runCodex(sandbox) {
  if (!sandbox) return;
  dom.codexDialog.close();

  if (appState.sessionState !== "connected") {
    showToast("连接未建立，无法启动 Codex");
    return;
  }

  const server = findCurrentServer();
  if (!server) {
    showToast("未选择服务器");
    return;
  }

  const targetPath = server.projectPath || "~";
  appendActionLog("Codex", `启动流程(${sandbox})`);

  const cdResult = await runRemoteCommand(`cd ${shellQuote(targetPath)}`, {
    source: "codex",
    markerType: "cd",
  });

  if (cdResult.code !== 0) {
    appendTerminal("Codex", "目录切换失败：请检查项目路径是否存在且有权限");
    showToast("Codex 启动失败：目录不可用");
    return;
  }

  const checkResult = await runRemoteCommand("command -v codex", {
    source: "codex",
    markerType: "check",
  });

  if (checkResult.code !== 0 || !checkResult.stdout.trim()) {
    appendTerminal("Codex", "检测到远端未安装 codex，请先安装后再试");
    appendTerminal("Codex", "安装指引：参考内部文档《Codex CLI 部署指南》");
    showToast("Codex 未安装");
    return;
  }

  const runResult = await runRemoteCommand(`codex --sandbox ${sandbox}`, {
    source: "codex",
    markerType: "run",
  });

  if (runResult.code === 0) {
    appendActionLog("Codex", `已进入 Codex 模式 (${sandbox})`);
    showToast(`Codex 已启动: ${sandbox}`);
  } else {
    appendActionLog("Codex", `启动失败(${sandbox})`);
    showToast("Codex 启动失败");
  }
}

function clearConsole() {
  appState.terminalLines = [];
  renderTerminal();
  appendActionLog("终端", "已清屏");
  showToast("终端已清屏");
}

function executeTerminalInput() {
  const command = String(dom.terminalInput.value || "").trim();
  if (!command) return;
  dom.terminalInput.value = "";

  runRemoteCommand(command, {
    source: "manual",
    markerType: "manual",
  }).catch((error) => {
    appendTerminal("错误", error.message);
  });
}

async function runRemoteCommand(command, { source = "manual", markerType = "manual" } = {}) {
  if (!appState.currentTransport || appState.sessionState !== "connected") {
    throw new Error("当前未连接，无法执行命令");
  }

  const startedAt = Date.now();
  const result = await appState.currentTransport.exec(command);
  const elapsed = Date.now() - startedAt;

  pushSessionCommandMarker({
    command,
    source,
    markerType,
    code: result.code,
    elapsed,
  });

  if (result.code !== 0 && result.stderr) {
    appendTerminal("错误", `${command} -> ${result.stderr}`);
  }

  return result;
}

function appendTerminal(scope, message) {
  const text = String(message || "");
  const lines = text.split(/\n/);
  lines.forEach((line) => {
    appState.terminalLines.push(`[${formatDateTime(new Date(), true)}] [${scope}] ${line}`);
  });

  while (appState.terminalLines.length > 600) {
    appState.terminalLines.shift();
  }

  renderTerminal();
}

function renderTerminal() {
  dom.terminalOutput.textContent = appState.terminalLines.join("\n");
  dom.terminalOutput.scrollTop = dom.terminalOutput.scrollHeight;
}

function openGlobalDialog() {
  const snapshot = collectGlobalFormData();
  dom.globalSnapshot.textContent = JSON.stringify(snapshot, null, 2);
  dom.globalDialog.showModal();
}

function openLogWindow() {
  navigateTo("log");
}

function appendActionLog(scope, message) {
  const line = `[${formatDateTime(new Date(), true)}] [${scope}] ${message}`;
  appState.actionLogs.unshift(line);
  while (appState.actionLogs.length > 300) {
    appState.actionLogs.pop();
  }
  saveJson(STORAGE_KEYS.actionLogs, appState.actionLogs);
}

function createSessionLog(server) {
  const now = formatDateTime(new Date());
  const log = {
    id: `sess-${Date.now()}`,
    sessionId: `session-${Date.now()}`,
    serverId: server.id,
    serverName: server.name,
    host: `${server.username}@${server.host}:${server.port}`,
    transportMode: server.transportMode,
    startAt: now,
    endAt: "",
    status: "connecting",
    error: "",
    commandMarkers: [],
    latency: [],
  };

  appState.sessionLogs.unshift(log);
  while (appState.sessionLogs.length > 200) {
    appState.sessionLogs.pop();
  }
  saveJson(STORAGE_KEYS.sessionLogs, appState.sessionLogs);
  appState.selectedSessionLogId = log.id;
  return log;
}

function updateSessionLogStatus(status, error = "") {
  if (!appState.currentSessionLogId) return;
  const log = appState.sessionLogs.find((item) => item.id === appState.currentSessionLogId);
  if (!log) return;

  log.status = status;
  if (error) {
    log.error = error;
  }
  saveJson(STORAGE_KEYS.sessionLogs, appState.sessionLogs);
}

function finalizeSessionLog(status, error = "") {
  if (!appState.currentSessionLogId) return;
  const log = appState.sessionLogs.find((item) => item.id === appState.currentSessionLogId);
  if (!log) return;

  log.status = status;
  log.error = error || "";
  if (!log.endAt) {
    log.endAt = formatDateTime(new Date());
  }
  saveJson(STORAGE_KEYS.sessionLogs, appState.sessionLogs);
  appState.currentSessionLogId = null;

  if (appState.currentView === "log") {
    renderSessionLogs();
  }
}

function updateSessionLatency(latency) {
  if (!appState.currentSessionLogId) return;
  const log = appState.sessionLogs.find((item) => item.id === appState.currentSessionLogId);
  if (!log) return;

  log.latency.push({ at: formatDateTime(new Date(), true), value: latency });
  if (log.latency.length > 40) {
    log.latency.shift();
  }
  saveJson(STORAGE_KEYS.sessionLogs, appState.sessionLogs);
}

function pushSessionCommandMarker(marker) {
  if (!appState.currentSessionLogId) return;
  const log = appState.sessionLogs.find((item) => item.id === appState.currentSessionLogId);
  if (!log) return;

  log.commandMarkers.push({
    at: formatDateTime(new Date(), true),
    ...marker,
  });

  if (log.commandMarkers.length > 120) {
    log.commandMarkers.shift();
  }
  saveJson(STORAGE_KEYS.sessionLogs, appState.sessionLogs);

  if (appState.currentView === "log") {
    renderSessionLogs();
  }
}

function enforceLogRetention() {
  const now = Date.now();
  const maxDays = clamp(Number(appState.globalConfig.logRetentionDays || 30), 1, 365);
  appState.sessionLogs = appState.sessionLogs.filter((log) => {
    const timestamp = new Date(log.startAt).getTime();
    if (!timestamp) return true;
    const diffDays = (now - timestamp) / (24 * 60 * 60 * 1000);
    return diffDays <= maxDays;
  });
  saveJson(STORAGE_KEYS.sessionLogs, appState.sessionLogs);
}

function renderLogFilters() {
  const current = dom.logServerFilter.value;
  const options = [
    `<option value="all">全部服务器</option>`,
    ...appState.servers.map(
      (server) => `<option value="${escapeAttr(server.id)}">${escapeHtml(server.name)}</option>`
    ),
  ];

  dom.logServerFilter.innerHTML = options.join("");
  if (current) {
    dom.logServerFilter.value = current;
  }
}

function getFilteredSessionLogs() {
  const serverId = dom.logServerFilter.value || "all";
  const status = dom.logStatusFilter.value || "all";
  const dateFrom = dom.logDateFrom.value ? new Date(dom.logDateFrom.value).getTime() : 0;
  const dateTo = dom.logDateTo.value ? new Date(dom.logDateTo.value).getTime() + 24 * 60 * 60 * 1000 : Infinity;

  return appState.sessionLogs.filter((log) => {
    if (serverId !== "all" && log.serverId !== serverId) return false;
    if (status !== "all" && log.status !== status) return false;

    const time = new Date(log.startAt).getTime();
    if (dateFrom && time < dateFrom) return false;
    if (isFinite(dateTo) && time > dateTo) return false;

    return true;
  });
}

function renderSessionLogs() {
  const filtered = getFilteredSessionLogs();

  if (filtered.length === 0) {
    dom.sessionLogList.innerHTML = `<p class="hint-text">当前筛选条件下无日志</p>`;
    dom.sessionLogDetail.textContent = "";
    return;
  }

  if (!filtered.some((item) => item.id === appState.selectedSessionLogId)) {
    appState.selectedSessionLogId = filtered[0].id;
  }

  dom.sessionLogList.innerHTML = filtered
    .slice(0, 50)
    .map((log) => {
      const active = log.id === appState.selectedSessionLogId ? "is-active" : "";
      const duration = log.endAt
        ? formatDuration(new Date(log.endAt).getTime() - new Date(log.startAt).getTime())
        : "进行中";

      return `
        <article class="session-log-item ${active}" data-action="session-log-select" data-id="${escapeAttr(log.id)}">
          <div class="session-log-title">
            <span>${escapeHtml(log.serverName)}</span>
            <span class="state-pill state-${escapeAttr(log.status)}">${escapeHtml(log.status)}</span>
          </div>
          <div class="session-log-meta">${escapeHtml(log.startAt)} -> ${escapeHtml(log.endAt || "--")}</div>
          <div class="session-log-meta">耗时：${escapeHtml(duration)} · 命令：${log.commandMarkers.length}</div>
          <div class="session-log-meta">错误：${escapeHtml(log.error || "- ")}</div>
        </article>
      `;
    })
    .join("");

  // 列表项点击委托：沿用 data-action 机制
  const detailLog = appState.sessionLogs.find((item) => item.id === appState.selectedSessionLogId) || filtered[0];
  if (detailLog) {
    renderSessionLogDetail(detailLog);
  }
}

document.addEventListener("click", (event) => {
  const selectTrigger = event.target.closest("[data-action='session-log-select']");
  if (!selectTrigger) return;
  const logId = selectTrigger.dataset.id;
  if (!logId) return;
  appState.selectedSessionLogId = logId;
  renderSessionLogs();
});

function renderSessionLogDetail(log) {
  const lines = [];
  lines.push(`会话ID: ${log.sessionId}`);
  lines.push(`服务器: ${log.serverName} (${log.host})`);
  lines.push(`模式: ${log.transportMode}`);
  lines.push(`开始: ${log.startAt}`);
  lines.push(`结束: ${log.endAt || "进行中"}`);
  lines.push(`状态: ${log.status}`);
  lines.push(`错误: ${log.error || "-"}`);
  lines.push("");
  lines.push("关键命令:");

  if (!log.commandMarkers.length) {
    lines.push("  - 无");
  } else {
    log.commandMarkers.forEach((marker) => {
      lines.push(
        `  - [${marker.at}] (${marker.markerType}) ${maskSensitive(marker.command)} -> code=${marker.code}, ${marker.elapsed}ms`
      );
    });
  }

  if (log.latency?.length) {
    lines.push("");
    lines.push("延迟采样:");
    log.latency.slice(-10).forEach((item) => {
      lines.push(`  - [${item.at}] ${item.value}ms`);
    });
  }

  dom.sessionLogDetail.textContent = lines.join("\n");
}

function exportSessionLogs() {
  const logs = getFilteredSessionLogs();
  if (logs.length === 0) {
    showToast("没有可导出的日志");
    return;
  }

  const masked = appState.globalConfig.maskSecrets;
  const chunks = [];
  chunks.push(`# RemoteConn Session Export (${formatDateTime(new Date())})`);
  chunks.push("");

  logs.forEach((log, index) => {
    chunks.push(`## ${index + 1}. ${log.serverName} [${log.status}]`);
    chunks.push(`- host: ${masked ? maskHost(log.host) : log.host}`);
    chunks.push(`- transport: ${log.transportMode}`);
    chunks.push(`- start: ${log.startAt}`);
    chunks.push(`- end: ${log.endAt || "--"}`);
    chunks.push(`- error: ${masked ? maskSensitive(log.error || "") : log.error || ""}`);
    chunks.push(`- commands:`);

    log.commandMarkers.forEach((marker) => {
      const cmd = masked ? maskSensitive(marker.command) : marker.command;
      chunks.push(`  - [${marker.at}] ${cmd} => code:${marker.code}`);
    });

    chunks.push("");
  });

  const file = new Blob([chunks.join("\n")], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = `remoteconn-session-${formatDateStamp(new Date())}.txt`;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  appendActionLog("日志", `导出 ${logs.length} 条会话日志`);
  showToast("日志已导出");
}

async function installSamplePlugins() {
  samplePluginPackages.forEach((pkg) => {
    try {
      pluginManager.installPackage(pkg);
    } catch (error) {
      pluginManager.logRuntime("error", pkg.manifest.id, `安装示例失败: ${error.message}`);
    }
  });

  pluginManager.refresh();
  showToast("示例插件已写入");
}

function importPluginFromInput() {
  const raw = String(dom.pluginPackageInput.value || "").trim();
  if (!raw) {
    showToast("请先输入插件包 JSON");
    return;
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (error) {
    throw new Error("JSON 解析失败");
  }

  const packages = Array.isArray(payload) ? payload : [payload];
  packages.forEach((item) => {
    pluginManager.installPackage(item);
  });

  dom.pluginPackageInput.value = "";
  pluginManager.refresh();
  showToast(`已导入 ${packages.length} 个插件包`);
}

function exportPluginPackages() {
  const packages = pluginFsAdapter.exportPackages();
  const file = new Blob([JSON.stringify(packages, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = `remoteconn-plugins-${formatDateStamp(new Date())}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  appendActionLog("插件", `导出插件包 ${packages.length} 个`);
  showToast("插件包已导出");
}

async function togglePlugin(pluginId, enabled) {
  if (!pluginId) return;
  if (enabled) {
    await pluginManager.enable(pluginId);
  } else {
    await pluginManager.disable(pluginId);
  }
  pluginManager.renderPluginList();
  pluginManager.renderCommandBar();
}

async function reloadPlugin(pluginId) {
  if (!pluginId) return;
  await pluginManager.reload(pluginId);
  pluginManager.renderPluginList();
  pluginManager.renderCommandBar();
}

async function removePlugin(pluginId) {
  if (!pluginId) return;
  await pluginManager.remove(pluginId);
  pluginManager.renderPluginList();
  pluginManager.renderCommandBar();
}

async function runPluginCommand(commandId) {
  if (!commandId) return;
  await pluginManager.runCommand(commandId);
}

function switchTab(button) {
  const tabsRoot = button.closest("[data-tabs-root]");
  if (!tabsRoot) return;

  const target = button.dataset.tabTarget;
  const scope = tabsRoot.parentElement;
  if (!target || !scope) return;

  tabsRoot.querySelectorAll(".tab-btn").forEach((tab) => {
    tab.classList.toggle("is-active", tab === button);
  });

  scope.querySelectorAll(".tab-pane").forEach((pane) => {
    pane.classList.toggle("is-active", pane.dataset.pane === target);
  });
}

function updateServerLabels() {
  const server = findCurrentServer();
  if (!server) return;
  if (dom.consoleServerName) {
    dom.consoleServerName.textContent = server.name;
  }
}

function findCurrentServer() {
  return appState.servers.find((server) => server.id === appState.selectedServerId);
}

function showToast(message) {
  if (!dom.toast) return;
  dom.toast.textContent = String(message || "");
  dom.toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    dom.toast.classList.remove("show");
  }, 1700);
}

function computeHostFingerprint(host, port) {
  const source = `${host}:${port}`;
  let hash = 2166136261;
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }

  const hex = Math.abs(hash >>> 0).toString(16).padStart(8, "0");
  return `${hex}${hex.slice(0, 6)}${hex.slice(2, 8)}`;
}

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (error) {
    console.error(`读取 ${key} 失败`, error);
    return fallback;
  }
}

function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function formatDateTime(date, short = false) {
  const target = date instanceof Date ? date : new Date(date);
  const year = target.getFullYear();
  const month = String(target.getMonth() + 1).padStart(2, "0");
  const day = String(target.getDate()).padStart(2, "0");
  const hh = String(target.getHours()).padStart(2, "0");
  const mm = String(target.getMinutes()).padStart(2, "0");
  const ss = String(target.getSeconds()).padStart(2, "0");
  return short ? `${hh}:${mm}:${ss}` : `${year}-${month}-${day} ${hh}:${mm}:${ss}`;
}

function formatDateStamp(date) {
  const target = date instanceof Date ? date : new Date(date);
  const year = target.getFullYear();
  const month = String(target.getMonth() + 1).padStart(2, "0");
  const day = String(target.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return "0s";
  const sec = Math.round(ms / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

function shellQuote(path) {
  return `'${String(path || "").replace(/'/g, "'\\''")}'`;
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function normalizeHex(input, fallback) {
  const value = String(input || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value.toLowerCase();
  return fallback;
}

function hexToRgb(hex) {
  const value = normalizeHex(hex, "#000000");
  return {
    r: Number.parseInt(value.slice(1, 3), 16),
    g: Number.parseInt(value.slice(3, 5), 16),
    b: Number.parseInt(value.slice(5, 7), 16),
  };
}

function rgbToHex({ r, g, b }) {
  const cr = clamp(Math.round(r), 0, 255).toString(16).padStart(2, "0");
  const cg = clamp(Math.round(g), 0, 255).toString(16).padStart(2, "0");
  const cb = clamp(Math.round(b), 0, 255).toString(16).padStart(2, "0");
  return `#${cr}${cg}${cb}`;
}

function hexToRgba(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${clamp(alpha, 0, 1)})`;
}

function blendHex(baseHex, overlayHex, ratio) {
  const base = hexToRgb(baseHex);
  const overlay = hexToRgb(overlayHex);
  const t = clamp(ratio, 0, 1);
  return rgbToHex({
    r: base.r * (1 - t) + overlay.r * t,
    g: base.g * (1 - t) + overlay.g * t,
    b: base.b * (1 - t) + overlay.b * t,
  });
}

function srgbToLinear(value) {
  const normalized = value / 255;
  if (normalized <= 0.03928) {
    return normalized / 12.92;
  }
  return ((normalized + 0.055) / 1.055) ** 2.4;
}

function calcLuminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

function calcContrastRatio(hexA, hexB) {
  const la = calcLuminance(hexA);
  const lb = calcLuminance(hexB);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

function pickBestBackground(textColor, accentColor) {
  const text = normalizeHex(textColor, "#e6f0ff");
  const accent = normalizeHex(accentColor, "#5bd2ff");

  const candidates = [
    "#0a1325",
    "#132747",
    "#102b34",
    "#2e223b",
    blendHex(accent, "#0a1222", 0.75),
    blendHex(accent, "#0a1222", 0.88),
  ];

  let best = candidates[0];
  let bestScore = 0;
  candidates.forEach((candidate) => {
    const score = calcContrastRatio(text, candidate);
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  });

  return best;
}

function maskSensitive(value) {
  if (!value) return "";
  return String(value)
    .replace(/([0-9]{1,3}\.){3}[0-9]{1,3}/g, "***.***.***.***")
    .replace(/(token|password|passphrase|secret)\s*[=:]\s*[^\s]+/gi, "$1=***")
    .replace(/~\/.+?(?=\s|$)/g, "~/***");
}

function maskHost(host) {
  return String(host || "")
    .replace(/([a-zA-Z0-9._%+-]+)@/, "***@")
    .replace(/([0-9]{1,3}\.){3}[0-9]{1,3}/, "***.***.***.***");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("`", "&#96;");
}

function sleep(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function runWithTimeout(promise, timeoutMs, timeoutMessage) {
  let timer = null;
  return new Promise((resolve, reject) => {
    timer = window.setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);

    Promise.resolve(promise)
      .then((value) => {
        window.clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        window.clearTimeout(timer);
        reject(error);
      });
  });
}
