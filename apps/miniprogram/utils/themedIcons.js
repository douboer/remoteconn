/* global require, module */

const { toSvgDataUri } = require("./svgDataUri");
const { ICON_SVG_SOURCES } = require("./iconSvgSources");

const DEFAULT_UI_BUTTON_COLOR = "#ADB9CD";
const DEFAULT_UI_ACCENT_COLOR = "#5BD2FF";
const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const BUTTON_ICON_NAMES = Object.freeze([
  "about",
  "add",
  "ai",
  "back",
  "cancel",
  "clear",
  "codex",
  "config",
  "connect",
  "copy",
  "create",
  "delete",
  "log",
  "plugins",
  "right",
  "recordmanager",
  "save",
  "search",
  "selectall",
  "share",
  "shell",
  "serverlist"
]);
const buttonIconCache = Object.create(null);
const activeButtonIconCache = Object.create(null);
const accentButtonIconCache = Object.create(null);

function normalizeThemeColor(value, fallback) {
  const normalized = String(value || "")
    .trim()
    .toUpperCase();
  return HEX_COLOR_PATTERN.test(normalized) ? normalized : fallback;
}

function toCamelIconName(name) {
  return String(name || "").replace(/-([a-zA-Z0-9])/g, (_, segment) => segment.toUpperCase());
}

/**
 * 按钮图标在 `image` 节点里渲染时，真正可见的是 SVG 自身的 fill/stroke。
 * 这里只替换十六进制色值，保留 `fill="none"`、opacity、规则属性等结构不变。
 */
function tintSvgMarkup(svg, color) {
  return String(svg || "").replace(
    /\b(fill|stroke)="#[0-9a-fA-F]{3,8}"/g,
    (_match, attribute) => `${attribute}="${color}"`
  );
}

function buildIconVariantMap(names, color, cache) {
  const cacheKey = normalizeThemeColor(color, DEFAULT_UI_BUTTON_COLOR);
  if (cache[cacheKey]) {
    return cache[cacheKey];
  }

  const iconMap = {};
  names.forEach((name) => {
    const source = ICON_SVG_SOURCES[name];
    if (!source) return;
    const dataUri = toSvgDataUri(tintSvgMarkup(source, cacheKey));
    iconMap[name] = dataUri;
    const camelName = toCamelIconName(name);
    if (camelName !== name) {
      iconMap[camelName] = dataUri;
    }
  });
  cache[cacheKey] = iconMap;
  return iconMap;
}

function buildButtonIconMap(settings) {
  const source = settings && typeof settings === "object" ? settings : {};
  return buildIconVariantMap(BUTTON_ICON_NAMES, source.uiBtnColor, buttonIconCache);
}

/**
 * 连接态按钮需要落在高饱和背景上：
 * 1. 图标本体改用界面前景色，避免继续沿用按钮灰而发闷；
 * 2. 目前只给 connect / shell 等“连接态按钮”消费，但实现保持通用，后续可复用。
 */
function buildActiveButtonIconMap(settings) {
  const source = settings && typeof settings === "object" ? settings : {};
  return buildIconVariantMap(BUTTON_ICON_NAMES, source.uiTextColor, activeButtonIconCache);
}

/**
 * 强调态按钮图标用于触摸反馈：
 * 1. 直接把 SVG 的 fill/stroke 换成强调色，避免只能靠背景变化；
 * 2. 优先使用 UI 强调色，没有时退回默认强调蓝。
 */
function buildAccentButtonIconMap(settings) {
  const source = settings && typeof settings === "object" ? settings : {};
  return buildIconVariantMap(
    BUTTON_ICON_NAMES,
    source.uiAccentColor || source.shellAccentColor || DEFAULT_UI_ACCENT_COLOR,
    accentButtonIconCache
  );
}

/**
 * 页面通常会同时消费常态 / 激活态 / 强调态三组按钮图标：
 * 1. 统一在这里聚合，避免每个页面各自重复构造；
 * 2. 返回值字段名直接对齐页面 data，便于 `setData` 复用。
 */
function buildButtonIconThemeMaps(settings) {
  return {
    icons: buildButtonIconMap(settings),
    activeIcons: buildActiveButtonIconMap(settings),
    accentIcons: buildAccentButtonIconMap(settings)
  };
}

function extractIconName(pathLike) {
  const raw = String(pathLike || "");
  const match = raw.match(/\/assets\/icons\/([a-zA-Z0-9-]+)\.svg/);
  return match ? match[1] : "";
}

function resolveButtonIcon(pathLike, iconMap) {
  const name = extractIconName(pathLike);
  if (!name) return pathLike;
  if (!iconMap) return pathLike;
  return iconMap[name] || iconMap[toCamelIconName(name)] || pathLike;
}

module.exports = {
  buildActiveButtonIconMap,
  buildAccentButtonIconMap,
  buildButtonIconMap,
  buildButtonIconThemeMaps,
  resolveButtonIcon,
  tintSvgMarkup
};
