/* global Component, getCurrentPages, wx, require, console */

const { getSettings, listServers } = require("../../utils/storage");
const { getTerminalSessionSnapshot } = require("../../utils/terminalSession");
const { buildButtonIconThemeMaps, resolveButtonIcon } = require("../../utils/themedIcons");
const { resolvePageNavigationMethod } = require("../../utils/navigationPolicy");
const {
  hasActiveTerminalSession,
  openTerminalPage,
  resolveActiveTerminalServerId
} = require("../../utils/terminalNavigation");
const { buildPageCopy, normalizeUiLanguage, t } = require("../../utils/i18n");
const { subscribeLocaleChange } = require("../../utils/localeBus");
const { subscribeSyncConfigApplied } = require("../../utils/syncConfigBus");
const { buildSvgButtonPressData, createSvgButtonPressMethods } = require("../../utils/svgButtonFeedback");

const SHELL_BUTTON_ACTION = "open-terminal-shell";
const SHELL_BUTTON_ITEM = Object.freeze({
  action: SHELL_BUTTON_ACTION,
  path: "/pages/terminal/index",
  icon: "/assets/icons/shell.svg",
  isTab: false
});

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

function prependShellItem(page, items) {
  if (String(page || "").trim() === "terminal") {
    return items;
  }
  return [SHELL_BUTTON_ITEM, ...items];
}

/**
 * 全局底部工具条组件：
 * 1. 复刻 Web 底栏语义：左侧返回，右侧按页面上下文展示图标按钮；
 * 2. 图标顺序按 Figma 页面 annotation 固定，不做自动重排；
 * 3. records 页面自身不展示 records 入口，避免重复高亮。
 */
