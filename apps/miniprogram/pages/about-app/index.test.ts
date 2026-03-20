import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type SharePayload = {
  path: string;
  title: string;
};

type AboutAppPageOptions = {
  onShareAppMessage?: () => SharePayload;
};

type MiniprogramGlobals = typeof globalThis & {
  Page?: (options: AboutAppPageOptions) => void;
  wx?: {
    setNavigationBarTitle?: (options: { title: string }) => void;
  };
};

describe("about-app page", () => {
  const globalState = globalThis as MiniprogramGlobals;
  const originalPage = globalState.Page;
  const originalWx = globalState.wx;
  let capturedPageOptions: AboutAppPageOptions | null = null;

  beforeEach(() => {
    capturedPageOptions = null;
    vi.resetModules();
    globalState.Page = vi.fn((options: AboutAppPageOptions) => {
      capturedPageOptions = options;
    });
    globalState.wx = {
      setNavigationBarTitle: vi.fn()
    };
  });

  afterEach(() => {
    if (originalPage) {
      globalState.Page = originalPage;
    } else {
      delete globalState.Page;
    }
    if (originalWx) {
      globalState.wx = originalWx;
    } else {
      delete globalState.wx;
    }
  });

  it("分享后应落到首页而不是 about 详情页", () => {
    require("./index.js");

    expect(capturedPageOptions).toBeTruthy();
    expect(capturedPageOptions?.onShareAppMessage).toBeTypeOf("function");
    expect(capturedPageOptions?.onShareAppMessage?.()).toEqual({
      title: "RemoteConn v3.0.0",
      path: "/pages/connect/index"
    });
  });
});
