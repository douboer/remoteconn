/* global module, require */

const { I18N_CATALOG } = require("./i18nCatalog");

const DEFAULT_UI_LANGUAGE = "zh-Hans";
const UI_LANGUAGE_VALUES = Object.freeze(["zh-Hans", "zh-Hant", "en", "ja", "ko"]);
const UI_LANGUAGE_VALUE_SET = new Set(UI_LANGUAGE_VALUES);
const UI_LANGUAGE_FALLBACKS = Object.freeze({
  ja: "en",
  ko: "en"
});
/**
 * 主题内部值顺序与 shared/Web 保持一致：
 * 1. 设置页下拉顺序直接复用这份稳定数组；
 * 2. 已重命名的老主题继续保留多语言展示名；
 * 3. 新增主题若未提供本地化名，则回退内部值显示，和 Web 保持同口径。
 */
const THEME_PRESET_VALUES = Object.freeze([
  "tide",
  "暮砂",
  "霓潮",
  "苔暮",
  "焰岩",
  "岩陶",
  "靛雾",
  "绛霓",
  "玫蓝",
  "珊湾",
  "苔荧",
  "铜暮",
  "炽潮",
  "藕夜",
  "沙海",
  "珀岚",
  "炫虹",
  "鎏霓",
  "珊汐",
  "黛苔",
  "霜绯"
]);
const THEME_PRESET_LABELS = Object.freeze({
  "zh-Hans": Object.freeze({
    tide: "潮汐",
    暮砂: "沙丘",
    霓潮: "棱光",
    苔暮: "苔影",
    焰岩: "余烬",
    岩陶: "陶土",
    靛雾: "岚雾",
    绛霓: "绛霓",
    玫蓝: "玫蓝",
    珊湾: "珊湾",
    苔荧: "苔荧",
    铜暮: "铜暮",
    炽潮: "炽潮",
    藕夜: "藕夜",
    沙海: "沙海",
    珀岚: "珀岚",
    炫虹: "炫虹",
    鎏霓: "鎏霓",
    珊汐: "珊汐",
    黛苔: "黛苔",
    霜绯: "霜绯"
  }),
  "zh-Hant": Object.freeze({
    tide: "潮汐",
    暮砂: "沙丘",
    霓潮: "稜光",
    苔暮: "苔影",
    焰岩: "餘燼",
    岩陶: "陶土",
    靛雾: "嵐霧",
    绛霓: "絳霓",
    玫蓝: "玫藍",
    珊湾: "珊灣",
    苔荧: "苔螢",
    铜暮: "銅暮",
    炽潮: "熾潮",
    藕夜: "藕夜",
    沙海: "沙海",
    珀岚: "珀嵐",
    炫虹: "炫虹",
    鎏霓: "鎏霓",
    珊汐: "珊汐",
    黛苔: "黛苔",
    霜绯: "霜緋"
  }),
  en: Object.freeze({
    tide: "Tide",
    暮砂: "Dune",
    霓潮: "Prism",
    苔暮: "Moss",
    焰岩: "Ember",
    岩陶: "Clay",
    靛雾: "Haze",
    绛霓: "Crimson",
    玫蓝: "Rose",
    珊湾: "Bay",
    苔荧: "Glow",
    铜暮: "Copper",
    炽潮: "Blaze",
    藕夜: "Lotus",
    沙海: "Sandsea",
    珀岚: "Amber",
    炫虹: "Neon",
    鎏霓: "Gilded",
    珊汐: "Coral",
    黛苔: "Slate",
    霜绯: "Frost"
  }),
  ja: Object.freeze({
    tide: "潮汐",
    暮砂: "砂丘",
    霓潮: "プリズム",
    苔暮: "苔影",
    焰岩: "残り火",
    岩陶: "陶土",
    靛雾: "藍霧",
    绛霓: "深紅",
    玫蓝: "薔薇",
    珊湾: "珊湾",
    苔荧: "苔光",
    铜暮: "銅暮",
    炽潮: "炎潮",
    藕夜: "蓮夜",
    沙海: "砂海",
    珀岚: "琥珀",
    炫虹: "ネオン",
    鎏霓: "金彩",
    珊汐: "珊汐",
    黛苔: "黛苔",
    霜绯: "霜緋"
  }),
  ko: Object.freeze({
    tide: "조류",
    暮砂: "사구",
    霓潮: "프리즘",
    苔暮: "이끼 그림자",
    焰岩: "잿불",
    岩陶: "도토",
    靛雾: "남빛 안개",
    绛霓: "크림슨",
    玫蓝: "로즈",
    珊湾: "코럴",
    苔荧: "글로우",
    铜暮: "코퍼",
    炽潮: "블레이즈",
    藕夜: "로터스",
    沙海: "샌드씨",
    珀岚: "앰버",
    炫虹: "네온",
    鎏霓: "길디드",
    珊汐: "산호",
    黛苔: "슬레이트",
    霜绯: "프로스트"
  })
});

function normalizeUiLanguage(value) {
  const normalized = String(value || "").trim();
  return UI_LANGUAGE_VALUE_SET.has(normalized) ? normalized : DEFAULT_UI_LANGUAGE;
}

