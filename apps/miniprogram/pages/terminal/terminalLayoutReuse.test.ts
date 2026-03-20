import { afterEach, describe, expect, it, vi } from "vitest";

const {
  ANSI_RESET_STATE,
  cloneAnsiState,
  createEmptyTerminalBufferState
} = require("./terminalBufferState.js");

type TerminalPageOptions = {
  data?: Record<string, unknown>;
  [key: string]: unknown;
};

type TerminalPageInstance = TerminalPageOptions & {
  data: Record<string, unknown>;
  outputCursorRow: number;
  outputCursorCol: number;
  outputCells: unknown[][];
  outputReplayText: string;
  outputReplayBytes: number;
  outputAnsiState: Record<string, unknown>;
  outputTerminalState: Record<string, unknown>;
  terminalCols: number;
  terminalRows: number;
  terminalBufferMaxEntries: number;
  terminalBufferMaxBytes: number;
  setData: (patch: Record<string, unknown>, callback?: () => void) => void;
  applyTerminalBufferState: (
    state: Record<string, unknown>,
    runtimeOptions?: Record<string, unknown>
  ) => Record<string, unknown>;
  applyTerminalBufferRuntimeState: (
    state: Record<string, unknown>,
    runtimeOptions?: Record<string, unknown>
  ) => Record<string, unknown>;
  syncTerminalReplayBuffer: (cleanText: string) => void;
  createQueuedTerminalOutputTask: (request: Record<string, unknown>) => Record<string, any>;
  applyQueuedTerminalOutputBatch: (request: Record<string, unknown>) => Record<string, any>;
  refreshOutputLayout: (options: Record<string, unknown>, callback?: (viewState: unknown) => void) => void;
  queryOutputRect: ReturnType<typeof vi.fn>;
  buildTerminalLayoutState: ReturnType<typeof vi.fn>;
  runAfterTerminalLayout: ReturnType<typeof vi.fn>;
  shouldLogTerminalPerfFrame: ReturnType<typeof vi.fn>;
  logTerminalPerf: ReturnType<typeof vi.fn>;
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
    setData(patch: Record<string, unknown>, callback?: () => void) {
      Object.assign(this.data, patch);
      callback?.();
    }
  } as TerminalPageInstance;

  return { page };
}

function initTerminalPageOutputRuntime(page: TerminalPageInstance) {
  page.terminalCols = 80;
  page.terminalRows = 24;
  page.terminalBufferMaxEntries = 5000;
  page.terminalBufferMaxBytes = 4 * 1024 * 1024;
  page.outputCursorRow = 0;
  page.outputCursorCol = 0;
  page.outputCells = [[]];
  page.outputReplayText = "";
  page.outputReplayBytes = 0;
  page.outputAnsiState = cloneAnsiState(ANSI_RESET_STATE);
  page.outputTerminalState = createEmptyTerminalBufferState({
    bufferCols: page.terminalCols,
    bufferRows: page.terminalRows
  });
  page.applyTerminalBufferState(page.outputTerminalState);
}

