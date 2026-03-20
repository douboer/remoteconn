/* global module, wx, require */

const { getSettings } = require("./storage");
const { buildThemeStyle, applyNavigationBarTheme } = require("./themeStyle");
const { getAboutBrand, getAboutDetailContent, getAboutUiCopy } = require("./aboutContent");
const { normalizeUiLanguage } = require("./i18n");

/**
 * 统一生成关于详情页，保证 5 个详情页结构一致：
 * 1. 共享品牌信息与复制邮箱逻辑；
 * 2. 页面仅通过 key 切换内容，避免后续文案更新时多处同步。
 */
function createAboutDetailPage(key) {
  return {
    data: {
      brand: getAboutBrand("zh-Hans"),
      pageContent: getAboutDetailContent(key, "zh-Hans"),
      uiCopy: getAboutUiCopy("zh-Hans"),
      themeStyle: ""
    },

    onLoad() {
      this.applyThemeStyle();
    },

    onShow() {
      this.applyThemeStyle();
    },

    applyThemeStyle() {
      const settings = getSettings();
      const language = normalizeUiLanguage(settings.uiLanguage);
      const brand = getAboutBrand(language);
      const pageContent = getAboutDetailContent(key, language);
      const uiCopy = getAboutUiCopy(language);
      applyNavigationBarTheme(settings);
      wx.setNavigationBarTitle({ title: pageContent.title });
      this.setData({ brand, pageContent, uiCopy, themeStyle: buildThemeStyle(settings) });
    },

    onCopyFeedbackEmail() {
      const uiCopy = this.data.uiCopy || getAboutUiCopy("zh-Hans");
      wx.setClipboardData({
        data: (this.data.brand && this.data.brand.feedbackEmail) || getAboutBrand("zh-Hans").feedbackEmail,
        success: () => {
          wx.showToast({ title: uiCopy.copiedEmail, icon: "none" });
        }
      });
    }
  };
}

module.exports = {
  createAboutDetailPage
};
