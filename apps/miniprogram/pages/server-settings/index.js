/* global Page, wx, require, getCurrentPages, console, setTimeout, clearTimeout */

const {
  createServerSeed,
  listServers,
  upsertServer,
  markServerConnected,
  appendLog,
  getSettings
} = require("../../utils/storage");
const { getOpsConfig, isOpsConfigReady } = require("../../utils/opsConfig");
const {
  listRemoteDirectories,
  normalizeHomePath,
  validateServerForConnect,
  resolveSocketDomainHint
} = require("../../utils/remoteDirectory");
const { buildThemeStyle, applyNavigationBarTheme } = require("../../utils/themeStyle");
const { buildButtonIconThemeMaps } = require("../../utils/themedIcons");
const {
  buildPageCopy,
  buildServerAuthTypeOptions,
  formatTemplate,
  localizeServerValidationMessage,
  normalizeUiLanguage
} = require("../../utils/i18n");
const { buildSvgButtonPressData, createSvgButtonPressMethods } = require("../../utils/svgButtonFeedback");

const AUTH_TYPE_OPTIONS = [
  { value: "password" },
  { value: "privateKey" },
  { value: "certificate" }
];
const DIRECTORY_USAGE_STORAGE_KEY = "remoteconn.directoryUsage.v1";
const DIRECTORY_USAGE_MAX_ENTRIES = 500;
const ROOT_DIR_PREFETCH_CACHE_TTL_MS = 45000;
const ROOT_DIR_PREFETCH_CACHE_MAX_ENTRIES = 32;
const rootDirPrefetchCache = new Map();

function normalizeAuthType(value) {
  const authType = String(value || "").trim();
  if (authType === "privateKey" || authType === "certificate") return authType;
  return "password";
}

function normalizeJumpHost(input, seedInput) {
  const seed = seedInput && typeof seedInput === "object" ? seedInput : createServerSeed().jumpHost;
  const source = input && typeof input === "object" ? input : {};
  return {
    enabled: source.enabled === true,
    host: String(source.host || "").trim(),
    port:
      source.port === ""
        ? ""
        : normalizePortForForm(source.port == null ? seed.port : source.port, String(seed.port || 22)),
    username: String(source.username || "").trim(),
    authType: normalizeAuthType(source.authType || seed.authType)
  };
}

function parseServerTags(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => !!item);
}

function normalizePortForForm(value, fallback) {
  const raw = String(value == null ? "" : value).trim();
  if (!raw) return "";
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const port = Math.round(parsed);
  if (port < 1) return 1;
  if (port > 65535) return 65535;
  return String(port);
}

function hashStringFNV1a(input) {
  const text = String(input || "");
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(16);
}

function buildCredentialFingerprint(form) {
  const source = form && typeof form === "object" ? form : {};
  const authType = normalizeAuthType(source.authType);
  if (authType === "privateKey") {
    return `pk:${hashStringFNV1a(`${source.privateKey || ""}|${source.passphrase || ""}`)}`;
  }
  if (authType === "certificate") {
    return `cert:${hashStringFNV1a(`${source.privateKey || ""}|${source.passphrase || ""}|${source.certificate || ""}`)}`;
  }
  return `pwd:${hashStringFNV1a(String(source.password || ""))}`;
}

/**
 * 根目录预取缓存按“服务器身份+认证内容”分桶，避免串线。
 */
function buildRootPrefetchKey(formInput) {
  const form = normalizeServerForm(formInput || createServerSeed());
  const username = String(form.username || "").trim() || "-";
  const host = String(form.host || "").trim() || "-";
  const port = Number(form.port) || 22;
  const authType = normalizeAuthType(form.authType);
  const credential = buildCredentialFingerprint(form);
  const jumpHost = form.jumpHost && form.jumpHost.enabled ? form.jumpHost : null;
  const jumpPart = jumpHost
    ? `|jump:${String(jumpHost.username || "-").trim()}@${String(jumpHost.host || "-").trim()}:${Number(jumpHost.port) || 22}|${normalizeAuthType(jumpHost.authType)}|${buildCredentialFingerprint(
        {
          authType: jumpHost.authType,
          password: form.jumpPassword,
          privateKey: form.jumpPrivateKey,
          passphrase: form.jumpPassphrase,
          certificate: form.jumpCertificate
        }
      )}`
    : "";
  return `${username}@${host}:${port}|${authType}|${credential}${jumpPart}`;
}

