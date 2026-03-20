import { describe, expect, it } from "vitest";

const { DEFAULT_TERMINAL_MODES } = require("./terminalBufferSet.js");
const { createTerminalVtInputHandler } = require("./vtInputHandler.js");

describe("vtInputHandler", () => {
  it("OSC 10/11/12 查询会把响应写回队列", () => {
    const { handler, responses } = createHandler();

    handler.handleOscSequence(10, "?;?;?");

    expect(responses).toEqual([
      "\u001b]10;rgb:#112233\u001b\\",
      "\u001b]11;rgb:#445566\u001b\\",
      "\u001b]12;rgb:#778899\u001b\\"
    ]);
  });

  it("模式报告只回报当前真实维护的模式位", () => {
    const { handler, responses, runtimeState, setActiveBufferAlt } = createHandler();

    runtimeState.modes.applicationCursorKeys = true;
    runtimeState.modes.sendFocus = true;
    runtimeState.modes.insertMode = true;
    setActiveBufferAlt(true);

    handler.pushModeReport("?", 1);
    handler.pushModeReport("?", 1049);
    handler.pushModeReport("?", 1004);
    handler.pushModeReport("", 4);
    handler.pushModeReport("?", 9999);

    expect(responses).toEqual([
      "\u001b[?1;1$y",
      "\u001b[?1049;1$y",
      "\u001b[?1004;1$y",
      "\u001b[4;1$y",
      "\u001b[?9999;0$y"
    ]);
  });

  it("1049 私有模式切换会先保存光标，再切屏并在退出时恢复", () => {
    const { handler, switchCalls, saveCalls, restoreCalls } = createHandler();

    handler.handlePrivateMode(true, 1049);
    handler.handlePrivateMode(false, 1049);

    expect(saveCalls.count).toBe(1);
    expect(restoreCalls.count).toBe(1);
    expect(switchCalls).toEqual([
      { target: "alt", clearTarget: true },
      { target: "normal", clearTarget: false }
    ]);
  });

  it("origin mode 私有模式切换会更新模式位，并委托运行态重置光标", () => {
    const { handler, runtimeState, originModeResets } = createHandler();

    handler.handlePrivateMode(true, 6);
    handler.handlePrivateMode(false, 6);

    expect(runtimeState.modes.originMode).toBe(false);
    expect(originModeResets).toEqual([true, false]);
  });

  it("DECSTR 软重置会收回模式位与保存光标，但不会改动当前 cursor", () => {
    const { handler, runtimeState, state, activeBuffer, defaults } = createHandler();

    state.cursorRow = 7;
    state.cursorCol = 9;
    state.scrollTop = 3;
    state.scrollBottom = 8;
    state.ansiState = { fg: "#abcdef", bg: "#123456", bold: true, underline: true };
    activeBuffer.savedCursorRow = 5;
    activeBuffer.savedCursorCol = 6;
    activeBuffer.savedAnsiState = { fg: "#ffffff", bg: "#000000", bold: true, underline: false };
    runtimeState.modes = {
      ...DEFAULT_TERMINAL_MODES,
      applicationCursorKeys: true,
      sendFocus: true,
      insertMode: true,
      cursorHidden: true
    };

    handler.softResetTerminal();

    expect(runtimeState.modes).toEqual(defaults);
    expect(state.cursorRow).toBe(7);
    expect(state.cursorCol).toBe(9);
    expect(state.scrollTop).toBe(0);
    expect(state.scrollBottom).toBe(23);
    expect(state.ansiState).toEqual({ fg: "", bg: "", bold: false, underline: false });
    expect(activeBuffer.savedCursorRow).toBe(0);
    expect(activeBuffer.savedCursorCol).toBe(0);
    expect(activeBuffer.savedAnsiState).toEqual({ fg: "", bg: "", bold: false, underline: false });
  });

  it("光标移动类 CSI 会按默认参数分派到对应动作", () => {
    const { handler, cursorOps } = createHandler();

    expect(handler.handleCursorControl("A", [])).toBe(true);
    expect(handler.handleCursorControl("B", [2])).toBe(true);
    expect(handler.handleCursorControl("C", [0])).toBe(true);
    expect(handler.handleCursorControl("D", [-3])).toBe(true);
    expect(handler.handleCursorControl("E", [])).toBe(true);
    expect(handler.handleCursorControl("F", [4])).toBe(true);

    expect(cursorOps).toEqual([
      { type: "up", value: 1 },
      { type: "down", value: 2 },
      { type: "right", value: 1 },
      { type: "left", value: 1 },
      { type: "nextLine", value: 1 },
      { type: "previousLine", value: 4 }
    ]);
  });

  it("HPA/VPA/CUP 会保留 VT 的 1-based 语义交给运行态落点", () => {
    const { handler, cursorOps } = createHandler();

    expect(handler.handleCursorControl("G", [5])).toBe(true);
    expect(handler.handleCursorControl("d", [])).toBe(true);
    expect(handler.handleCursorControl("H", [3, 7])).toBe(true);
    expect(handler.handleCursorControl("f", [0, -2])).toBe(true);
    expect(handler.handleCursorControl("J", [2])).toBe(false);

    expect(cursorOps).toEqual([
      { type: "column1", value: 5 },
      { type: "row1", value: 1 },
      { type: "position1", row: 3, column: 7 },
      { type: "position1", row: 1, column: 1 }
    ]);
  });

  it("擦除类 CSI 会按各自默认参数分派到对应擦除动作", () => {
    const { handler, eraseOps } = createHandler();

    expect(handler.handleEraseControl("J", [])).toBe(true);
    expect(handler.handleEraseControl("K", [2])).toBe(true);
    expect(handler.handleEraseControl("X", [0])).toBe(true);
    expect(handler.handleEraseControl("X", [-3])).toBe(true);
    expect(handler.handleEraseControl("P", [1])).toBe(false);

    expect(eraseOps).toEqual([
      { type: "display", value: 0 },
      { type: "line", value: 2 },
      { type: "chars", value: 1 },
      { type: "chars", value: 1 }
    ]);
  });

  it("编辑与滚动类 CSI 会按默认参数分派到对应 buffer 动作", () => {
    const { handler, editOps } = createHandler();

    expect(handler.handleEditControl("@", [])).toBe(true);
    expect(handler.handleEditControl("P", [2])).toBe(true);
    expect(handler.handleEditControl("L", [0])).toBe(true);
    expect(handler.handleEditControl("M", [-3])).toBe(true);
    expect(handler.handleEditControl("S", [])).toBe(true);
    expect(handler.handleEditControl("T", [4])).toBe(true);
    expect(handler.handleEditControl("r", [2])).toBe(true);
    expect(handler.handleEditControl("r", [3, 0])).toBe(true);
    expect(handler.handleEditControl("u", [])).toBe(false);

    expect(editOps).toEqual([
      { type: "insertChars", value: 1 },
      { type: "deleteChars", value: 2 },
      { type: "insertLines", value: 1 },
      { type: "deleteLines", value: 1 },
      { type: "scrollUp", value: 1 },
      { type: "scrollDown", value: 4 },
      { type: "scrollRegion", top: 2, bottom: 24 },
      { type: "scrollRegion", top: 3, bottom: 24 }
    ]);
  });

  it("CSI s/u 与 ESC 7/8 会统一分派保存与恢复光标动作", () => {
    const { handler, saveCalls, restoreCalls } = createHandler();

    expect(handler.handleCursorSaveRestoreControl("s")).toBe(true);
    expect(handler.handleCursorSaveRestoreControl("u")).toBe(true);
    expect(handler.handleCursorSaveRestoreControl("7")).toBe(true);
    expect(handler.handleCursorSaveRestoreControl("8")).toBe(true);
    expect(handler.handleCursorSaveRestoreControl("D")).toBe(false);

    expect(saveCalls.count).toBe(2);
    expect(restoreCalls.count).toBe(2);
  });

  it("查询类 CSI 会统一分派 mode report、DSR 和 DA", () => {
    const { handler, responses, runtimeState, setActiveBufferAlt } = createHandler();

    runtimeState.modes.sendFocus = true;
    setActiveBufferAlt(true);

    expect(handler.handleQueryControl("?", "$", "p", [1049])).toBe(true);
    expect(handler.handleQueryControl("?", "", "n", [6])).toBe(true);
    expect(handler.handleQueryControl("", "", "c", [0])).toBe(true);
    expect(handler.handleQueryControl(">", "", "c", [0])).toBe(true);
    expect(handler.handleQueryControl("!", "", "p", [0])).toBe(false);

    expect(responses).toEqual([
      "\u001b[?1049;1$y",
      "\u001b[?2;3R",
      "\u001b[?1;2c",
      "\u001b[>0;276;0c"
    ]);
  });

  it("ESC D/E/M 与 ESC 7/8 会统一走 ESC 分派入口", () => {
    const { handler, saveCalls, restoreCalls, escOps } = createHandler();

    expect(handler.handleEscControl("7")).toBe(true);
    expect(handler.handleEscControl("8")).toBe(true);
    expect(handler.handleEscControl("D")).toBe(true);
    expect(handler.handleEscControl("E")).toBe(true);
    expect(handler.handleEscControl("M")).toBe(true);
    expect(handler.handleEscControl("]")).toBe(false);

    expect(saveCalls.count).toBe(1);
    expect(restoreCalls.count).toBe(1);
    expect(escOps).toEqual(["D", "E", "M"]);
  });

  it("CSI 顶层分派会统一路由查询、模式切换和普通控制动作", () => {
    const { handler, responses, runtimeState, cursorOps, eraseOps, editOps, saveCalls, defaults } = createHandler();

    runtimeState.modes.applicationCursorKeys = true;
    runtimeState.modes.insertMode = true;

    expect(handler.handleCsiControl("!", "", "p", [0])).toBe(true);
    expect(runtimeState.modes).toEqual(defaults);

    expect(handler.handleCsiControl("?", "", "h", [1])).toBe(true);
    expect(runtimeState.modes.applicationCursorKeys).toBe(true);

    expect(handler.handleCsiControl("", "", "h", [4])).toBe(true);
    expect(runtimeState.modes.insertMode).toBe(true);

    expect(handler.handleCsiControl("?", "$", "p", [1])).toBe(true);
    expect(handler.handleCsiControl("", "", "B", [2])).toBe(true);
    expect(handler.handleCsiControl("", "", "K", [])).toBe(true);
    expect(handler.handleCsiControl("", "", "@", [3])).toBe(true);
    expect(handler.handleCsiControl("", "", "s", [])).toBe(true);
    expect(handler.handleCsiControl(">", "", "u", [1])).toBe(false);

    expect(responses).toEqual(["\u001b[?1;1$y"]);
    expect(cursorOps).toEqual([{ type: "down", value: 2 }]);
    expect(eraseOps).toEqual([{ type: "line", value: 0 }]);
    expect(editOps).toEqual([{ type: "insertChars", value: 3 }]);
    expect(saveCalls.count).toBe(1);
  });
});

