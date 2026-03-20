import type { GlobalSettings, ThemePreset } from "@/types/app";
import { pickShellAccentColor } from "@remoteconn/shared";

const MIN_TERMINAL_BUFFER_MAX_ENTRIES = 200;
const MAX_TERMINAL_BUFFER_MAX_ENTRIES = 50_000;
const MIN_TERMINAL_BUFFER_MAX_BYTES = 64 * 1024;
const MAX_TERMINAL_BUFFER_MAX_BYTES = 64 * 1024 * 1024;
const UI_LANGUAGE_VALUES = new Set<GlobalSettings["uiLanguage"]>(["zh-Hans", "zh-Hant", "en", "ja", "ko"]);
const DEFAULT_SHELL_BG_COLOR = "#192b4d";
const DEFAULT_SHELL_TEXT_COLOR = "#e6f0ff";
export const DEFAULT_VOICE_RECORD_CATEGORY_FALLBACK = "未分类";
export const DEFAULT_VOICE_RECORD_CATEGORIES = ["未分类", "优化", "新需求", "问题", "灵感"] as const;
export const DEFAULT_VOICE_RECORD_DEFAULT_CATEGORY = "优化";

function normalizeInteger(value: number, fallback: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  const normalized = Math.round(value);
  if (normalized < min) {
    return min;
  }
  if (normalized > max) {
    return max;
  }
  return normalized;
}

/**
 * 界面语言归一化：
 * 1. Web 端当前只负责保真，不负责真正切语言；
 * 2. 仍需限制合法枚举，避免无效值在跨端同步中持续扩散。
 */
function normalizeUiLanguage(value: unknown): GlobalSettings["uiLanguage"] {
  const normalized = String(value ?? "").trim() as GlobalSettings["uiLanguage"];
  return UI_LANGUAGE_VALUES.has(normalized) ? normalized : "zh-Hans";
}

/**
 * 归一化闪念分类列表：
 * 1. 去空白、去重、保序；
 * 2. 强制保留“未分类”兜底项；
 * 3. 限制最多 10 项，避免配置面板无限增长。
 */
function normalizeVoiceRecordCategories(value: unknown): string[] {
  const source = Array.isArray(value) ? value : [];
  const seen = new Set<string>();
  const next: string[] = [];

  for (const entry of source) {
    const normalized = String(entry ?? "").trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    next.push(normalized);
    if (next.length >= 10) {
      break;
    }
  }

  if (!seen.has(DEFAULT_VOICE_RECORD_CATEGORY_FALLBACK)) {
    next.unshift(DEFAULT_VOICE_RECORD_CATEGORY_FALLBACK);
  }

  return next.slice(0, 10);
}

/**
 * 归一化默认闪念分类：
 * 1. 优先使用合法且存在于分类列表中的配置值；
 * 2. 否则回退到预设默认分类；
 * 3. 若预设默认分类不在列表中，则回退到分类列表首项。
 */
function normalizeVoiceRecordDefaultCategory(value: unknown, categories: string[]): string {
  const normalized = String(value ?? "").trim();
  if (normalized && categories.includes(normalized)) {
    return normalized;
  }
  if (categories.includes(DEFAULT_VOICE_RECORD_DEFAULT_CATEGORY)) {
    return DEFAULT_VOICE_RECORD_DEFAULT_CATEGORY;
  }
  return categories[0] ?? DEFAULT_VOICE_RECORD_CATEGORY_FALLBACK;
}

/**
 * 推导默认网关地址：
 * 1) 若显式配置了 VITE_GATEWAY_URL，优先使用；
 * 2) 浏览器环境下根据当前站点自动推导；
 * 3) 默认走同域 80/443（由反向代理承接）。
 */