Component({
  properties: {
    page: {
      type: String,
      value: ""
    }
  },

  data: {
    ...buildSvgButtonPressData(),
    canGoBack: false,
    backIcon: "/assets/icons/back.svg",
    backPressedIcon: "/assets/icons/back.svg",
    backLabel: t("zh-Hans", "bottomNav.backText"),
    textIconMode: false,
    items: []
  },

  lifetimes: {
    attached() {
      this.syncCanGoBack();
      this.syncItems();
      this.localeUnsub = subscribeLocaleChange(() => {
        this.syncItems();
      });
      this.syncConfigUnsub = subscribeSyncConfigApplied(() => {
        this.syncCanGoBack();
        this.syncItems();
      });
    },

    detached() {
      if (typeof this.localeUnsub === "function") {
        this.localeUnsub();
        this.localeUnsub = null;
      }
      if (typeof this.syncConfigUnsub === "function") {
        this.syncConfigUnsub();
        this.syncConfigUnsub = null;
      }
    }
  },

  pageLifetimes: {
    show() {
      this.syncCanGoBack();
      this.syncItems();
    }
  },

  observers: {
    page() {
      this.syncItems();
    }
  },

  methods: {
    currentPathByPage(page) {
      const name = String(page || "").trim();
      if (!name) return "";
      if (name === "about" || name.indexOf("about-") === 0) {
        return "/pages/about/index";
      }
      return `/pages/${name}/index`;
    },

    syncCanGoBack() {
      const pages = getCurrentPages();
      this.setData({ canGoBack: pages.length > 1 });
    },

    rawItemsByPage(page) {
      const aboutItem = { path: "/pages/about/index", icon: "/assets/icons/about.svg", isTab: false };
      if (page === "about" || String(page || "").indexOf("about-") === 0) {
        return prependShellItem(page, [
          { path: "/pages/connect/index", icon: "/assets/icons/serverlist.svg", isTab: false },
          { path: "/pages/logs/index", icon: "/assets/icons/log.svg", isTab: false },
          { path: "/pages/settings/index", icon: "/assets/icons/config.svg", isTab: false }
        ]);
      }
      if (page === "connect") {
        return prependShellItem(page, [
          { path: "/pages/logs/index", icon: "/assets/icons/log.svg", isTab: false },
          {
            path: "/pages/records/index",
            icon: "/assets/icons/recordmanager.svg",
            isTab: false
          },
          { path: "/pages/settings/index", icon: "/assets/icons/config.svg", isTab: false },
          aboutItem
        ]);
      }
      if (page === "settings") {
        return prependShellItem(page, [
          { path: "/pages/connect/index", icon: "/assets/icons/serverlist.svg", isTab: false },
          { path: "/pages/logs/index", icon: "/assets/icons/log.svg", isTab: false },
          { path: "/pages/plugins/index", icon: "/assets/icons/plugins.svg", isTab: false },
          { path: "/pages/records/index", icon: "/assets/icons/recordmanager.svg", isTab: false },
          aboutItem
        ]);
      }
      if (page === "plugins") {
        return prependShellItem(page, [
          { path: "/pages/connect/index", icon: "/assets/icons/serverlist.svg", isTab: false },
          {
            path: "/pages/records/index",
            icon: "/assets/icons/recordmanager.svg",
            isTab: false
          },
          { path: "/pages/settings/index", icon: "/assets/icons/config.svg", isTab: false },
          aboutItem
        ]);
      }
      if (page === "terminal") {
        return [
          { path: "/pages/connect/index", icon: "/assets/icons/serverlist.svg", isTab: false },
          { path: "/pages/logs/index", icon: "/assets/icons/log.svg", isTab: false },
          {
            path: "/pages/records/index",
            icon: "/assets/icons/recordmanager.svg",
            isTab: false
          },
          { path: "/pages/settings/index", icon: "/assets/icons/config.svg", isTab: false },
          aboutItem
        ];
      }
      if (page === "records") {
        return prependShellItem(page, [
          { path: "/pages/connect/index", icon: "/assets/icons/serverlist.svg", isTab: false },
          { path: "/pages/logs/index", icon: "/assets/icons/log.svg", isTab: false },
          { path: "/pages/settings/index", icon: "/assets/icons/config.svg", isTab: false },
          aboutItem
        ]);
      }
      if (page === "logs") {
        return prependShellItem(page, [
          { path: "/pages/connect/index", icon: "/assets/icons/serverlist.svg", isTab: false },
          {
            path: "/pages/records/index",
            icon: "/assets/icons/recordmanager.svg",
            isTab: false
          },
          { path: "/pages/settings/index", icon: "/assets/icons/config.svg", isTab: false },
          aboutItem
        ]);
      }
      return prependShellItem(page, [
        { path: "/pages/connect/index", icon: "/assets/icons/serverlist.svg", isTab: false },
        { path: "/pages/settings/index", icon: "/assets/icons/config.svg", isTab: false },
        aboutItem
      ]);
    },

    syncItems() {
      const page = this.data.page;
      const settings = getSettings();
      const language = normalizeUiLanguage(settings.uiLanguage);
      const copy = buildPageCopy(language, "bottomNav");
      const { icons: iconMap, activeIcons: activeIconMap, accentIcons: accentIconMap } =
        buildButtonIconThemeMaps(settings);
      const currentPath = this.currentPathByPage(page);
      const sessionSnapshot = getTerminalSessionSnapshot();
      const shellActive = hasActiveTerminalSession(sessionSnapshot, listServers());
      const list = this.rawItemsByPage(page).map((item) => ({
        ...item,
        id: String(item.action || item.path || item.icon || ""),
        pressKey: `bottom-nav:${String(item.action || item.path || item.icon || "").trim()}`,
        icon:
          item.action === SHELL_BUTTON_ACTION && shellActive
            ? resolveButtonIcon(item.icon, activeIconMap)
            : resolveButtonIcon(item.icon, iconMap),
        pressedIcon: resolveButtonIcon(
          item.icon,
          item.action === SHELL_BUTTON_ACTION && shellActive ? activeIconMap : accentIconMap
        ),
        textLabel: this.resolveTextLabel(item.action || item.path, copy),
        active: item.action === SHELL_BUTTON_ACTION ? shellActive : item.path === currentPath,
        connectionActive: item.action === SHELL_BUTTON_ACTION && shellActive
      }));
      const payload = {
        backIcon: iconMap.back || "/assets/icons/back.svg",
        backPressedIcon: accentIconMap.back || iconMap.back || "/assets/icons/back.svg",
        backLabel: copy.backText || t(language, "bottomNav.backText"),
        textIconMode: shouldUseTextIcons() && Object.keys(iconMap).length === 0,
        items: list
      };
      logRenderProbeOnce("bottom-nav.syncItems", "bottom-nav.syncItems", payload);
      this.setData(payload);
    },

    onBack() {
      if (!this.data.canGoBack) return;
      wx.navigateBack({
        delta: 1,
        fail: () => {
          wx.redirectTo({ url: "/pages/connect/index" });
        }
      });
    },

    onNavTap(event) {
      const action = String(event.currentTarget.dataset.action || "").trim();
      if (action === SHELL_BUTTON_ACTION) {
        this.onShellTap();
        return;
      }
      const path = event.currentTarget.dataset.path;
      if (!path) return;
      const currentPath = this.currentPathByPage(this.data.page);
      const method = resolvePageNavigationMethod(currentPath, path);
      if (method === "noop") return;
      if (method === "redirectTo") {
        wx.redirectTo({
          url: path,
          fail: () => {
            wx.navigateTo({ url: path });
          }
        });
        return;
      }
      wx.navigateTo({ url: path });
    },

    onShellTap() {
      const sessionSnapshot = getTerminalSessionSnapshot();
      const serverId = resolveActiveTerminalServerId(sessionSnapshot, listServers());
      const language = normalizeUiLanguage(getSettings().uiLanguage);
      if (!serverId) {
        wx.showModal({
          title: t(language, "bottomNav.modal.noTerminalTitle"),
          content: t(language, "bottomNav.modal.noTerminalContent"),
          showCancel: false
        });
        return;
      }
      openTerminalPage(serverId, true);
    },

    resolveTextLabel(key, copyInput) {
      const copy = copyInput && typeof copyInput === "object" ? copyInput : buildPageCopy("zh-Hans", "bottomNav");
      const pageTextLabels = (copy && copy.pageTextLabels) || {};
      const normalized = String(key || "").trim();
      return pageTextLabels[normalized] || pageTextLabels.default || "页";
    },

    ...createSvgButtonPressMethods()
  }
});