describe("terminal layout rect reuse", () => {
  const globalState = globalThis as MiniprogramGlobals;
  const originalPage = globalState.Page;
  const originalWx = globalState.wx;

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
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

  it("stdout 连续 slice 复用 rect 时不应重复查询输出区几何", () => {
    const { page } = createTerminalPageHarness();
    const cachedRect = {
      left: 0,
      top: 0,
      right: 320,
      bottom: 480,
      width: 320,
      height: 480
    };
    page.queryOutputRect = vi.fn();
    page.buildTerminalLayoutState = vi.fn(() => ({
      lineHeight: 21,
      charWidth: 9,
      paddingLeft: 8,
      paddingRight: 8,
      renderLines: [{ lineStyle: "", segments: [] }],
      renderStartRow: 24,
      renderEndRow: 25,
      contentRowCount: 120,
      topSpacerHeight: 504,
      bottomSpacerHeight: 1995,
      keyboardInsetHeight: 0,
      maxScrollTop: 2079,
      nextScrollTop: 0,
      cursorRow: 0,
      cursorCol: 0,
      cols: 33,
      rows: 22,
      rect: cachedRect
    }));
    page.runAfterTerminalLayout = vi.fn((callback?: () => void) => {
      callback?.();
    });
    page.shouldLogTerminalPerfFrame = vi.fn(() => false);
    page.logTerminalPerf = vi.fn();

    const done = vi.fn();
    page.refreshOutputLayout(
      {
        rect: cachedRect,
        reuseRect: true,
        skipPostLayoutRectQuery: true
      },
      done
    );

    expect(page.queryOutputRect).not.toHaveBeenCalled();
    expect(page.buildTerminalLayoutState).toHaveBeenCalledWith(
      cachedRect,
      expect.objectContaining({
        rect: cachedRect,
        reuseRect: true,
        skipPostLayoutRectQuery: true
      })
    );
    expect(page.data.outputRenderLines).toEqual([{ lineStyle: "", segments: [] }]);
    expect(page.data.outputTopSpacerPx).toBe(504);
    expect(page.data.outputBottomSpacerPx).toBe(1995);
    expect(done).toHaveBeenCalledWith(
      expect.objectContaining({
        rect: cachedRect
      })
    );
  });

  it("滚动补刷窗口时不应回写 outputScrollTop，避免打断手势滚动", () => {
    const { page } = createTerminalPageHarness();
    const cachedRect = {
      left: 0,
      top: 0,
      right: 320,
      bottom: 480,
      width: 320,
      height: 480
    };
    const patches: Record<string, unknown>[] = [];
    const originalSetData = page.setData;
    page.setData = function setDataWithSpy(patch: Record<string, unknown>, callback?: () => void) {
      patches.push({ ...patch });
      originalSetData.call(this, patch, callback);
    };
    page.currentOutputScrollTop = 960;
    page.queryOutputRect = vi.fn();
    page.buildTerminalLayoutState = vi.fn(() => ({
      lineHeight: 21,
      charWidth: 9,
      paddingLeft: 8,
      paddingRight: 8,
      renderLines: [{ lineStyle: "", segments: [] }],
      renderStartRow: 40,
      renderEndRow: 80,
      contentRowCount: 200,
      topSpacerHeight: 840,
      bottomSpacerHeight: 2520,
      keyboardInsetHeight: 0,
      maxScrollTop: 3129,
      nextScrollTop: 960,
      cursorRow: 50,
      cursorCol: 0,
      cols: 33,
      rows: 22,
      rect: cachedRect
    }));
    page.runAfterTerminalLayout = vi.fn((callback?: () => void) => {
      callback?.();
    });
    page.shouldLogTerminalPerfFrame = vi.fn(() => false);
    page.logTerminalPerf = vi.fn();

    page.refreshOutputLayout({
      rect: cachedRect,
      reuseRect: true,
      skipPostLayoutRectQuery: true,
      preserveScrollTop: true
    });

    expect(patches[0]).not.toHaveProperty("outputScrollTop");
    expect(page.currentOutputScrollTop).toBe(960);
  });

  it("scroll 过程中不应立刻同步 overlay，而是走节流定时器", () => {
    vi.useFakeTimers();
    const { page } = createTerminalPageHarness();
    page.outputRectSnapshot = {
      left: 0,
      top: 0,
      right: 320,
      bottom: 480,
      width: 320,
      height: 480
    };
    page.syncTerminalOverlay = vi.fn();
    page.refreshOutputLayout = vi.fn();

    page.onOutputScroll({
      detail: {
        scrollTop: 480
      }
    });

    expect(page.syncTerminalOverlay).not.toHaveBeenCalled();
    vi.advanceTimersByTime(31);
    expect(page.syncTerminalOverlay).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(page.syncTerminalOverlay).toHaveBeenCalledTimes(1);
    expect(page.refreshOutputLayout).not.toHaveBeenCalled();
  });

  it("接近窗口边缘时会在滚动中提前补刷正文窗口", () => {
    vi.useFakeTimers();
    const { page } = createTerminalPageHarness();
    const cachedRect = {
      left: 0,
      top: 0,
      right: 320,
      bottom: 480,
      width: 320,
      height: 480
    };
    page.outputRectSnapshot = cachedRect;
    page.outputViewportWindow = {
      renderStartRow: 40,
      renderEndRow: 100,
      contentRowCount: 200,
      lineHeight: 20,
      visibleRows: 20
    };
    page.syncTerminalOverlay = vi.fn();
    page.refreshOutputLayout = vi.fn(
      (options: Record<string, unknown>, callback?: (viewState: unknown) => void) => {
        callback?.({
          rect: cachedRect,
          lineHeight: 20,
          charWidth: 9,
          paddingLeft: 8,
          paddingRight: 8,
          cursorRow: 80,
          cursorCol: 0,
          rows: 20
        });
      }
    );

    page.onOutputScroll({
      detail: {
        scrollTop: 1500
      }
    });

    expect(page.refreshOutputLayout).not.toHaveBeenCalled();
    vi.advanceTimersByTime(15);
    expect(page.refreshOutputLayout).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(page.refreshOutputLayout).toHaveBeenCalledWith(
      expect.objectContaining({
        preserveScrollTop: true,
        scrollViewport: true,
        rect: cachedRect,
        reuseRect: true,
        skipPostLayoutRectQuery: true
      }),
      expect.any(Function)
    );
  });

  it("可视区已经落进顶部 spacer 时会立刻补刷正文，避免先看到空白", () => {
    vi.useFakeTimers();
    const { page } = createTerminalPageHarness();
    const cachedRect = {
      left: 0,
      top: 0,
      right: 320,
      bottom: 480,
      width: 320,
      height: 480
    };
    page.outputRectSnapshot = cachedRect;
    page.outputViewportWindow = {
      renderStartRow: 40,
      renderEndRow: 100,
      contentRowCount: 200,
      lineHeight: 20,
      visibleRows: 20
    };
    page.syncTerminalOverlay = vi.fn();
    page.refreshOutputLayout = vi.fn(
      (options: Record<string, unknown>, callback?: (viewState: unknown) => void) => {
        callback?.({
          rect: cachedRect,
          lineHeight: 20,
          charWidth: 9,
          paddingLeft: 8,
          paddingRight: 8,
          cursorRow: 40,
          cursorCol: 0,
          rows: 20
        });
      }
    );

    page.onOutputScroll({
      detail: {
        scrollTop: 300
      }
    });

    expect(page.refreshOutputLayout).toHaveBeenCalledWith(
      expect.objectContaining({
        preserveScrollTop: true,
        scrollViewport: true,
        rect: cachedRect,
        reuseRect: true,
        skipPostLayoutRectQuery: true
      }),
      expect.any(Function)
    );
  });

  it("stdout defer slice 只更新运行态，不应立刻同步 replay 文本和可视 rows", () => {
    let now = 1000;
    vi.spyOn(Date, "now").mockImplementation(() => {
      now += 4;
      return now;
    });
    const { page } = createTerminalPageHarness();
    initTerminalPageOutputRuntime(page);
    const syncReplaySpy = vi.spyOn(page, "syncTerminalReplayBuffer");
    const applyStateSpy = vi.spyOn(page, "applyTerminalBufferState");
    const applyRuntimeSpy = vi.spyOn(page, "applyTerminalBufferRuntimeState");
    const text = "a".repeat(10 * 1024);
    const request = {
      options: {},
      stdoutSamples: [
        {
          text,
          appendStartedAt: 1,
          visibleBytes: text.length,
          visibleFrameCount: 1
        }
      ]
    };

    request.stdoutTask = page.createQueuedTerminalOutputTask(request);
    request.stdoutTask.lastRenderCompletedAt = Date.now();

    const result = page.applyQueuedTerminalOutputBatch(request);

    expect(result.shouldRender).toBe(false);
    expect(syncReplaySpy).not.toHaveBeenCalled();
    expect(applyStateSpy).not.toHaveBeenCalled();
    expect(applyRuntimeSpy).toHaveBeenCalledTimes(1);
    expect(page.outputReplayText).toBe("");
    expect(page.outputReplayBytes).toBe(0);
    expect(request.stdoutTask.pendingReplayBytes).toBeGreaterThan(0);
  });

  it("stdout 真正 render 时会一次性提交 defer 期间累积的 replay 文本", () => {
    let now = 2000;
    vi.spyOn(Date, "now").mockImplementation(() => {
      now += 4;
      return now;
    });
    const { page } = createTerminalPageHarness();
    initTerminalPageOutputRuntime(page);
    const syncReplaySpy = vi.spyOn(page, "syncTerminalReplayBuffer");
    const applyStateSpy = vi.spyOn(page, "applyTerminalBufferState");
    const text = "a".repeat(10 * 1024);
    const request = {
      options: {},
      stdoutSamples: [
        {
          text,
          appendStartedAt: 1,
          visibleBytes: text.length,
          visibleFrameCount: 1
        }
      ]
    };

    request.stdoutTask = page.createQueuedTerminalOutputTask(request);
    request.stdoutTask.lastRenderCompletedAt = Date.now();

    const deferred = page.applyQueuedTerminalOutputBatch(request);
    expect(deferred.shouldRender).toBe(false);

    request.stdoutTask.slicesSinceLastRender = 7;
    request.stdoutTask.lastRenderCompletedAt = Date.now() - 1000;

    const rendered = page.applyQueuedTerminalOutputBatch(request);

    expect(rendered.shouldRender).toBe(true);
    expect(syncReplaySpy).toHaveBeenCalledTimes(1);
    expect(syncReplaySpy).toHaveBeenCalledWith("a".repeat(2048));
    expect(applyStateSpy).toHaveBeenCalledTimes(1);
    expect(page.outputReplayBytes).toBe(2048);
    expect(request.stdoutTask.pendingReplayBytes).toBe(0);
    expect(request.stdoutTask.pendingReplayText).toBe("");
  });
});
