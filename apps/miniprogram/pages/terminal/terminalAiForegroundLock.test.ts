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

function createTerminalPageHarness(initialStorage: Record<string, unknown>) {
  const globalState = globalThis as MiniprogramGlobals;
  let capturedPageOptions: TerminalPageOptions | null = null;
  const storage = new Map<string, unknown>(Object.entries(initialStorage));
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
    getStorageSync: vi.fn((key: string) => storage.get(key)),
    setStorageSync: vi.fn((key: string, value: unknown) => {
      storage.set(key, value);
    }),
    removeStorageSync: vi.fn((key: string) => {
      storage.delete(key);
    }),
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

  return { page, storage };
}

describe("terminal ai foreground lock", () => {
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

  it("当前前台是 Codex 时，成功发出 Ctrl+C 会释放本地 AI 锁并同步快照", () => {
    const { page, storage } = createTerminalPageHarness({});
    const sendStdin = vi.fn();

    page.client = { sendStdin };
    page.sessionKey = "mini-session-key";
    page.activeAiProvider = "codex";
    page.activeCodexSandboxMode = "danger-full-access";
    page.aiRuntimeExitCarry = "partial-marker";
    page.data.serverId = "srv-1";
    page.data.serverLabel = "server-1";
    page.data.sessionId = "mini-session";
    page.data.statusText = "connected";

    const sent = page.sendControlSequence("\u0003");
    const snapshot = storage.get("remoteconn.terminal.session.v1") as Record<string, unknown>;

    expect(sent).toBe(true);
    expect(sendStdin).toHaveBeenCalledWith("\u0003");
    expect(page.activeAiProvider).toBe("");
    expect(page.activeCodexSandboxMode).toBe("");
    expect(page.aiRuntimeExitCarry).toBe("");
    expect(snapshot.activeAiProvider).toBe("");
    expect(snapshot.codexSandboxMode).toBe("");
  });

  it("Codex 前台态时，清屏操作应直接忽略", () => {
    const { page } = createTerminalPageHarness({});

    page.activeAiProvider = "codex";
    page.data.statusText = "connected";
    page.captureTerminalBufferState = vi.fn();

    const result = page.onClearScreen();

    expect(result).toBe(false);
    expect(page.captureTerminalBufferState).not.toHaveBeenCalled();
  });

  it("home 快捷键会发送切回服务器工作目录的 cd 命令", () => {
    const { page } = createTerminalPageHarness({});
    const sendStdin = vi.fn();

    page.client = { sendStdin };
    page.server = { projectPath: "~/workspace/remoteconn" };

    page.onTouchKeyTap({
      currentTarget: {
        dataset: {
          key: "home"
        }
      }
    } as unknown as Parameters<typeof page.onTouchKeyTap>[0]);

    expect(sendStdin).toHaveBeenCalledWith("cd \"$HOME\"/'workspace/remoteconn'\r");
  });

  it("AI 前台态时，home 快捷键应静默忽略", () => {
    const { page } = createTerminalPageHarness({});
    const sendStdin = vi.fn();

    page.client = { sendStdin };
    page.server = { projectPath: "~/workspace/remoteconn" };
    page.activeAiProvider = "copilot";

    page.onTouchKeyTap({
      currentTarget: {
        dataset: {
          key: "home"
        }
      }
    } as unknown as Parameters<typeof page.onTouchKeyTap>[0]);

    expect(sendStdin).not.toHaveBeenCalled();
    expect(globalState.wx?.showToast).not.toHaveBeenCalled();
  });
});
