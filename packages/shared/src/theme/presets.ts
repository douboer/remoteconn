import { pickShellAccentColor } from "./contrast";

/**
 * 主题色板预设（按配置计划 §主题实现方案）。
 *
 * 每套主题包含：
 *   - palette: 原始色板（按 Figma 顺序）
 *   - dark:    dark 变体（bg / text / accent / btn）
 *   - light:   light 变体（bg / text / accent / btn）
 */

export type ThemePreset =
  | "tide"
  | "暮砂"
  | "霓潮"
  | "苔暮"
  | "焰岩"
  | "岩陶"
  | "靛雾"
  | "绛霓"
  | "玫蓝"
  | "珊湾"
  | "苔荧"
  | "铜暮"
  | "炽潮"
  | "藕夜"
  | "沙海"
  | "珀岚"
  | "炫虹"
  | "鎏霓"
  | "珊汐"
  | "黛苔"
  | "霜绯";

export interface ThemeVariant {
  /** 页面/卡片背景色 */
  bg: string;
  /** 正文字体色 */
  text: string;
  /** 强调色（链接、输入框聚焦线、开关等） */
  accent: string;
  /** 主按钮底色 */
  btn: string;
}

export interface ThemeDefinition {
  name: ThemePreset;
  /** 色板原始顺序 */
  palette: string[];
  dark: ThemeVariant;
  light: ThemeVariant;
  /** shell 专用 dark 变体（终端背景/前景/光标） */
  shellDark: { bg: string; text: string; cursor: string };
  /** shell 专用 light 变体 */
  shellLight: { bg: string; text: string; cursor: string };
}

