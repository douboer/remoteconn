/**
 * 主题引擎：提供 WCAG 对比度计算与背景自动优化。
 */

export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

/**
 * 终端强调色插值系数：
 * - 0.5 代表正中间；
 * - >0.5 代表向前景色偏移；
 * - 当前取 0.64，满足“中间色且略偏前景”的视觉要求。
 */
export const SHELL_ACCENT_BLEND_T = 0.64;

export function normalizeHex(input: string, fallback: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(input) ? input.toLowerCase() : fallback;
}

export function hexToRgb(hex: string): RgbColor {
  const value = normalizeHex(hex, "#000000");
  return {
    r: Number.parseInt(value.slice(1, 3), 16),
    g: Number.parseInt(value.slice(3, 5), 16),
    b: Number.parseInt(value.slice(5, 7), 16)
  };
}

function srgbToLinear(value: number): number {
  const normalized = value / 255;
  if (normalized <= 0.03928) {
    return normalized / 12.92;
  }
  return ((normalized + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const rgb = hexToRgb(hex);
  return 0.2126 * srgbToLinear(rgb.r) + 0.7152 * srgbToLinear(rgb.g) + 0.0722 * srgbToLinear(rgb.b);
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

export function pickBestBackground(textColor: string, accentColor: string): string {
  const candidates = [
    "#0a1325",
    "#132747",
    "#102b34",
    "#2e223b",
    normalizeHex(accentColor, "#5bd2ff")
  ];

  let best = candidates[0] ?? "#0a1325";
  let bestScore = 0;
  for (const candidate of candidates) {
    const score = contrastRatio(normalizeHex(textColor, "#e6f0ff"), candidate);
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best;
}

/**
 * 颜色线性插值：
 * - t=0 表示返回背景色；
 * - t=1 表示返回前景色；
 * - 用于按钮色与终端强调色等“在 bg/text 之间取色”的场景。
 */
function mixColor(bgColor: string, textColor: string, t: number, fallbackBg: string, fallbackText: string): string {
  const bg = hexToRgb(normalizeHex(bgColor, fallbackBg));
  const text = hexToRgb(normalizeHex(textColor, fallbackText));
  const factor = Number.isFinite(t) ? Math.min(1, Math.max(0, t)) : 0.5;
  const r = Math.round(bg.r + (text.r - bg.r) * factor);
  const g = Math.round(bg.g + (text.g - bg.g) * factor);
  const b = Math.round(bg.b + (text.b - bg.b) * factor);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

/**
 * 按钮色自动推导：在背景色和文本色之间取色，偏向文本色一侧（t=0.72）。
 * 确保按钮与背景有足够对比度，同时色调协调。
 */
export function pickBtnColor(bgColor: string, textColor: string): string {
  return mixColor(bgColor, textColor, 0.72, "#192b4d", "#e6f0ff");
}

/**
 * 终端强调色自动推导：
 * - 在终端背景色与前景色之间取“中间偏前景”的颜色；
 * - 目标是避免强调色贴近背景导致识别度不足，同时避免过亮抢占正文层级。
 */
export function pickShellAccentColor(bgColor: string, textColor: string): string {
  return mixColor(bgColor, textColor, SHELL_ACCENT_BLEND_T, "#192b4d", "#e6f0ff");
}
