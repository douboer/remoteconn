import { describe, expect, it } from "vitest";
import {
  ABOUT_BRAND,
  ABOUT_HOME_ITEMS,
  buildAboutInfoRows,
  getAboutDetailContent,
  isAboutDetailKey
} from "./about";

describe("about content", () => {
  it("首页入口与小程序结构一致", () => {
    expect(ABOUT_HOME_ITEMS.map((item) => item.key)).toEqual([
      "manual",
      "feedback",
      "privacy",
      "changelog",
      "app"
    ]);
  });

  it("可识别合法详情 key", () => {
    expect(isAboutDetailKey("manual")).toBe(true);
    expect(isAboutDetailKey("unknown")).toBe(false);
  });

  it("非法 key 会回退到关于详情", () => {
    expect(getAboutDetailContent("unknown").title).toBe("关于");
  });

  it("产品信息可拆成标签和值", () => {
    const rows = buildAboutInfoRows(getAboutDetailContent("app"));
    expect(rows[0]).toEqual({
      key: "row-0",
      label: "产品名称：",
      value: ABOUT_BRAND.productName
    });
  });
});