export const THEME_PRESETS: Record<ThemePreset, ThemeDefinition> = {
  tide: {
    name: "tide",
    palette: ["#192b4d", "#5bd2ff", "#e6f0ff", "#3D86FF"],
    dark: { bg: "#192b4d", text: "#e6f0ff", accent: "#5bd2ff", btn: "#3D86FF" },
    light: { bg: "#e6f0ff", text: "#192b4d", accent: "#3D86FF", btn: "#3D86FF" },
    shellDark: { bg: "#192b4d", text: "#e6f0ff", cursor: "#5bd2ff" },
    shellLight: { bg: "#e6f0ff", text: "#192b4d", cursor: "#3D86FF" }
  },
  暮砂: {
    name: "暮砂",
    palette: ["#F4F1DE", "#EAB69F", "#E07A5F", "#8F5D5D", "#3D405B", "#5F797B", "#81B29A", "#9EB998", "#BABF95", "#F2CC8F"],
    dark: { bg: "#3D405B", text: "#F4F1DE", accent: "#81B29A", btn: "#E07A5F" },
    light: { bg: "#F4F1DE", text: "#3D405B", accent: "#E07A5F", btn: "#8F5D5D" },
    shellDark: { bg: "#3D405B", text: "#F4F1DE", cursor: "#81B29A" },
    shellLight: { bg: "#F4F1DE", text: "#3D405B", cursor: "#E07A5F" }
  },
  霓潮: {
    name: "霓潮",
    palette: ["#EF476F", "#F78C6B", "#FFD166", "#83D483", "#06D6A0", "#001914", "#118AB2", "#0F7799", "#0C637F", "#073B4C"],
    dark: { bg: "#073B4C", text: "#FFD166", accent: "#06D6A0", btn: "#118AB2" },
    light: { bg: "#FFD166", text: "#073B4C", accent: "#EF476F", btn: "#0F7799" },
    shellDark: { bg: "#073B4C", text: "#FFD166", cursor: "#06D6A0" },
    shellLight: { bg: "#FFD166", text: "#073B4C", cursor: "#EF476F" }
  },
  苔暮: {
    name: "苔暮",
    palette: ["#A8B868", "#798575", "#4A5282", "#393F7C", "#313679", "#282C75", "#3C3C9D", "#4E4CC3", "#645FD4", "#7A71E4"],
    dark: { bg: "#282C75", text: "#A8B868", accent: "#7A71E4", btn: "#84916c" },
    light: { bg: "#A8B868", text: "#282C75", accent: "#4E4CC3", btn: "#393F7C" },
    shellDark: { bg: "#282C75", text: "#A8B868", cursor: "#7A71E4" },
    shellLight: { bg: "#A8B868", text: "#282C75", cursor: "#4E4CC3" }
  },
  焰岩: {
    name: "焰岩",
    palette: ["#5F0F40", "#7D092F", "#9A031E", "#CB4721", "#FB8B24", "#EF781C", "#E36414", "#AE5E26", "#795838", "#0F4C5C"],
    dark: { bg: "#0F4C5C", text: "#FB8B24", accent: "#E36414", btn: "#CB4721" },
    light: { bg: "#FB8B24", text: "#0F4C5C", accent: "#CB4721", btn: "#9A031E" },
    shellDark: { bg: "#0F4C5C", text: "#FB8B24", cursor: "#E36414" },
    shellLight: { bg: "#FB8B24", text: "#0F4C5C", cursor: "#CB4721" }
  },
  岩陶: {
    name: "岩陶",
    palette: ["#283D3B", "#21585A", "#197278", "#83A8A6", "#EDDDD4", "#D99185", "#E9B5AF", "#9E3A2E", "#772E25"],
    dark: { bg: "#283D3B", text: "#EDDDD4", accent: "#E9B5AF", btn: "#D99185" },
    light: { bg: "#EDDDD4", text: "#283D3B", accent: "#D99185", btn: "#9E3A2E" },
    shellDark: { bg: "#283D3B", text: "#EDDDD4", cursor: "#E9B5AF" },
    shellLight: { bg: "#EDDDD4", text: "#283D3B", cursor: "#D99185" }
  },
  靛雾: {
    name: "靛雾",
    palette: ["#292281", "#2D2586", "#31278B", "#382D93", "#3F329B", "#4437A1", "#4A3BA6", "#9D96BA", "#C7C4C4", "#F1F0CD"],
    dark: { bg: "#292281", text: "#F1F0CD", accent: "#9D96BA", btn: "#b9b6b8" },
    light: { bg: "#F1F0CD", text: "#292281", accent: "#4A3BA6", btn: "#382D93" },
    shellDark: { bg: "#292281", text: "#F1F0CD", cursor: "#9D96BA" },
    shellLight: { bg: "#F1F0CD", text: "#292281", cursor: "#4A3BA6" }
  },
  绛霓: {
    name: "绛霓",
    palette: ["#F72585", "#B5179E", "#7209B7", "#560BAD", "#480CA8", "#3A0CA3", "#3F37C9", "#4361EE", "#4895EF", "#4CC9F0"],
    dark: { bg: "#3A0CA3", text: "#4CC9F0", accent: "#4895EF", btn: "#7209B7" },
    light: { bg: "#4CC9F0", text: "#3A0CA3", accent: "#F72585", btn: "#7209B7" },
    shellDark: { bg: "#3A0CA3", text: "#4CC9F0", cursor: "#4895EF" },
    shellLight: { bg: "#4CC9F0", text: "#3A0CA3", cursor: "#F72585" }
  },
  玫蓝: {
    name: "玫蓝",
    palette: ["#D06A79", "#984B8D", "#5E2BA1", "#482398", "#3D1F94", "#311B90", "#3D39B6", "#4857DC", "#567BE3", "#629FEB"],
    dark: { bg: "#3D1F94", text: "#629FEB", accent: "#D06A79", btn: "#567BE3" },
    light: { bg: "#629FEB", text: "#3D1F94", accent: "#D06A79", btn: "#4857DC" },
    shellDark: { bg: "#3D1F94", text: "#629FEB", cursor: "#567BE3" },
    shellLight: { bg: "#629FEB", text: "#3D1F94", cursor: "#D06A79" }
  },
  珊湾: {
    name: "珊湾",
    palette: ["#EC5B57", "#AD635D", "#6C6B64", "#526660", "#45645D", "#37615B", "#3E8983", "#44B0AB", "#4BC8C4", "#52DFDD"],
    dark: { bg: "#37615B", text: "#52DFDD", accent: "#EC5B57", btn: "#44B0AB" },
    light: { bg: "#52DFDD", text: "#37615B", accent: "#EC5B57", btn: "#3E8983" },
    shellDark: { bg: "#37615B", text: "#52DFDD", cursor: "#44B0AB" },
    shellLight: { bg: "#52DFDD", text: "#37615B", cursor: "#EC5B57" }
  },
  苔荧: {
    name: "苔荧",
    palette: ["#414731", "#515A23", "#616C15", "#99A32C", "#D1D942", "#C2CB37", "#B3BC2C", "#909636", "#6C6F41", "#252157"],
    dark: { bg: "#252157", text: "#D1D942", accent: "#99A32C", btn: "#C2CB37" },
    light: { bg: "#D1D942", text: "#252157", accent: "#909636", btn: "#99A32C" },
    shellDark: { bg: "#252157", text: "#D1D942", cursor: "#C2CB37" },
    shellLight: { bg: "#D1D942", text: "#252157", cursor: "#909636" }
  },
  铜暮: {
    name: "铜暮",
    palette: ["#502939", "#672F2A", "#7E351A", "#B27225", "#E6B030", "#D99F27", "#CB8E1E", "#9F782D", "#72623C", "#1A375A"],
    dark: { bg: "#1A375A", text: "#E6B030", accent: "#B27225", btn: "#D99F27" },
    light: { bg: "#E6B030", text: "#1A375A", accent: "#B27225", btn: "#9F782D" },
    shellDark: { bg: "#1A375A", text: "#E6B030", cursor: "#D99F27" },
    shellLight: { bg: "#E6B030", text: "#1A375A", cursor: "#B27225" }
  },
  炽潮: {
    name: "炽潮",
    palette: ["#5B2A28", "#771E1C", "#921211", "#C43133", "#F55054", "#E94347", "#DC363A", "#AA3E40", "#774547", "#125554"],
    dark: { bg: "#125554", text: "#F55054", accent: "#C43133", btn: "#E94347" },
    light: { bg: "#F55054", text: "#125554", accent: "#AA3E40", btn: "#DC363A" },
    shellDark: { bg: "#125554", text: "#F55054", cursor: "#E94347" },
    shellLight: { bg: "#F55054", text: "#125554", cursor: "#AA3E40" }
  },
  藕夜: {
    name: "藕夜",
    palette: ["#322F4F", "#433E71", "#554C93", "#98958C", "#DBDD85", "#D8DD7D", "#D5DB74", "#CED56E", "#C8CF67", "#BAC35A"],
    dark: { bg: "#322F4F", text: "#DBDD85", accent: "#554C93", btn: "#C8CF67" },
    light: { bg: "#DBDD85", text: "#322F4F", accent: "#D5DB74", btn: "#433E71" },
    shellDark: { bg: "#322F4F", text: "#DBDD85", cursor: "#C8CF67" },
    shellLight: { bg: "#DBDD85", text: "#322F4F", cursor: "#554C93" }
  },
  沙海: {
    name: "沙海",
    palette: ["#2B3B51", "#355971", "#3F7690", "#91A483", "#E2D075", "#E4C66F", "#E4BD69", "#E0B464", "#DBAA5F", "#D19654"],
    dark: { bg: "#2B3B51", text: "#E2D075", accent: "#3F7690", btn: "#DBAA5F" },
    light: { bg: "#E2D075", text: "#2B3B51", accent: "#355971", btn: "#D19654" },
    shellDark: { bg: "#2B3B51", text: "#E2D075", cursor: "#DBAA5F" },
    shellLight: { bg: "#E2D075", text: "#2B3B51", cursor: "#3F7690" }
  },
  珀岚: {
    name: "珀岚",
    palette: ["#274D4C", "#2B7171", "#2F9595", "#8B9395", "#E79094", "#EC878A", "#EF7D7F", "#EC7578", "#E86D6F", "#E15D5F"],
    dark: { bg: "#274D4C", text: "#E79094", accent: "#2F9595", btn: "#EC7578" },
    light: { bg: "#E79094", text: "#274D4C", accent: "#2B7171", btn: "#E15D5F" },
    shellDark: { bg: "#274D4C", text: "#E79094", cursor: "#EC7578" },
    shellLight: { bg: "#E79094", text: "#274D4C", cursor: "#2F9595" }
  },
  炫虹: {
    name: "炫虹",
    palette: ["#FFBE0B", "#FD8A09", "#FB5607", "#FD2B3B", "#FF006E", "#C11CAD", "#A22ACD", "#8338EC", "#5F5FF6", "#3A86FF"],
    dark: { bg: "#8338EC", text: "#FFBE0B", accent: "#FF006E", btn: "#3A86FF" },
    light: { bg: "#FFBE0B", text: "#8338EC", accent: "#FD2B3B", btn: "#5F5FF6" },
    shellDark: { bg: "#8338EC", text: "#FFBE0B", cursor: "#3A86FF" },
    shellLight: { bg: "#FFBE0B", text: "#8338EC", cursor: "#FF006E" }
  },
  鎏霓: {
    name: "鎏霓",
    palette: ["#F3D321", "#E7B019", "#DC8C10", "#D67039", "#D05460", "#A2529A", "#8C51B8", "#7550D5", "#5F5FE3", "#476CEF"],
    dark: { bg: "#7550D5", text: "#F3D321", accent: "#A2529A", btn: "#476CEF" },
    light: { bg: "#F3D321", text: "#7550D5", accent: "#D67039", btn: "#5F5FE3" },
    shellDark: { bg: "#7550D5", text: "#F3D321", cursor: "#476CEF" },
    shellLight: { bg: "#F3D321", text: "#7550D5", cursor: "#A2529A" }
  },
  珊汐: {
    name: "珊汐",
    palette: ["#FB5860", "#F74046", "#F2292C", "#F23433", "#F23E39", "#B86E68", "#9C867F", "#7F9E96", "#5FB4AE", "#3DCAC5"],
    dark: { bg: "#7F9E96", text: "#FB5860", accent: "#3DCAC5", btn: "#F23E39" },
    light: { bg: "#FB5860", text: "#7F9E96", accent: "#F2292C", btn: "#5FB4AE" },
    shellDark: { bg: "#7F9E96", text: "#FB5860", cursor: "#3DCAC5" },
    shellLight: { bg: "#FB5860", text: "#7F9E96", cursor: "#F2292C" }
  },
  黛苔: {
    name: "黛苔",
    palette: ["#2F2E3B", "#353159", "#3A3376", "#908EA6", "#E7E8D6", "#BEC388", "#949D3A", "#788031", "#5B6127"],
    dark: { bg: "#2F2E3B", text: "#E7E8D6", accent: "#788031", btn: "#949D3A" },
    light: { bg: "#E7E8D6", text: "#2F2E3B", accent: "#788031", btn: "#5B6127" },
    shellDark: { bg: "#2F2E3B", text: "#E7E8D6", cursor: "#949D3A" },
    shellLight: { bg: "#E7E8D6", text: "#2F2E3B", cursor: "#788031" }
  },
  霜绯: {
    name: "霜绯",
    palette: ["#293B3B", "#235959", "#1D7575", "#84A6A6", "#ECD7D8", "#D58A8A", "#BD3C3D", "#993333", "#732829"],
    dark: { bg: "#293B3B", text: "#ECD7D8", accent: "#1D7575", btn: "#BD3C3D" },
    light: { bg: "#ECD7D8", text: "#293B3B", accent: "#993333", btn: "#BD3C3D" },
    shellDark: { bg: "#293B3B", text: "#ECD7D8", cursor: "#BD3C3D" },
    shellLight: { bg: "#ECD7D8", text: "#293B3B", cursor: "#993333" }
  }
};

/**
 * 按主题名和模式获取 UI 变体颜色。
 */
export function getThemeVariant(preset: ThemePreset, mode: "dark" | "light"): ThemeVariant {
  const def = THEME_PRESETS[preset] ?? THEME_PRESETS["tide"];
  return mode === "dark" ? def.dark : def.light;
}

/**
 * 按主题名和模式获取 Shell 变体颜色。
 */
export function getShellVariant(
  preset: ThemePreset,
  mode: "dark" | "light"
): { bg: string; text: string; cursor: string } {
  const def = THEME_PRESETS[preset] ?? THEME_PRESETS["tide"];
  const base = mode === "dark" ? def.shellDark : def.shellLight;
  return {
    bg: base.bg,
    text: base.text,
    // 终端强调色统一按“背景与前景之间、略偏前景”的规则实时推导。
    cursor: pickShellAccentColor(base.bg, base.text)
  };
}

/**
 * 返回所有可用主题预设名称列表。
 */
export const THEME_PRESET_NAMES: ThemePreset[] = Object.keys(THEME_PRESETS) as ThemePreset[];
