import { describe, expect, it } from "vitest";
import { defaultSettings, normalizeGlobalSettings, resolveGatewayUrl, resolveGatewayToken } from "./defaults";

describe("default settings", () => {
  it("包含 UI/Shell 域前缀字段、终端缓冲阈值", () => {
    expect(defaultSettings.uiLanguage).toBe("zh-Hans");
    expect(defaultSettings.uiBgColor.length).toBeGreaterThan(0);
    expect(defaultSettings.uiAccentColor.length).toBeGreaterThan(0);
    expect(defaultSettings.shellFontFamily.length).toBeGreaterThan(0);
    expect(["dark", "light"]).toContain(defaultSettings.shellThemeMode);
    expect(defaultSettings.shellFontSize).toBeGreaterThanOrEqual(12);
    expect(defaultSettings.terminalBufferMaxBytes).toBeGreaterThan(0);
    expect(defaultSettings.terminalBufferMaxEntries).toBeGreaterThan(0);
    expect(defaultSettings.autoReconnect).toBe(true);
    expect(defaultSettings.voiceRecordCategories.length).toBeGreaterThan(0);
    expect(defaultSettings.voiceRecordDefaultCategory.length).toBeGreaterThan(0);
  });

  it("resolveGatewayUrl 返回非空字符串", () => {
    expect(resolveGatewayUrl().length).toBeGreaterThan(0);
  });

  it("resolveGatewayToken 返回非空字符串", () => {
    expect(resolveGatewayToken().length).toBeGreaterThan(0);
  });

  it("可将旧版 fontFamily 迁移到 shellFontFamily", () => {
    const normalized = normalizeGlobalSettings({
      fontFamily: "Menlo",
      terminalBufferMaxBytes: Number.NaN,
      terminalBufferMaxEntries: 1
    });
    expect(normalized.shellFontFamily).toBe("Menlo");
    expect(normalized.terminalBufferMaxBytes).toBe(defaultSettings.terminalBufferMaxBytes);
    expect(normalized.terminalBufferMaxEntries).toBeGreaterThanOrEqual(200);
  });

  it("可将旧版颜色字段迁移到域前缀字段", () => {
    const normalized = normalizeGlobalSettings({
      bgColor: "#112233",
      textColor: "#aabbcc",
      accentColor: "#ff0000"
    });
    expect(normalized.uiBgColor).toBe("#112233");
    expect(normalized.shellBgColor).toBe("#112233");
    expect(normalized.uiTextColor).toBe("#aabbcc");
    expect(normalized.shellTextColor).toBe("#aabbcc");
    expect(normalized.uiAccentColor).toBe("#ff0000");
    expect(normalized.shellAccentColor).toBe("#ff0000");
  });

  it("可将旧版 credentialMemoryPolicy=session 迁移到 forget", () => {
    const normalized = normalizeGlobalSettings({
      credentialMemoryPolicy: "session" as "remember"
    });
    expect(normalized.credentialMemoryPolicy).toBe("forget");
  });

  it("可将旧版 themePreset 映射到新 ThemePreset", () => {
    const normalized = normalizeGlobalSettings({ themePreset: "sunrise" });
    expect(normalized.uiThemePreset).toBe("焰岩");
    expect(normalized.shellThemePreset).toBe("焰岩");
  });

  it("shellThemeMode 非法值会回退到 dark", () => {
    const normalized = normalizeGlobalSettings({ shellThemeMode: "invalid" as "dark" });
    expect(normalized.shellThemeMode).toBe("dark");
  });

  it("会归一化闪念分类并保证默认分类有效", () => {
    const normalized = normalizeGlobalSettings({
      voiceRecordCategories: ["", "问题", "问题", "灵感"],
      voiceRecordDefaultCategory: "不存在"
    });
    expect(normalized.voiceRecordCategories).toEqual(["未分类", "问题", "灵感"]);
    expect(normalized.voiceRecordDefaultCategory).toBe("未分类");
  });

  it("会保留合法的新界面语言并拦截非法值", () => {
    expect(normalizeGlobalSettings({ uiLanguage: "ja" }).uiLanguage).toBe("ja");
    expect(normalizeGlobalSettings({ uiLanguage: "ko" }).uiLanguage).toBe("ko");
    expect(normalizeGlobalSettings({ uiLanguage: "invalid" as "ja" }).uiLanguage).toBe("zh-Hans");
  });
});
