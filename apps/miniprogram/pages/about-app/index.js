/* global Page, wx, require */

const { getSettings } = require("../../utils/storage");
const { buildThemeStyle, applyNavigationBarTheme } = require("../../utils/themeStyle");
const {
  getAboutBrand,
  getAboutDetailContent,
  getAboutFooterLinks,
  getAboutUiCopy
} = require("../../utils/aboutContent");
const { normalizeUiLanguage } = require("../../utils/i18n");
const { buildButtonIconThemeMaps } = require("../../utils/themedIcons");
const { buildSvgButtonPressData, createSvgButtonPressMethods } = require("../../utils/svgButtonFeedback");

// “关于”页分享出去后应回到小程序首页，而不是再次落到 about 详情页。
const ABOUT_APP_SHARE_HOME_PATH = "/pages/connect/index";

/**
 * 将“关于”详情页按 Figma Frame 2223 落地：
 * 1. 保留关于首页的 5 个入口结构不变；
 * 2. 当前页只重排品牌区、信息卡、分享按钮和底部跳转；
 * 3. 中间信息继续复用统一数据源，避免文案在多个页面分叉。
 */
function buildInfoRows(section) {
  const bullets = Array.isArray(section && section.bullets) ? section.bullets : [];
  return bullets.map((line, index) => {
    const text = String(line || "").trim();
    const matched = text.match(/^([^：:]+)[：:]\s*(.+)$/);
    if (!matched) {
      return {
        key: `row-${index}`,
        label: "",
        value: text
      };
    }
    return {
      key: `row-${index}`,
      label: `${matched[1]}：`,
      value: matched[2]
    };
  });
}

Page({
  data: {
    ...buildSvgButtonPressData(),
    brand: getAboutBrand("zh-Hans"),
    pageContent: getAboutDetailContent("app", "zh-Hans"),
    infoRows: [],
    versionLine: "",
    themeStyle: "",
    footerLinks: getAboutFooterLinks("zh-Hans"),
    uiCopy: getAboutUiCopy("zh-Hans"),
    icons: {},
    accentIcons: {}
  },

  onLoad() {
    const brand = getAboutBrand("zh-Hans");
    const pageContent = getAboutDetailContent("app", "zh-Hans");
    const primarySection = Array.isArray(pageContent.sections) ? pageContent.sections[0] : null;
    wx.setNavigationBarTitle({ title: pageContent.title || "关于" });
    this.setData({
      brand,
      pageContent,
      infoRows: buildInfoRows(primarySection),
      versionLine: `${brand.version}·wechat·${brand.updatedAtCompact}`,
      footerLinks: getAboutFooterLinks("zh-Hans"),
      uiCopy: getAboutUiCopy("zh-Hans")
    });
    this.applyThemeStyle();
  },

  onShow() {
    this.applyThemeStyle();
  },

  applyThemeStyle() {
    const settings = getSettings();
    const language = normalizeUiLanguage(settings.uiLanguage);
    const brand = getAboutBrand(language);
    const pageContent = getAboutDetailContent("app", language);
    const primarySection = Array.isArray(pageContent.sections) ? pageContent.sections[0] : null;
    const { icons, accentIcons } = buildButtonIconThemeMaps(settings);
    applyNavigationBarTheme(settings);
    wx.setNavigationBarTitle({ title: pageContent.title || "关于" });
    this.setData({
      brand,
      pageContent,
      infoRows: buildInfoRows(primarySection),
      versionLine: `${brand.version}·wechat·${brand.updatedAtCompact}`,
      footerLinks: getAboutFooterLinks(language),
      uiCopy: getAboutUiCopy(language),
      icons,
      accentIcons,
      themeStyle: buildThemeStyle(settings)
    });
  },

  onOpenLink(event) {
    const path = String(event.currentTarget.dataset.path || "").trim();
    if (!path) return;
    wx.navigateTo({ url: path });
  },

  onShareAppMessage() {
    const brand = this.data.brand || getAboutBrand("zh-Hans");
    return {
      title: `${brand.productName} ${brand.version}`,
      path: ABOUT_APP_SHARE_HOME_PATH
    };
  },

  ...createSvgButtonPressMethods()
});
