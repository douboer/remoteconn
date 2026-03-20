/* global Page, wx, require, getCurrentPages, clearTimeout, setTimeout, console */

const {
  getSettings,
  saveSettings,
  DEFAULT_VOICE_RECORD_CATEGORY_FALLBACK,
  DEFAULT_TERMINAL_BUFFER_SNAPSHOT_MAX_LINES,
  MIN_TERMINAL_BUFFER_SNAPSHOT_MAX_LINES,
  MAX_TERMINAL_BUFFER_SNAPSHOT_MAX_LINES,
  normalizeVoiceRecordCategories,
  normalizeVoiceRecordDefaultCategory
} = require("../../utils/storage");
const {
  DEFAULT_TERMINAL_RESUME_MINUTES,
  MIN_TERMINAL_RESUME_MINUTES,
  MAX_TERMINAL_RESUME_MINUTES
} = require("../../utils/terminalSessionState");
const {
  DEFAULT_TTS_SPEAKABLE_MAX_CHARS,
  MIN_TTS_SPEAKABLE_MAX_CHARS,
  MAX_TTS_SPEAKABLE_MAX_CHARS,
  DEFAULT_TTS_SEGMENT_MAX_CHARS,
  MIN_TTS_SEGMENT_MAX_CHARS,
  MAX_TTS_SEGMENT_MAX_CHARS
} = require("../../utils/ttsSettings");
const {
  buildThemeStyle,
  applyNavigationBarTheme,
  applyUiThemeSelection,
  applyShellThemeSelection,
  pickBtnColor,
  pickShellAccentColor,
  TERMINAL_SAFE_FONT_OPTIONS,
  normalizeTerminalFontFamily
} = require("../../utils/themeStyle");
const { getRuntimeFingerprint } = require("../../utils/systemInfoCompat");
const {
  buildAiCodexSandboxOptions,
  buildAiCopilotPermissionOptions,
  buildAiProviderOptions,
  buildPageCopy,
  buildSettingsAuthTypeOptions,
  buildSettingsTabs,
  buildThemeModeOptions,
  buildThemePresetOptions,
  formatTemplate,
  getUiLanguageOptions,
  normalizeUiLanguage,
  t
} = require("../../utils/i18n");
const {
  normalizeAiProvider,
  normalizeCodexSandboxMode,
  normalizeCopilotPermissionMode
} = require("../../utils/aiLaunch");
const { emitLocaleChange } = require("../../utils/localeBus");

const SETTINGS_UI_STATE_KEY = "remoteconn.settings.uiState.v1";

const NUMBER_RULES = {
  reconnectLimit: { fallback: 3, min: 0, max: 10, integer: true },
  backgroundSessionKeepAliveMinutes: {
    fallback: DEFAULT_TERMINAL_RESUME_MINUTES,
    min: MIN_TERMINAL_RESUME_MINUTES,
    max: MAX_TERMINAL_RESUME_MINUTES,
    integer: true
  },
  defaultPort: { fallback: 22, min: 1, max: 65535, integer: true },
  defaultTimeoutSeconds: { fallback: 20, min: 5, max: 600, integer: true },
  defaultHeartbeatSeconds: { fallback: 15, min: 5, max: 600, integer: true },
  shellFontSize: { fallback: 15, min: 12, max: 22, integer: true },
  shellLineHeight: { fallback: 1.4, min: 1, max: 2, integer: false },
  ttsSpeakableMaxChars: {
    fallback: DEFAULT_TTS_SPEAKABLE_MAX_CHARS,
    min: MIN_TTS_SPEAKABLE_MAX_CHARS,
    max: MAX_TTS_SPEAKABLE_MAX_CHARS,
    integer: true
  },
  ttsSegmentMaxChars: {
    fallback: DEFAULT_TTS_SEGMENT_MAX_CHARS,
    min: MIN_TTS_SEGMENT_MAX_CHARS,
    max: MAX_TTS_SEGMENT_MAX_CHARS,
    integer: true
  },
  shellBufferMaxEntries: { fallback: 5000, min: 100, max: 200000, integer: true },
  shellBufferMaxBytes: { fallback: 4 * 1024 * 1024, min: 1024, max: 50 * 1024 * 1024, integer: true },
  shellBufferSnapshotMaxLines: {
    fallback: DEFAULT_TERMINAL_BUFFER_SNAPSHOT_MAX_LINES,
    min: MIN_TERMINAL_BUFFER_SNAPSHOT_MAX_LINES,
    max: MAX_TERMINAL_BUFFER_SNAPSHOT_MAX_LINES,
    integer: true
  },
  logRetentionDays: { fallback: 30, min: 1, max: 365, integer: true }
};

const DEFAULT_AUTH_TYPE_OPTIONS = buildSettingsAuthTypeOptions("zh-Hans");
const DEFAULT_AI_PROVIDER_OPTIONS = buildAiProviderOptions("zh-Hans");
const DEFAULT_AI_CODEX_SANDBOX_OPTIONS = buildAiCodexSandboxOptions("zh-Hans");
const DEFAULT_AI_COPILOT_PERMISSION_OPTIONS = buildAiCopilotPermissionOptions("zh-Hans");
const THEME_MODE_OPTIONS = buildThemeModeOptions("zh-Hans");
const UI_LANGUAGE_OPTIONS = getUiLanguageOptions();
const UI_THEME_PRESET_OPTIONS = buildThemePresetOptions("zh-Hans");
const SHELL_THEME_PRESET_OPTIONS = UI_THEME_PRESET_OPTIONS;
const MAX_SHELL_FONT_OPTIONS = 12;
/**
 * 设置页启动时不能因为字体配置模块返回异常而整页崩掉。
 * 这里保留一层兜底：
 * 1. 优先使用 themeStyle 导出的安全字体列表；
 * 2. 若导出值异常，则退回最小可用的等宽字体集合；
 * 3. 至少保证设置页能打开并继续保存其他配置。
 */
