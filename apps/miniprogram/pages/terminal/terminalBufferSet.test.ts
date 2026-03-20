import { describe, expect, it } from "vitest";

const {
  cloneTerminalBufferState,
  createEmptyTerminalBufferState,
  getActiveTerminalBuffer,
  getTerminalModeState
} = require("./terminalBufferSet.js");

describe("terminalBufferSet", () => {
  it("会把旧版单缓冲状态提升为 normal/alt 双缓冲结构", () => {
    const state = cloneTerminalBufferState(
      {
        cells: [[{ text: "A", width: 1, continuation: false, style: null }]],
        ansiState: { fg: "#fff", bg: "", bold: false, underline: false },
        cursorRow: 0,
        cursorCol: 1
      },
      { bufferRows: 4 }
    );

    expect(state.version).toBe(2);
    expect(state.activeBuffer).toBe("normal");
    expect(getActiveTerminalBuffer(state).isAlt).toBe(false);
    expect(state.buffers.alt.cells).toHaveLength(4);
    expect(state.cursorCol).toBe(1);
  });

  it("active buffer 镜像字段会跟随 alt buffer 切换", () => {
    const state = createEmptyTerminalBufferState({ bufferRows: 3 });
    state.activeBuffer = "alt";
    state.buffers.alt.cursorRow = 2;
    state.buffers.alt.cursorCol = 5;

    const cloned = cloneTerminalBufferState(state, { bufferRows: 3 });

    expect(cloned.activeBufferName).toBe("alt");
    expect(cloned.cursorRow).toBe(2);
    expect(cloned.cursorCol).toBe(5);
    expect(getActiveTerminalBuffer(cloned).isAlt).toBe(true);
  });

  it("模式位会按统一结构收敛，避免页面层分散保存", () => {
    const state = cloneTerminalBufferState(
      {
        modes: {
          applicationCursorKeys: true,
          applicationKeypad: true,
          cursorHidden: true,
          bracketedPasteMode: true,
          reverseWraparound: true,
          sendFocus: true,
          insertMode: true
        }
      },
      { bufferRows: 2 }
    );

    expect(getTerminalModeState(state)).toMatchObject({
      applicationCursorKeys: true,
      applicationKeypad: true,
      cursorHidden: true,
      bracketedPasteMode: true,
      reverseWraparound: true,
      sendFocus: true,
      insertMode: true,
      wraparound: true
    });
  });

  it("运行态克隆可复用 active buffer 镜像引用，避免热路径重复深拷贝", () => {
    const state = createEmptyTerminalBufferState({ bufferRows: 3 });
    state.buffers.normal.cells = [[{ text: "A", width: 1, continuation: false, style: null }]];
    state.activeBuffer = "normal";

    const cloned = cloneTerminalBufferState(state, { bufferRows: 3 }, { cloneRows: false });

    expect(cloned.cells).toBe(cloned.buffers.normal.cells);
    expect(cloned.cells).not.toBe(state.buffers.normal.cells);
  });
});
