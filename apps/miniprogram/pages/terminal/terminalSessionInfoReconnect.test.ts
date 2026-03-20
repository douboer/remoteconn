import { afterEach, describe, expect, it, vi } from "vitest";

type TerminalPageOptions = {
  data?: Record<string, unknown>;
  [key: string]: unknown;
};

type TerminalPageInstance = TerminalPageOptions & {
  data: Record<string, unknown>;
  setData: (patch: Record<string, unknown>, callback?: () => void) => void;
};

type MiniprogramGlobals = typeof globalThis & {
  Page?: (options: TerminalPageOptions) => void;
  wx?: Record<string, unknown>;
};

function createTerminalPageHarness() {
  const globalState = globalThis as MiniprogramGlobals;
  let capturedPageOptions: TerminalPageOptions | null = null;
  const noop = () => {};

  vi.resetModules();
  delete require.cache[require.resolve("./index.js")];
  globalState.Page = vi.fn((options: TerminalPageOptions) => {
    capturedPageOptions = options;
  });
  globalState.wx = {
    env: {
      USER_DATA_PATH: "/tmp"
    },
    getRecorderManager: vi.fn(() => ({
      onStart: noop,
      onStop: noop,
      onError: noop,
      onFrameRecorded: noop,
      start: noop,
      stop: noop
    })),
    createInnerAudioContext: vi.fn(() => ({
      onCanplay: noop,
      onPlay: noop,
      onEnded: noop,
      onStop: noop,
      onError: noop,
      stop: noop,
      destroy: noop
    })),
    setInnerAudioOption: vi.fn(),
    createSelectorQuery: vi.fn(() => ({
      in: vi.fn(() => ({
        select: vi.fn(() => ({
          boundingClientRect: vi.fn(() => ({
            exec: noop
          }))
        }))
      }))
    })),
    nextTick: vi.fn((callback?: () => void) => {
      callback?.();
    }),
    getSystemInfoSync: vi.fn(() => ({})),
    canIUse: vi.fn(() => false),
    showToast: vi.fn()
  };

  require("./index.js");

  if (!capturedPageOptions) {
    throw new Error("terminal page not captured");
  }

  const captured = capturedPageOptions as TerminalPageOptions;
  const page = {
    ...captured,
    data: JSON.parse(JSON.stringify(captured.data || {})) as Record<string, unknown>,
    setData(patch: Record<string, unknown>, callback?: () => void) {
      Object.assign(this.data, patch);
      callback?.();
    }
  } as TerminalPageInstance;

  return { page };
}

describe("terminal session info reconnect", () => {
  const globalState = globalThis as MiniprogramGlobals;
  const originalPage = globalState.Page;
  const originalWx = globalState.wx;

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
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

  it("点击 SSH 卡片会复用连接开关逻辑", () => {
    const { page } = createTerminalPageHarness();
    const onConnectionAction = vi.fn();

    page.onConnectionAction = onConnectionAction;
    page.data.connectionActionDisabled = false;

    page.onSessionInfoStatusTap({
      currentTarget: {
        dataset: {
          key: "sshConnection"
        }
      }
    } as unknown as Parameters<typeof page.onSessionInfoStatusTap>[0]);

    expect(onConnectionAction).toHaveBeenCalledTimes(1);
  });

  it("点击 AI 卡片会复用 AI 按钮逻辑", () => {
    const { page } = createTerminalPageHarness();
    const onOpenCodex = vi.fn();

    page.onOpenCodex = onOpenCodex;
    page.data.aiLaunchBusy = false;

    page.onSessionInfoStatusTap({
      currentTarget: {
        dataset: {
          key: "aiConnection"
        }
      }
    } as unknown as Parameters<typeof page.onSessionInfoStatusTap>[0]);

    expect(onOpenCodex).toHaveBeenCalledTimes(1);
  });

  it("连接开关禁用时点击 SSH 卡片不会触发连接动作", () => {
    const { page } = createTerminalPageHarness();
    const onConnectionAction = vi.fn();

    page.onConnectionAction = onConnectionAction;
    page.data.connectionActionDisabled = true;

    page.onSessionInfoStatusTap({
      currentTarget: {
        dataset: {
          key: "sshConnection"
        }
      }
    } as unknown as Parameters<typeof page.onSessionInfoStatusTap>[0]);

    expect(onConnectionAction).not.toHaveBeenCalled();
  });

  it("AI 正在启动时点击 AI 卡片不会重复触发", () => {
    const { page } = createTerminalPageHarness();
    const onOpenCodex = vi.fn();

    page.onOpenCodex = onOpenCodex;
    page.data.aiLaunchBusy = true;

    page.onSessionInfoStatusTap({
      currentTarget: {
        dataset: {
          key: "aiConnection"
        }
      }
    } as unknown as Parameters<typeof page.onSessionInfoStatusTap>[0]);

    expect(onOpenCodex).not.toHaveBeenCalled();
  });
});
