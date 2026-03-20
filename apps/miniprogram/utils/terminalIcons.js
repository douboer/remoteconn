/* global require, module */

const { toSvgDataUri } = require("./svgDataUri");
const { ICON_SVG_SOURCES } = require("./iconSvgSources");
const { tintSvgMarkup } = require("./themedIcons");

const DEFAULT_SHELL_ICON_COLOR = "#9CA9BF";
const DEFAULT_SHELL_ACTIVE_ICON_COLOR = "#5BD2FF";
const DEFAULT_SHELL_CTRL_C_HIGHLIGHT_COLOR = "#5BD2FF";
const CTRL_C_PRIMARY_SOURCE_COLOR = "#FFC16E";
const CTRL_C_HIGHLIGHT_SOURCE_COLOR = "#5BD2FF";
const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const TERMINAL_ICON_NAMES = Object.freeze([
  "backspace",
  "cancel",
  "clear",
  "clear-input",
  "codex",
  "ctrlc",
  "down",
  "enter",
  "esc",
  "home",
  "keyboard",
  "left",
  "paste",
  "reading",
  "record",
  "right",
  "sent",
  "shift",
  "stopreading",
  "tab",
  "up",
  "voice"
]);
const terminalIconCache = Object.create(null);
const terminalActiveIconCache = Object.create(null);

function normalizeShellColor(value, fallback) {
  const normalized = String(value || "")
    .trim()
    .toUpperCase();
  return HEX_COLOR_PATTERN.test(normalized) ? normalized : fallback;
}

function hexToRgb(value) {
  const normalized = normalizeShellColor(value, "#000000");
  return {
    r: parseInt(normalized.slice(1, 3), 16),
    g: parseInt(normalized.slice(3, 5), 16),
    b: parseInt(normalized.slice(5, 7), 16)
  };
}

function resolveRelativeLuminance(value) {
  const rgb = hexToRgb(value);
  const channelToLinear = (channel) => {
    const normalized = channel / 255;
    if (normalized <= 0.03928) {
      return normalized / 12.92;
    }
    return ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return channelToLinear(rgb.r) * 0.2126 + channelToLinear(rgb.g) * 0.7152 + channelToLinear(rgb.b) * 0.0722;
}

function contrastRatio(left, right) {
  const leftLuminance = resolveRelativeLuminance(left);
  const rightLuminance = resolveRelativeLuminance(right);
  const lighter = Math.max(leftLuminance, rightLuminance);
  const darker = Math.min(leftLuminance, rightLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

function toCamelIconName(name) {
  return String(name || "").replace(/-([a-zA-Z0-9])/g, (_, segment) => segment.toUpperCase());
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceSvgHexColor(svg, sourceColor, targetColor) {
  const source = normalizeShellColor(sourceColor, sourceColor);
  const target = normalizeShellColor(targetColor, targetColor);
  return String(svg || "").replace(
    new RegExp(`\\b(fill|stroke)="${escapeRegExp(source)}"`, "g"),
    (_match, attribute) => `${attribute}="${target}"`
  );
}

/**
 * `Ctrl+C` 图标本身是双段结构：
 * 1. `Ctrl` 保持终端工具色，继续跟随工具区主题；
 * 2. `C` 单独保留强调色，避免被统一着色后丢掉原始 SVG 的层次感。
 */
function tintTerminalToolSvgMarkup(name, svg, primaryColor, highlightColor) {
  if (name !== "ctrlc") {
    return tintSvgMarkup(svg, primaryColor);
  }
  const primaryTinted = replaceSvgHexColor(svg, CTRL_C_PRIMARY_SOURCE_COLOR, primaryColor);
  return replaceSvgHexColor(primaryTinted, CTRL_C_HIGHLIGHT_SOURCE_COLOR, highlightColor);
}

/**
 * 终端工具按钮有两组颜色：
 * 1. 常态沿用 shell accent，和终端工具区其余图标保持一致；
 * 2. 激活态切到 shell text，让 reading 图标在无外层底板时仍然足够醒目。
 */
function buildTerminalToolIconVariantMap(color, highlightColor, cache) {
  const cacheKey = `${normalizeShellColor(color, DEFAULT_SHELL_ICON_COLOR)}:${normalizeShellColor(
    highlightColor,
    DEFAULT_SHELL_CTRL_C_HIGHLIGHT_COLOR
  )}`;
  if (cache[cacheKey]) {
    return cache[cacheKey];
  }

  const normalizedColor = normalizeShellColor(color, DEFAULT_SHELL_ICON_COLOR);
  const normalizedHighlightColor = normalizeShellColor(
    highlightColor,
    DEFAULT_SHELL_CTRL_C_HIGHLIGHT_COLOR
  );
  const iconMap = {};
  TERMINAL_ICON_NAMES.forEach((name) => {
    const svg = ICON_SVG_SOURCES[name];
    if (!svg) return;
    const dataUri = toSvgDataUri(
      tintTerminalToolSvgMarkup(name, svg, normalizedColor, normalizedHighlightColor)
    );
    iconMap[name] = dataUri;
    const camelName = toCamelIconName(name);
    if (camelName !== name) {
      iconMap[camelName] = dataUri;
    }
  });
  cache[cacheKey] = iconMap;
  return iconMap;
}

/**
 * reading 激活态所在位置是终端页工具栏，而不是 shell 输出区。
 * 因此优先使用更醒目的 UI accent；若当前 accent 与页面背景太接近，
 * 再退回 shell 文本色，避免浅色模式下“已开启但看不清”。
 */
function resolveTerminalToolActiveColor(settings) {
  const source = settings && typeof settings === "object" ? settings : {};
  const toolbarBg = normalizeShellColor(source.uiBgColor, "#192B4D");
  const accentColor = normalizeShellColor(source.uiAccentColor, DEFAULT_SHELL_ACTIVE_ICON_COLOR);
  const shellTextColor = normalizeShellColor(source.shellTextColor, "#E6F0FF");
  const accentContrast = contrastRatio(toolbarBg, accentColor);
  const shellTextContrast = contrastRatio(toolbarBg, shellTextColor);
  if (accentContrast >= 3 || accentContrast >= shellTextContrast * 0.92) {
    return accentColor;
  }
  return shellTextColor;
}

function resolveTerminalToolCtrlCHighlightColor(settings) {
  const source = settings && typeof settings === "object" ? settings : {};
  return normalizeShellColor(source.uiAccentColor, DEFAULT_SHELL_CTRL_C_HIGHLIGHT_COLOR);
}

function buildTerminalToolIconMap(settings) {
  const source = settings && typeof settings === "object" ? settings : {};
  return buildTerminalToolIconVariantMap(
    normalizeShellColor(source.shellAccentColor, DEFAULT_SHELL_ICON_COLOR),
    resolveTerminalToolCtrlCHighlightColor(source),
    terminalIconCache
  );
}

function buildTerminalToolActiveIconMap(settings) {
  return buildTerminalToolIconVariantMap(
    resolveTerminalToolActiveColor(settings),
    resolveTerminalToolCtrlCHighlightColor(settings),
    terminalActiveIconCache
  );
}

module.exports = {
  buildTerminalToolActiveIconMap,
  buildTerminalToolIconMap
};
