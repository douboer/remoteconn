import { afterEach, describe, expect, it, vi } from "vitest";

function loadTerminalNavigationModule() {
  const modulePath = require.resolve("./terminalNavigation.js");
  const intentModulePath = require.resolve("./terminalIntent.js");
  delete require.cache[modulePath];
  delete require.cache[intentModulePath];
  return require("./terminalNavigation.js");
}

describe("terminalNavigation", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete (global as typeof globalThis & { wx?: unknown }).wx;
    delete (global as typeof globalThis & { getCurrentPages?: unknown }).getCurrentPages;
    delete (global as typeof globalThis & { getApp?: unknown }).getApp;
  });

  it("仅对仍有效且服务器仍存在的终端会话返回可打开 serverId", () => {
    const { hasActiveTerminalSession, resolveActiveTerminalServerId } = loadTerminalNavigationModule();
    const baseSnapshot = {
      version: 1,
      serverId: "srv-1",
      sessionId: "mini-1",
      sessionKey: "key-1",
      status: "connected",
      resumeGraceMs: 15 * 60 * 1000,
      resumeExpiresAt: 0,
      savedAt: 1_700_000_000_000
    };

    expect(resolveActiveTerminalServerId(baseSnapshot, [{ id: "srv-1" }], 1_700_000_001_000)).toBe("srv-1");
    expect(hasActiveTerminalSession(baseSnapshot, [{ id: "srv-1" }], 1_700_000_001_000)).toBe(true);
    expect(
      resolveActiveTerminalServerId({ ...baseSnapshot, status: "disconnected" }, [{ id: "srv-1" }], 1_700_000_001_000)
    ).toBe("");
    expect(hasActiveTerminalSession({ ...baseSnapshot, status: "disconnected" }, [{ id: "srv-1" }], 1_700_000_001_000)).toBe(
      false
    );
    expect(resolveActiveTerminalServerId(baseSnapshot, [{ id: "srv-2" }], 1_700_000_001_000)).toBe("");
    expect(hasActiveTerminalSession(baseSnapshot, [{ id: "srv-2" }], 1_700_000_001_000)).toBe(false);
  });

  it("复用上一页终端时直接 navigateBack，并保留 AI 直启意图", () => {
    const navigateBack = vi.fn();
    const navigateTo = vi.fn();
    (
      global as typeof globalThis & {
        wx?: { navigateBack: typeof navigateBack; navigateTo: typeof navigateTo };
        getCurrentPages?: () => Array<Record<string, unknown>>;
        getApp?: () => { globalData: Record<string, unknown> };
      }
    ).wx = {
      navigateBack,
      navigateTo
    };
    (global as typeof globalThis & { getCurrentPages?: () => Array<Record<string, unknown>> }).getCurrentPages = () => [
      { route: "pages/connect/index", data: {} },
      { route: "pages/terminal/index", data: { serverId: "srv-1" } },
      { route: "pages/connect/index", data: {} }
    ];
    const globalData: Record<string, unknown> = {};
    (global as typeof globalThis & { getApp?: () => { globalData: Record<string, unknown> } }).getApp = () => ({
      globalData
    });

    const { openTerminalPage } = loadTerminalNavigationModule();
    const opened = openTerminalPage("srv-1", true, { openCodex: true });

    expect(opened).toBe(true);
    expect(navigateBack).toHaveBeenCalledWith({ delta: 1 });
    expect(navigateTo).not.toHaveBeenCalled();
    expect(globalData.pendingTerminalIntent).toMatchObject({
      action: "open_ai",
      serverId: "srv-1"
    });
  });

  it("未命中复用时按 serverId 打开终端页", () => {
    const navigateBack = vi.fn();
    const navigateTo = vi.fn();
    (
      global as typeof globalThis & {
        wx?: { navigateBack: typeof navigateBack; navigateTo: typeof navigateTo };
        getCurrentPages?: () => Array<Record<string, unknown>>;
      }
    ).wx = {
      navigateBack,
      navigateTo
    };
    (global as typeof globalThis & { getCurrentPages?: () => Array<Record<string, unknown>> }).getCurrentPages = () => [
      { route: "pages/settings/index", data: {} }
    ];

    const { openTerminalPage, resolveTerminalPageUrl } = loadTerminalNavigationModule();
    const opened = openTerminalPage("srv-9", true);

    expect(opened).toBe(true);
    expect(resolveTerminalPageUrl("srv-9", { openCodex: true })).toBe("/pages/terminal/index?serverId=srv-9&openCodex=1");
    expect(navigateTo).toHaveBeenCalledWith({ url: "/pages/terminal/index?serverId=srv-9" });
    expect(navigateBack).not.toHaveBeenCalled();
  });
});
