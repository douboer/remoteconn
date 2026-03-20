import { describe, expect, it } from "vitest";
import { applyThemeChromeColor, resolveThemeChromeColor } from "./themeChrome";

type FakeMeta = {
  name: string;
  content: string;
};

type FakeDocument = {
  head: {
    appendChild: (node: FakeMeta) => void;
  };
  querySelector: (selector: string) => FakeMeta | null;
  createElement: (tagName: string) => FakeMeta;
  metas: FakeMeta[];
};

function createFakeDocument(initialMetas: FakeMeta[] = []): FakeDocument {
  const metas = [...initialMetas];
  return {
    metas,
    head: {
      appendChild: (node) => {
        metas.push(node);
      }
    },
    querySelector: (selector) => {
      if (selector !== 'meta[name="theme-color"]') {
        return null;
      }
      return metas.find((meta) => meta.name === "theme-color") ?? null;
    },
    createElement: (tagName) => {
      if (tagName !== "meta") {
        throw new Error(`unexpected tag: ${tagName}`);
      }
      return { name: "", content: "" };
    }
  };
}

describe("themeChrome", () => {
  it("优先使用当前主题背景色作为宿主顶栏颜色", () => {
    expect(resolveThemeChromeColor({ "--bg": "  #f6fbff " })).toBe("#f6fbff");
  });

  it("背景色缺失时回退默认值", () => {
    expect(resolveThemeChromeColor({})).toBe("#192b4d");
    expect(resolveThemeChromeColor({ "--bg": "   " }, "#ffffff")).toBe("#ffffff");
  });

  it("不存在 theme-color meta 时应自动创建", () => {
    const doc = createFakeDocument();
    applyThemeChromeColor("#102030", doc);

    expect(doc.metas).toHaveLength(1);
    expect(doc.metas[0]).toEqual({ name: "theme-color", content: "#102030" });
  });

  it("已存在 theme-color meta 时应更新内容而不是重复插入", () => {
    const doc = createFakeDocument([{ name: "theme-color", content: "#000000" }]);
    applyThemeChromeColor("#abcdef", doc);

    expect(doc.metas).toHaveLength(1);
    expect(doc.metas[0]?.content).toBe("#abcdef");
  });
});