const SETTINGS_FALLBACK_FONT_OPTIONS = [
  {
    label: "等宽默认",
    value: 'ui-monospace, "SFMono-Regular", Menlo, Consolas, "Liberation Mono", monospace'
  },
  {
    label: "JetBrains Mono",
    value: '"JetBrains Mono", "SFMono-Regular", Menlo, Consolas, monospace'
  }
];
const UNIVERSAL_SHELL_FONT_OPTIONS =
  Array.isArray(TERMINAL_SAFE_FONT_OPTIONS) && TERMINAL_SAFE_FONT_OPTIONS.length > 0
    ? TERMINAL_SAFE_FONT_OPTIONS
    : SETTINGS_FALLBACK_FONT_OPTIONS;
if (UNIVERSAL_SHELL_FONT_OPTIONS === SETTINGS_FALLBACK_FONT_OPTIONS) {
  console.warn("[settings.font_options] terminal safe font options unavailable, fallback applied");
}
const SHELL_FONT_OPTION_LOOKUP = UNIVERSAL_SHELL_FONT_OPTIONS.reduce((acc, item) => {
  acc[item.label] = item;
  return acc;
}, {});
const SHELL_FONT_VALUE_LABEL_LOOKUP = UNIVERSAL_SHELL_FONT_OPTIONS.reduce((acc, item) => {
  const key = String(item.value || "")
    .trim()
    .toLowerCase();
  if (key) acc[key] = String(item.label || item.value);
  return acc;
}, {});
const PLATFORM_FONT_PRIORITY = {
  ios: ["SF Mono", "Menlo", "等宽默认", "JetBrains Mono"],
  android: ["Roboto Mono", "JetBrains Mono", "等宽默认"],
  windows: ["Consolas", "JetBrains Mono", "等宽默认"],
  mac: ["SF Mono", "Menlo", "Monaco", "JetBrains Mono", "等宽默认"],
  linux: ["JetBrains Mono", "Consolas", "Roboto Mono", "等宽默认"],
  common: ["JetBrains Mono", "等宽默认", "Consolas"]
};

const HEX_COLOR_REGEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const BASE_COLOR_VALUES = [
  "#192b4d",
  "#e6f0ff",
  "#5bd2ff",
  "#adb9cd",
  "#9ca9bf",
  "#3d86ff",
  "#3d405b",
  "#f4f1de",
  "#81b29a",
  "#e07a5f",
  "#073b4c",
  "#ffd166",
  "#06d6a0",
  "#ef476f",
  "#282c75",
  "#a8b868",
  "#7a71e4",
  "#4e4cc3",
  "#0f4c5c",
  "#fb8b24",
  "#e36414",
  "#cb4721",
  "#283d3b",
  "#edddd4",
  "#e9b5af",
  "#d99185",
  "#292281",
  "#f1f0cd",
  "#9d96ba",
  "#4a3ba6"
];
const DEFAULT_UI_ACCENT_COLOR = "#5bd2ff";
const DEFAULT_UI_BG_COLOR = "#192b4d";
const DEFAULT_UI_TEXT_COLOR = "#e6f0ff";
const DEFAULT_UI_BTN_COLOR = pickBtnColor(DEFAULT_UI_BG_COLOR, DEFAULT_UI_TEXT_COLOR);
const DEFAULT_SHELL_BG_COLOR = "#192b4d";
const DEFAULT_SHELL_TEXT_COLOR = "#e6f0ff";
const DEFAULT_SHELL_ACCENT_COLOR = pickShellAccentColor(DEFAULT_SHELL_BG_COLOR, DEFAULT_SHELL_TEXT_COLOR);
const COLOR_FIELD_KEYS = new Set([
  "uiAccentColor",
  "uiBgColor",
  "uiTextColor",
  "uiBtnColor",
  "shellBgColor",
  "shellTextColor",
  "shellAccentColor"
]);

function buildColorPaletteOptions() {
  const values = new Set(BASE_COLOR_VALUES.map((item) => item.toLowerCase()));
  UI_THEME_PRESET_OPTIONS.forEach((preset) => {
    ["dark", "light"].forEach((mode) => {
      const ui = applyUiThemeSelection({ uiThemePreset: preset.value, uiThemeMode: mode });
      const shell = applyShellThemeSelection({ shellThemePreset: preset.value, shellThemeMode: mode });
      [ui.uiAccentColor, ui.uiBgColor, ui.uiTextColor, ui.uiBtnColor].forEach((color) => {
        const value = String(color || "").toLowerCase();
        if (HEX_COLOR_REGEX.test(value)) values.add(value);
      });
      [shell.shellBgColor, shell.shellTextColor, shell.shellAccentColor].forEach((color) => {
        const value = String(color || "").toLowerCase();
        if (HEX_COLOR_REGEX.test(value)) values.add(value);
      });
    });
  });
  return [...values].map((value, index) => ({
    label: `色板 ${String(index + 1).padStart(2, "0")}`,
    value
  }));
}

const COLOR_PALETTE_OPTIONS = buildColorPaletteOptions();
const COLOR_VALUE_SET = new Set(COLOR_PALETTE_OPTIONS.map((item) => item.value));
const VALID_TAB_IDS = new Set(["ui", "shell", "connection", "log"]);
const MAX_VOICE_RECORD_CATEGORIES = 10;
const CATEGORY_DRAG_TAP_LOCK_MS = 240;

function resolveOptionIndex(options, value) {
  const raw = String(value == null ? "" : value);
  const lower = raw.toLowerCase();
  const index = options.findIndex((item) => {
    const optionValue = String(item.value == null ? "" : item.value);
    return optionValue === raw || optionValue.toLowerCase() === lower;
  });
  return index >= 0 ? index : 0;
}

function resolveSelection(options, rawValue) {
  if (!Array.isArray(options) || options.length === 0) {
    return { index: 0, option: null };
  }
  const byIndex = Number(rawValue);
  if (Number.isInteger(byIndex) && byIndex >= 0 && byIndex < options.length) {
    return { index: byIndex, option: options[byIndex] };
  }

  const rawText = String(rawValue == null ? "" : rawValue);
  const found = options.findIndex((item) => item.value === rawText || item.label === rawText);
  const index = found >= 0 ? found : 0;
  return { index, option: options[index] };
}

