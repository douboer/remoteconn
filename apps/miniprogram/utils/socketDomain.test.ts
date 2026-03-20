import { describe, expect, it } from "vitest";

const { resolveSocketDomainHint } = require("./socketDomain.js");

describe("socketDomain", () => {
  it("将 https 网关地址归一化为 wss 域名提示", () => {
    expect(resolveSocketDomainHint("https://conn.biboer.cn")).toBe("wss://conn.biboer.cn");
  });

  it("保留已带协议与端口的 socket 地址", () => {
    expect(resolveSocketDomainHint("wss://conn.biboer.cn:443/")).toBe("wss://conn.biboer.cn");
  });

  it("在缺少 URL 全局时仍能解析真机网关地址", () => {
    const originalUrl = globalThis.URL;
    // 模拟小程序真机缺少标准 URL 构造器的运行时。
    // @ts-expect-error 测试里需要显式移除全局对象。
    delete globalThis.URL;
    try {
      expect(resolveSocketDomainHint("wss://conn.biboer.cn")).toBe("wss://conn.biboer.cn");
    } finally {
      globalThis.URL = originalUrl;
    }
  });
});
