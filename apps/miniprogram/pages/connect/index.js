/* global Page, wx, require, console, module */

const {
  createServerSeed,
  listServers,
  saveServers,
  upsertServer,
  removeServer,
  markServerConnected,
  appendLog,
  getSettings
} = require("../../utils/storage");
const { getTerminalSessionSnapshot } = require("../../utils/terminalSession");
const {
  isTerminalSessionAiHighlighted,
  isTerminalSessionConnecting,
  isTerminalSessionHighlighted
} = require("../../utils/terminalSessionState");
const { buildThemeStyle, applyNavigationBarTheme } = require("../../utils/themeStyle");
const { buildButtonIconThemeMaps, resolveButtonIcon } = require("../../utils/themedIcons");
const { openTerminalPage: navigateTerminalPage } = require("../../utils/terminalNavigation");
const { buildPageCopy, formatTemplate, normalizeUiLanguage } = require("../../utils/i18n");
const { subscribeSyncConfigApplied } = require("../../utils/syncConfigBus");
const { buildSvgButtonPressData, createSvgButtonPressMethods } = require("../../utils/svgButtonFeedback");
const { getWindowMetrics } = require("../../utils/systemInfoCompat");

const SWIPE_AXIS_LOCK_THRESHOLD_PX = 8;
const SERVER_SWIPE_ACTION_WIDTH_RPX = 240;
const SERVER_SWIPE_FALLBACK_WIDTH_PX = 120;

