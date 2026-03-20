import { afterEach, describe, expect, it } from "vitest";

function loadModule(modulePath: string) {
  const resolved = require.resolve(modulePath);
  delete require.cache[resolved];
  return require(modulePath);
}

describe("systemInfoCompat", () => {
  afterEach(() => {
    delete (global as typeof globalThis & { wx?: unknown }).wx;
  });

  it("优先使用新接口读取窗口尺寸", () => {
    (
      global as typeof globalThis & {
        wx?: {
          getWindowInfo: () => { windowWidth: number; windowHeight: number };
          getSystemInfoSync: () => { windowWidth: number; windowHeight: number };
        };
      }
    ).wx = {
      getWindowInfo() {
        return { windowWidth: 430, windowHeight: 932 };
      },
      getSystemInfoSync() {
        return { windowWidth: 320, windowHeight: 568 };
      }
    };
    const wxMock = (global as typeof globalThis & { wx?: unknown }).wx;

    const { getWindowMetrics } = loadModule("./systemInfoCompat.js");
    expect(getWindowMetrics(wxMock)).toEqual({
      windowWidth: 430,
      windowHeight: 932
    });
  });

  it("新接口不存在时回退到 getSystemInfoSync", () => {
    (
      global as typeof globalThis & {
        wx?: {
          getSystemInfoSync: () => { windowWidth: number; windowHeight: number; platform: string };
        };
      }
    ).wx = {
      getSystemInfoSync() {
        return { windowWidth: 375, windowHeight: 667, platform: "ios" };
      }
    };
    const wxMock = (global as typeof globalThis & { wx?: unknown }).wx;

    const { getWindowMetrics, getRuntimeFingerprint } = loadModule("./systemInfoCompat.js");
    expect(getWindowMetrics(wxMock)).toEqual({
      windowWidth: 375,
      windowHeight: 667
    });
    expect(getRuntimeFingerprint(wxMock)).toEqual({
      platform: "ios",
      system: "",
      brand: ""
    });
  });

  it("运行环境指纹优先组合 getAppBaseInfo 与 getDeviceInfo", () => {
    (
      global as typeof globalThis & {
        wx?: {
          getAppBaseInfo: () => { platform: string };
          getDeviceInfo: () => { brand: string; system: string };
        };
      }
    ).wx = {
      getAppBaseInfo() {
        return { platform: "devtools" };
      },
      getDeviceInfo() {
        return { brand: "apple", system: "iOS 18.1" };
      }
    };
    const wxMock = (global as typeof globalThis & { wx?: unknown }).wx;

    const { getRuntimeFingerprint } = loadModule("./systemInfoCompat.js");
    expect(getRuntimeFingerprint(wxMock)).toEqual({
      platform: "devtools",
      system: "iOS 18.1",
      brand: "apple"
    });
  });
});