function pruneRootPrefetchCache() {
  if (rootDirPrefetchCache.size <= ROOT_DIR_PREFETCH_CACHE_MAX_ENTRIES) return;
  const entries = Array.from(rootDirPrefetchCache.entries())
    .map(([key, entry]) => ({ key, updatedAt: Number(entry && entry.updatedAt) || 0 }))
    .sort((a, b) => a.updatedAt - b.updatedAt);
  const removeCount = Math.max(0, entries.length - ROOT_DIR_PREFETCH_CACHE_MAX_ENTRIES);
  for (let i = 0; i < removeCount; i += 1) {
    rootDirPrefetchCache.delete(entries[i].key);
  }
}

function readFreshRootPrefetchNames(formInput) {
  const key = buildRootPrefetchKey(formInput);
  const entry = rootDirPrefetchCache.get(key);
  if (!entry || !Array.isArray(entry.names)) return null;
  const updatedAt = Number(entry.updatedAt) || 0;
  if (!updatedAt || Date.now() - updatedAt > ROOT_DIR_PREFETCH_CACHE_TTL_MS) return null;
  return entry.names.slice();
}

function readRootPrefetchInFlight(formInput) {
  const key = buildRootPrefetchKey(formInput);
  const entry = rootDirPrefetchCache.get(key);
  if (!entry || !entry.inFlight) return null;
  return entry.inFlight;
}

function writeRootPrefetchResult(formInput, names) {
  const key = buildRootPrefetchKey(formInput);
  const normalized = Array.isArray(names)
    ? names.map((name) => String(name || "").trim()).filter((name) => !!name)
    : [];
  const prev = rootDirPrefetchCache.get(key) || {};
  rootDirPrefetchCache.set(key, {
    ...prev,
    names: normalized,
    updatedAt: Date.now(),
    inFlight: null
  });
  pruneRootPrefetchCache();
}

function writeRootPrefetchInFlight(formInput, inFlight) {
  const key = buildRootPrefetchKey(formInput);
  const prev = rootDirPrefetchCache.get(key) || {};
  rootDirPrefetchCache.set(key, {
    ...prev,
    inFlight: inFlight || null
  });
}

function buildDirectoryChildrenFromNames(parentNode, names, form, usageMap) {
  const safeNames = Array.isArray(names) ? names : [];
  const remoteOrderMap = {};
  safeNames.forEach((name, index) => {
    remoteOrderMap[String(name)] = index;
  });
  return safeNames
    .map((name) => String(name || "").trim())
    .filter((name) => !!name)
    .filter((name) => !/__RC_/i.test(name))
    .filter((name) => !/^~\/__RC_/i.test(name))
    .map((name) => buildDirectoryNode(composeChildPath(parentNode.path, name), parentNode.depth + 1))
    .sort((a, b) => {
      const sourceUsage = usageMap && typeof usageMap === "object" ? usageMap : {};
      const aUsage = Number(sourceUsage[buildDirectoryUsageKey(form, a.path)] || 0);
      const bUsage = Number(sourceUsage[buildDirectoryUsageKey(form, b.path)] || 0);
      if (aUsage !== bUsage) return bUsage - aUsage;
      const aOrder = Number(remoteOrderMap[a.name]);
      const bOrder = Number(remoteOrderMap[b.name]);
      const safeAOrder = Number.isFinite(aOrder) ? aOrder : Number.MAX_SAFE_INTEGER;
      const safeBOrder = Number.isFinite(bOrder) ? bOrder : Number.MAX_SAFE_INTEGER;
      if (safeAOrder !== safeBOrder) return safeAOrder - safeBOrder;
      return a.name.localeCompare(b.name, "zh-Hans-CN");
    });
}

/**
 * 目录使用记录按“服务器+目录”维度存储：
 * 1. 同一路径在不同服务器可独立排序；
 * 2. 仅保留最近一批记录，避免存储无限增长。
 */
function readDirectoryUsageMap() {
  try {
    const raw = wx.getStorageSync(DIRECTORY_USAGE_STORAGE_KEY);
    if (!raw || typeof raw !== "object") return {};
    return raw;
  } catch {
    return {};
  }
}

function writeDirectoryUsageMap(input) {
  const source = input && typeof input === "object" ? input : {};
  const pairs = Object.keys(source)
    .map((key) => {
      const value = Number(source[key]);
      if (!Number.isFinite(value) || value <= 0) return null;
      return { key, value };
    })
    .filter((item) => !!item)
    .sort((a, b) => b.value - a.value)
    .slice(0, DIRECTORY_USAGE_MAX_ENTRIES);

  const next = {};
  pairs.forEach((item) => {
    next[item.key] = item.value;
  });

  try {
    wx.setStorageSync(DIRECTORY_USAGE_STORAGE_KEY, next);
  } catch {
    // ignore
  }
  return next;
}

