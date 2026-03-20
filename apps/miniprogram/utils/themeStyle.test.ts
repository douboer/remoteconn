import { describe, expect, it } from "vitest";

const {
  DEFAULT_NAVIGATION_BAR_THEME,
  DEFAULT_SHELL_FONT_FAMILY,
  TERMINAL_SAFE_FONT_OPTIONS,
  buildThemeStyle,
  normalizeTerminalFontFamily,
  applyUiThemeSelection,
  applyShellThemeSelection,
  resolveNavigationBarTheme
} = require("./themeStyle.js");

describe("themeStyle terminal font safety", () => {
  it("保留已验证可用于终端 cell 网格的等宽字体", () => {
    TERMINAL_SAFE_FONT_OPTIONS.forEach((option: { value: string }) => {
      expect(normalizeTerminalFontFamily(option.value)).toBe(option.value);
    });
  });

  it("把比例字体或不安全字体回退到默认等宽字体", () => {
    expect(normalizeTerminalFontFamily('"PingFang SC", "Hiragino Sans GB", sans-serif')).toBe(
      DEFAULT_SHELL_FONT_FAMILY
    );
    expect(
      normalizeTerminalFontFamily(
        '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif'
      )
    ).toBe(DEFAULT_SHELL_FONT_FAMILY);
    expect(normalizeTerminalFontFamily('"Microsoft YaHei", "PingFang SC", sans-serif')).toBe(
      DEFAULT_SHELL_FONT_FAMILY
    );
    expect(normalizeTerminalFontFamily('"Noto Sans Mono CJK SC", "Noto Sans Mono", monospace')).toBe(
      DEFAULT_SHELL_FONT_FAMILY
    );
  });

  it("深色主题下原生导航栏使用深色背景和白色前景", () => {
    expect(resolveNavigationBarTheme({ uiBgColor: "#192b4d" })).toEqual({
      backgroundColor: "#192b4d",
      frontColor: "#ffffff"
    });
  });

  it("浅色主题下原生导航栏自动切换黑色前景", () => {
    expect(resolveNavigationBarTheme({ uiBgColor: "#f4f1de" })).toEqual({
      backgroundColor: "#f4f1de",
      frontColor: "#000000"
    });
  });

  it("缺省配置回退默认导航栏主题", () => {
    expect(resolveNavigationBarTheme({})).toEqual(DEFAULT_NAVIGATION_BAR_THEME);
  });

  it("UI 主题切换时按钮色按文档规则跟随主体联动", () => {
    expect(applyUiThemeSelection({ uiThemePreset: "tide", uiThemeMode: "dark" })).toMatchObject({
      uiBgColor: "#192b4d",
      uiTextColor: "#e6f0ff",
      uiAccentColor: "#5bd2ff",
      uiBtnColor: "#adb9cd"
    });
  });

  it("Shell 主题切换时强调色按文档规则从背景和前景推导", () => {
    expect(applyShellThemeSelection({ shellThemePreset: "tide", shellThemeMode: "dark" })).toMatchObject({
      shellBgColor: "#192b4d",
      shellTextColor: "#e6f0ff",
      shellAccentColor: "#9ca9bf"
    });
  });

  it("新增主题预设在小程序端也能输出与 Web 对齐的基色", () => {
    expect(applyUiThemeSelection({ uiThemePreset: "绛霓", uiThemeMode: "dark" })).toMatchObject({
      uiBgColor: "#3A0CA3",
      uiTextColor: "#4CC9F0",
      uiAccentColor: "#4895EF"
    });
    expect(applyShellThemeSelection({ shellThemePreset: "霜绯", shellThemeMode: "light" })).toMatchObject({
      shellBgColor: "#ECD7D8",
      shellTextColor: "#293B3B"
    });
  });

  it("展开键盘区背景跟随 shell 背景生成 80% 透明 token", () => {
    expect(buildThemeStyle({ shellBgColor: "#192b4d", shellTextColor: "#e6f0ff" })).toContain(
      "--terminal-touch-tools-bg:rgba(25, 43, 77, 0.8)"
    );
  });

  it("about 页面派生色板跟随当前界面主题输出", () => {
    const style = buildThemeStyle({
      uiBgColor: "#102030",
      uiTextColor: "#E0F0FF",
      uiAccentColor: "#55CCFF",
      uiBtnColor: "#88AACC"
    });

    expect(style).toContain("--about-bg:#102030");
    expect(style).toContain("--about-text-strong:#E0F0FF");
    expect(style).toContain("--about-accent:#55CCFF");
    expect(style).toContain("--surface:");
    expect(style).toContain("--surface-border:");
    expect(style).toContain("--about-surface:");
  });
});
