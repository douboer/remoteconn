import { beforeEach, describe, expect, it, vi } from "vitest";

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
    }
  };
}

function loadTerminalSessionModule() {
  const modulePath = require.resolve("./terminalSession.js");
  delete require.cache[modulePath];
  return require("./terminalSession.js");
}

describe("terminalSession", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("终端缓冲快照会保留当时的列数和行数，供恢复时避免误判几何变化", () => {
    const wxStorage = createWxStorage({});
    (global as typeof globalThis & { wx: typeof wxStorage }).wx = wxStorage;

    const terminalSession = loadTerminalSessionModule();
    terminalSession.saveTerminalBufferSnapshot({
      sessionKey: "mini-key-1",
      lines: ["prompt"],
      replayText: "prompt",
      bufferCols: 53,
      bufferRows: 18,
      cursorRow: 0,
      cursorCol: 6
    });

    expect(terminalSession.getTerminalBufferSnapshot("mini-key-1")).toEqual(
      expect.objectContaining({
        bufferCols: 53,
        bufferRows: 18,
        cursorRow: 0,
        cursorCol: 6
      })
    );
  });

  it("终端缓冲快照会保留压缩样式行，供恢复第一页时直接还原 ANSI 颜色", () => {
    const wxStorage = createWxStorage({});
    (global as typeof globalThis & { wx: typeof wxStorage }).wx = wxStorage;

    const terminalSession = loadTerminalSessionModule();
    terminalSession.saveTerminalBufferSnapshot({
      sessionKey: "mini-key-2",
      lines: ["ERR"],
      styleTable: [{ fg: "#ff5f56", bg: "#1f2937", bold: true }],
      styledLines: [[{ t: "ERR", c: 3, s: 0 }]],
      replayText: "\u001b[31;1mERR\u001b[0m",
      bufferCols: 53,
      bufferRows: 18,
      cursorRow: 0,
      cursorCol: 3
    });

    expect(terminalSession.getTerminalBufferSnapshot("mini-key-2")).toEqual(
      expect.objectContaining({
        version: 2,
        styleTable: [expect.objectContaining({ fg: "#ff5f56", bg: "#1f2937", bold: true })],
        styledLines: [[{ t: "ERR", c: 3, s: 0 }]]
      })
    );
  });
});
