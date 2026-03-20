import { afterEach, describe, expect, it, vi } from "vitest";

type TerminalPageOptions = {
  data?: Record<string, unknown>;
  [key: string]: unknown;
};

type TerminalCaretSnapshot = {
  left: number;
  top: number;
  height: number;
  visible: boolean;
  cursorRow: number;
  cursorCol: number;
  scrollTop: number;
  rawTop: number;
  rawLeft: number;
  rectWidth: number;
  rectHeight: number;
  lineHeight: number;
  charWidth: number;
};

type TerminalPageInstance = TerminalPageOptions & {
  data: Record<string, unknown>;
  activeTerminalStdoutTask: Record<string, unknown> | null;
  terminalStableCaretSnapshot: TerminalCaretSnapshot | null;
  terminalPendingCaretSnapshot: TerminalCaretSnapshot | null;
  terminalPendingCaretSince: number;
  shellLineHeightPx?: number;
  terminalPerf?: Record<string, unknown> | null;
  setData: (patch: Record<string, unknown>, callback?: () => void) => void;
  resolveStableTerminalCaret: (
    caret: TerminalCaretSnapshot,
    options?: Record<string, unknown>
  ) => TerminalCaretSnapshot | null;
  resolveActivationBandFromCaretSnapshot: (
    rect: Record<string, unknown>,
    caret: TerminalCaretSnapshot | null,
    cursorMetrics?: Record<string, unknown> | null
  ) => { top: number; height: number };
  resetTerminalCaretStabilityState: () => void;
  syncTerminalOverlay: (options?: Record<string, unknown>, callback?: (perf?: Record<string, unknown>) => void) => void;
  resolveOutputScrollTopForRect: ReturnType<typeof vi.fn>;
  getTerminalModes: ReturnType<typeof vi.fn>;
  shouldLogTerminalPerfFrame: ReturnType<typeof vi.fn>;
  logTerminalPerf: ReturnType<typeof vi.fn>;
};

type MiniprogramGlobals = typeof globalThis & {
  Page?: (options: TerminalPageOptions) => void;
  wx?: Record<string, unknown>;
};

function buildCaretSnapshot(top: number, left = 12): TerminalCaretSnapshot {
  return {
    left,
    top,
    height: 21,
    visible: true,
    cursorRow: Math.max(0, Math.round(top / 21)),
    cursorCol: Math.max(0, Math.round(left / 9)),
    scrollTop: 0,
    rawTop: top,
    rawLeft: left,
    rectWidth: 320,
    rectHeight: 480,
    lineHeight: 21,
    charWidth: 9
  };
}

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
    getStorageSync: vi.fn(() => undefined),
    setStorageSync: vi.fn(),
    removeStorageSync: vi.fn(),
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
    canIUse: vi.fn(() => false)
  };

  require("./index.js");

  if (!capturedPageOptions) {
    throw new Error("terminal page not captured");
  }

  const captured = capturedPageOptions as TerminalPageOptions;
  const page = {
    ...captured,
    data: JSON.parse(JSON.stringify(captured.data || {})) as Record<string, unknown>,
    activeTerminalStdoutTask: null,
    terminalStableCaretSnapshot: null,
    terminalPendingCaretSnapshot: null,
    terminalPendingCaretSince: 0,
    shellLineHeightPx: 21,
    terminalPerf: null,
    setData(patch: Record<string, unknown>, callback?: () => void) {
      Object.assign(this.data, patch);
      callback?.();
    }
  } as TerminalPageInstance;

  page.resolveOutputScrollTopForRect = vi.fn(() => 0);
  page.getTerminalModes = vi.fn(() => ({ cursorHidden: false }));
  page.shouldLogTerminalPerfFrame = vi.fn(() => false);
  page.logTerminalPerf = vi.fn();

  return { page };
}

describe("terminal caret stability", () => {
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

  it("stdout in-flight 时，短时间跳到新位置仍保留上一个稳定 caret", () => {
    let now = 1000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const { page } = createTerminalPageHarness();
    page.activeTerminalStdoutTask = {
      remainingText: "working"
    };

    const first = page.resolveStableTerminalCaret(buildCaretSnapshot(210), {
      stabilizeDuringStdout: true
    });
    now = 1040;
    const second = page.resolveStableTerminalCaret(buildCaretSnapshot(252), {
      stabilizeDuringStdout: true
    });

    expect(first?.top).toBe(210);
    expect(second?.top).toBe(210);
  });

  it("同一位置超过稳定窗口后，会提交新的 caret 位置", () => {
    let now = 2000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const { page } = createTerminalPageHarness();
    page.activeTerminalStdoutTask = {
      remainingText: "working"
    };

    page.resolveStableTerminalCaret(buildCaretSnapshot(210), {
      stabilizeDuringStdout: true
    });
    now = 2040;
    page.resolveStableTerminalCaret(buildCaretSnapshot(252), {
      stabilizeDuringStdout: true
    });
    now = 2180;
    const stabilized = page.resolveStableTerminalCaret(buildCaretSnapshot(252), {
      stabilizeDuringStdout: true
    });

    expect(stabilized?.top).toBe(252);
  });

  it("最终帧会强制提交最新 caret，不再继续冻结旧位置", () => {
    let now = 3000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const { page } = createTerminalPageHarness();
    page.activeTerminalStdoutTask = {
      remainingText: "working"
    };

    page.resolveStableTerminalCaret(buildCaretSnapshot(210), {
      stabilizeDuringStdout: true
    });
    now = 3040;
    page.resolveStableTerminalCaret(buildCaretSnapshot(252), {
      stabilizeDuringStdout: true
    });
    now = 3060;
    const finalCaret = page.resolveStableTerminalCaret(buildCaretSnapshot(252), {
      stabilizeDuringStdout: true,
      forceCommit: true
    });

    expect(finalCaret?.top).toBe(252);
  });

  it("stdout in-flight 时，激活框应跟随稳定 caret，而不是按实时位置单独跳动", () => {
    let now = 4000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const { page } = createTerminalPageHarness();
    page.activeTerminalStdoutTask = {
      remainingText: "working"
    };
    page.data.statusClass = "connected";
    page.data.activationDebugEnabled = true;
    page.data.activationDebugVisible = true;
    page.data.terminalCaretVisible = false;
    page.data.terminalCaretTopPx = 0;
    page.data.activationDebugTopPx = 0;
    page.data.activationDebugHeightPx = 0;

    const rect = {
      width: 320,
      height: 480
    };

    page.syncTerminalOverlay({
      rect,
      cursorMetrics: {
        lineHeight: 21,
        charWidth: 9,
        paddingLeft: 12,
        paddingRight: 8,
        cursorRow: 10,
        cursorCol: 1,
        rows: 20
      },
      stabilizeCaretDuringStdout: true
    });

    expect(page.data.terminalCaretTopPx).toBe(210);
    expect(page.data.activationDebugTopPx).toBe(168);

    now = 4040;
    page.syncTerminalOverlay({
      rect,
      cursorMetrics: {
        lineHeight: 21,
        charWidth: 9,
        paddingLeft: 12,
        paddingRight: 8,
        cursorRow: 12,
        cursorCol: 1,
        rows: 20
      },
      stabilizeCaretDuringStdout: true
    });

    expect(page.data.terminalCaretTopPx).toBe(210);
    expect(page.data.activationDebugTopPx).toBe(168);
  });
});