function buildDirectoryUsageKey(form, path) {
  const source = form && typeof form === "object" ? form : {};
  const username = String(source.username || "").trim() || "-";
  const host = String(source.host || "").trim() || "-";
  const port = Number(source.port) || 22;
  const normalizedPath = normalizeHomePath(path);
  return `${username}@${host}:${port}|${normalizedPath}`;
}

function sanitizeProjectPath(value) {
  const raw = String(value || "").trim();
  if (!raw) return raw;
  // 兜底清理历史异常值：内部标记路径不应进入用户可见配置。
  if (/(?:^|\/)__RC_/i.test(raw)) return "~";
  return raw;
}

function normalizeServerForm(input) {
  const seed = createServerSeed();
  const source = input && typeof input === "object" ? input : {};
  return {
    ...seed,
    ...source,
    name: String(source.name || "").trim(),
    tags: Array.isArray(source.tags)
      ? source.tags.map((item) => String(item || "").trim()).filter((item) => !!item)
      : [],
    host: String(source.host || "").trim(),
    port:
      source.port === ""
        ? ""
        : normalizePortForForm(source.port == null ? seed.port : source.port, String(seed.port || 22)),
    username: String(source.username || "").trim(),
    authType: normalizeAuthType(source.authType || seed.authType),
    password: String(source.password || ""),
    privateKey: String(source.privateKey || ""),
    passphrase: String(source.passphrase || ""),
    certificate: String(source.certificate || ""),
    projectPath: sanitizeProjectPath(String(source.projectPath || seed.projectPath || "")),
    transportMode: String(source.transportMode || seed.transportMode || "gateway"),
    jumpHost: normalizeJumpHost(source.jumpHost, seed.jumpHost),
    jumpPassword: String(source.jumpPassword || ""),
    jumpPrivateKey: String(source.jumpPrivateKey || ""),
    jumpPassphrase: String(source.jumpPassphrase || ""),
    jumpCertificate: String(source.jumpCertificate || "")
  };
}

function resolveEventFieldKey(event) {
  return event?.currentTarget?.dataset?.key || event?.target?.dataset?.key || "";
}

function updateFieldValue(base, key, value) {
  const source = base && typeof base === "object" ? base : createServerSeed();
  if (!key.includes(".")) {
    return {
      ...source,
      // 编辑阶段保留原始输入，端口归一化延后到保存时执行。
      [key]: value
    };
  }
  const [rootKey, childKey] = key.split(".", 2);
  if (rootKey !== "jumpHost" || !childKey) {
    return source;
  }
  const nextJumpHost = {
    ...(source.jumpHost || normalizeJumpHost()),
    [childKey]: childKey === "enabled" ? value === true : value
  };
  return {
    ...source,
    // jumpHost 同样保留草稿，避免输入中被即时裁剪/补默认值。
    jumpHost: nextJumpHost
  };
}

function buildDirectoryNode(path, depth) {
  const normalized = normalizeHomePath(path);
  const name = normalized === "~" ? "~" : normalized.split("/").pop() || "~";
  return {
    path: normalized,
    name,
    depth: Number(depth) || 0,
    expanded: false,
    loading: false,
    loaded: false,
    children: []
  };
}

function composeChildPath(parentPath, childName) {
  const parent = normalizeHomePath(parentPath);
  const child = String(childName || "")
    .trim()
    .replace(/^\/+|\/+$/g, "");
  if (!child) return parent;
  return parent === "~" ? `~/${child}` : `${parent}/${child}`;
}

function findDirectoryNode(root, targetPath) {
  const target = normalizeHomePath(targetPath);
  if (!root) return null;
  if (root.path === target) return root;
  const children = Array.isArray(root.children) ? root.children : [];
  for (let i = 0; i < children.length; i += 1) {
    const found = findDirectoryNode(children[i], target);
    if (found) return found;
  }
  return null;
}

