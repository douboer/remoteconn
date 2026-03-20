import { afterEach, describe, expect, it, vi } from "vitest";

type TerminalPageOptions = {
  data?: Record<string, unknown>;
  [key: string]: unknown;
};

type TerminalPageInstance = TerminalPageOptions & {
  data: Record<string, unknown>;
  setData: (patch: Record<string, unknown>, callback?: () => void) => void;
  handleDisconnect: (reason: string) => void;
  connectGateway: ReturnType<typeof vi.fn>;
  logTerminalPerf: ReturnType<typeof vi.fn>;
  stopConnectionDiagnosticNetworkProbe: ReturnType<typeof vi.fn>;
  persistConnectionDiagnosticSamples: ReturnType<typeof vi.fn>;
  clearTerminalStdoutCarry: ReturnType<typeof vi.fn>;
  clearCodexBootstrapGuard: ReturnType<typeof vi.fn>;
  persistTerminalBufferSnapshot: ReturnType<typeof vi.fn>;
  stopVoiceRound: ReturnType<typeof vi.fn>;
  teardownAsrClient: ReturnType<typeof vi.fn>;
  syncActiveAiProvider: ReturnType<typeof vi.fn>;
  setStatus: ReturnType<typeof vi.fn>;
  autoReconnectTimer: ReturnType<typeof setTimeout> | null;
  autoReconnectAttempts: number;
  autoReconnectSuppressed: boolean;
  sessionSuspended: boolean;
  activeAiProvider: string;
  activeCodexSandboxMode: string;
  resumeGraceMs: number;
  sessionKey: string;
  server: Record<string, unknown> | null;
};

type MiniprogramGlobals = typeof globalThis & {
  Page?: (options: TerminalPageOptions) => void;
  wx?: Record<string, unknown>;
};

function createWxStorage(initial: Record<string, unknown>) {
  const store = new Map<string, unknown>(Object.entries(initial));
  return {
    getStorageSync(key: string) {
      return store.get(key);
    },
    setStorageSync(key: string, value: unknown) {
      store.set(key, value);
    },
    removeStorageSync(key: string) {
      store.delete(key);
    },
    getStorageInfoSync() {
      return {
        keys: Array.from(store.keys())
      };
    }
  };
}

function createTerminalPageHarness(initialStorage: Record<string, unknown> = {}) {
  const globalState = globalThis as MiniprogramGlobals;
  let capturedPageOptions: TerminalPageOptions | null = null;
  const noop = () => {};
  const wxStorage = createWxStorage(initialStorage);

  vi.resetModules();
  delete require.cache[require.resolve("./index.js")];
  globalState.Page = vi.fn((options: TerminalPageOptions) => {
    capturedPageOptions = options;
  });
  globalState.wx = {
    ...wxStorage,
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

  page.logTerminalPerf = vi.fn();
  page.stopConnectionDiagnosticNetworkProbe = vi.fn();
  page.persistConnectionDiagnosticSamples = vi.fn();
  page.clearTerminalStdoutCarry = vi.fn();
  page.clearCodexBootstrapGuard = vi.fn();
  page.persistTerminalBufferSnapshot = vi.fn();
  page.stopVoiceRound = vi.fn();
  page.teardownAsrClient = vi.fn();
  page.syncActiveAiProvider = vi.fn();
  page.setStatus = vi.fn(function (this: TerminalPageInstance, status: string) {
    this.data.statusText = status;
  });
  page.connectGateway = vi.fn().mockResolvedValue(undefined);
  page.autoReconnectTimer = null;
  page.autoReconnectAttempts = 0;
  page.autoReconnectSuppressed = false;
  page.sessionSuspended = false;
  page.activeAiProvider = "";
  page.activeCodexSandboxMode = "";
  page.resumeGraceMs = 5 * 60 * 1000;
  page.sessionKey = "session-key";
  page.server = {
    id: "srv-1",
    name: "srv-1",
    host: "127.0.0.1",
    port: 22,
    username: "root"
  };
  page.data.serverId = "srv-1";
  page.data.serverLabel = "srv-1";
  page.data.sessionId = "session-1";

  return {
    page,
    wxRuntime: globalState.wx as Record<string, ReturnType<typeof vi.fn>>
  };
}

describe("terminal auto reconnect", () => {
  const globalState = globalThis as MiniprogramGlobals;
  const originalPage = globalState.Page;
  const originalWx = globalState.wx;

  afterEach(() => {
    vi.useRealTimers();
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

  it("ws_closed 且开启自动重连时，会按次数上限调度重连", async () => {
    vi.useFakeTimers();
    const { page } = createTerminalPageHarness({
      "remoteconn.settings.v2": {
        autoReconnect: true,
        reconnectLimit: 2
      }
    });

    page.handleDisconnect("ws_closed");

    expect(page.autoReconnectAttempts).toBe(1);
    expect(page.setStatus).toHaveBeenCalledWith("disconnected");
    expect(page.setStatus).toHaveBeenCalledWith("reconnecting");

    await vi.advanceTimersByTimeAsync(1200);

    expect(page.connectGateway).toHaveBeenCalledWith(true);
  });

  it("手动断开不会进入自动重连", async () => {
    vi.useFakeTimers();
    const { page } = createTerminalPageHarness({
      "remoteconn.settings.v2": {
        autoReconnect: true,
        reconnectLimit: 2
      }
    });

    page.handleDisconnect("manual");
    await vi.advanceTimersByTimeAsync(2000);

    expect(page.autoReconnectAttempts).toBe(0);
    expect(page.connectGateway).not.toHaveBeenCalled();
  });

  it("本地已抑制自动重连时，后续 ws_closed 不会误触发重连", async () => {
    vi.useFakeTimers();
    const { page } = createTerminalPageHarness({
      "remoteconn.settings.v2": {
        autoReconnect: true,
        reconnectLimit: 2
      }
    });

    page.autoReconnectSuppressed = true;
    page.handleDisconnect("ws_closed");
    await vi.advanceTimersByTimeAsync(2000);

    expect(page.autoReconnectAttempts).toBe(0);
    expect(page.connectGateway).not.toHaveBeenCalled();
  });
});