function resolveTouchClientPoint(event) {
  const point =
    (event && event.touches && event.touches[0]) ||
    (event && event.changedTouches && event.changedTouches[0]) ||
    null;
  if (!point) return null;
  const x = Number(point.clientX);
  const y = Number(point.clientY);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

function resolveTouchClientY(event) {
  const point = resolveTouchClientPoint(event);
  return point ? point.y : null;
}

/**
 * 服务器左滑动作区露出“复制 + 删除”两个按钮，整体宽度按设计稿 `240rpx` 换算：
 * 1. 统一在 JS 内转成 px，便于与 touch `clientX` 直接比较；
 * 2. 老环境拿不到窗口宽度时回退到保守值，避免手势完全失效。
 */
function resolveServerSwipeRevealPx(windowWidth) {
  const width = Number(windowWidth);
  if (!Number.isFinite(width) || width <= 0) {
    return SERVER_SWIPE_FALLBACK_WIDTH_PX;
  }
  return Math.round((width * SERVER_SWIPE_ACTION_WIDTH_RPX) / 750);
}

function clampServerSwipeOffset(offset, revealPx) {
  const numeric = Number(offset);
  if (!Number.isFinite(numeric)) return 0;
  if (numeric < -revealPx) return -revealPx;
  if (numeric > 0) return 0;
  return numeric;
}

function shouldOpenServerSwipe(offset, revealPx) {
  return clampServerSwipeOffset(offset, revealPx) <= -revealPx * 0.45;
}

const loggedRenderProbeKeys = new Set();

function shouldUseTextIcons() {
  if (!wx || typeof wx.getAppBaseInfo !== "function") return false;
  try {
    const info = wx.getAppBaseInfo() || {};
    return (
      String(info.platform || "")
        .trim()
        .toLowerCase() === "devtools"
    );
  } catch {
    return false;
  }
}

function inspectRenderPayload(payload) {
  const stats = {
    stringCount: 0,
    dataImageCount: 0,
    svgPathCount: 0,
    urlCount: 0,
    maxLength: 0,
    samples: []
  };
  const walk = (value, path, depth) => {
    if (depth > 5) return;
    if (typeof value === "string") {
      stats.stringCount += 1;
      if (value.includes("data:image")) stats.dataImageCount += 1;
      if (value.includes(".svg")) stats.svgPathCount += 1;
      if (value.includes("url(")) stats.urlCount += 1;
      if (value.length > stats.maxLength) stats.maxLength = value.length;
      if (
        stats.samples.length < 6 &&
        (value.includes("data:image") ||
          value.includes(".svg") ||
          value.includes("url(") ||
          value.length >= 120)
      ) {
        stats.samples.push({
          path,
          length: value.length,
          preview: value.slice(0, 120)
        });
      }
      return;
    }
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${path}[${index}]`, depth + 1));
      return;
    }
    Object.keys(value).forEach((key) => walk(value[key], path ? `${path}.${key}` : key, depth + 1));
  };
  walk(payload, "", 0);
  return stats;
}

function logRenderProbeOnce(key, label, payload) {
  const normalizedKey = String(key || label || "");
  if (!normalizedKey || loggedRenderProbeKeys.has(normalizedKey)) return;
  loggedRenderProbeKeys.add(normalizedKey);
  console.warn(`[render_probe] ${label}`, inspectRenderPayload(payload));
}

/**
 * 服务器列表页（对齐 Web ConnectView）：
 * 1. 顶部三图标：新增、删除已选、全选/取消全选；
 * 2. 搜索框 + 单层列表；
 * 3. 每行保留 ai/connect 图标位，排序改为长按拖拽。
 */
const connectPageOptions = {
  data: {
    ...buildSvgButtonPressData(),
    themeStyle: "",
    icons: {},
    activeIcons: {},
    accentIcons: {},
    copy: buildPageCopy("zh-Hans", "connect"),
    textIconMode: false,
    query: "",
    servers: [],
    filteredServers: [],
    selectedServerIds: [],
    isAllSelected: false,
    activeServerId: "",
    connectingServerId: "",
    dragActive: false,
    dragServerId: ""
  },

  dragRuntime: null,
  dragTapLockUntil: 0,
  syncConfigUnsub: null,
  swipeRuntime: null,
  swipeOffsets: null,
  serverSwipeRevealPx: 0,

  onLoad() {
    /**
     * 首次启动时，云端 bootstrap 可能晚于首页首帧完成：
     * 1. 首页先按旧本地快照渲染是正常的；
     * 2. 一旦 bootstrap 合并回 storage，需要立刻重读服务器列表和主题；
     * 3. 否则用户会误以为同步没生效，必须手动重进页面才看到更新。
     */
    this.syncConfigUnsub = subscribeSyncConfigApplied(() => {
      this.applyThemeStyle();
      this.reloadServers();
    });
  },

  onShow() {
    this.applyThemeStyle();
    this.reloadServers();
  },

  onHide() {
    this.swipeRuntime = null;
    this.closeAllServerRows();
    if (this.data.dragActive) {
      this.clearDragState();
    }
  },

  onUnload() {
    if (typeof this.syncConfigUnsub === "function") {
      this.syncConfigUnsub();
      this.syncConfigUnsub = null;
    }
  },

  applyThemeStyle() {
    const settings = getSettings();
    const language = normalizeUiLanguage(settings.uiLanguage);
    const copy = buildPageCopy(language, "connect");
    const { icons, activeIcons, accentIcons } = buildButtonIconThemeMaps(settings);
    applyNavigationBarTheme(settings);
    wx.setNavigationBarTitle({ title: copy.navTitle || "服务器" });
    const payload = {
      themeStyle: buildThemeStyle(settings),
      icons,
      activeIcons,
      accentIcons,
      copy,
      textIconMode: shouldUseTextIcons() && Object.keys(icons).length === 0
    };
    logRenderProbeOnce("connect.applyThemeStyle", "connect.applyThemeStyle", payload);
    this.setData(payload);
  },

  reloadServers() {
    const rows = listServers();
    this.reconcileServerSwipeState(rows);
    this.setData({ servers: rows }, () => {
      this.applyFilter(this.data.query);
      this.syncSelectState();
    });
  },

  applyFilter(query) {
    const text = String(query || "")
      .trim()
      .toLowerCase();
    const selected = new Set(this.data.selectedServerIds);
    const sessionSnapshot = getTerminalSessionSnapshot();
    const fallbackThemeMaps = buildButtonIconThemeMaps(getSettings());
    const iconMap =
      this.data.icons && Object.keys(this.data.icons).length ? this.data.icons : fallbackThemeMaps.icons;
    const activeIconMap =
      this.data.activeIcons && Object.keys(this.data.activeIcons).length
        ? this.data.activeIcons
        : fallbackThemeMaps.activeIcons;
    const accentIconMap =
      this.data.accentIcons && Object.keys(this.data.accentIcons).length
        ? this.data.accentIcons
        : fallbackThemeMaps.accentIcons;
    this.reconcileServerSwipeState(this.data.servers);
    const next = this.data.servers
      .filter((item) => {
        if (!text) return true;
        return [
          item.name,
          item.host,
          item.username,
          String(item.port),
          item.authType,
          this.resolveDisplayTags(item)
            .map((tag) => tag.label)
            .join(" ")
        ]
          .join(" ")
          .toLowerCase()
          .includes(text);
      })
      .map((item) => {
        const tags = this.resolveTags(item);
        const displayTags = this.resolveDisplayTags(item);
        const isConnected = isTerminalSessionHighlighted(sessionSnapshot, item.id);
        const isAiConnected = isTerminalSessionAiHighlighted(sessionSnapshot, item.id);
        return {
          ...item,
          selected: selected.has(item.id),
          swipeOffsetX:
            this.swipeOffsets && Number.isFinite(Number(this.swipeOffsets[item.id]))
              ? this.clampServerSwipeOffset(this.swipeOffsets[item.id])
              : 0,
          tags,
          displayTags,
          lastConnectedText: this.formatLastConnected(item.lastConnectedAt),
          authTypeLabel:
            (this.data.copy &&
              this.data.copy.authTypeLabels &&
              this.data.copy.authTypeLabels[item.authType]) ||
            item.authType ||
            "-",
          isConnected,
          isAiConnected,
          isConnecting:
            this.data.connectingServerId === item.id || isTerminalSessionConnecting(sessionSnapshot, item.id),
          aiPressKey: `connect-ai:${item.id}`,
          connectPressKey: `connect-open:${item.id}`,
          aiIcon: resolveButtonIcon("/assets/icons/ai.svg", isAiConnected ? activeIconMap : iconMap),
          aiPressedIcon: resolveButtonIcon(
            "/assets/icons/ai.svg",
            isAiConnected ? activeIconMap : accentIconMap
          ),
          connectIcon: resolveButtonIcon("/assets/icons/connect.svg", isConnected ? activeIconMap : iconMap),
          connectPressedIcon: resolveButtonIcon(
            "/assets/icons/connect.svg",
            isConnected ? activeIconMap : accentIconMap
          ),
          dragOffsetY: 0,
          dragging: false
        };
      });
    const payload = { query, filteredServers: next };
    logRenderProbeOnce("connect.applyFilter", "connect.applyFilter", payload);
    this.setData(payload, () => this.refreshDragVisual());
  },

  syncSelectState() {
    const ids = this.data.servers.map((item) => item.id);
    const selected = this.data.selectedServerIds.filter((id) => ids.includes(id));
    const isAllSelected = ids.length > 0 && selected.length === ids.length;
    this.setData({ selectedServerIds: selected, isAllSelected }, () => this.applyFilter(this.data.query));
  },

  onQueryInput(event) {
    this.closeAllServerRows();
    this.applyFilter(event.detail.value || "");
  },

  onSearchTap() {
    this.closeAllServerRows();
    this.applyFilter(this.data.query);
  },

  onCreateServer() {
    this.closeAllServerRows();
    const seed = createServerSeed();
    const prefix =
      (this.data.copy && this.data.copy.fallback && this.data.copy.fallback.newServerPrefix) || "server";
    upsertServer({ ...seed, name: `${prefix}-${this.data.servers.length + 1}` });
    this.reloadServers();
    wx.navigateTo({ url: `/pages/server-settings/index?id=${seed.id}` });
  },

  onToggleServerSelect(event) {
    this.closeAllServerRows();
    const id = event.currentTarget.dataset.id;
    if (!id) return;
    const selected = new Set(this.data.selectedServerIds);
    if (selected.has(id)) {
      selected.delete(id);
    } else {
      selected.add(id);
    }
    this.setData({ selectedServerIds: [...selected] }, () => this.syncSelectState());
  },

  onToggleSelectAll() {
    this.closeAllServerRows();
    if (this.data.isAllSelected) {
      this.setData({ selectedServerIds: [] }, () => this.syncSelectState());
      return;
    }
    const all = this.data.servers.map((item) => item.id);
    this.setData({ selectedServerIds: all }, () => this.syncSelectState());
  },

  onRemoveSelected() {
    this.closeAllServerRows();
    const targets = this.data.selectedServerIds;
    if (!targets.length) return;
    const copy = this.data.copy || {};
    wx.showModal({
      title: copy?.modal?.removeTitle || "删除服务器",
      content: formatTemplate(copy?.modal?.removeContent, { count: targets.length }),
      success: (res) => {
        if (!res.confirm) return;
        targets.forEach((id) => removeServer(id));
        this.setData({ selectedServerIds: [] });
        this.reloadServers();
      }
    });
  },

  onOpenSettings(event) {
    if (this.data.dragActive || Date.now() < this.dragTapLockUntil) return;
    this.closeAllServerRows();
    const serverId = event.currentTarget.dataset.id;
    this.setData({ activeServerId: serverId || "" });
    wx.navigateTo({ url: `/pages/server-settings/index?id=${serverId}` });
  },

  onConnect(event) {
    if (this.data.dragActive || Date.now() < this.dragTapLockUntil) return;
    this.closeAllServerRows();
    const serverId = event.currentTarget.dataset.id;
    if (!serverId) return;

    const sessionSnapshot = getTerminalSessionSnapshot();
    if (
      isTerminalSessionHighlighted(sessionSnapshot, serverId) ||
      isTerminalSessionConnecting(sessionSnapshot, serverId)
    ) {
      this.setData({ activeServerId: serverId }, () => this.applyFilter(this.data.query));
      this.openTerminalPage(serverId, true);
      return;
    }

    this.setData({ activeServerId: serverId, connectingServerId: serverId }, () =>
      this.applyFilter(this.data.query)
    );
    markServerConnected(serverId);
    appendLog({
      serverId,
      status: "connecting",
      summary: (this.data.copy && this.data.copy.summary && this.data.copy.summary.connectFromList) || ""
    });
    this.setData({ connectingServerId: "" });
    this.openTerminalPage(serverId, false);
  },

  /**
   * 若当前页下方已经是终端页，优先直接返回，避免重复压入新的终端实例。
   */
  openTerminalPage(serverId, reuseExisting, options) {
    navigateTerminalPage(serverId, reuseExisting, options);
  },

  onAiTap(event) {
    if (this.data.dragActive || Date.now() < this.dragTapLockUntil) return;
    this.closeAllServerRows();
    const serverId = event.currentTarget.dataset.id;
    if (!serverId) return;

    const server = this.data.servers.find((item) => item.id === serverId);
    if (!server) {
      wx.showToast({ title: this.data.copy?.toast?.serverNotFound || "服务器不存在", icon: "none" });
      return;
    }

    const sessionSnapshot = getTerminalSessionSnapshot();
    this.setData({ activeServerId: serverId }, () => this.applyFilter(this.data.query));

    if (
      isTerminalSessionHighlighted(sessionSnapshot, serverId) ||
      isTerminalSessionConnecting(sessionSnapshot, serverId)
    ) {
      this.openTerminalPage(serverId, true, { openCodex: true });
      return;
    }

    this.setData({ connectingServerId: serverId }, () => this.applyFilter(this.data.query));
    markServerConnected(serverId);
    appendLog({
      serverId,
      status: "connecting",
      summary: (this.data.copy && this.data.copy.summary && this.data.copy.summary.aiFromList) || ""
    });
    this.setData({ connectingServerId: "" });
    this.openTerminalPage(serverId, false, { openCodex: true });
  },

  /**
   * 复制服务器配置（含认证信息）：
   * 1. 基于当前服务器快照复制全部字段；
   * 2. 重新生成唯一 ID，避免覆盖原记录；
   * 3. 名称按“原服务器名+copy”落库，便于用户二次编辑。
   */
  onCopyServer(event) {
    if (this.data.dragActive || Date.now() < this.dragTapLockUntil) return;
    this.closeAllServerRows();
    const serverId = event.currentTarget.dataset.id;
    if (!serverId) return;

    const source = this.data.servers.find((item) => item.id === serverId);
    if (!source) {
      wx.showToast({
        title: this.data.copy?.toast?.serverToCopyNotFound || "未找到待复制服务器",
        icon: "none"
      });
      return;
    }

    const seed = createServerSeed();
    const copySuffix = String(this.data.copy?.labels?.copyNameSuffix || " copy");
    const copied = {
      ...source,
      id: seed.id,
      name: `${String(source.name || this.data.copy?.unnamedServer || "未命名服务器")}${copySuffix}`,
      sortOrder: Date.now(),
      lastConnectedAt: ""
    };
    upsertServer(copied);
    this.setData({ activeServerId: copied.id }, () => this.reloadServers());
    wx.showToast({ title: this.data.copy?.toast?.serverCopied || "服务器已复制", icon: "none" });
  },

  onStartDrag(event) {
    this.closeAllServerRows();
    this.swipeRuntime = null;
    const serverId = event.currentTarget.dataset.id;
    if (!serverId) return;
    if (this.data.dragActive) return;
    if (String(this.data.query || "").trim()) {
      wx.showToast({
        title: this.data.copy?.toast?.clearSearchBeforeSort || "请清空搜索后再调整顺序",
        icon: "none"
      });
      return;
    }
    if (this.data.filteredServers.length <= 1) return;
    const fromIndex = this.data.filteredServers.findIndex((item) => item.id === serverId);
    if (fromIndex < 0) return;

    const query = wx.createSelectorQuery().in(this);
    query.selectAll(".server-list-row").boundingClientRect((rects) => {
      if (!Array.isArray(rects) || rects.length !== this.data.filteredServers.length) return;
      const startRect = rects[fromIndex];
      if (!startRect) return;
      const startY = resolveTouchClientY(event) || startRect.top + startRect.height / 2;
      this.dragRuntime = {
        serverId,
        fromIndex,
        toIndex: fromIndex,
        startY,
        offsetY: 0,
        orderIds: this.data.filteredServers.map((item) => item.id),
        rects: rects.map((item) => ({
          top: Number(item.top) || 0,
          height: Number(item.height) || 0,
          center: (Number(item.top) || 0) + (Number(item.height) || 0) / 2
        }))
      };
      this.setData(
        {
          dragActive: true,
          dragServerId: serverId
        },
        () => this.refreshDragVisual()
      );
    });
    query.exec();
  },

  onDragTouchMove(event) {
    if (!this.data.dragActive || !this.dragRuntime) return;
    const touchY = resolveTouchClientY(event);
    if (touchY == null) return;

    const runtime = this.dragRuntime;
    runtime.offsetY = touchY - runtime.startY;

    const sourceRect = runtime.rects[runtime.fromIndex];
    if (!sourceRect) return;
    const center = sourceRect.center + runtime.offsetY;
    let targetIndex = runtime.fromIndex;
    let minDistance = Number.POSITIVE_INFINITY;
    for (let i = 0; i < runtime.rects.length; i += 1) {
      const distance = Math.abs(center - runtime.rects[i].center);
      if (distance < minDistance) {
        minDistance = distance;
        targetIndex = i;
      }
    }
    runtime.toIndex = targetIndex;
    this.refreshDragVisual();
  },

  onDragTouchEnd() {
    if (!this.data.dragActive || !this.dragRuntime) return;
    const runtime = this.dragRuntime;
    const moved = runtime.toIndex !== runtime.fromIndex;
    const dragServerId = runtime.serverId;
    this.clearDragState();

    if (!moved || !dragServerId) return;

    const rows = this.data.servers.slice();
    const fromIndex = rows.findIndex((item) => item.id === dragServerId);
    if (fromIndex < 0) return;
    const [current] = rows.splice(fromIndex, 1);
    if (!current) return;
    const targetIndex = Math.max(0, Math.min(rows.length, runtime.toIndex));
    rows.splice(targetIndex, 0, current);
    this.persistServerOrder(rows, dragServerId);
  },

  clearDragState() {
    this.dragRuntime = null;
    this.dragTapLockUntil = Date.now() + 240;
    const next = this.data.filteredServers.map((item) => {
      if (!item.dragOffsetY && !item.dragging) return item;
      return {
        ...item,
        dragOffsetY: 0,
        dragging: false
      };
    });
    this.setData({
      dragActive: false,
      dragServerId: "",
      filteredServers: next
    });
  },

  buildDragOffsetMap() {
    if (!this.data.dragActive || !this.dragRuntime) return {};
    const runtime = this.dragRuntime;
    const from = runtime.fromIndex;
    const to = runtime.toIndex;
    const offsets = {
      [runtime.serverId]: runtime.offsetY
    };
    if (to > from) {
      for (let i = from + 1; i <= to; i += 1) {
        const id = runtime.orderIds[i];
        if (!id) continue;
        const prev = runtime.rects[i - 1];
        const current = runtime.rects[i];
        offsets[id] = (prev ? prev.top : 0) - (current ? current.top : 0);
      }
    } else if (to < from) {
      for (let i = to; i < from; i += 1) {
        const id = runtime.orderIds[i];
        if (!id) continue;
        const current = runtime.rects[i];
        const next = runtime.rects[i + 1];
        offsets[id] = (next ? next.top : 0) - (current ? current.top : 0);
      }
    }
    return offsets;
  },

  refreshDragVisual() {
    if (!this.data.dragActive || !this.dragRuntime) return;
    const offsets = this.buildDragOffsetMap();
    const dragId = this.data.dragServerId;
    const next = this.data.filteredServers.map((item) => {
      const dragOffsetY = Number(offsets[item.id] || 0);
      const dragging = item.id === dragId;
      if (item.dragOffsetY === dragOffsetY && item.dragging === dragging) {
        return item;
      }
      return {
        ...item,
        dragOffsetY,
        dragging
      };
    });
    this.setData({ filteredServers: next });
  },

  persistServerOrder(rows, activeServerId) {
    const base = Date.now();
    const next = rows.map((item, index) => ({
      ...item,
      sortOrder: base + index
    }));
    saveServers(next);
    this.setData(
      {
        servers: next,
        activeServerId: activeServerId || this.data.activeServerId
      },
      () => {
        this.applyFilter(this.data.query);
        this.syncSelectState();
      }
    );
  },

  resolveTouchPoint(event) {
    return resolveTouchClientPoint(event);
  },

  getServerSwipeRevealPx() {
    if (Number.isFinite(this.serverSwipeRevealPx) && this.serverSwipeRevealPx > 0) {
      return this.serverSwipeRevealPx;
    }
    const metrics = getWindowMetrics(wx);
    this.serverSwipeRevealPx = resolveServerSwipeRevealPx(metrics.windowWidth);
    return this.serverSwipeRevealPx;
  },

  clampServerSwipeOffset(offset) {
    return clampServerSwipeOffset(offset, this.getServerSwipeRevealPx());
  },

  reconcileServerSwipeState(rows) {
    const list = Array.isArray(rows) ? rows : [];
    const validIds = new Set(list.map((item) => item.id));
    const nextOffsets = {};
    Object.keys(this.swipeOffsets || {}).forEach((id) => {
      if (!validIds.has(id)) return;
      nextOffsets[id] = this.clampServerSwipeOffset(this.swipeOffsets[id]);
    });
    this.swipeOffsets = nextOffsets;
    if (this.swipeRuntime && !validIds.has(this.swipeRuntime.id)) {
      this.swipeRuntime = null;
    }
  },

  findFilteredServerIndexById(id) {
    return this.data.filteredServers.findIndex((item) => item.id === id);
  },

  updateServerSwipeOffset(id, offset) {
    const index = this.findFilteredServerIndexById(id);
    if (index < 0) return;
    const normalized = this.clampServerSwipeOffset(offset);
    this.swipeOffsets = this.swipeOffsets || {};
    this.swipeOffsets[id] = normalized;
    this.setData({ [`filteredServers[${index}].swipeOffsetX`]: normalized });
  },

  closeOtherServerRows(exceptId) {
    this.swipeOffsets = this.swipeOffsets || {};
    const updates = {};
    this.data.filteredServers.forEach((item, index) => {
      if (item.id === exceptId) return;
      if (item.swipeOffsetX === 0) return;
      this.swipeOffsets[item.id] = 0;
      updates[`filteredServers[${index}].swipeOffsetX`] = 0;
    });
    if (Object.keys(updates).length > 0) {
      this.setData(updates);
    }
  },

  closeAllServerRows() {
    this.swipeOffsets = this.swipeOffsets || {};
    const updates = {};
    this.data.filteredServers.forEach((item, index) => {
      if (item.swipeOffsetX === 0) return;
      this.swipeOffsets[item.id] = 0;
      updates[`filteredServers[${index}].swipeOffsetX`] = 0;
    });
    if (Object.keys(updates).length > 0) {
      this.setData(updates);
    }
  },

  onListTap() {
    this.closeAllServerRows();
  },

  /**
   * 服务器列表沿用闪念页的横向手势模型：
   * 1. `touchstart` 仅记录起点和当前开合态；
   * 2. `touchmove` 再做横纵轴锁定，避免和列表纵向滚动打架；
   * 3. 只允许向左露出删除按钮，不支持向右拖出正偏移。
   */
  onServerTouchStart(event) {
    if (this.data.dragActive) return;
    const id = String(event.currentTarget.dataset.id || "");
    if (!id) return;
    const point = this.resolveTouchPoint(event);
    if (!point) return;
    this.closeOtherServerRows(id);
    this.swipeOffsets = this.swipeOffsets || {};
    this.swipeRuntime = {
      id,
      startX: point.x,
      startY: point.y,
      startOffsetX: this.clampServerSwipeOffset(this.swipeOffsets[id] || 0),
      dragging: false,
      blocked: false
    };
  },

  onServerTouchMove(event) {
    if (this.data.dragActive) return;
    const runtime = this.swipeRuntime;
    if (!runtime || runtime.blocked) return;
    const id = String(event.currentTarget.dataset.id || "");
    if (!id || id !== runtime.id) return;
    const point = this.resolveTouchPoint(event);
    if (!point) return;

    const deltaX = point.x - runtime.startX;
    const deltaY = point.y - runtime.startY;
    if (!runtime.dragging) {
      if (
        Math.abs(deltaX) < SWIPE_AXIS_LOCK_THRESHOLD_PX &&
        Math.abs(deltaY) < SWIPE_AXIS_LOCK_THRESHOLD_PX
      ) {
        return;
      }
      if (Math.abs(deltaY) > Math.abs(deltaX)) {
        runtime.blocked = true;
        return;
      }
      runtime.dragging = true;
    }

    this.updateServerSwipeOffset(id, runtime.startOffsetX + deltaX);
  },

  onServerTouchEnd(event) {
    if (this.data.dragActive) return;
    const runtime = this.swipeRuntime;
    this.swipeRuntime = null;
    if (!runtime || runtime.blocked) return;
    const id = String(event.currentTarget.dataset.id || "");
    if (!id || id !== runtime.id) return;
    const current = this.clampServerSwipeOffset((this.swipeOffsets && this.swipeOffsets[id]) || 0);
    const shouldOpen = shouldOpenServerSwipe(current, this.getServerSwipeRevealPx());
    this.updateServerSwipeOffset(id, shouldOpen ? -this.getServerSwipeRevealPx() : 0);
  },

  onSwipeDeleteServer(event) {
    const serverId = String(event.currentTarget.dataset.id || "");
    if (!serverId) return;
    const server = this.data.servers.find((item) => item.id === serverId);
    const serverName = String(
      (server && server.name) || this.data.copy?.unnamedServer || event.currentTarget.dataset.name || ""
    ).trim();
    const copy = this.data.copy || {};
    wx.showModal({
      title: copy?.modal?.removeTitle || "删除服务器",
      content: formatTemplate(copy?.modal?.removeSingleContent, {
        name: serverName || copy?.unnamedServer || "未命名服务器"
      }),
      success: (res) => {
        if (!res.confirm) return;
        removeServer(serverId);
        if (this.swipeOffsets) {
          delete this.swipeOffsets[serverId];
        }
        this.setData(
          {
            activeServerId: this.data.activeServerId === serverId ? "" : this.data.activeServerId,
            selectedServerIds: this.data.selectedServerIds.filter((id) => id !== serverId)
          },
          () => {
            this.reloadServers();
            wx.showToast({
              title: copy?.toast?.serverDeleted || "服务器已删除",
              icon: "success"
            });
          }
        );
      }
    });
  },

  /**
   * 服务器标签对齐 Web 语义：
   * 1. 只展示用户明确配置的 tags；
   * 2. 不再按服务器名称猜测标签，避免与真实标签混淆。
   */
  resolveTags(server) {
    return Array.isArray(server && server.tags)
      ? server.tags.map((item) => String(item || "").trim()).filter((item) => !!item)
      : [];
  },

  /**
   * 提取项目目录最后一级名称：
   * 1. 先清理空白与尾部斜杠；
   * 2. 同时兼容 Unix/Windows 路径；
   * 3. 列表里只展示短目录名，避免胶囊过长。
   */
  resolveProjectDirectoryName(projectPath) {
    const normalized = String(projectPath || "")
      .trim()
      .replace(/[\\/]+$/g, "");
    if (!normalized) return "";
    const segments = normalized.split(/[\\/]+/).filter(Boolean);
    if (!segments.length) {
      return normalized === "~" ? "~" : "";
    }
    return segments[segments.length - 1] || "";
  },

  /**
   * 卡片底部标签组装：
   * 1. project 胶囊固定排在最前面；
   * 2. 原始 tags 继续跟在后面；
   * 3. 返回对象数组，便于模板按类型切换底色。
   */
  resolveDisplayTags(server) {
    const displayTags = [];
    const projectDirectoryName = this.resolveProjectDirectoryName(server && server.projectPath);
    if (projectDirectoryName) {
      displayTags.push({
        type: "project",
        label: `${(this.data.copy && this.data.copy.display && this.data.copy.display.projectPrefix) || "pro"}:${projectDirectoryName}`
      });
    }
    this.resolveTags(server).forEach((tag) => {
      displayTags.push({
        type: "tag",
        label: tag
      });
    });
    return displayTags;
  },

  /**
   * 最近连接时间统一格式：
   * - 空值显示“无连接”；
   * - 非法时间显示“无连接”；
   * - 合法时间输出 YYYY-MM-DD HH:mm:ss。
   */
  formatLastConnected(input) {
    if (!input) return this.data.copy?.fallback?.noConnection || "无连接";
    const date = new Date(input);
    if (Number.isNaN(+date)) return this.data.copy?.fallback?.noConnection || "无连接";
    const pad = (n) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  },

  ...createSvgButtonPressMethods()
};

Page(connectPageOptions);

module.exports = {
  __test__: {
    pageOptions: connectPageOptions,
    SWIPE_AXIS_LOCK_THRESHOLD_PX,
    SERVER_SWIPE_ACTION_WIDTH_RPX,
    SERVER_SWIPE_FALLBACK_WIDTH_PX,
    resolveServerSwipeRevealPx,
    clampServerSwipeOffset,
    shouldOpenServerSwipe
  }
};