/**
 * 新增语种先走英文基线兜底：
 * 1. 保证所有现有页面能稳定显示，不会回落成简体中文；
 * 2. 后续补专门词典时，只需在 catalog 中加同名语言节点即可覆盖。
 */
function resolveCatalogLanguage(language) {
  const normalized = normalizeUiLanguage(language);
  return I18N_CATALOG[normalized] ? normalized : UI_LANGUAGE_FALLBACKS[normalized] || DEFAULT_UI_LANGUAGE;
}

function resolveCatalog(language) {
  return I18N_CATALOG[resolveCatalogLanguage(language)] || I18N_CATALOG[DEFAULT_UI_LANGUAGE];
}

function deepClone(value) {
  if (Array.isArray(value)) {
    return value.map((item) => deepClone(item));
  }
  if (value && typeof value === "object") {
    const next = {};
    Object.keys(value).forEach((key) => {
      next[key] = deepClone(value[key]);
    });
    return next;
  }
  return value;
}

function readByPath(source, path) {
  if (!source || typeof source !== "object") return undefined;
  const segments = String(path || "")
    .split(".")
    .filter((item) => !!item);
  let current = source;
  for (let i = 0; i < segments.length; i += 1) {
    const key = segments[i];
    if (!current || typeof current !== "object" || !(key in current)) {
      return undefined;
    }
    current = current[key];
  }
  return current;
}

function formatTemplate(template, params) {
  const source = params && typeof params === "object" ? params : {};
  return String(template || "").replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, key) => {
    if (!(key in source)) return "";
    return String(source[key] == null ? "" : source[key]);
  });
}

function t(language, key, params) {
  const value = readByPath(resolveCatalog(language), key);
  if (typeof value !== "string") {
    return key ? String(key) : "";
  }
  return params ? formatTemplate(value, params) : value;
}

function buildPageCopy(language, namespace) {
  const value = readByPath(resolveCatalog(language), namespace);
  return value && typeof value === "object" ? deepClone(value) : {};
}

function getStatusLabel(language, status) {
  const normalized = String(status || "").trim();
  return t(language, `common.statusLabels.${normalized}`) || normalized;
}

function getRuntimeStateLabel(language, status) {
  const normalized = String(status || "").trim();
  return t(language, `common.runtimeStateLabels.${normalized}`) || normalized;
}

function getUiLanguageOptions() {
  return [
    { label: "简体中文", value: "zh-Hans" },
    { label: "繁體中文", value: "zh-Hant" },
    { label: "English", value: "en" },
    { label: "日本語", value: "ja" },
    { label: "한국어", value: "ko" }
  ];
}

function buildThemeModeOptions(language) {
  return [
    { label: t(language, "settings.options.themeMode.dark"), value: "dark" },
    { label: t(language, "settings.options.themeMode.light"), value: "light" }
  ];
}

function buildSettingsAuthTypeOptions(language) {
  return [
    { label: t(language, "settings.options.authType.password"), value: "password" },
    { label: t(language, "settings.options.authType.key"), value: "key" }
  ];
}

function buildAiCodexSandboxOptions(language) {
  return [
    { label: t(language, "settings.options.aiCodexSandboxMode.readOnly"), value: "read-only" },
    { label: t(language, "settings.options.aiCodexSandboxMode.workspaceWrite"), value: "workspace-write" },
    {
      label: t(language, "settings.options.aiCodexSandboxMode.dangerFullAccess"),
      value: "danger-full-access"
    }
  ];
}

function buildAiProviderOptions(language) {
  return [
    { label: t(language, "settings.options.aiDefaultProvider.codex"), value: "codex" },
    { label: t(language, "settings.options.aiDefaultProvider.copilot"), value: "copilot" }
  ];
}

function buildAiCopilotPermissionOptions(language) {
  return [
    { label: t(language, "settings.options.aiCopilotPermissionMode.default"), value: "default" },
    {
      label: t(language, "settings.options.aiCopilotPermissionMode.experimental"),
      value: "experimental"
    },
    { label: t(language, "settings.options.aiCopilotPermissionMode.allowAll"), value: "allow-all" }
  ];
}

function buildServerAuthTypeOptions(language) {
  return [
    { label: t(language, "serverSettings.options.authType.password"), value: "password" },
    { label: t(language, "serverSettings.options.authType.privateKey"), value: "privateKey" },
    { label: t(language, "serverSettings.options.authType.certificate"), value: "certificate" }
  ];
}

function buildSettingsTabs(language) {
  return [
    { id: "ui", label: t(language, "settings.tabs.ui") },
    { id: "shell", label: t(language, "settings.tabs.shell") },
    { id: "connection", label: t(language, "settings.tabs.connection") },
    { id: "log", label: t(language, "settings.tabs.log") }
  ];
}

/**
 * 主题预设内部值保持稳定，界面层再按语言映射为用户可读展示名。
 */
function getThemePresetLabel(language, value) {
  const normalizedLanguage = normalizeUiLanguage(language);
  return THEME_PRESET_LABELS[normalizedLanguage]?.[value] || String(value || "");
}

