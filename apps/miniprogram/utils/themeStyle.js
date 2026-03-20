/* global module, wx */

/**
 * 小程序主题预设与 shared/Web 保持同一套内部值和顺序：
 * 1. 这里保留运行时可直接消费的扁平对象，避免小程序侧额外依赖 TS 共享模块；
 * 2. 若 shared 新增主题，这里也要同步补齐，保证多端主题配置可互通；
 * 3. shell cursor 仍按当前小程序规则实时推导，因此这里只保留 bg/text 基色。
 */
const THEME_PRESETS = {
  tide: {
    dark: { bg: "#192b4d", text: "#e6f0ff", accent: "#5bd2ff" },
    light: { bg: "#e6f0ff", text: "#192b4d", accent: "#3D86FF" },
    shellDark: { bg: "#192b4d", text: "#e6f0ff", cursor: "#5bd2ff" },
    shellLight: { bg: "#e6f0ff", text: "#192b4d", cursor: "#3D86FF" }
  },
  暮砂: {
    dark: { bg: "#3D405B", text: "#F4F1DE", accent: "#81B29A" },
    light: { bg: "#F4F1DE", text: "#3D405B", accent: "#E07A5F" },
    shellDark: { bg: "#3D405B", text: "#F4F1DE", cursor: "#81B29A" },
    shellLight: { bg: "#F4F1DE", text: "#3D405B", cursor: "#E07A5F" }
  },
  霓潮: {
    dark: { bg: "#073B4C", text: "#FFD166", accent: "#06D6A0" },
    light: { bg: "#FFD166", text: "#073B4C", accent: "#EF476F" },
    shellDark: { bg: "#073B4C", text: "#FFD166", cursor: "#06D6A0" },
    shellLight: { bg: "#FFD166", text: "#073B4C", cursor: "#EF476F" }
  },
  苔暮: {
    dark: { bg: "#282C75", text: "#A8B868", accent: "#7A71E4" },
    light: { bg: "#A8B868", text: "#282C75", accent: "#4E4CC3" },
    shellDark: { bg: "#282C75", text: "#A8B868", cursor: "#7A71E4" },
    shellLight: { bg: "#A8B868", text: "#282C75", cursor: "#4E4CC3" }
  },
  焰岩: {
    dark: { bg: "#0F4C5C", text: "#FB8B24", accent: "#E36414" },
    light: { bg: "#FB8B24", text: "#0F4C5C", accent: "#CB4721" },
    shellDark: { bg: "#0F4C5C", text: "#FB8B24", cursor: "#E36414" },
    shellLight: { bg: "#FB8B24", text: "#0F4C5C", cursor: "#CB4721" }
  },
  岩陶: {
    dark: { bg: "#283D3B", text: "#EDDDD4", accent: "#E9B5AF" },
    light: { bg: "#EDDDD4", text: "#283D3B", accent: "#D99185" },
    shellDark: { bg: "#283D3B", text: "#EDDDD4", cursor: "#E9B5AF" },
    shellLight: { bg: "#EDDDD4", text: "#283D3B", cursor: "#D99185" }
  },
  靛雾: {
    dark: { bg: "#292281", text: "#F1F0CD", accent: "#9D96BA" },
    light: { bg: "#F1F0CD", text: "#292281", accent: "#4A3BA6" },
    shellDark: { bg: "#292281", text: "#F1F0CD", cursor: "#9D96BA" },
    shellLight: { bg: "#F1F0CD", text: "#292281", cursor: "#4A3BA6" }
  },
  绛霓: {
    dark: { bg: "#3A0CA3", text: "#4CC9F0", accent: "#4895EF" },
    light: { bg: "#4CC9F0", text: "#3A0CA3", accent: "#F72585" },
    shellDark: { bg: "#3A0CA3", text: "#4CC9F0", cursor: "#4895EF" },
    shellLight: { bg: "#4CC9F0", text: "#3A0CA3", cursor: "#F72585" }
  },
  玫蓝: {
    dark: { bg: "#3D1F94", text: "#629FEB", accent: "#D06A79" },
    light: { bg: "#629FEB", text: "#3D1F94", accent: "#D06A79" },
    shellDark: { bg: "#3D1F94", text: "#629FEB", cursor: "#567BE3" },
    shellLight: { bg: "#629FEB", text: "#3D1F94", cursor: "#D06A79" }
  },
  珊湾: {
    dark: { bg: "#37615B", text: "#52DFDD", accent: "#EC5B57" },
    light: { bg: "#52DFDD", text: "#37615B", accent: "#EC5B57" },
    shellDark: { bg: "#37615B", text: "#52DFDD", cursor: "#44B0AB" },
    shellLight: { bg: "#52DFDD", text: "#37615B", cursor: "#EC5B57" }
  },
  苔荧: {
    dark: { bg: "#252157", text: "#D1D942", accent: "#99A32C" },
    light: { bg: "#D1D942", text: "#252157", accent: "#909636" },
    shellDark: { bg: "#252157", text: "#D1D942", cursor: "#C2CB37" },
    shellLight: { bg: "#D1D942", text: "#252157", cursor: "#909636" }
  },
  铜暮: {
    dark: { bg: "#1A375A", text: "#E6B030", accent: "#B27225" },
    light: { bg: "#E6B030", text: "#1A375A", accent: "#B27225" },
    shellDark: { bg: "#1A375A", text: "#E6B030", cursor: "#D99F27" },
    shellLight: { bg: "#E6B030", text: "#1A375A", cursor: "#B27225" }
  },
  炽潮: {
    dark: { bg: "#125554", text: "#F55054", accent: "#C43133" },
    light: { bg: "#F55054", text: "#125554", accent: "#AA3E40" },
    shellDark: { bg: "#125554", text: "#F55054", cursor: "#E94347" },
    shellLight: { bg: "#F55054", text: "#125554", cursor: "#AA3E40" }
  },
  藕夜: {
    dark: { bg: "#322F4F", text: "#DBDD85", accent: "#554C93" },
    light: { bg: "#DBDD85", text: "#322F4F", accent: "#D5DB74" },
    shellDark: { bg: "#322F4F", text: "#DBDD85", cursor: "#C8CF67" },
    shellLight: { bg: "#DBDD85", text: "#322F4F", cursor: "#554C93" }
  },
  沙海: {
    dark: { bg: "#2B3B51", text: "#E2D075", accent: "#3F7690" },
    light: { bg: "#E2D075", text: "#2B3B51", accent: "#355971" },
    shellDark: { bg: "#2B3B51", text: "#E2D075", cursor: "#DBAA5F" },
    shellLight: { bg: "#E2D075", text: "#2B3B51", cursor: "#3F7690" }
  },
  珀岚: {
    dark: { bg: "#274D4C", text: "#E79094", accent: "#2F9595" },
    light: { bg: "#E79094", text: "#274D4C", accent: "#2B7171" },
    shellDark: { bg: "#274D4C", text: "#E79094", cursor: "#EC7578" },
    shellLight: { bg: "#E79094", text: "#274D4C", cursor: "#2F9595" }
  },
  炫虹: {
    dark: { bg: "#8338EC", text: "#FFBE0B", accent: "#FF006E" },
    light: { bg: "#FFBE0B", text: "#8338EC", accent: "#FD2B3B" },
    shellDark: { bg: "#8338EC", text: "#FFBE0B", cursor: "#3A86FF" },
    shellLight: { bg: "#FFBE0B", text: "#8338EC", cursor: "#FF006E" }
  },
  鎏霓: {
    dark: { bg: "#7550D5", text: "#F3D321", accent: "#A2529A" },
    light: { bg: "#F3D321", text: "#7550D5", accent: "#D67039" },
    shellDark: { bg: "#7550D5", text: "#F3D321", cursor: "#476CEF" },
    shellLight: { bg: "#F3D321", text: "#7550D5", cursor: "#A2529A" }
  },
  珊汐: {
    dark: { bg: "#7F9E96", text: "#FB5860", accent: "#3DCAC5" },
    light: { bg: "#FB5860", text: "#7F9E96", accent: "#F2292C" },
    shellDark: { bg: "#7F9E96", text: "#FB5860", cursor: "#3DCAC5" },
    shellLight: { bg: "#FB5860", text: "#7F9E96", cursor: "#F2292C" }
  },
  黛苔: {
    dark: { bg: "#2F2E3B", text: "#E7E8D6", accent: "#788031" },
    light: { bg: "#E7E8D6", text: "#2F2E3B", accent: "#788031" },
    shellDark: { bg: "#2F2E3B", text: "#E7E8D6", cursor: "#949D3A" },
    shellLight: { bg: "#E7E8D6", text: "#2F2E3B", cursor: "#788031" }
  },
  霜绯: {
    dark: { bg: "#293B3B", text: "#ECD7D8", accent: "#1D7575" },
    light: { bg: "#ECD7D8", text: "#293B3B", accent: "#993333" },
    shellDark: { bg: "#293B3B", text: "#ECD7D8", cursor: "#BD3C3D" },
    shellLight: { bg: "#ECD7D8", text: "#293B3B", cursor: "#993333" }
  }
};

