/* global Page, wx, require */

const { getSettings } = require("../../utils/storage");
const { buildThemeStyle, applyNavigationBarTheme } = require("../../utils/themeStyle");
const { getAboutBrand, getAboutDetailContent, getAboutHomeItems } = require("../../utils/aboutContent");
const { normalizeUiLanguage } = require("../../utils/i18n");
const { buildButtonIconThemeMaps } = require("../../utils/themedIcons");
const { buildSvgButtonPressData, createSvgButtonPressMethods } = require("../../utils/svgButtonFeedback");

Page({
  data: {
    ...buildSvgButtonPressData(),
    brand: getAboutBrand("zh-Hans"),
    items: [],
    icons: {},
    accentIcons: {},
    themeStyle: "",
    // 首页头部只保留纯版本号，不叠加平台和时间戳。
    homeVersionLine: getAboutBrand("zh-Hans").version
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
    const { icons, accentIcons } = buildButtonIconThemeMaps(settings);
    const items = getAboutHomeItems(language).map((item) => ({
      ...item,
      // about 首页入口目前固定 5 项，用业务 key 生成 press key，后续增删项也无需改模板判断。
      pressKey: `about:${item.key || item.path || item.title || "entry"}`
    }));
    const homeTitle = getAboutDetailContent("app", language).title || "About";
    applyNavigationBarTheme(settings);
    wx.setNavigationBarTitle({ title: homeTitle });
    this.setData({
      brand,
      items,
      icons,
      accentIcons,
      themeStyle: buildThemeStyle(settings),
      homeVersionLine: brand.version
    });
  },

  onOpenItem(event) {
    const path = String(event.currentTarget.dataset.path || "").trim();
    if (!path) return;
    wx.navigateTo({ url: path });
  },

  ...createSvgButtonPressMethods()
});
