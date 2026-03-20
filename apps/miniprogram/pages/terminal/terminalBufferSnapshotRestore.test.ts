import { afterEach, describe, expect, it, vi } from "vitest";

type TerminalPageOptions = {
  data?: Record<string, unknown>;
  [key: string]: any;
};

type TerminalPageInstance = TerminalPageOptions & {
  data: Record<string, unknown>;
  setData: (patch: Record<string, unknown>, callback?: () => void) => void;
};

type MiniprogramGlobals = typeof globalThis & {
  Page?: (options: TerminalPageOptions) => void;
  wx?: Record<string, unknown>;
};

const { createTerminalCell, createContinuationCell } = require("./terminalCursorModel.js");
const { serializeTerminalSnapshotRows } = require("./terminalSnapshotCodec.js");

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

describe("terminal snapshot restore", () => {
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

  it("恢复第一页时会优先使用样式快照，保留 ANSI 颜色并继续保留 replayText", () => {
    const style = { fg: "#ff5f56", bg: "#1f2937", bold: true, underline: false };
    const rows = [
      [
        createTerminalCell("错", style, 2),
        createContinuationCell(style),
        createTerminalCell("误", style, 2),
        createContinuationCell(style),
        createTerminalCell(":", style, 1)
      ]
    ];
    const snapshotLines = serializeTerminalSnapshotRows(rows);
    const { page } = createTerminalPageHarness({
      "remoteconn.terminal.buffer.v1": {
        sessionKey: "mini-key-color",
        lines: ["错误:"],
        styleTable: snapshotLines.styleTable,
        styledLines: snapshotLines.styledLines,
        replayText: "\u001b[31;1m错误:\u001b[0m",
        bufferCols: 40,
        bufferRows: 12,
        cursorRow: 0,
        cursorCol: 5
      }
    });

    page.sessionKey = "mini-key-color";
    page.restorePersistedTerminalBuffer();

    expect(page.outputCells[0][0]?.style).toEqual(style);
    expect(page.outputCells[0][2]?.style).toEqual(style);
    expect(page.outputReplayText).toBe("\u001b[31;1m错误:\u001b[0m");
    expect(page.outputReplayBytes).toBeGreaterThan(0);
  });
});
