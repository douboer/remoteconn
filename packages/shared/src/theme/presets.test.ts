import { describe, expect, it } from "vitest";
import { pickShellAccentColor } from "./contrast";
import { getShellVariant } from "./presets";

describe("theme presets", () => {
  it("shell 变体的 cursor 按背景和前景自动推导", () => {
    const variant = getShellVariant("tide", "dark");
    expect(variant.cursor).toBe(pickShellAccentColor(variant.bg, variant.text));
    expect(variant.cursor).toBe("#9ca9bf");
  });
});