function flattenDirectoryNodes(root, selectedPath) {
  if (!root) return [];
  const selected = normalizeHomePath(selectedPath || "~");
  const rows = [];

  const walk = (node) => {
    const children = Array.isArray(node.children) ? node.children : [];
    const canExpand = !node.loaded || children.length > 0;
    rows.push({
      path: node.path,
      name: node.name,
      depth: node.depth,
      paddingLeft: node.depth * 26,
      expanded: !!node.expanded,
      loading: !!node.loading,
      loaded: !!node.loaded,
      canExpand,
      childrenCount: children.length,
      isSelected: node.path === selected
    });
    if (!node.expanded || children.length === 0) return;
    children.forEach((child) => walk(child));
  };

  walk(root);
  return rows;
}

function toErrorMessage(error, fallback) {
  if (!error) return fallback;
  if (typeof error === "string") return error;
  if (typeof error.message === "string" && error.message.trim()) return error.message.trim();
  if (typeof error.errMsg === "string" && error.errMsg.trim()) return error.errMsg.trim();
  return fallback;
}

function normalizeDirectoryPickerSeqValue(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.floor(parsed);
}

/**
 * 服务器配置页（对齐 Web ServerSettingsView）：
 * 1. 顶部仅保留返回+标题；
 * 2. 底部动作栏固定为返回/连接/保存；
 * 3. 字段按双列网格布局。
 */