function normalizeNumber(value, rule) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return rule.fallback;
  const normalized = rule.integer ? Math.round(parsed) : parsed;
  if (normalized < rule.min) return rule.min;
  if (normalized > rule.max) return rule.max;
  return normalized;
}

function normalizePaletteColor(value, fallback) {
  const raw = String(value || "")
    .trim()
    .toLowerCase();
  if (COLOR_VALUE_SET.has(raw)) return raw;
  return fallback;
}

function resolveFontPlatformKey() {
  let systemInfo = {};
  try {
    systemInfo = getRuntimeFingerprint(wx);
  } catch (error) {
    console.warn("[settings.fonts.system_info]", error);
  }
  const fingerprint =
    `${systemInfo.platform || ""} ${systemInfo.system || ""} ${systemInfo.brand || ""}`.toLowerCase();
  if (/ios|iphone|ipad/.test(fingerprint)) return "ios";
  if (/android/.test(fingerprint)) return "android";
  if (/windows|win/.test(fingerprint)) return "windows";
  if (/mac|darwin/.test(fingerprint)) return "mac";
  if (/linux|devtools/.test(fingerprint)) return "linux";
  return "common";
}

function buildShellFontFamilyOptions(currentValue) {
  const options = [];
  const seen = new Set();
  const appendOption = (option) => {
    if (!option || typeof option !== "object") return;
    const value = String(option.value || "").trim();
    if (!value) return;
    const key = value.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    options.push({ label: String(option.label || value), value });
  };

  const resolveCurrentLabel = (value) => {
    const raw = String(value || "").trim();
    if (!raw) return "";
    const matchedByValue = SHELL_FONT_VALUE_LABEL_LOOKUP[raw.toLowerCase()];
    if (matchedByValue) return matchedByValue;
    const matchedByLabel = SHELL_FONT_OPTION_LOOKUP[raw];
    if (matchedByLabel && matchedByLabel.label) return String(matchedByLabel.label);
    // 回退到字体族首项，避免显示“当前字体”这类无信息文案。
    const firstFamily = raw
      .split(",")[0]
      .trim()
      .replace(/^["']|["']$/g, "");
    return firstFamily || raw;
  };

  const current = normalizeTerminalFontFamily(currentValue);
  if (current) {
    appendOption({ label: resolveCurrentLabel(current), value: current });
  }

  const platformKey = resolveFontPlatformKey();
  const priorityLabels = PLATFORM_FONT_PRIORITY[platformKey] || PLATFORM_FONT_PRIORITY.common;
  priorityLabels.forEach((label) => appendOption(SHELL_FONT_OPTION_LOOKUP[label]));
  UNIVERSAL_SHELL_FONT_OPTIONS.forEach((option) => appendOption(option));
  return options.slice(0, MAX_SHELL_FONT_OPTIONS);
}

function getSavedSettingsUiState() {
  try {
    const state = wx.getStorageSync(SETTINGS_UI_STATE_KEY);
    return state && typeof state === "object" ? state : {};
  } catch (error) {
    console.warn("[settings.ui_state.read]", error);
    return {};
  }
}

function saveSettingsUiState(patch) {
  const nextPatch = patch && typeof patch === "object" ? patch : {};
  try {
    const current = getSavedSettingsUiState();
    wx.setStorageSync(SETTINGS_UI_STATE_KEY, { ...current, ...nextPatch });
  } catch (error) {
    console.warn("[settings.ui_state.write]", error);
  }
}

function normalizeForm(input) {
  const form = { ...(input || {}) };
  Object.keys(NUMBER_RULES).forEach((key) => {
    form[key] = normalizeNumber(form[key], NUMBER_RULES[key]);
  });
  form.uiLanguage = normalizeUiLanguage(form.uiLanguage);
  form.uiThemeMode = form.uiThemeMode === "light" ? "light" : "dark";
  form.uiThemePreset = String(form.uiThemePreset || "tide");
  form.uiAccentColor = normalizePaletteColor(form.uiAccentColor, DEFAULT_UI_ACCENT_COLOR);
  form.uiBgColor = normalizePaletteColor(form.uiBgColor, DEFAULT_UI_BG_COLOR);
  form.uiTextColor = normalizePaletteColor(form.uiTextColor, DEFAULT_UI_TEXT_COLOR);
  form.uiBtnColor = normalizePaletteColor(form.uiBtnColor, DEFAULT_UI_BTN_COLOR);
  form.shellThemeMode = form.shellThemeMode === "light" ? "light" : "dark";
  form.shellThemePreset = String(form.shellThemePreset || "tide");
  form.shellBgColor = normalizePaletteColor(form.shellBgColor, DEFAULT_SHELL_BG_COLOR);
  form.shellTextColor = normalizePaletteColor(form.shellTextColor, DEFAULT_SHELL_TEXT_COLOR);
  form.shellAccentColor = normalizePaletteColor(form.shellAccentColor, DEFAULT_SHELL_ACCENT_COLOR);
  form.defaultAuthType = form.defaultAuthType === "key" ? "key" : "password";
  form.shellActivationDebugOutline =
    form.shellActivationDebugOutline === undefined ? true : !!form.shellActivationDebugOutline;
  form.showVoiceInputButton = form.showVoiceInputButton === undefined ? true : !!form.showVoiceInputButton;
  form.unicode11 = !!form.unicode11;
  form.autoReconnect = !!form.autoReconnect;
  form.syncConfigEnabled = form.syncConfigEnabled === undefined ? true : !!form.syncConfigEnabled;
  form.aiDefaultProvider = normalizeAiProvider(form.aiDefaultProvider);
  form.aiCodexSandboxMode = normalizeCodexSandboxMode(form.aiCodexSandboxMode);
  form.aiCopilotPermissionMode = normalizeCopilotPermissionMode(form.aiCopilotPermissionMode);
  form.voiceRecordCategories = normalizeVoiceRecordCategories(form.voiceRecordCategories);
  form.voiceRecordDefaultCategory = normalizeVoiceRecordDefaultCategory(
    form.voiceRecordDefaultCategory,
    form.voiceRecordCategories
  );
  return form;
}

function buildLocalizedFontOptions(language, currentValue) {
  const localizedFallback = t(language, "settings.options.fontFallback");
  return buildShellFontFamilyOptions(currentValue).map((item) => {
    if (String(item.label || "").trim() === "等宽默认") {
      return {
        ...item,
        label: localizedFallback
      };
    }
    return item;
  });
}

function resolveSelectedVoiceRecordCategory(form, preferredValue) {
  const categories = normalizeVoiceRecordCategories(form && form.voiceRecordCategories);
  const preferred = String(preferredValue || "").trim();
  if (preferred && categories.includes(preferred)) return preferred;
  return normalizeVoiceRecordDefaultCategory(form && form.voiceRecordDefaultCategory, categories);
}

function resolveTouchClientPoint(event) {
  const point =
    (event && event.touches && event.touches[0]) ||
    (event && event.changedTouches && event.changedTouches[0]) ||
    null;
  if (!point) return null;
  const x = Number(point.clientX);
  const y = Number(point.clientY);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

/**
 * 全局设置页（对齐 mini 配置实现方案）：
 * 1. 四个 Tab：界面/终端/连接/日志；
 * 2. 运维配置保持不可见，仅通过 opsConfig 管理。
 */
Page({
  data: {
    canGoBack: false,
    activeTab: "ui",
    themeStyle: "",
    copy: buildPageCopy("zh-Hans", "settings"),
    terminalPreviewLine: "",
    tabs: buildSettingsTabs("zh-Hans"),
    form: getSettings(),
    activeColorPanelKey: "",
    saveStatusText: t("zh-Hans", "settings.saveStatus.synced"),
    newVoiceRecordCategory: "",
    selectedVoiceRecordCategory: "",
    voiceCategoryDragActive: false,
    voiceCategoryDragCategory: "",
    voiceRecordCategoryCards: [],
    defaultAuthTypeOptions: DEFAULT_AUTH_TYPE_OPTIONS,
    aiProviderOptions: DEFAULT_AI_PROVIDER_OPTIONS,
    aiCodexSandboxOptions: DEFAULT_AI_CODEX_SANDBOX_OPTIONS,
    aiCopilotPermissionOptions: DEFAULT_AI_COPILOT_PERMISSION_OPTIONS,
    uiLanguageOptions: UI_LANGUAGE_OPTIONS,
    colorPaletteOptions: COLOR_PALETTE_OPTIONS,
    shellFontFamilyOptions: UNIVERSAL_SHELL_FONT_OPTIONS.slice(0, MAX_SHELL_FONT_OPTIONS),
    uiThemeModeOptions: THEME_MODE_OPTIONS,
    uiThemePresetOptions: UI_THEME_PRESET_OPTIONS,
    shellThemeModeOptions: THEME_MODE_OPTIONS,
    shellThemePresetOptions: SHELL_THEME_PRESET_OPTIONS,
    defaultAuthTypeIndex: 0,
    uiLanguageIndex: 0,
    uiThemeModeIndex: 0,
    uiThemePresetIndex: 0,
    shellThemeModeIndex: 0,
    shellThemePresetIndex: 0,
    uiAccentColorIndex: 0,
    uiBgColorIndex: 0,
    uiTextColorIndex: 0,
    uiBtnColorIndex: 0,
    shellBgColorIndex: 0,
    shellTextColorIndex: 0,
    shellAccentColorIndex: 0,
    shellFontFamilyIndex: 0,
    aiDefaultProviderIndex: 0,
    aiCodexSandboxModeIndex: 0,
    aiCopilotPermissionModeIndex: 0
  },

  resolveThemeStyle(form) {
    applyNavigationBarTheme(form);
    return buildThemeStyle(form);
  },

  getCurrentLanguage(formInput) {
    const source = formInput && typeof formInput === "object" ? formInput : this.data.form || {};
    return normalizeUiLanguage(source.uiLanguage);
  },

  resolveSaveStatusKey(text, language) {
    const normalizedLanguage = normalizeUiLanguage(language);
    const copy = buildPageCopy(normalizedLanguage, "settings");
    const saveStatus = (copy && copy.saveStatus) || {};
    if (text === saveStatus.saving) return "saving";
    if (text === saveStatus.saved) return "saved";
    return "synced";
  },

  buildSaveStatusText(statusKey, language) {
    const normalizedLanguage = normalizeUiLanguage(language);
    const safeKey = statusKey === "saving" || statusKey === "saved" ? statusKey : "synced";
    return t(normalizedLanguage, `settings.saveStatus.${safeKey}`);
  },

  applyLocale(formInput) {
    const form = normalizeForm(formInput || this.data.form);
    const language = this.getCurrentLanguage(form);
    const copy = buildPageCopy(language, "settings");
    const shellFontFamilyOptions = buildLocalizedFontOptions(language, form.shellFontFamily);
    const uiLanguageOptions = getUiLanguageOptions();
    const saveStatusKey = this.resolveSaveStatusKey(this.data.saveStatusText, language);
    const terminalPreviewLine = formatTemplate(copy?.hints?.terminalPreviewLine, {
      unicodeState: form.unicode11 ? copy?.hints?.voicePreviewUnicodeOn : copy?.hints?.voicePreviewUnicodeOff
    });
    wx.setNavigationBarTitle({ title: copy.navTitle || t(language, "settings.navTitle") });
    return {
      copy,
      terminalPreviewLine,
      tabs: buildSettingsTabs(language),
      defaultAuthTypeOptions: buildSettingsAuthTypeOptions(language),
      aiProviderOptions: buildAiProviderOptions(language),
      aiCodexSandboxOptions: buildAiCodexSandboxOptions(language),
      aiCopilotPermissionOptions: buildAiCopilotPermissionOptions(language),
      uiLanguageOptions,
      uiThemeModeOptions: buildThemeModeOptions(language),
      uiThemePresetOptions: buildThemePresetOptions(language),
      shellThemeModeOptions: buildThemeModeOptions(language),
      shellThemePresetOptions: buildThemePresetOptions(language),
      shellFontFamilyOptions,
      saveStatusText: this.buildSaveStatusText(saveStatusKey, language),
      ...this.buildOptionIndexState(form, shellFontFamilyOptions, {
        defaultAuthTypeOptions: buildSettingsAuthTypeOptions(language),
        aiProviderOptions: buildAiProviderOptions(language),
        aiCodexSandboxOptions: buildAiCodexSandboxOptions(language),
        aiCopilotPermissionOptions: buildAiCopilotPermissionOptions(language),
        uiLanguageOptions,
        uiThemeModeOptions: buildThemeModeOptions(language),
        uiThemePresetOptions: buildThemePresetOptions(language),
        shellThemeModeOptions: buildThemeModeOptions(language),
        shellThemePresetOptions: buildThemePresetOptions(language)
      })
    };
  },

  onShow() {
    const pages = getCurrentPages();
    this.clearAutoSaveTimer();
    this.pendingAutoSaveForm = null;
    const form = normalizeForm(getSettings());
    const uiState = getSavedSettingsUiState();
    const activeTab = VALID_TAB_IDS.has(uiState.activeTab) ? uiState.activeTab : "ui";
    const selectedVoiceRecordCategory = resolveSelectedVoiceRecordCategory(form);
    this.dragRuntime = null;
    this.dragTapLockUntil = 0;
    const localePatch = this.applyLocale(form);
    this.setData({
      canGoBack: pages.length > 1,
      activeTab,
      form,
      selectedVoiceRecordCategory,
      voiceCategoryDragActive: false,
      voiceCategoryDragCategory: "",
      voiceRecordCategoryCards: this.buildVoiceRecordCategoryCards(form, selectedVoiceRecordCategory),
      activeColorPanelKey: "",
      themeStyle: this.resolveThemeStyle(form),
      ...localePatch
    });
  },

  onHide() {
    this.flushAutoSave(this.pendingAutoSaveForm || this.data.form, { silent: true });
  },

  onUnload() {
    this.flushAutoSave(this.pendingAutoSaveForm || this.data.form, { silent: true });
    this.clearAutoSaveTimer();
  },

  goBack() {
    if (!this.data.canGoBack) return;
    wx.navigateBack({ delta: 1 });
  },

  onTabTap(event) {
    const tab = event.currentTarget.dataset.tab;
    if (!VALID_TAB_IDS.has(tab)) return;
    this.flushAutoSave(this.pendingAutoSaveForm || this.data.form, { silent: true });
    saveSettingsUiState({ activeTab: tab });
    this.setData({ activeTab: tab, activeColorPanelKey: "" });
  },

  onInput(event) {
    const key = event.currentTarget.dataset.key;
    const raw = event.detail.value;
    // 输入阶段保留用户原始草稿，避免数字字段在键入过程中被立即“纠正”。
    const form = {
      ...this.data.form,
      [key]: raw
    };
    this.setData({
      form,
      themeStyle: this.resolveThemeStyle(form),
      saveStatusText: this.buildSaveStatusText("saving", this.getCurrentLanguage(form)),
      terminalPreviewLine: this.applyLocale(form).terminalPreviewLine
    });
    this.scheduleAutoSave(form);
  },

  onSwitch(event) {
    const key = event.currentTarget.dataset.key;
    const form = {
      ...this.data.form,
      [key]: !!event.detail.value
    };
    this.setData({
      form,
      themeStyle: this.resolveThemeStyle(form),
      saveStatusText: this.buildSaveStatusText("saving", this.getCurrentLanguage(form)),
      terminalPreviewLine: this.applyLocale(form).terminalPreviewLine
    });
    this.scheduleAutoSave(form);
  },

  onSelectChange(event) {
    const key = event.currentTarget?.dataset?.key || event.target?.dataset?.key;
    const options = this.getOptionsByKey(key);
    if (!options || options.length === 0) return;

    const { option } = resolveSelection(options, event.detail && event.detail.value);
    if (!option) return;
    this.applySelectOption(key, option);
  },

  applySelectOption(key, option) {
    if (!key || !option) return;
    const previousLanguage = this.getCurrentLanguage(this.data.form);
    let form = {
      ...this.data.form,
      [key]: option.value
    };
    if (key === "uiLanguage") {
      form.uiLanguage = normalizeUiLanguage(option.value);
    }
    if (key === "uiThemeMode" || key === "uiThemePreset") {
      form = applyUiThemeSelection(form);
    }
    if (key === "shellThemeMode" || key === "shellThemePreset") {
      form = applyShellThemeSelection(form);
    }
    const localePatch = this.applyLocale(form);
    const patch = {
      form,
      themeStyle: this.resolveThemeStyle(form),
      activeColorPanelKey: "",
      ...localePatch,
      saveStatusText: this.buildSaveStatusText("saving", this.getCurrentLanguage(form))
    };
    this.setData(patch);
    const nextLanguage = this.getCurrentLanguage(form);
    if (key === "uiLanguage" && nextLanguage !== previousLanguage) {
      emitLocaleChange(nextLanguage);
    }
    if (COLOR_FIELD_KEYS.has(key)) {
      this.scheduleAutoSave(form);
    } else {
      this.flushAutoSave(form);
    }
  },

  onPillSelect(event) {
    const key = event.currentTarget?.dataset?.key || event.target?.dataset?.key;
    const options = this.getOptionsByKey(key);
    if (!key || !options || options.length === 0) return;
    const index = Number(event.currentTarget?.dataset?.index);
    if (!Number.isInteger(index) || index < 0 || index >= options.length || !key) return;
    const option = options[index];
    this.applySelectOption(key, option);
  },

  onToggleColorPanel(event) {
    const key = event.currentTarget?.dataset?.key || event.target?.dataset?.key;
    if (!COLOR_FIELD_KEYS.has(key)) return;
    const activeColorPanelKey = this.data.activeColorPanelKey === key ? "" : key;
    this.setData({ activeColorPanelKey });
  },

  onPickPaletteColor(event) {
    const key = event.currentTarget?.dataset?.key || event.target?.dataset?.key;
    if (!COLOR_FIELD_KEYS.has(key)) return;
    const color = String(event.currentTarget?.dataset?.color || event.target?.dataset?.color || "")
      .trim()
      .toLowerCase();
    if (!COLOR_VALUE_SET.has(color)) return;
    const form = {
      ...this.data.form,
      [key]: color
    };
    this.setData({
      form,
      activeColorPanelKey: "",
      themeStyle: this.resolveThemeStyle(form),
      ...this.applyLocale(form),
      saveStatusText: this.buildSaveStatusText("saving", this.getCurrentLanguage(form))
    });
    this.scheduleAutoSave(form);
  },

  buildOptionIndexState(form, shellFontFamilyOptions, optionSets) {
    const options = optionSets && typeof optionSets === "object" ? optionSets : {};
    const fontOptions =
      Array.isArray(shellFontFamilyOptions) && shellFontFamilyOptions.length > 0
        ? shellFontFamilyOptions
        : this.data.shellFontFamilyOptions;
    const defaultAuthTypeOptions = options.defaultAuthTypeOptions || this.data.defaultAuthTypeOptions;
    const aiProviderOptions = options.aiProviderOptions || this.data.aiProviderOptions;
    const aiCodexSandboxOptions = options.aiCodexSandboxOptions || this.data.aiCodexSandboxOptions;
    const aiCopilotPermissionOptions =
      options.aiCopilotPermissionOptions || this.data.aiCopilotPermissionOptions;
    const uiLanguageOptions = options.uiLanguageOptions || this.data.uiLanguageOptions;
    const uiThemeModeOptions = options.uiThemeModeOptions || this.data.uiThemeModeOptions;
    const uiThemePresetOptions = options.uiThemePresetOptions || this.data.uiThemePresetOptions;
    const shellThemeModeOptions = options.shellThemeModeOptions || this.data.shellThemeModeOptions;
    const shellThemePresetOptions = options.shellThemePresetOptions || this.data.shellThemePresetOptions;
    return {
      defaultAuthTypeIndex: resolveOptionIndex(defaultAuthTypeOptions, form.defaultAuthType),
      aiDefaultProviderIndex: resolveOptionIndex(aiProviderOptions, form.aiDefaultProvider),
      aiCodexSandboxModeIndex: resolveOptionIndex(aiCodexSandboxOptions, form.aiCodexSandboxMode),
      aiCopilotPermissionModeIndex: resolveOptionIndex(
        aiCopilotPermissionOptions,
        form.aiCopilotPermissionMode
      ),
      uiLanguageIndex: resolveOptionIndex(uiLanguageOptions, form.uiLanguage),
      uiThemeModeIndex: resolveOptionIndex(uiThemeModeOptions, form.uiThemeMode),
      uiThemePresetIndex: resolveOptionIndex(uiThemePresetOptions, form.uiThemePreset),
      shellThemeModeIndex: resolveOptionIndex(shellThemeModeOptions, form.shellThemeMode),
      shellThemePresetIndex: resolveOptionIndex(shellThemePresetOptions, form.shellThemePreset),
      uiAccentColorIndex: resolveOptionIndex(COLOR_PALETTE_OPTIONS, form.uiAccentColor),
      uiBgColorIndex: resolveOptionIndex(COLOR_PALETTE_OPTIONS, form.uiBgColor),
      uiTextColorIndex: resolveOptionIndex(COLOR_PALETTE_OPTIONS, form.uiTextColor),
      uiBtnColorIndex: resolveOptionIndex(COLOR_PALETTE_OPTIONS, form.uiBtnColor),
      shellBgColorIndex: resolveOptionIndex(COLOR_PALETTE_OPTIONS, form.shellBgColor),
      shellTextColorIndex: resolveOptionIndex(COLOR_PALETTE_OPTIONS, form.shellTextColor),
      shellAccentColorIndex: resolveOptionIndex(COLOR_PALETTE_OPTIONS, form.shellAccentColor),
      shellFontFamilyIndex: resolveOptionIndex(fontOptions, form.shellFontFamily)
    };
  },

  getOptionsByKey(key) {
    if (key === "defaultAuthType") return this.data.defaultAuthTypeOptions;
    if (key === "aiDefaultProvider") return this.data.aiProviderOptions;
    if (key === "aiCodexSandboxMode") return this.data.aiCodexSandboxOptions;
    if (key === "aiCopilotPermissionMode") return this.data.aiCopilotPermissionOptions;
    if (key === "uiLanguage") return this.data.uiLanguageOptions;
    if (key === "uiThemeMode") return this.data.uiThemeModeOptions;
    if (key === "uiThemePreset") return this.data.uiThemePresetOptions;
    if (key === "shellThemeMode") return this.data.shellThemeModeOptions;
    if (key === "shellThemePreset") return this.data.shellThemePresetOptions;
    if (key === "shellFontFamily") return this.data.shellFontFamilyOptions;
    if (COLOR_FIELD_KEYS.has(key)) return COLOR_PALETTE_OPTIONS;
    return null;
  },

  scheduleAutoSave(form) {
    this.pendingAutoSaveForm = normalizeForm(form || this.data.form);
    this.clearAutoSaveTimer();
    this.autoSaveTimer = setTimeout(() => {
      this.flushAutoSave(this.pendingAutoSaveForm || form);
    }, 280);
  },

  flushAutoSave(form, options) {
    const opts = options && typeof options === "object" ? options : {};
    const normalized = normalizeForm(form || this.data.form);
    saveSettings(normalized);
    this.pendingAutoSaveForm = null;
    this.clearAutoSaveTimer();
    if (opts.silent) return;
    this.setData({
      saveStatusText: this.buildSaveStatusText("saved", this.getCurrentLanguage(normalized))
    });
  },

  clearAutoSaveTimer() {
    if (!this.autoSaveTimer) return;
    clearTimeout(this.autoSaveTimer);
    this.autoSaveTimer = null;
  },

  /**
   * 分类输入只更新本地临时态，真正持久化在点击“新增”时进行。
   */
  onVoiceRecordCategoryInput(event) {
    this.setData({ newVoiceRecordCategory: String(event.detail.value || "") });
  },

  /**
   * 选中分类卡片，后续默认/删除/排序都作用于当前选中项。
   */
  onSelectVoiceRecordCategory(event) {
    if (this.data.voiceCategoryDragActive || Date.now() < (this.dragTapLockUntil || 0)) return;
    const category = String(event.currentTarget.dataset.category || "").trim();
    if (!category) return;
    this.setData({
      selectedVoiceRecordCategory: category,
      voiceRecordCategoryCards: this.buildVoiceRecordCategoryCards(this.data.form, category)
    });
  },

  /**
   * 新增分类：去空、去重、限制 10 项，并立即写回设置。
   */
  onAddVoiceRecordCategory() {
    const nextCategory = String(this.data.newVoiceRecordCategory || "").trim();
    if (!nextCategory) {
      wx.showToast({
        title: t(this.getCurrentLanguage(), "settings.toast.enterCategoryName"),
        icon: "none"
      });
      return;
    }
    const categories = normalizeVoiceRecordCategories(this.data.form.voiceRecordCategories);
    if (categories.includes(nextCategory)) {
      wx.showToast({ title: t(this.getCurrentLanguage(), "settings.toast.categoryExists"), icon: "none" });
      this.setData({ selectedVoiceRecordCategory: nextCategory });
      return;
    }
    if (categories.length >= MAX_VOICE_RECORD_CATEGORIES) {
      wx.showToast({ title: t(this.getCurrentLanguage(), "settings.toast.maxCategories"), icon: "none" });
      return;
    }
    const form = normalizeForm({
      ...this.data.form,
      voiceRecordCategories: [...categories, nextCategory]
    });
    this.commitVoiceRecordForm(form, {
      selectedVoiceRecordCategory: nextCategory,
      newVoiceRecordCategory: ""
    });
  },

  /**
   * 设为默认分类，后续语音记录默认落到该项。
   */
  applySelectedVoiceRecordCategoryAsDefault() {
    const selectedCategory = String(this.data.selectedVoiceRecordCategory || "").trim();
    if (!selectedCategory) return;
    if (selectedCategory === this.data.form.voiceRecordDefaultCategory) return;
    const form = normalizeForm({
      ...this.data.form,
      voiceRecordDefaultCategory: selectedCategory
    });
    this.commitVoiceRecordForm(form, { selectedVoiceRecordCategory: selectedCategory });
  },

  /**
   * 删除所选分类。兜底项“未分类”不允许删，避免历史记录出现不可解释状态。
   */
  removeSelectedVoiceRecordCategory() {
    const selectedCategory = String(this.data.selectedVoiceRecordCategory || "").trim();
    if (!selectedCategory) return;
    if (selectedCategory === DEFAULT_VOICE_RECORD_CATEGORY_FALLBACK) {
      wx.showToast({
        title: t(this.getCurrentLanguage(), "settings.toast.fallbackCannotDelete"),
        icon: "none"
      });
      return;
    }
    const currentCategories = normalizeVoiceRecordCategories(this.data.form.voiceRecordCategories);
    if (currentCategories.length <= 1) {
      wx.showToast({
        title: t(this.getCurrentLanguage(), "settings.toast.keepAtLeastOneCategory"),
        icon: "none"
      });
      return;
    }
    const nextCategories = currentCategories.filter((item) => item !== selectedCategory);
    const preferredDefault =
      this.data.form.voiceRecordDefaultCategory === selectedCategory
        ? nextCategories[0]
        : this.data.form.voiceRecordDefaultCategory;
    const form = normalizeForm({
      ...this.data.form,
      voiceRecordCategories: nextCategories,
      voiceRecordDefaultCategory: preferredDefault
    });
    this.commitVoiceRecordForm(form, {
      selectedVoiceRecordCategory: resolveSelectedVoiceRecordCategory(form)
    });
  },

  /**
   * 统一提交分类相关设置，避免各操作重复拼装自动保存状态。
   */
  commitVoiceRecordForm(formInput, extraPatch) {
    const form = normalizeForm(formInput || this.data.form);
    const patch = extraPatch && typeof extraPatch === "object" ? extraPatch : {};
    const selectedVoiceRecordCategory =
      patch.selectedVoiceRecordCategory !== undefined
        ? patch.selectedVoiceRecordCategory
        : resolveSelectedVoiceRecordCategory(form, this.data.selectedVoiceRecordCategory);
    this.setData({
      form,
      themeStyle: this.resolveThemeStyle(form),
      saveStatusText: this.buildSaveStatusText("saving", this.getCurrentLanguage(form)),
      selectedVoiceRecordCategory,
      voiceRecordCategoryCards: this.buildVoiceRecordCategoryCards(form, selectedVoiceRecordCategory),
      terminalPreviewLine: this.applyLocale(form).terminalPreviewLine,
      newVoiceRecordCategory:
        patch.newVoiceRecordCategory !== undefined
          ? patch.newVoiceRecordCategory
          : this.data.newVoiceRecordCategory
    });
    this.flushAutoSave(form);
  },

  buildVoiceRecordCategoryCards(formInput, selectedCategory, dragPatch) {
    const form = normalizeForm(formInput || this.data.form);
    const selected = resolveSelectedVoiceRecordCategory(form, selectedCategory);
    const patch = dragPatch && typeof dragPatch === "object" ? dragPatch : {};
    const offsetMap = patch.offsetMap && typeof patch.offsetMap === "object" ? patch.offsetMap : {};
    const draggingCategory = String(patch.draggingCategory || "");
    return form.voiceRecordCategories.map((category) => {
      const dragState = offsetMap[category] || {};
      const dragOffsetX = Number(dragState.x || 0);
      const dragOffsetY = Number(dragState.y || 0);
      const dragging = draggingCategory === category;
      return {
        category,
        isDefault: form.voiceRecordDefaultCategory === category,
        isSelected: selected === category,
        dragging,
        dragStyle: `transform: translate(${dragOffsetX}px, ${dragOffsetY}px); z-index: ${dragging ? 10 : 1};`
      };
    });
  },

  onStartVoiceRecordCategoryDrag(event) {
    const category = String(event.currentTarget.dataset.category || "").trim();
    if (!category || this.data.voiceCategoryDragActive) return;
    const categories = normalizeVoiceRecordCategories(this.data.form.voiceRecordCategories);
    if (categories.length <= 1) return;
    const fromIndex = categories.indexOf(category);
    if (fromIndex < 0) return;

    const query = wx.createSelectorQuery().in(this);
    query.selectAll(".voice-category-card").boundingClientRect((rects) => {
      if (!Array.isArray(rects) || rects.length !== categories.length) return;
      const startRect = rects[fromIndex];
      if (!startRect) return;
      const point = resolveTouchClientPoint(event);
      const startX = point ? point.x : (Number(startRect.left) || 0) + (Number(startRect.width) || 0) / 2;
      const startY = point ? point.y : (Number(startRect.top) || 0) + (Number(startRect.height) || 0) / 2;
      this.dragRuntime = {
        category,
        fromIndex,
        toIndex: fromIndex,
        startX,
        startY,
        offsetX: 0,
        offsetY: 0,
        orderIds: categories.slice(),
        rects: rects.map((item) => ({
          left: Number(item.left) || 0,
          top: Number(item.top) || 0,
          width: Number(item.width) || 0,
          height: Number(item.height) || 0,
          centerX: (Number(item.left) || 0) + (Number(item.width) || 0) / 2,
          centerY: (Number(item.top) || 0) + (Number(item.height) || 0) / 2
        }))
      };
      this.setData({
        voiceCategoryDragActive: true,
        voiceCategoryDragCategory: category,
        selectedVoiceRecordCategory: category,
        voiceRecordCategoryCards: this.buildVoiceRecordCategoryCards(this.data.form, category, {
          draggingCategory: category,
          offsetMap: {
            [category]: { x: 0, y: 0 }
          }
        })
      });
    });
    query.exec();
  },

  buildVoiceCategoryDragOffsetMap() {
    if (!this.data.voiceCategoryDragActive || !this.dragRuntime) return {};
    const runtime = this.dragRuntime;
    const reorderedIds = runtime.orderIds.slice();
    const [draggingId] = reorderedIds.splice(runtime.fromIndex, 1);
    reorderedIds.splice(runtime.toIndex, 0, draggingId);
    const offsets = {
      [runtime.category]: {
        x: runtime.offsetX,
        y: runtime.offsetY
      }
    };
    runtime.orderIds.forEach((category, index) => {
      if (category === runtime.category) return;
      const targetIndex = reorderedIds.indexOf(category);
      if (targetIndex < 0 || !runtime.rects[index] || !runtime.rects[targetIndex]) return;
      offsets[category] = {
        x: runtime.rects[targetIndex].left - runtime.rects[index].left,
        y: runtime.rects[targetIndex].top - runtime.rects[index].top
      };
    });
    return offsets;
  },

  refreshVoiceCategoryDragVisual() {
    if (!this.data.voiceCategoryDragActive || !this.dragRuntime) return;
    this.setData({
      voiceRecordCategoryCards: this.buildVoiceRecordCategoryCards(
        this.data.form,
        this.data.selectedVoiceRecordCategory,
        {
          draggingCategory: this.dragRuntime.category,
          offsetMap: this.buildVoiceCategoryDragOffsetMap()
        }
      )
    });
  },

  onVoiceRecordCategoryDragMove(event) {
    if (!this.data.voiceCategoryDragActive || !this.dragRuntime) return;
    const point = resolveTouchClientPoint(event);
    if (!point) return;
    const runtime = this.dragRuntime;
    runtime.offsetX = point.x - runtime.startX;
    runtime.offsetY = point.y - runtime.startY;

    const sourceRect = runtime.rects[runtime.fromIndex];
    if (!sourceRect) return;
    const centerX = sourceRect.centerX + runtime.offsetX;
    const centerY = sourceRect.centerY + runtime.offsetY;
    let targetIndex = runtime.fromIndex;
    let minDistance = Number.POSITIVE_INFINITY;
    for (let index = 0; index < runtime.rects.length; index += 1) {
      const rect = runtime.rects[index];
      const distance = Math.hypot(centerX - rect.centerX, centerY - rect.centerY);
      if (distance < minDistance) {
        minDistance = distance;
        targetIndex = index;
      }
    }
    runtime.toIndex = targetIndex;
    this.refreshVoiceCategoryDragVisual();
  },

  onVoiceRecordCategoryDragEnd() {
    if (!this.data.voiceCategoryDragActive || !this.dragRuntime) return;
    const runtime = this.dragRuntime;
    const moved = runtime.toIndex !== runtime.fromIndex;
    const draggingCategory = runtime.category;
    this.dragRuntime = null;
    this.dragTapLockUntil = Date.now() + CATEGORY_DRAG_TAP_LOCK_MS;

    if (!moved || !draggingCategory) {
      this.setData({
        voiceCategoryDragActive: false,
        voiceCategoryDragCategory: "",
        voiceRecordCategoryCards: this.buildVoiceRecordCategoryCards(
          this.data.form,
          this.data.selectedVoiceRecordCategory
        )
      });
      return;
    }

    const nextCategories = normalizeVoiceRecordCategories(this.data.form.voiceRecordCategories);
    const fromIndex = nextCategories.indexOf(draggingCategory);
    if (fromIndex < 0) {
      this.setData({
        voiceCategoryDragActive: false,
        voiceCategoryDragCategory: "",
        voiceRecordCategoryCards: this.buildVoiceRecordCategoryCards(
          this.data.form,
          this.data.selectedVoiceRecordCategory
        )
      });
      return;
    }
    const [current] = nextCategories.splice(fromIndex, 1);
    if (!current) {
      this.setData({
        voiceCategoryDragActive: false,
        voiceCategoryDragCategory: "",
        voiceRecordCategoryCards: this.buildVoiceRecordCategoryCards(
          this.data.form,
          this.data.selectedVoiceRecordCategory
        )
      });
      return;
    }
    nextCategories.splice(runtime.toIndex, 0, current);
    const form = normalizeForm({
      ...this.data.form,
      voiceRecordCategories: nextCategories
    });
    this.setData({
      voiceCategoryDragActive: false,
      voiceCategoryDragCategory: ""
    });
    this.commitVoiceRecordForm(form, {
      selectedVoiceRecordCategory: draggingCategory
    });
  }
});