function createHandler() {
  const defaults = { ...DEFAULT_TERMINAL_MODES };
  const responses: string[] = [];
  const runtimeState = { modes: { ...defaults } };
  const normalBuffer = {
    isAlt: false,
    savedCursorRow: 0,
    savedCursorCol: 0,
    savedAnsiState: { fg: "", bg: "", bold: false, underline: false }
  };
  const altBuffer = {
    isAlt: true,
    savedCursorRow: 0,
    savedCursorCol: 0,
    savedAnsiState: { fg: "", bg: "", bold: false, underline: false }
  };
  const state = {
    cursorRow: 1,
    cursorCol: 2,
    scrollTop: 0,
    scrollBottom: 23,
    ansiState: { fg: "", bg: "", bold: false, underline: false }
  };
  let activeBuffer = normalBuffer;
  const switchCalls: Array<{ target: string; clearTarget: boolean }> = [];
  const saveCalls = { count: 0 };
  const restoreCalls = { count: 0 };
  const cursorOps: Array<
    | { type: "up" | "down" | "right" | "left" | "nextLine" | "previousLine"; value: number }
    | { type: "column1" | "row1"; value: number }
    | { type: "position1"; row: number; column: number }
  > = [];
  const eraseOps: Array<
    | { type: "display" | "line"; value: number }
    | { type: "chars"; value: number }
  > = [];
  const editOps: Array<
    | { type: "insertChars" | "deleteChars" | "insertLines" | "deleteLines" | "scrollUp" | "scrollDown"; value: number }
    | { type: "scrollRegion"; top: number; bottom: number }
  > = [];
  const escOps: string[] = [];
  const originModeResets: boolean[] = [];

  const handler = createTerminalVtInputHandler({
    ansiResetState: { fg: "", bg: "", bold: false, underline: false },
    bufferCols: 80,
    bufferRows: 24,
    cloneAnsiState: (value: { fg?: string; bg?: string; bold?: boolean; underline?: boolean } | null) => ({
      fg: value && value.fg ? String(value.fg) : "",
      bg: value && value.bg ? String(value.bg) : "",
      bold: !!(value && value.bold),
      underline: !!(value && value.underline)
    }),
    getActiveBuffer: () => activeBuffer,
    getCursorCol: () => state.cursorCol,
    getScreenCursorRow: () => state.cursorRow,
    getScrollBottom: () => state.scrollBottom,
    getScrollTop: () => state.scrollTop,
    responses,
    restoreCurrentCursor: () => {
      restoreCalls.count += 1;
    },
    runtimeColors: {
      defaultForeground: "#112233",
      defaultBackground: "#445566",
      defaultCursor: "#778899"
    },
    runtimeState,
    saveCurrentCursor: () => {
      saveCalls.count += 1;
    },
    moveCursorUp: (value: number) => {
      cursorOps.push({ type: "up", value });
    },
    moveCursorDown: (value: number) => {
      cursorOps.push({ type: "down", value });
    },
    moveCursorRight: (value: number) => {
      cursorOps.push({ type: "right", value });
    },
    moveCursorLeft: (value: number) => {
      cursorOps.push({ type: "left", value });
    },
    moveCursorNextLine: (value: number) => {
      cursorOps.push({ type: "nextLine", value });
    },
    moveCursorPreviousLine: (value: number) => {
      cursorOps.push({ type: "previousLine", value });
    },
    setCursorColumn1: (value: number) => {
      cursorOps.push({ type: "column1", value });
    },
    setCursorRow1: (value: number) => {
      cursorOps.push({ type: "row1", value });
    },
    setCursorPosition1: (row: number, column: number) => {
      cursorOps.push({ type: "position1", row, column });
    },
    clearDisplayByMode: (value: number) => {
      eraseOps.push({ type: "display", value });
    },
    clearLineByMode: (value: number) => {
      eraseOps.push({ type: "line", value });
    },
    eraseChars: (value: number) => {
      eraseOps.push({ type: "chars", value });
    },
    insertChars: (value: number) => {
      editOps.push({ type: "insertChars", value });
    },
    deleteChars: (value: number) => {
      editOps.push({ type: "deleteChars", value });
    },
    insertLines: (value: number) => {
      editOps.push({ type: "insertLines", value });
    },
    deleteLines: (value: number) => {
      editOps.push({ type: "deleteLines", value });
    },
    scrollRegionUp: (value: number) => {
      editOps.push({ type: "scrollUp", value });
    },
    scrollRegionDown: (value: number) => {
      editOps.push({ type: "scrollDown", value });
    },
    setScrollRegion: (top: number, bottom: number) => {
      editOps.push({ type: "scrollRegion", top, bottom });
    },
    resetCursorForOriginMode: (enabled: boolean) => {
      originModeResets.push(enabled);
    },
    indexDown: () => {
      escOps.push("D");
    },
    nextLine: () => {
      escOps.push("E");
    },
    reverseIndex: () => {
      escOps.push("M");
    },
    setAnsiState: (value: { fg: string; bg: string; bold: boolean; underline: boolean }) => {
      state.ansiState = { ...value };
    },
    setCursorCol: (value: number) => {
      state.cursorCol = value;
    },
    setCursorRow: (value: number) => {
      state.cursorRow = value;
    },
    setScrollBottom: (value: number) => {
      state.scrollBottom = value;
    },
    setScrollTop: (value: number) => {
      state.scrollTop = value;
    },
    switchActiveBuffer: (target: string, clearTarget: boolean) => {
      switchCalls.push({ target, clearTarget });
      activeBuffer = target === "alt" ? altBuffer : normalBuffer;
    },
    toOscRgbString: (value: string) => `rgb:${value}`
  });

  return {
    activeBuffer,
    defaults,
    handler,
    responses,
    restoreCalls,
    runtimeState,
    saveCalls,
    originModeResets,
    cursorOps,
    eraseOps,
    editOps,
    escOps,
    setActiveBufferAlt(value: boolean) {
      activeBuffer = value ? altBuffer : normalBuffer;
    },
    state,
    switchCalls
  };
}
