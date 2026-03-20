import { describe, expect, it } from "vitest";

const { resolvePageNavigationMethod } = require("./navigationPolicy.js");

describe("navigationPolicy", () => {
  it("底部导航在标准页面之间切换时使用 redirectTo 以避免堆积页面实例", () => {
    expect(resolvePageNavigationMethod("/pages/connect/index", "/pages/logs/index")).toBe("redirectTo");
    expect(resolvePageNavigationMethod("/pages/terminal/index", "/pages/settings/index")).toBe("redirectTo");
  });

  it("目标为空或与当前页面相同时不触发导航", () => {
    expect(resolvePageNavigationMethod("/pages/connect/index", "")).toBe("noop");
    expect(resolvePageNavigationMethod("/pages/connect/index", "/pages/connect/index")).toBe("noop");
  });

  it("非标准页面路径仍保留 navigateTo 兜底", () => {
    expect(resolvePageNavigationMethod("/pages/connect/index", "/packageA/detail")).toBe("navigateTo");
  });
});