const DEFAULT_UI = THEME_PRESETS.tide.dark;
const SHELL_ACCENT_BLEND_T = 0.64;
const DEFAULT_SHELL = {
  ...THEME_PRESETS.tide.shellDark,
  cursor: pickShellAccentColor(THEME_PRESETS.tide.shellDark.bg, THEME_PRESETS.tide.shellDark.text)
};
const DEFAULT_SHELL_FONT_FAMILY = 'JetBrains Mono, "SFMono-Regular", Menlo, monospace';
const DEFAULT_SHELL_FONT_SIZE = 15;
const DEFAULT_SHELL_LINE_HEIGHT = 1.4;
const DEFAULT_NAVIGATION_BAR_THEME = {
  backgroundColor: DEFAULT_UI.bg,
  frontColor: "#ffffff"
};
/**
 * 小程序终端当前采用“固定 cell 网格 + 自绘 caret”模型。
 * 因此这里只允许已验证度量稳定的终端字体；比例字体或中英文度量不稳定的字体
 * 会导致字间空隙拉大、光标横向偏移。
 */
const TERMINAL_SAFE_FONT_OPTIONS = [
  {
    label: "等宽默认",
    value: 'ui-monospace, "SFMono-Regular", Menlo, Consolas, "Liberation Mono", monospace'
  },
  {
    label: "JetBrains Mono",
    value: '"JetBrains Mono", "SFMono-Regular", Menlo, Consolas, monospace'
  },
  { label: "SF Mono", value: '"SFMono-Regular", Menlo, monospace' },
  { label: "Menlo", value: "Menlo, Monaco, monospace" },
  { label: "Monaco", value: "Monaco, Menlo, monospace" },
  { label: "Consolas", value: 'Consolas, "Courier New", monospace' },
  {
    label: "Roboto Mono",
    value: '"Roboto Mono", "SFMono-Regular", Menlo, Consolas, monospace'
  }
];
const TERMINAL_SAFE_FONT_VALUE_SET = new Set(
  TERMINAL_SAFE_FONT_OPTIONS.map((item) =>
    String(item.value || "")
      .trim()
      .toLowerCase()
  )
);

