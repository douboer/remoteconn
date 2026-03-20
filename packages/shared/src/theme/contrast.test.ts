import { describe, expect, it } from "vitest";
import { contrastRatio, pickBestBackground, pickShellAccentColor } from "./contrast";

describe("theme contrast", () => {
  it("计算对比度", () => {
    expect(contrastRatio("#ffffff", "#000000")).toBeGreaterThan(7);
  });

  it("自动选择背景", () => {
    const selected = pickBestBackground("#e6f0ff", "#5bd2ff");
    expect(selected.startsWith("#")).toBe(true);
  });

  it("终端强调色取背景和前景之间，并略偏前景", () => {
    expect(pickShellAccentColor("#192b4d", "#e6f0ff")).toBe("#9ca9bf");
  });
});
