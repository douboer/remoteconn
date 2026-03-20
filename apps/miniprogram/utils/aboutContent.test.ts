import { describe, expect, it } from "vitest";

const { getAboutBrand, getAboutDetailContent, getAboutHomeItems } = require("./aboutContent.js");

describe("about content i18n", () => {
  it("关于页产品信息在繁中和英文下仍保留明细内容", () => {
    const zhHantApp = getAboutDetailContent("app", "zh-Hant");
    const enApp = getAboutDetailContent("app", "en");

    expect(zhHantApp.sections[0].title).toBe("產品資訊");
    expect(zhHantApp.sections[0].bullets.length).toBeGreaterThan(0);
    expect(enApp.sections[0].title).toBe("Product Info");
    expect(enApp.sections[0].bullets.length).toBeGreaterThan(0);
  });

  it("使用手册和隐私政策支持繁中和英文标题", () => {
    const zhHantManual = getAboutDetailContent("manual", "zh-Hant");
    const enPrivacy = getAboutDetailContent("privacy", "en");

    expect(zhHantManual.title).toBe("使用手冊");
    expect(enPrivacy.title).toBe("Privacy");
    expect(enPrivacy.sections[0].bullets[3]).toContain("microphone audio chunks");
  });

  it("变更记录支持繁中和英文正文切换", () => {
    const zhHansChangelog = getAboutDetailContent("changelog", "zh-Hans");
    const zhHantChangelog = getAboutDetailContent("changelog", "zh-Hant");
    const enChangelog = getAboutDetailContent("changelog", "en");
    const zhHansV300 = zhHansChangelog.sections.find((section) => section.title === "v3.0.0（2026-03-18）");
    const zhHantV300 = zhHantChangelog.sections.find((section) => section.title === "v3.0.0（2026-03-18）");
    const enV300 = enChangelog.sections.find((section) => section.title === "v3.0.0 (2026-03-18)");

    expect(zhHansV300?.bullets?.[0]).toContain("终端交互稳定性修复");
    expect(zhHantChangelog.sections[0].title).toBe("索引說明");
    expect(enChangelog.sections[0].title).toBe("Index Notes");
    expect(zhHantV300?.bullets?.[1]).toContain("多語言文案");
    expect(enV300?.bullets?.[2]).toContain("v2.9.6");
  });

  it("首页入口和品牌信息会按语言切换", () => {
    expect(getAboutHomeItems("en")[0].title).toBe("Manual");
    expect(getAboutBrand("zh-Hant").chineseName).toBe("AI矩連");
  });

  it("日文和韩文关于首页入口、反馈与关于详情页都支持本地化", () => {
    expect(getAboutHomeItems("ja")[0].title).toBe("使い方");
    expect(getAboutHomeItems("ko")[0].title).toBe("사용 안내");
    expect(getAboutDetailContent("feedback", "ja").title).toBe("フィードバック");
    expect(getAboutDetailContent("app", "ko").sections[0].title).toBe("제품 정보");
  });

  it("使用手册中的闪念页说明同步包含新增入口", () => {
    const zhHansManual = getAboutDetailContent("manual", "zh-Hans");
    const enManual = getAboutDetailContent("manual", "en");

    expect(zhHansManual.sections[6].bullets[3]).toContain("新增");
    expect(enManual.sections[6].bullets[3]).toContain("Add");
  });

  it("使用手册会在正文前插入项目背景三点并挂载配图", () => {
    const zhHansManual = getAboutDetailContent("manual", "zh-Hans");
    const enManual = getAboutDetailContent("manual", "en");

    expect(zhHansManual.sections[0].title).toBe("为什么需要这个APP？");
    expect(zhHansManual.sections[0].bullets).toHaveLength(3);
    expect(zhHansManual.sections[1].mediaItems[0].src).toBe("/assets/guide/guide-mobile-01-server-list.jpg");
    expect(zhHansManual.sections[7].mediaItems).toHaveLength(4);
    expect(enManual.sections[9].mediaItems[0].src).toBe("/assets/guide/guide-mobile-10-about.jpg");
  });
});