Page({
  data: {
    ...buildSvgButtonPressData(),
    themeStyle: "",
    icons: {},
    accentIcons: {},
    canGoBack: false,
    serverId: "",
    copy: buildPageCopy("zh-Hans", "serverSettings"),
    authTypeOptions: buildServerAuthTypeOptions("zh-Hans"),
    authTypeIndex: 0,
    form: createServerSeed(),
    tagText: "",
    dirPickerVisible: false,
    dirPickerLoading: false,
    dirPickerError: "",
    dirPickerSelectedPath: "~",
    directoryRows: []
  },

  autoSaveTimer: null,
  formDraft: null,
  opsConfig: null,
  directoryRoot: null,
  directoryPickerSeq: 0,
  directoryUsageMap: {},

  getCurrentLanguage(settingsInput) {
    const source = settingsInput && typeof settingsInput === "object" ? settingsInput : getSettings();
    return normalizeUiLanguage(source.uiLanguage);
  },

  applyLocale(settingsInput, formInput) {
    const settings = settingsInput && typeof settingsInput === "object" ? settingsInput : getSettings();
    const form = normalizeServerForm(formInput || this.formDraft || this.data.form || createServerSeed());
    const language = this.getCurrentLanguage(settings);
    const copy = buildPageCopy(language, "serverSettings");
    const authTypeOptions = buildServerAuthTypeOptions(language);
    wx.setNavigationBarTitle({ title: copy.navTitle || "服务器配置" });
    return {
      copy,
      authTypeOptions,
      authTypeIndex: Math.max(0, authTypeOptions.findIndex((item) => item.value === form.authType))
    };
  },

  onLoad(options) {
    const serverId = options.id || "";
    const rows = listServers();
    const found = rows.find((item) => item.id === serverId) || createServerSeed();
    const form = normalizeServerForm(found);
    this.formDraft = { ...form };
    this.opsConfig = getOpsConfig();
    this.directoryUsageMap = readDirectoryUsageMap();
    this.directoryPickerSeq = normalizeDirectoryPickerSeqValue(this.directoryPickerSeq);
    const settings = getSettings();
    const { icons, accentIcons } = buildButtonIconThemeMaps(settings);
    applyNavigationBarTheme(settings);
    const localePatch = this.applyLocale(settings, form);
    this.setData({
      serverId: form.id,
      form,
      tagText: Array.isArray(form.tags) ? form.tags.join(",") : "",
      themeStyle: buildThemeStyle(settings),
      icons,
      accentIcons,
      ...localePatch
    });
    this.prefetchRootDirectory("onLoad");
  },

  onShow() {
    const pages = getCurrentPages();
    this.opsConfig = getOpsConfig();
    this.directoryUsageMap = readDirectoryUsageMap();
    const settings = getSettings();
    const { icons, accentIcons } = buildButtonIconThemeMaps(settings);
    applyNavigationBarTheme(settings);
    const localePatch = this.applyLocale(settings);
    this.setData({
      canGoBack: pages.length > 1,
      themeStyle: buildThemeStyle(settings),
      icons,
      accentIcons,
      ...localePatch
    });
    this.prefetchRootDirectory("onShow");
  },

  onUnload() {
    this.clearAutoSaveTimer();
    this.bumpDirectoryPickerSeq("onUnload");
  },

  onFieldInput(event) {
    const key = resolveEventFieldKey(event);
    if (!key) return;
    const value = event.detail.value;
    const base = this.formDraft || this.data.form || createServerSeed();
    if (key === "tagsText") {
      const next = {
        ...base,
        tags: parseServerTags(value)
      };
      this.formDraft = next;
      this.setData({
        form: next,
        tagText: String(value || "")
      });
      this.scheduleAutoSave(next);
      return;
    }
    const next = updateFieldValue(base, key, value);
    this.formDraft = next;
    this.setData({ form: next });
    this.scheduleAutoSave(next);
  },

  applyAuthTypeByIndex(indexInput) {
    const index = Number(indexInput);
    if (!Number.isFinite(index) || index < 0) return;
    const option = AUTH_TYPE_OPTIONS[index] || AUTH_TYPE_OPTIONS[0];
    if (!option) return;
    const base = this.formDraft || this.data.form || createServerSeed();
    if (base.authType === option.value && this.data.authTypeIndex === index) return;
    const nextForm = {
      ...base,
      authType: option.value
    };
    this.formDraft = nextForm;
    this.setData({
      authTypeIndex: index,
      form: nextForm
    });
    this.scheduleAutoSave(nextForm);
  },

  onAuthTypeTap(event) {
    const index = Number(event?.currentTarget?.dataset?.index);
    this.applyAuthTypeByIndex(index);
  },

  onJumpAuthTypeTap(event) {
    const index = Number(event?.currentTarget?.dataset?.index);
    if (!Number.isFinite(index) || index < 0) return;
    const option = AUTH_TYPE_OPTIONS[index] || AUTH_TYPE_OPTIONS[0];
    if (!option) return;
    const base = this.formDraft || this.data.form || createServerSeed();
    if (base.jumpHost.authType === option.value) return;
    const nextForm = {
      ...base,
      jumpHost: {
        ...base.jumpHost,
        authType: option.value
      }
    };
    this.formDraft = nextForm;
    this.setData({ form: nextForm });
    this.scheduleAutoSave(nextForm);
  },

  onJumpEnabledTap(event) {
    const enabled = String(event?.currentTarget?.dataset?.enabled || "") === "true";
    const base = this.formDraft || this.data.form || createServerSeed();
    if (base.jumpHost.enabled === enabled) return;
    const nextForm = {
      ...base,
      jumpHost: {
        ...base.jumpHost,
        enabled
      }
    };
    this.formDraft = nextForm;
    this.setData({ form: nextForm });
    this.scheduleAutoSave(nextForm);
  },

  onJumpSwitchChange(event) {
    const enabled = event && event.detail ? event.detail.value === true : false;
    const base = this.formDraft || this.data.form || createServerSeed();
    if (base.jumpHost.enabled === enabled) return;
    const nextForm = {
      ...base,
      jumpHost: {
        ...base.jumpHost,
        enabled
      }
    };
    this.formDraft = nextForm;
    this.setData({ form: nextForm });
    this.scheduleAutoSave(nextForm);
  },

  bumpDirectoryPickerSeq(reason) {
    const current = normalizeDirectoryPickerSeqValue(this.directoryPickerSeq);
    if (current !== Number(this.directoryPickerSeq)) {
      console.warn(
        `[目录选择] 序号异常，自动重置 current=${String(this.directoryPickerSeq)} normalized=${current}`
      );
    }
    const next = current + 1;
    this.directoryPickerSeq = next;
    if (reason) {
      console.info(`[目录选择] 序号推进 reason=${reason} seq=${next}`);
    }
    return next;
  },

  isDirectoryPickerActive(seq) {
    if (!Number.isFinite(Number(seq))) return false;
    const requestSeq = normalizeDirectoryPickerSeqValue(seq);
    const currentSeq = normalizeDirectoryPickerSeqValue(this.directoryPickerSeq);
    this.directoryPickerSeq = currentSeq;
    return requestSeq === currentSeq && !!this.data.dirPickerVisible;
  },

  refreshDirectoryRows(extraData) {
    const selectedPathFromExtra =
      extraData && typeof extraData.dirPickerSelectedPath === "string"
        ? extraData.dirPickerSelectedPath
        : this.data.dirPickerSelectedPath;
    const next = {
      directoryRows: flattenDirectoryNodes(this.directoryRoot, selectedPathFromExtra)
    };
    if (extraData && typeof extraData === "object") {
      Object.assign(next, extraData);
    }
    this.setData(next);
  },

  prefetchRootDirectory(reason) {
    const form = normalizeServerForm(this.formDraft || this.data.form || createServerSeed());
    const profileError = validateServerForConnect(form);
    if (profileError) return;
    this.opsConfig = this.opsConfig || getOpsConfig();
    if (!isOpsConfigReady(this.opsConfig)) return;

    const cached = readFreshRootPrefetchNames(form);
    if (cached) return;
    const pending = readRootPrefetchInFlight(form);
    if (pending) return;

    const startedAt = Date.now();
    const request = listRemoteDirectories({
      server: form,
      opsConfig: this.opsConfig,
      path: "~"
    })
      .then((names) => {
        writeRootPrefetchResult(form, names);
        console.info(
          `[目录预取] 完成 reason=${reason || "-"} count=${Array.isArray(names) ? names.length : 0} ` +
            `elapsed=${Date.now() - startedAt}ms`
        );
        return names;
      })
      .catch((error) => {
        console.warn(
          `[目录预取] 失败 reason=${reason || "-"} elapsed=${Date.now() - startedAt}ms ` +
            `reason=${toErrorMessage(error, "unknown")}`
        );
        return null;
      })
      .finally(() => {
        writeRootPrefetchInFlight(form, null);
      });

    writeRootPrefetchInFlight(form, request);
    console.info(`[目录预取] 启动 reason=${reason || "-"}`);
  },

  async readRootDirectoryFromCacheOrPrefetch(form) {
    const cached = readFreshRootPrefetchNames(form);
    if (cached) {
      return { names: cached, source: "cache" };
    }
    const inFlight = readRootPrefetchInFlight(form);
    if (!inFlight) return { names: null, source: "none" };
    try {
      const names = await inFlight;
      if (!Array.isArray(names)) return { names: null, source: "none" };
      return {
        names: names.slice(),
        source: "inflight"
      };
    } catch {
      return { names: null, source: "none" };
    }
  },

  async ensureDirectoryNodeChildren(path, seq) {
    if (!this.isDirectoryPickerActive(seq)) return;
    const node = findDirectoryNode(this.directoryRoot, path);
    if (!node || node.loading || node.loaded) return;
    const loadStartedAt = Date.now();
    console.info(`[目录选择] 加载开始 seq=${seq} path=${node.path}`);
    node.loading = true;
    this.refreshDirectoryRows();

    try {
      const form = normalizeServerForm(this.formDraft || this.data.form || createServerSeed());
      const names = await listRemoteDirectories({
        server: form,
        opsConfig: this.opsConfig || getOpsConfig(),
        path: node.path
      });
      if (!this.isDirectoryPickerActive(seq)) return;
      const children = buildDirectoryChildrenFromNames(node, names, form, this.directoryUsageMap || {});
      node.children = children;
      node.loaded = true;
      node.loading = false;
      console.info(
        `[目录选择] 加载完成 seq=${seq} path=${node.path} children=${children.length} ` +
          `elapsed=${Date.now() - loadStartedAt}ms`
      );
      this.refreshDirectoryRows({ dirPickerError: "" });
    } catch (error) {
      if (!this.isDirectoryPickerActive(seq)) return;
      node.loading = false;
      console.warn(
        `[目录选择] 加载失败 seq=${seq} path=${node.path} elapsed=${Date.now() - loadStartedAt}ms ` +
          `reason=${toErrorMessage(error, "unknown")}`
      );
      this.refreshDirectoryRows();
      throw error;
    }
  },

  async expandToDirectoryPath(targetPath, seq) {
    const normalizedTarget = normalizeHomePath(targetPath);
    if (normalizedTarget === "~") return;

    const segments = normalizedTarget
      .slice(2)
      .split("/")
      .filter((part) => !!part);
    let currentPath = "~";
    for (let i = 0; i < segments.length; i += 1) {
      if (!this.isDirectoryPickerActive(seq)) return;
      await this.ensureDirectoryNodeChildren(currentPath, seq);
      const parentNode = findDirectoryNode(this.directoryRoot, currentPath);
      if (!parentNode) return;
      parentNode.expanded = true;
      const childPath = composeChildPath(currentPath, segments[i]);
      const childNode = findDirectoryNode(this.directoryRoot, childPath);
      if (!childNode) return;
      childNode.expanded = true;
      currentPath = childPath;
      this.refreshDirectoryRows();
    }
  },

  showDirectoryFetchError(error) {
    const copy = this.data.copy || {};
    const fallbackTitle = copy?.modal?.connectFailedTitle || "无法连接服务器";
    const rawMessage = toErrorMessage(error, fallbackTitle);
    const message = `${fallbackTitle}：${rawMessage}`;
    this.setData({
      dirPickerError: message,
      dirPickerLoading: false
    });
    if (/url not in domain list/i.test(rawMessage)) {
      const domainHint = resolveSocketDomainHint(this.opsConfig && this.opsConfig.gatewayUrl);
      wx.showModal({
        title: copy?.modal?.socketDomainTitle || "Socket 域名未配置",
        content: domainHint
          ? formatTemplate(copy?.modal?.socketDomainContent, { domainHint })
          : copy?.modal?.socketDomainContentNoHint || "当前网关地址不在小程序 socket 合法域名列表",
        showCancel: false
      });
      return;
    }
    wx.showModal({
      title: fallbackTitle,
      content: formatTemplate(copy?.modal?.connectFailedContent, { message: rawMessage }),
      showCancel: false
    });
  },

  async onOpenDirectoryPicker() {
    // 再次点击“选择目录”时直接收起，行为等同取消。
    if (this.data.dirPickerVisible) {
      console.info("[目录选择] 二次点击选择目录，执行收起（等同取消）");
      this.onDirectoryPickerCancel();
      return;
    }

    const openStartedAt = Date.now();
    const language = this.getCurrentLanguage();
    const form = normalizeServerForm(this.formDraft || this.data.form || createServerSeed());
    this.formDraft = { ...form };
    this.setData({ form });

    const profileError = validateServerForConnect(form);
    if (profileError) {
      wx.showToast({
        title: localizeServerValidationMessage(language, profileError),
        icon: "none"
      });
      return;
    }
    this.opsConfig = getOpsConfig();
    if (!isOpsConfigReady(this.opsConfig)) {
      wx.showToast({ title: this.data.copy?.toast?.opsConfigMissing || "运维配置缺失，请联系管理员", icon: "none" });
      return;
    }

    const targetPath = normalizeHomePath(form.projectPath || "~");
    const seq = this.bumpDirectoryPickerSeq("openPicker");
    console.info(`[目录选择] 打开开始 seq=${seq} target=${targetPath}`);
    this.directoryRoot = buildDirectoryNode("~", 0);
    this.directoryRoot.expanded = true;
    this.setData(
      {
        dirPickerVisible: true,
        dirPickerLoading: true,
        dirPickerError: "",
        dirPickerSelectedPath: targetPath,
        directoryRows: []
      },
      () => {
        console.info(`[目录选择] 面板渲染完成 seq=${seq} elapsed=${Date.now() - openStartedAt}ms`);
      }
    );
    this.refreshDirectoryRows({ dirPickerSelectedPath: targetPath });

    try {
      const rootNode = findDirectoryNode(this.directoryRoot, "~");
      const prefetched = await this.readRootDirectoryFromCacheOrPrefetch(form);
      if (!this.isDirectoryPickerActive(seq)) return;
      if (rootNode && Array.isArray(prefetched.names)) {
        rootNode.children = buildDirectoryChildrenFromNames(
          rootNode,
          prefetched.names,
          form,
          this.directoryUsageMap || {}
        );
        rootNode.loaded = true;
        rootNode.loading = false;
        console.info(
          `[目录选择] 根目录命中预取 source=${prefetched.source} count=${prefetched.names.length} ` +
            `elapsed=${Date.now() - openStartedAt}ms`
        );
        this.refreshDirectoryRows({ dirPickerError: "" });
      } else {
        await this.ensureDirectoryNodeChildren("~", seq);
      }
      await this.expandToDirectoryPath(targetPath, seq);
      if (!this.isDirectoryPickerActive(seq)) return;
      console.info(`[目录选择] 打开完成 seq=${seq} elapsed=${Date.now() - openStartedAt}ms`);
      this.refreshDirectoryRows({ dirPickerLoading: false });
    } catch (error) {
      if (!this.isDirectoryPickerActive(seq)) return;
      console.warn(
        `[目录选择] 打开失败 seq=${seq} elapsed=${Date.now() - openStartedAt}ms ` +
          `reason=${toErrorMessage(error, "unknown")}`
      );
      this.showDirectoryFetchError(error);
    }
  },

  onDirectoryPickerCancel() {
    console.info("[目录选择] 面板取消/收起");
    this.bumpDirectoryPickerSeq("cancelPicker");
    this.setData({
      dirPickerVisible: false,
      dirPickerLoading: false,
      dirPickerError: "",
      directoryRows: []
    });
    this.directoryRoot = null;
  },

  onDirectorySelectTap(event) {
    const path = normalizeHomePath(event?.currentTarget?.dataset?.path || "~");
    this.setData({ dirPickerSelectedPath: path }, () => this.refreshDirectoryRows());
  },

  async onDirectoryExpandTap(event) {
    const path = normalizeHomePath(event?.currentTarget?.dataset?.path || "~");
    const node = findDirectoryNode(this.directoryRoot, path);
    if (!node) return;
    const expandStartedAt = Date.now();
    if (node.expanded) {
      node.expanded = false;
      this.refreshDirectoryRows();
      console.info(`[目录选择] 收起目录 path=${path} elapsed=${Date.now() - expandStartedAt}ms`);
      return;
    }
    node.expanded = true;
    this.refreshDirectoryRows();
    if (node.loaded) {
      console.info(`[目录选择] 展开目录（已缓存） path=${path} elapsed=${Date.now() - expandStartedAt}ms`);
      return;
    }
    const seq = this.directoryPickerSeq;
    try {
      await this.ensureDirectoryNodeChildren(path, seq);
      console.info(`[目录选择] 展开目录完成 path=${path} elapsed=${Date.now() - expandStartedAt}ms`);
    } catch (error) {
      if (!this.isDirectoryPickerActive(seq)) return;
      console.warn(
        `[目录选择] 展开目录失败 path=${path} elapsed=${Date.now() - expandStartedAt}ms ` +
          `reason=${toErrorMessage(error, "unknown")}`
      );
      this.showDirectoryFetchError(error);
    }
  },

  onDirectoryPickerConfirm() {
    const selectedPath = normalizeHomePath(this.data.dirPickerSelectedPath || "~");
    const base = this.formDraft || this.data.form || createServerSeed();
    const next = {
      ...base,
      projectPath: selectedPath
    };
    const usageKey = buildDirectoryUsageKey(next, selectedPath);
    this.directoryUsageMap = writeDirectoryUsageMap({
      ...(this.directoryUsageMap || {}),
      [usageKey]: Date.now()
    });
    this.formDraft = next;
    this.bumpDirectoryPickerSeq("confirmPicker");
    this.directoryRoot = null;
    this.setData({
      form: next,
      dirPickerVisible: false,
      dirPickerLoading: false,
      dirPickerError: "",
      directoryRows: []
    });
    this.scheduleAutoSave(next);
  },

  goBack() {
    if (!this.data.canGoBack) return;
    wx.navigateBack({ delta: 1 });
  },

  persistForm(formInput) {
    const form = normalizeServerForm(formInput || this.formDraft || this.data.form);
    upsertServer(form);
    this.formDraft = { ...form };
    this.setData({
      form,
      authTypeIndex: Math.max(
        0,
        this.data.authTypeOptions.findIndex((item) => item.value === form.authType)
      )
    });
    return form;
  },

  scheduleAutoSave(form) {
    this.clearAutoSaveTimer();
    this.autoSaveTimer = setTimeout(() => {
      this.persistForm(form || this.data.form);
      this.clearAutoSaveTimer();
    }, 280);
  },

  clearAutoSaveTimer() {
    if (!this.autoSaveTimer) return;
    clearTimeout(this.autoSaveTimer);
    this.autoSaveTimer = null;
  },

  onSave() {
    this.clearAutoSaveTimer();
    const saved = this.persistForm(this.formDraft || this.data.form);
    if (!saved) return;
    wx.showToast({ title: this.data.copy?.toast?.saved || "已保存", icon: "success" });
  },

  onConnect() {
    this.clearAutoSaveTimer();
    const saved = this.persistForm(this.formDraft || this.data.form);
    if (!saved) return;
    const error = validateServerForConnect(saved);
    if (error) {
      wx.showToast({
        title: localizeServerValidationMessage(this.getCurrentLanguage(), error),
        icon: "none"
      });
      return;
    }
    markServerConnected(saved.id);
    appendLog({
      serverId: saved.id,
      status: "connecting",
      summary: this.data.copy?.toast?.connectFromSettings || "从服务器配置页发起连接"
    });
    wx.navigateTo({ url: `/pages/terminal/index?serverId=${saved.id}` });
  },

  onOpenRecords() {
    wx.navigateTo({ url: "/pages/records/index" });
  },

  // 配置页沿用独立底栏，在这里直接补关于入口，保证全页面可达。
  onOpenAbout() {
    wx.navigateTo({ url: "/pages/about/index" });
  },

  ...createSvgButtonPressMethods()
});
