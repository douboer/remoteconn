import type { ThemePreset } from "@/types/app";
import { THEME_PRESETS } from "@remoteconn/shared";

export type ThemePresetOption = {
  label: string;
  value: ThemePreset;
};

const THEME_PRESET_LABEL_OVERRIDES: Partial<Record<ThemePreset, string>> = Object.freeze({
  tide: "潮汐",
  暮砂: "沙丘",
  霓潮: "棱光",
  苔暮: "苔影",
  焰岩: "余烬",
  岩陶: "陶土",
  靛雾: "岚雾"
});

/**
 * Web 设置页只改展示名，不改持久化值，避免影响既有配置兼容性。
 */
export function getThemePresetLabel(preset: ThemePreset): string {
  return THEME_PRESET_LABEL_OVERRIDES[preset] ?? preset;
}

/**
 * 主题选项顺序直接复用共享预设定义，避免 Web 侧再维护一份平行枚举。
 */
export function buildThemePresetOptions(): ThemePresetOption[] {
  return (Object.keys(THEME_PRESETS) as ThemePreset[]).map((preset) => ({
    value: preset,
    label: getThemePresetLabel(preset)
  }));
}