function resolveDefaultGatewayUrl(): string {
  const envGateway = import.meta.env.VITE_GATEWAY_URL?.trim();
  if (envGateway) {
    return envGateway;
  }

  if (typeof window === "undefined") {
    return "ws://localhost:8787";
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const hostname = window.location.hostname;
  return `${protocol}//${hostname}`;
}

export const defaultSettings: GlobalSettings = {
  // ── UI 外观 ──────────────────────────────────────────────────────────────
  uiLanguage: "zh-Hans",
  uiThemePreset: "tide",
  uiThemeMode: "dark" as "dark" | "light",
  uiAccentColor: "#5bd2ff",
  uiBgColor: "#192b4d",
  uiTextColor: "#e6f0ff",
  uiBtnColor: "#adb9cd",

  // ── Shell 显示 ────────────────────────────────────────────────────────────
  shellThemePreset: "tide",
  shellThemeMode: "dark" as "dark" | "light",
  shellBgColor: DEFAULT_SHELL_BG_COLOR,
  shellTextColor: DEFAULT_SHELL_TEXT_COLOR,
  shellAccentColor: pickShellAccentColor(DEFAULT_SHELL_BG_COLOR, DEFAULT_SHELL_TEXT_COLOR),
  shellFontFamily: "JetBrains Mono",
  shellFontSize: 15,
  shellLineHeight: 1.4,
  unicode11: true,

  // ── 终端缓冲 ─────────────────────────────────────────────────────────────
  terminalBufferMaxEntries: 5000,
  terminalBufferMaxBytes: 4 * 1024 * 1024,

  // ── 连接策略 ─────────────────────────────────────────────────────────────
  autoReconnect: true,
  reconnectLimit: 3,
  hostKeyPolicy: "strict",
  credentialMemoryPolicy: "remember",
  gatewayConnectTimeoutMs: 12000,
  waitForConnectedTimeoutMs: 15000,

  // ── 服务器配置预填 ────────────────────────────────────────────────────────
  defaultAuthType: "password",
  defaultPort: 22,
  defaultProjectPath: "~/workspace",
  defaultTimeoutSeconds: 20,
  defaultHeartbeatSeconds: 15,
  defaultTransportMode: "gateway",

  // ── 日志 ─────────────────────────────────────────────────────────────────
  logRetentionDays: 30,
  maskSecrets: true,
  voiceRecordCategories: [...DEFAULT_VOICE_RECORD_CATEGORIES],
  voiceRecordDefaultCategory: DEFAULT_VOICE_RECORD_DEFAULT_CATEGORY
};

/**
 * 全局配置归一化：
 * - 为历史版本缺失字段补齐默认值；
 * - 将旧版废弃字段迁移到新域前缀字段（仅首次，不覆盖已有新字段）；
 * - 对终端缓冲阈值做边界收敛，避免 NaN/异常值导致缓冲策略失效。
 */
export function normalizeGlobalSettings(raw: Partial<GlobalSettings> | null | undefined): GlobalSettings {
  const r = raw ?? {};
  const merged: GlobalSettings = {
    ...defaultSettings,
    ...r
  };

  // ── 旧字段迁移（取旧值兜底，不覆盖已存在的新字段）────────────────────────
  // fontFamily → shellFontFamily
  if (!r.shellFontFamily && r.fontFamily) {
    merged.shellFontFamily = r.fontFamily;
  }
  // fontSize → shellFontSize
  if (!r.shellFontSize && r.fontSize !== undefined) {
    merged.shellFontSize = r.fontSize;
  }
  // lineHeight → shellLineHeight
  if (!r.shellLineHeight && r.lineHeight !== undefined) {
    merged.shellLineHeight = r.lineHeight;
  }
  // accentColor → uiAccentColor / shellAccentColor
  if (!r.uiAccentColor && r.accentColor) {
    merged.uiAccentColor = r.accentColor;
  }
  if (!r.shellAccentColor && r.accentColor) {
    merged.shellAccentColor = r.accentColor;
  }
  // bgColor → uiBgColor / shellBgColor
  if (!r.uiBgColor && r.bgColor) {
    merged.uiBgColor = r.bgColor;
  }
  if (!r.shellBgColor && r.bgColor) {
    merged.shellBgColor = r.bgColor;
  }
  // textColor → uiTextColor / shellTextColor
  if (!r.uiTextColor && r.textColor) {
    merged.uiTextColor = r.textColor;
  }
  if (!r.shellTextColor && r.textColor) {
    merged.shellTextColor = r.textColor;
  }
  // themePreset → uiThemePreset / shellThemePreset（仅映射合法值）
  const legacyThemeMap: Record<string, ThemePreset> = {
    tide: "tide",
    mint: "tide",    // mint 无对应新预设，兜底 tide
    sunrise: "焰岩"  // sunrise 映射到焰岩暖色系
  };
  if (!r.uiThemePreset && r.themePreset) {
    merged.uiThemePreset = legacyThemeMap[r.themePreset] ?? "tide";
  }
  if (!r.shellThemePreset && r.themePreset) {
    merged.shellThemePreset = legacyThemeMap[r.themePreset] ?? "tide";
  }
  // shellThemeMode 非法值兜底
  if (merged.shellThemeMode !== "dark" && merged.shellThemeMode !== "light") {
    merged.shellThemeMode = "dark";
  }
  // credentialMemoryPolicy: "session" → "forget"（旧枚举值 session 对应 forget）
  if ((merged.credentialMemoryPolicy as string) === "session") {
    merged.credentialMemoryPolicy = "forget";
  }
  // uiThemeMode 非法值兜底
  if (merged.uiThemeMode !== "dark" && merged.uiThemeMode !== "light") {
    merged.uiThemeMode = "dark";
  }
  merged.uiLanguage = normalizeUiLanguage(merged.uiLanguage);

  // ── 数值边界收敛 ─────────────────────────────────────────────────────────
  merged.terminalBufferMaxEntries = normalizeInteger(
    merged.terminalBufferMaxEntries,
    defaultSettings.terminalBufferMaxEntries,
    MIN_TERMINAL_BUFFER_MAX_ENTRIES,
    MAX_TERMINAL_BUFFER_MAX_ENTRIES
  );
  merged.terminalBufferMaxBytes = normalizeInteger(
    merged.terminalBufferMaxBytes,
    defaultSettings.terminalBufferMaxBytes,
    MIN_TERMINAL_BUFFER_MAX_BYTES,
    MAX_TERMINAL_BUFFER_MAX_BYTES
  );

  merged.voiceRecordCategories = normalizeVoiceRecordCategories(merged.voiceRecordCategories);
  merged.voiceRecordDefaultCategory = normalizeVoiceRecordDefaultCategory(
    merged.voiceRecordDefaultCategory,
    merged.voiceRecordCategories
  );

  return merged;
}

/**
 * 根据设置推导 gatewayUrl（运行时，不持久化到用户设置）。
 * 优先级：构建时 VITE_GATEWAY_URL > 旧版持久化数据残留 > 自动推导同域地址。
 */
export function resolveGatewayUrl(settings?: Pick<GlobalSettings, "gatewayUrl">): string {
  // 兼容旧版持久化数据中残留的 gatewayUrl 字段
  if (settings?.gatewayUrl) {
    return settings.gatewayUrl;
  }
  return resolveDefaultGatewayUrl();
}

/**
 * 根据设置推导 gatewayToken（运行时，不持久化到用户设置）。
 * 优先级：构建时 VITE_GATEWAY_TOKEN > 旧版持久化数据残留 > 开发占位符。
 */
export function resolveGatewayToken(settings?: Pick<GlobalSettings, "gatewayToken">): string {
  const envToken = import.meta.env.VITE_GATEWAY_TOKEN?.trim();
  if (envToken) {
    return envToken;
  }
  // 兼容旧版持久化数据中残留的 gatewayToken 字段
  if (settings?.gatewayToken) {
    return settings.gatewayToken;
  }
  return "remoteconn-dev-token";
}
