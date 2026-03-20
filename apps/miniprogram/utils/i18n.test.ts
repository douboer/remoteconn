import { describe, expect, it } from "vitest";

const {
  buildPageCopy,
  buildThemeModeOptions,
  buildThemePresetOptions,
  formatTemplate,
  getThemePresetLabel,
  getStatusLabel,
  getUiLanguageOptions,
  localizeServerValidationMessage,
  normalizeUiLanguage,
  t
} = require("./i18n.js");

describe("miniprogram i18n", () => {
  it("会把非法界面语言回退到简体中文", () => {
    expect(normalizeUiLanguage("zh-Hant")).toBe("zh-Hant");
    expect(normalizeUiLanguage("en")).toBe("en");
    expect(normalizeUiLanguage("ja")).toBe("ja");
    expect(normalizeUiLanguage("ko")).toBe("ko");
    expect(normalizeUiLanguage("unknown")).toBe("zh-Hans");
  });

  it("可构建设置页主题模式和状态文案", () => {
    expect(buildThemeModeOptions("en")).toEqual([
      { label: "Dark", value: "dark" },
      { label: "Light", value: "light" }
    ]);
    expect(getStatusLabel("zh-Hant", "connected")).toBe("已連線");
  });

  it("会按界面语言输出主题展示名", () => {
    expect(getThemePresetLabel("zh-Hans", "tide")).toBe("潮汐");
    expect(getThemePresetLabel("zh-Hant", "霓潮")).toBe("稜光");
    expect(getThemePresetLabel("en", "焰岩")).toBe("Ember");
    expect(buildThemePresetOptions("zh-Hans").slice(0, 7)).toEqual([
      { label: "潮汐", value: "tide" },
      { label: "沙丘", value: "暮砂" },
      { label: "棱光", value: "霓潮" },
      { label: "苔影", value: "苔暮" },
      { label: "余烬", value: "焰岩" },
      { label: "陶土", value: "岩陶" },
      { label: "岚雾", value: "靛雾" }
    ]);
    expect(buildThemePresetOptions("zh-Hans")).toHaveLength(21);
    expect(buildThemePresetOptions("zh-Hans")[20]).toEqual({ label: "霜绯", value: "霜绯" });
    expect(getThemePresetLabel("en", "绛霓")).toBe("Crimson");
    expect(getThemePresetLabel("ja", "珀岚")).toBe("琥珀");
    expect(getThemePresetLabel("ko", "霜绯")).toBe("프로스트");
    expect(buildThemePresetOptions("en")[0]).toEqual({ label: "Tide", value: "tide" });
  });

  it("支持模板替换和页面 copy 读取", () => {
    expect(formatTemplate("Hello {name}", { name: "RemoteConn" })).toBe("Hello RemoteConn");
    expect(buildPageCopy("en", "connect").pageTitle).toBe("My Servers");
    expect(buildPageCopy("ja", "connect").pageTitle).toBe("サーバー一覧");
    expect(buildPageCopy("ko", "settings").navTitle).toBe("설정");
    expect(buildPageCopy("zh-Hans", "records").addButton).toBe("新增");
    expect(buildPageCopy("en", "records").newRecordHint).toBe("Type to autosave as a new note");
    expect(buildPageCopy("zh-Hans", "settings").hints.shellActivationDebugOutline).toContain("软键盘");
    expect(buildPageCopy("zh-Hans", "settings").fields.showVoiceInputButton).toBe("语音输入按钮");
    expect(t("ja", "bottomNav.backText")).toBe("戻る");
    expect(t("ko", "bottomNav.backText")).toBe("뒤로");
    expect(t("en", "bottomNav.backText")).toBe("Back");
  });

  it("会本地化服务器校验消息", () => {
    expect(localizeServerValidationMessage("en", "主机不能为空")).toBe("Host is required");
    expect(localizeServerValidationMessage("ja", "主机不能为空")).toBe("ホストは必須です");
    expect(localizeServerValidationMessage("ko", "跳板机端口需为 1-65535 的整数")).toBe(
      "점프 호스트 포트는 1~65535 사이 정수여야 합니다"
    );
    expect(localizeServerValidationMessage("zh-Hant", "SSH 端口需为 1-65535 的整数")).toBe(
      "SSH 埠需為 1-65535 的整數"
    );
  });

  it("界面语言选项保持稳定顺序", () => {
    expect(getUiLanguageOptions()).toEqual([
      { label: "简体中文", value: "zh-Hans" },
      { label: "繁體中文", value: "zh-Hant" },
      { label: "English", value: "en" },
      { label: "日本語", value: "ja" },
      { label: "한국어", value: "ko" }
    ]);
  });
});