function clampChannel(value) {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 255) return 255;
  return Math.round(value);
}

function clampNumber(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < min) return min;
  if (parsed > max) return max;
  return parsed;
}

function sanitizeCssToken(value, fallback) {
  const raw = String(value == null ? "" : value)
    .replace(/[;\n\r]/g, " ")
    .trim();
  return raw || fallback;
}

function normalizeTerminalFontFamily(value) {
  const raw = sanitizeCssToken(value, DEFAULT_SHELL_FONT_FAMILY);
  return TERMINAL_SAFE_FONT_VALUE_SET.has(raw.toLowerCase()) ? raw : DEFAULT_SHELL_FONT_FAMILY;
}

function hexToRgb(hex) {
  const raw = String(hex || "").trim();
  const match = raw.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (!match) return null;
  const normalized =
    match[1].length === 3
      ? match[1]
          .split("")
          .map((ch) => ch + ch)
          .join("")
      : match[1];
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16)
  };
}

function rgbToHex(rgb) {
  const toHex = (value) => clampChannel(value).toString(16).padStart(2, "0");
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
}

function hexToRgba(hex, alpha, fallback) {
  const rgb = hexToRgb(hex);
  if (!rgb) return fallback;
  const normalizedAlpha = clampNumber(alpha, 0, 1, 1);
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${normalizedAlpha})`;
}

function mixHex(a, b, t) {
  const left = hexToRgb(a);
  const right = hexToRgb(b);
  if (!left || !right) return b;
  return rgbToHex({
    r: left.r + (right.r - left.r) * t,
    g: left.g + (right.g - left.g) * t,
    b: left.b + (right.b - left.b) * t
  });
}

function pickBtnColor(bg, text) {
  return mixHex(bg, text, 0.72);
}

/**
 * Shell 强调色与 Web/shared 规则保持一致：
 * 1. 不直接复用 UI accent，避免终端层级过亮；
 * 2. 在 shell 背景和前景之间取“中间偏前景”的颜色；
 * 3. 这样终端按钮、光标和状态提示可以跟随 shell 主体变化。
 */
function pickShellAccentColor(bg, text) {
  return mixHex(bg, text, SHELL_ACCENT_BLEND_T);
}

function resolveRelativeLuminance(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const channelToLinear = (value) => {
    const normalized = clampChannel(value) / 255;
    if (normalized <= 0.03928) {
      return normalized / 12.92;
    }
    return ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return channelToLinear(rgb.r) * 0.2126 + channelToLinear(rgb.g) * 0.7152 + channelToLinear(rgb.b) * 0.0722;
}

/**
 * 解析原生导航栏配色：
 * 1. backgroundColor 跟随当前 UI 背景色；
 * 2. frontColor 仅允许微信支持的 #ffffff / #000000，两者按背景亮度择优。
 */
function resolveNavigationBarTheme(settings) {
  const palette = resolveRuntimeTheme(settings);
  const luminance = resolveRelativeLuminance(palette.bg);
  return {
    backgroundColor: palette.bg,
    frontColor: luminance >= 0.42 ? "#000000" : "#ffffff"
  };
}

/**
 * 将当前主题同步到微信原生导航栏，解决“页面工具栏上方颜色锁定”的问题。
 * 调用失败时静默返回，避免在单测或非微信运行环境中抛错。
 */
function applyNavigationBarTheme(settings, wxLike) {
  const theme = resolveNavigationBarTheme(settings);
  const api = wxLike || (typeof wx !== "undefined" ? wx : null);
  if (!api || typeof api.setNavigationBarColor !== "function") {
    return theme;
  }
  try {
    api.setNavigationBarColor({
      frontColor: theme.frontColor,
      backgroundColor: theme.backgroundColor,
      animation: {
        duration: 0,
        timingFunc: "linear"
      }
    });
  } catch {
    return theme;
  }
  return theme;
}

function getPreset(preset) {
  const key = String(preset || "tide");
  return THEME_PRESETS[key] || THEME_PRESETS.tide;
}

function getUiThemeVariant(preset, mode) {
  const entry = getPreset(preset);
  return mode === "light" ? entry.light : entry.dark;
}

function getShellThemeVariant(preset, mode) {
  const entry = getPreset(preset);
  const variant = mode === "light" ? entry.shellLight : entry.shellDark;
  return {
    ...variant,
    cursor: pickShellAccentColor(variant.bg, variant.text)
  };
}

function applyUiThemeSelection(form) {
  const source = { ...(form || {}) };
  const mode = source.uiThemeMode === "light" ? "light" : "dark";
  const variant = getUiThemeVariant(source.uiThemePreset, mode);
  source.uiBgColor = variant.bg;
  source.uiTextColor = variant.text;
  source.uiAccentColor = variant.accent;
  source.uiBtnColor = pickBtnColor(variant.bg, variant.text);
  return source;
}

function applyShellThemeSelection(form) {
  const source = { ...(form || {}) };
  const mode = source.shellThemeMode === "light" ? "light" : "dark";
  const variant = getShellThemeVariant(source.shellThemePreset, mode);
  source.shellBgColor = variant.bg;
  source.shellTextColor = variant.text;
  source.shellAccentColor = pickShellAccentColor(variant.bg, variant.text);
  return source;
}

function resolveRuntimeTheme(settings) {
  const s = settings || {};
  const uiBg = s.uiBgColor || DEFAULT_UI.bg;
  const uiText = s.uiTextColor || DEFAULT_UI.text;
  const shellBg = s.shellBgColor || DEFAULT_SHELL.bg;
  const shellText = s.shellTextColor || DEFAULT_SHELL.text;
  return {
    bg: uiBg,
    text: uiText,
    accent: s.uiAccentColor || DEFAULT_UI.accent,
    btn: s.uiBtnColor || pickBtnColor(uiBg, uiText),
    shellBg,
    shellText,
    shellAccent: s.shellAccentColor || pickShellAccentColor(shellBg, shellText),
    shellFontFamily: normalizeTerminalFontFamily(s.shellFontFamily),
    shellFontSize: clampNumber(s.shellFontSize, 12, 22, DEFAULT_SHELL_FONT_SIZE),
    shellLineHeight: clampNumber(s.shellLineHeight, 1, 2, DEFAULT_SHELL_LINE_HEIGHT)
  };
}

function resolveButtonTokens(palette) {
  return {
    btnBorder: mixHex(palette.bg, palette.btn, 0.68),
    btnBorderStrong: mixHex(palette.bg, palette.btn, 0.84),
    btnBg: mixHex(palette.bg, palette.btn, 0.2),
    btnBgStrong: mixHex(palette.bg, palette.btn, 0.34),
    btnBgActive: mixHex(palette.bg, palette.btn, 0.26),
    btnText: mixHex(palette.text, palette.btn, 0.18),
    btnDangerBorder: mixHex(palette.bg, palette.accent, 0.8),
    btnDangerBg: mixHex(palette.bg, palette.accent, 0.22),
    chipBg: mixHex(palette.bg, palette.accent, 0.28),
    chipText: palette.text,
    accentDivider: hexToRgba(palette.accent, 0.6, "rgba(91, 210, 255, 0.6)"),
    switchOnBg: mixHex(palette.bg, palette.btn, 0.58),
    switchOffBg: mixHex(palette.bg, palette.text, 0.24),
    switchKnob: mixHex(palette.text, "#ffffff", 0.45),
    iconBtnBg: mixHex(palette.bg, palette.btn, 0.14),
    iconBtnBgStrong: mixHex(palette.bg, palette.btn, 0.24),
    accentBg: mixHex(palette.bg, palette.accent, 0.18),
    accentBgStrong: mixHex(palette.bg, palette.accent, 0.32),
    accentBorder: mixHex(palette.bg, palette.accent, 0.72),
    accentRing: hexToRgba(palette.accent, 0.22, "rgba(91, 210, 255, 0.22)"),
    accentShadow: hexToRgba(palette.accent, 0.28, "rgba(91, 210, 255, 0.28)"),
    shellBtnBg: mixHex(palette.shellBg, palette.shellAccent, 0.42),
    shellBtnText: mixHex(palette.shellText, palette.shellAccent, 0.5),
    shellAccentBg: mixHex(palette.shellBg, palette.shellAccent, 0.18),
    shellAccentBgStrong: mixHex(palette.shellBg, palette.shellAccent, 0.32),
    shellAccentBorder: mixHex(palette.shellBg, palette.shellAccent, 0.74),
    shellAccentRing: hexToRgba(palette.shellAccent, 0.24, "rgba(156, 169, 191, 0.24)"),
    shellAccentShadow: hexToRgba(palette.shellAccent, 0.3, "rgba(156, 169, 191, 0.3)"),
    terminalTouchToolsBg: hexToRgba(palette.shellBg, 0.8, "rgba(25, 43, 77, 0.8)")
  };
}

/**
 * 主界面卡片与 about 卡片共用同一套表面 token：
 * 1. 浅色模式下边框直接从当前 text 推导，避免继续沿用深色基线；
 * 2. 面板底色保持轻微前景混合，保证和页面背景拉开层次；
 * 3. 阴影也跟随当前强调色派生，后续其他页面可直接复用。
 */
function resolveSurfaceTokens(palette) {
  return {
    surface: mixHex(palette.bg, palette.text, 0.05),
    surfaceBorder: hexToRgba(palette.text, 0.18, "rgba(230, 240, 255, 0.18)"),
    surfaceShadow: hexToRgba(palette.accent, 0.18, "rgba(91, 210, 255, 0.18)")
  };
}

/**
 * About 页面虽然布局更自由，但配色仍应跟随“界面配置”：
 * 1. 面板底色从 bg/text 混合得到，避免再写死一套米白主题；
 * 2. 强调色继续复用当前 UI accent，保证切换主题后 about 也同步变；
 * 3. 背景光斑只作为氛围层，仍从当前主题色推导，不脱离主界面。
 */
function resolveAboutTokens(palette, buttonTokens, surfaceTokens) {
  return {
    bg: palette.bg,
    surface: surfaceTokens.surface,
    surfaceBorder: surfaceTokens.surfaceBorder,
    glow: surfaceTokens.surfaceShadow,
    textStrong: palette.text,
    text: mixHex(palette.bg, palette.text, 0.84),
    textMuted: mixHex(palette.bg, palette.text, 0.62),
    accent: palette.accent,
    accentSoft: hexToRgba(palette.accent, 0.22, "rgba(91, 210, 255, 0.22)"),
    accentLine: hexToRgba(palette.accent, 0.42, "rgba(91, 210, 255, 0.42)"),
    actionBg: buttonTokens.btnBgStrong,
    actionText: buttonTokens.btnText,
    actionBorder: buttonTokens.btnBorderStrong,
    orbLeftStart: palette.accent,
    orbLeftEnd: mixHex(palette.accent, palette.bg, 0.56),
    orbRightStart: mixHex(palette.btn, palette.bg, 0.34),
    orbRightEnd: mixHex(palette.text, palette.bg, 0.16)
  };
}

function buildThemeStyle(settings) {
  const palette = resolveRuntimeTheme(settings);
  const buttonTokens = resolveButtonTokens(palette);
  const surfaceTokens = resolveSurfaceTokens(palette);
  const aboutTokens = resolveAboutTokens(palette, buttonTokens, surfaceTokens);
  const muted = mixHex(palette.bg, palette.text, 0.58);
  return [
    `--bg:${palette.bg}`,
    `--text:${palette.text}`,
    `--accent:${palette.accent}`,
    `--btn:${palette.btn}`,
    `--muted:${muted}`,
    `--surface:${surfaceTokens.surface}`,
    `--surface-border:${surfaceTokens.surfaceBorder}`,
    `--surface-shadow:${surfaceTokens.surfaceShadow}`,
    `--shell-bg:${palette.shellBg}`,
    `--shell-text:${palette.shellText}`,
    `--shell-accent:${palette.shellAccent}`,
    `--shell-font-family:${palette.shellFontFamily}`,
    `--shell-font-size:${palette.shellFontSize}px`,
    `--shell-line-height:${palette.shellLineHeight}`,
    `--btn-border:${buttonTokens.btnBorder}`,
    `--btn-border-strong:${buttonTokens.btnBorderStrong}`,
    `--btn-bg:${buttonTokens.btnBg}`,
    `--btn-bg-strong:${buttonTokens.btnBgStrong}`,
    `--btn-bg-active:${buttonTokens.btnBgActive}`,
    `--btn-text:${buttonTokens.btnText}`,
    `--btn-danger-border:${buttonTokens.btnDangerBorder}`,
    `--btn-danger-bg:${buttonTokens.btnDangerBg}`,
    `--chip-bg:${buttonTokens.chipBg}`,
    `--chip-text:${buttonTokens.chipText}`,
    `--accent-divider:${buttonTokens.accentDivider}`,
    `--switch-on-bg:${buttonTokens.switchOnBg}`,
    `--switch-off-bg:${buttonTokens.switchOffBg}`,
    `--switch-knob:${buttonTokens.switchKnob}`,
    `--icon-btn-bg:${buttonTokens.iconBtnBg}`,
    `--icon-btn-bg-strong:${buttonTokens.iconBtnBgStrong}`,
    `--accent-bg:${buttonTokens.accentBg}`,
    `--accent-bg-strong:${buttonTokens.accentBgStrong}`,
    `--accent-border:${buttonTokens.accentBorder}`,
    `--accent-ring:${buttonTokens.accentRing}`,
    `--accent-shadow:${buttonTokens.accentShadow}`,
    `--about-bg:${aboutTokens.bg}`,
    `--about-surface:${aboutTokens.surface}`,
    `--about-surface-border:${aboutTokens.surfaceBorder}`,
    `--about-glow:${aboutTokens.glow}`,
    `--about-text-strong:${aboutTokens.textStrong}`,
    `--about-text:${aboutTokens.text}`,
    `--about-text-muted:${aboutTokens.textMuted}`,
    `--about-accent:${aboutTokens.accent}`,
    `--about-accent-soft:${aboutTokens.accentSoft}`,
    `--about-accent-line:${aboutTokens.accentLine}`,
    `--about-action-bg:${aboutTokens.actionBg}`,
    `--about-action-text:${aboutTokens.actionText}`,
    `--about-action-border:${aboutTokens.actionBorder}`,
    `--about-orb-left-start:${aboutTokens.orbLeftStart}`,
    `--about-orb-left-end:${aboutTokens.orbLeftEnd}`,
    `--about-orb-right-start:${aboutTokens.orbRightStart}`,
    `--about-orb-right-end:${aboutTokens.orbRightEnd}`,
    `--shell-btn-bg:${buttonTokens.shellBtnBg}`,
    `--shell-btn-text:${buttonTokens.shellBtnText}`,
    `--shell-accent-bg:${buttonTokens.shellAccentBg}`,
    `--shell-accent-bg-strong:${buttonTokens.shellAccentBgStrong}`,
    `--shell-accent-border:${buttonTokens.shellAccentBorder}`,
    `--shell-accent-ring:${buttonTokens.shellAccentRing}`,
    `--shell-accent-shadow:${buttonTokens.shellAccentShadow}`,
    `--terminal-touch-tools-bg:${buttonTokens.terminalTouchToolsBg}`
  ].join(";");
}

module.exports = {
  buildThemeStyle,
  applyUiThemeSelection,
  applyShellThemeSelection,
  pickBtnColor,
  pickShellAccentColor,
  resolveNavigationBarTheme,
  applyNavigationBarTheme,
  DEFAULT_NAVIGATION_BAR_THEME,
  DEFAULT_SHELL_FONT_FAMILY,
  TERMINAL_SAFE_FONT_OPTIONS,
  normalizeTerminalFontFamily
};
