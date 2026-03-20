/* global Page, wx, require, getCurrentPages, console */

const pluginRuntime = require("../../utils/pluginRuntime");
const { onSessionEvent, getSessionState } = require("../../utils/sessionBus");
const { getSettings } = require("../../utils/storage");
const { buildThemeStyle, applyNavigationBarTheme } = require("../../utils/themeStyle");
const { buildPageCopy, formatTemplate, getRuntimeStateLabel, normalizeUiLanguage } = require("../../utils/i18n");

/**
 * 插件页：
 * 1. 对齐 Web 的“插件运行时管理”能力；
 * 2. 支持启用/禁用/重载/移除、JSON 导入导出、命令执行与运行日志。
 */
Page({
  data: {
    themeStyle: "",
    canGoBack: false,
    pluginJson: "",
    records: [],
    commands: [],
    runtimeLogs: [],
    sessionState: "disconnected",
    sessionStateLabel: "Disconnected",
    copy: buildPageCopy("zh-Hans", "plugins")
  },

  async onShow() {
    const pages = getCurrentPages();
    const settings = getSettings();
    const language = normalizeUiLanguage(settings.uiLanguage);
    const copy = buildPageCopy(language, "plugins");
    applyNavigationBarTheme(settings);
    wx.setNavigationBarTitle({ title: copy.navTitle || "插件" });
    this.setData({
      canGoBack: pages.length > 1,
      sessionState: getSessionState(),
      sessionStateLabel: getRuntimeStateLabel(language, getSessionState()),
      copy,
      themeStyle: buildThemeStyle(settings)
    });
    if (!Array.isArray(this.sessionUnsubs) || this.sessionUnsubs.length === 0) {
      this.sessionUnsubs = [
        onSessionEvent("connected", () => {
          const nextLanguage = normalizeUiLanguage(getSettings().uiLanguage);
          this.setData(
            {
              sessionState: "connected",
              sessionStateLabel: getRuntimeStateLabel(nextLanguage, "connected")
            },
            () => this.reloadRuntime()
          );
        }),
        onSessionEvent("disconnected", () => {
          const nextLanguage = normalizeUiLanguage(getSettings().uiLanguage);
          this.setData(
            {
              sessionState: "disconnected",
              sessionStateLabel: getRuntimeStateLabel(nextLanguage, "disconnected")
            },
            () => this.reloadRuntime()
          );
        })
      ];
    }
    await this.reloadRuntime();
  },

  onUnload() {
    if (Array.isArray(this.sessionUnsubs)) {
      this.sessionUnsubs.forEach((off) => {
        try {
          off();
        } catch (error) {
          console.warn("[plugins.sessionUnsubs]", error);
        }
      });
    }
    this.sessionUnsubs = null;
  },

  async reloadRuntime() {
    try {
      await pluginRuntime.ensureBootstrapped();
      const records = pluginRuntime.listRecords();
      const commands = pluginRuntime.listCommands(this.data.sessionState);
      const runtimeLogs = pluginRuntime.listRuntimeLogs();
      this.setData({ records, commands, runtimeLogs });
    } catch (error) {
      wx.showToast({ title: (error && error.message) || this.data.copy?.toast?.bootstrapFailed || "插件初始化失败", icon: "none" });
    }
  },

  goBack() {
    if (!this.data.canGoBack) return;
    wx.navigateBack({ delta: 1 });
  },

  onPluginJsonInput(event) {
    this.setData({ pluginJson: event.detail.value || "" });
  },

  async onImportJson() {
    if (!String(this.data.pluginJson || "").trim()) {
      wx.showToast({ title: this.data.copy?.toast?.pastePluginJsonFirst || "请先粘贴插件 JSON", icon: "none" });
      return;
    }
    try {
      await pluginRuntime.importJson(this.data.pluginJson);
      this.setData({ pluginJson: "" });
      await this.reloadRuntime();
      wx.showToast({ title: this.data.copy?.toast?.importSuccess || "导入成功", icon: "success" });
    } catch (error) {
      wx.showToast({ title: (error && error.message) || this.data.copy?.toast?.importFailed || "导入失败", icon: "none" });
    }
  },

  async onExportJson() {
    try {
      const raw = await pluginRuntime.exportJson();
      wx.setClipboardData({
        data: raw,
        success: () => {
          wx.showToast({ title: this.data.copy?.toast?.exportSuccess || "插件 JSON 已复制", icon: "success" });
        }
      });
    } catch (error) {
      wx.showToast({ title: (error && error.message) || this.data.copy?.toast?.exportFailed || "导出失败", icon: "none" });
    }
  },

  async onEnable(event) {
    const id = String(event.currentTarget.dataset.id || "");
    if (!id) return;
    try {
      await pluginRuntime.enable(id);
      await this.reloadRuntime();
      wx.showToast({ title: this.data.copy?.toast?.enabled || "已启用", icon: "success" });
    } catch (error) {
      wx.showToast({ title: (error && error.message) || this.data.copy?.toast?.enableFailed || "启用失败", icon: "none" });
    }
  },

  async onDisable(event) {
    const id = String(event.currentTarget.dataset.id || "");
    if (!id) return;
    try {
      await pluginRuntime.disable(id);
      await this.reloadRuntime();
      wx.showToast({ title: this.data.copy?.toast?.disabled || "已禁用", icon: "success" });
    } catch (error) {
      wx.showToast({ title: (error && error.message) || this.data.copy?.toast?.disableFailed || "禁用失败", icon: "none" });
    }
  },

  async onReload(event) {
    const id = String(event.currentTarget.dataset.id || "");
    if (!id) return;
    try {
      await pluginRuntime.reload(id);
      await this.reloadRuntime();
      wx.showToast({ title: this.data.copy?.toast?.reloaded || "已重载", icon: "success" });
    } catch (error) {
      wx.showToast({ title: (error && error.message) || this.data.copy?.toast?.reloadFailed || "重载失败", icon: "none" });
    }
  },

  async onRemove(event) {
    const id = String(event.currentTarget.dataset.id || "");
    if (!id) return;
    wx.showModal({
      title: this.data.copy?.modal?.removeTitle || "移除插件",
      content: formatTemplate(this.data.copy?.modal?.removeContent, { id }),
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await pluginRuntime.remove(id);
          await this.reloadRuntime();
          wx.showToast({ title: this.data.copy?.toast?.removed || "已移除", icon: "success" });
        } catch (error) {
          wx.showToast({ title: (error && error.message) || this.data.copy?.toast?.removeFailed || "移除失败", icon: "none" });
        }
      }
    });
  },

  async onRunCommand(event) {
    const commandId = String(event.currentTarget.dataset.commandId || "");
    if (!commandId) return;
    try {
      await pluginRuntime.runCommand(commandId);
      wx.showToast({ title: this.data.copy?.toast?.commandExecuted || "命令已执行", icon: "success" });
    } catch (error) {
      wx.showToast({ title: (error && error.message) || this.data.copy?.toast?.commandExecuteFailed || "命令执行失败", icon: "none" });
    }
  }
});