function buildThemePresetOptions(language) {
  return THEME_PRESET_VALUES.map((value) => ({
    value,
    label: getThemePresetLabel(language, value)
  }));
}

function localizeServerValidationMessage(language, message) {
  const raw = String(message || "").trim();
  const localizedLanguage = resolveCatalogLanguage(language);
  if (!raw) return raw;
  const map = {
    主机不能为空: {
      "zh-Hant": "主機不能為空",
      en: "Host is required",
      ja: "ホストは必須です",
      ko: "호스트는 필수입니다"
    },
    用户名不能为空: {
      "zh-Hant": "使用者名稱不能為空",
      en: "Username is required",
      ja: "ユーザー名は必須です",
      ko: "사용자명은 필수입니다"
    },
    密码不能为空: {
      "zh-Hant": "密碼不能為空",
      en: "Password is required",
      ja: "パスワードは必須です",
      ko: "비밀번호는 필수입니다"
    },
    私钥内容不能为空: {
      "zh-Hant": "私鑰內容不能為空",
      en: "Private key is required",
      ja: "秘密鍵は必須です",
      ko: "개인 키는 필수입니다"
    },
    证书模式下私钥不能为空: {
      "zh-Hant": "憑證模式下私鑰不能為空",
      en: "Private key is required for certificate mode",
      ja: "証明書モードでは秘密鍵が必須です",
      ko: "인증서 모드에서는 개인 키가 필요합니다"
    },
    证书模式下证书不能为空: {
      "zh-Hant": "憑證模式下憑證不能為空",
      en: "Certificate is required for certificate mode",
      ja: "証明書モードでは証明書が必須です",
      ko: "인증서 모드에서는 인증서가 필요합니다"
    },
    跳板机主机不能为空: {
      "zh-Hant": "跳板機主機不能為空",
      en: "Jump host is required",
      ja: "踏み台ホストは必須です",
      ko: "점프 호스트는 필수입니다"
    },
    跳板机用户名不能为空: {
      "zh-Hant": "跳板機使用者名稱不能為空",
      en: "Jump host username is required",
      ja: "踏み台ユーザー名は必須です",
      ko: "점프 호스트 사용자명은 필수입니다"
    },
    跳板机密码不能为空: {
      "zh-Hant": "跳板機密碼不能為空",
      en: "Jump host password is required",
      ja: "踏み台パスワードは必須です",
      ko: "점프 호스트 비밀번호는 필수입니다"
    },
    跳板机私钥不能为空: {
      "zh-Hant": "跳板機私鑰不能為空",
      en: "Jump host private key is required",
      ja: "踏み台秘密鍵は必須です",
      ko: "점프 호스트 개인 키는 필수입니다"
    },
    跳板机证书模式下私钥不能为空: {
      "zh-Hant": "跳板機憑證模式下私鑰不能為空",
      en: "Jump host private key is required for certificate mode",
      ja: "踏み台の証明書モードでは秘密鍵が必須です",
      ko: "점프 호스트 인증서 모드에서는 개인 키가 필요합니다"
    },
    跳板机证书模式下证书不能为空: {
      "zh-Hant": "跳板機憑證模式下憑證不能為空",
      en: "Jump host certificate is required for certificate mode",
      ja: "踏み台の証明書モードでは証明書が必須です",
      ko: "점프 호스트 인증서 모드에서는 인증서가 필요합니다"
    }
  };
  if (map[raw] && map[raw][localizedLanguage]) {
    return map[raw][localizedLanguage];
  }
  if (/^SSH 端口需为 1-65535 的整数$/.test(raw)) {
    if (localizedLanguage === "zh-Hant") return "SSH 埠需為 1-65535 的整數";
    if (localizedLanguage === "en") return "SSH port must be an integer between 1 and 65535";
    if (localizedLanguage === "ja") return "SSH ポートは 1〜65535 の整数で入力してください";
    if (localizedLanguage === "ko") return "SSH 포트는 1~65535 사이 정수여야 합니다";
  }
  if (/^跳板机端口需为 1-65535 的整数$/.test(raw)) {
    if (localizedLanguage === "zh-Hant") return "跳板機埠需為 1-65535 的整數";
    if (localizedLanguage === "en") return "Jump host port must be an integer between 1 and 65535";
    if (localizedLanguage === "ja") return "踏み台ポートは 1〜65535 の整数で入力してください";
    if (localizedLanguage === "ko") return "점프 호스트 포트는 1~65535 사이 정수여야 합니다";
  }
  return raw;
}

module.exports = {
  DEFAULT_UI_LANGUAGE,
  UI_LANGUAGE_VALUES,
  buildAiCodexSandboxOptions,
  buildAiCopilotPermissionOptions,
  buildAiProviderOptions,
  buildPageCopy,
  buildServerAuthTypeOptions,
  buildSettingsAuthTypeOptions,
  buildSettingsTabs,
  buildThemeModeOptions,
  buildThemePresetOptions,
  formatTemplate,
  getThemePresetLabel,
  getRuntimeStateLabel,
  getStatusLabel,
  getUiLanguageOptions,
  localizeServerValidationMessage,
  normalizeUiLanguage,
  t
};
