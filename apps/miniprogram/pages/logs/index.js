/* global Page, wx, require, getCurrentPages */

const { listLogs, getSettings } = require("../../utils/storage");
const { pageOf } = require("../../utils/pagination");
const { buildThemeStyle, applyNavigationBarTheme } = require("../../utils/themeStyle");
const { buildPageCopy, formatTemplate, normalizeUiLanguage, t } = require("../../utils/i18n");

const PAGE_SIZE = 15;

/**
 * 日志页（对齐 Web LogsView）：
 * 1. 顶部工具栏保留返回语义；
 * 2. 主体为导出 + 列表 + 分页。
 */
Page({
  data: {
    themeStyle: "",
    canGoBack: false,
    copy: buildPageCopy("zh-Hans", "logs"),
    page: 1,
    total: 0,
    totalPages: 1,
    rows: [],
    totalCountText: t("zh-Hans", "logs.totalCount", { total: 0 }),
    pageIndicatorText: t("zh-Hans", "common.pageIndicator", { page: 1, total: 1 })
  },

  onShow() {
    const settings = getSettings();
    const language = normalizeUiLanguage(settings.uiLanguage);
    const copy = buildPageCopy(language, "logs");
    applyNavigationBarTheme(settings);
    wx.setNavigationBarTitle({ title: copy.navTitle || "日志" });
    this.setData({ themeStyle: buildThemeStyle(settings), copy });
    this.syncCanGoBack();
    this.reload();
  },

  syncCanGoBack() {
    const pages = getCurrentPages();
    this.setData({ canGoBack: pages.length > 1 });
  },

  goBack() {
    if (!this.data.canGoBack) return;
    wx.navigateBack({ delta: 1 });
  },

  reload() {
    const logs = listLogs();
    const paged = pageOf(logs, this.data.page, PAGE_SIZE);
    const settings = getSettings();
    const language = normalizeUiLanguage(settings.uiLanguage);
    this.setData({
      page: paged.page,
      total: paged.total,
      totalPages: paged.totalPages,
      rows: paged.rows,
      totalCountText: formatTemplate(this.data.copy.totalCount, { total: paged.total }),
      pageIndicatorText: t(language, "common.pageIndicator", {
        page: paged.page,
        total: paged.totalPages
      })
    });
  },

  onPrev() {
    this.setData({ page: Math.max(1, this.data.page - 1) }, () => this.reload());
  },

  onNext() {
    this.setData({ page: Math.min(this.data.totalPages, this.data.page + 1) }, () => this.reload());
  },

  onExport() {
    const rows = listLogs();
    const content = rows
      .map(
        (item) =>
          `[${item.startAt || "--"}] ${item.serverId || "-"} ${item.status || "-"}\n${item.summary || ""}`
      )
      .join("\n\n");
    wx.setClipboardData({
      data: content || "",
      success: () => wx.showToast({ title: this.data.copy?.toast?.copied || "日志已复制", icon: "success" })
    });
  }
});
