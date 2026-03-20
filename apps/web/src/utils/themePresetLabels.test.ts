import { describe, expect, it } from "vitest";
import { buildThemePresetOptions, getThemePresetLabel } from "./themePresetLabels";

describe("themePresetLabels", () => {
  it("会为已确认主题输出新的中文展示名", () => {
    expect(getThemePresetLabel("tide")).toBe("潮汐");
    expect(getThemePresetLabel("暮砂")).toBe("沙丘");
    expect(getThemePresetLabel("靛雾")).toBe("岚雾");
  });

  it("未重命名主题继续回退内部值，并保留共享预设顺序", () => {
    const options = buildThemePresetOptions();

    expect(getThemePresetLabel("绛霓")).toBe("绛霓");
    expect(options.slice(0, 7)).toEqual([
      { label: "潮汐", value: "tide" },
      { label: "沙丘", value: "暮砂" },
      { label: "棱光", value: "霓潮" },
      { label: "苔影", value: "苔暮" },
      { label: "余烬", value: "焰岩" },
      { label: "陶土", value: "岩陶" },
      { label: "岚雾", value: "靛雾" }
    ]);
  });
});
