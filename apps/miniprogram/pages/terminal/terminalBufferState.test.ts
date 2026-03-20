import { describe, expect, it } from "vitest";

const {
  ANSI_RESET_STATE,
  applyTerminalOutput,
  cloneTerminalBufferState,
  getActiveTerminalBuffer,
  rebuildTerminalBufferStateFromReplayText,
  trimTerminalReplayTextToMaxBytes
} = require("./terminalBufferState.js");
const { lineCellsToText } = require("./terminalCursorModel.js");
const { takeTerminalReplaySlice } = require("./vtParser.js");

describe("terminalBufferState", () => {
  it("宽字符和组合字符仍按 cell 列推进，不回退到字符串长度语义", () => {
    const result = applyTerminalOutput(
      {
        cells: [[]],
        ansiState: { ...ANSI_RESET_STATE },
        cursorRow: 0,
        cursorCol: 0
      },
      "中e\u0301A",
      { bufferCols: 10, maxEntries: 20, maxBytes: 1024 }
    );

    const row = result.state.cells[0];
    expect(lineCellsToText(row)).toBe("中e\u0301A");
    expect(result.state.cursorRow).toBe(0);
    expect(result.state.cursorCol).toBe(4);
    expect(row[0]).toMatchObject({ text: "中", width: 2, continuation: false });
    expect(row[1]).toMatchObject({ text: "", width: 0, continuation: true });
    expect(row[2]).toMatchObject({ text: "e\u0301", width: 1, continuation: false });
    expect(row[3]).toMatchObject({ text: "A", width: 1, continuation: false });
  });

  it("覆盖宽字符 continuation 时会先清理 owner，避免留下脏半格", () => {
    const result = applyTerminalOutput(
      {
        cells: [[]],
        ansiState: { ...ANSI_RESET_STATE },
        cursorRow: 0,
        cursorCol: 0
      },
      "中\bA",
      { bufferCols: 10, maxEntries: 20, maxBytes: 1024 }
    );

    const row = result.state.cells[0];
    expect(lineCellsToText(row)).toBe(" A");
    expect(result.state.cursorCol).toBe(2);
    expect(row[0]).toMatchObject({ text: "", width: 1, continuation: false, placeholder: true });
    expect(row[1]).toMatchObject({ text: "A", width: 1, continuation: false });
    expect(row.some((cell: { continuation?: boolean }) => !!cell && !!cell.continuation)).toBe(false);
  });

  it("在列数变化后可按重放文本重新排布旧输出", () => {
    const narrowResult = applyTerminalOutput(
      {
        cells: [[]],
        ansiState: { ...ANSI_RESET_STATE },
        cursorRow: 0,
        cursorCol: 0
      },
      "abcdef",
      { bufferCols: 4, maxEntries: 20, maxBytes: 1024 }
    );
    const replayState = rebuildTerminalBufferStateFromReplayText(narrowResult.cleanText, {
      bufferCols: 8,
      maxEntries: 20,
      maxBytes: 1024
    });

    expect(narrowResult.state.cells.map((row: unknown[]) => lineCellsToText(row))).toEqual(["abcd", "ef"]);
    expect(replayState.cells.map((row: unknown[]) => lineCellsToText(row))).toEqual(["abcdef"]);
    expect(replayState.cursorRow).toBe(0);
    expect(replayState.cursorCol).toBe(6);
  });

  it("重放文本会保留 ANSI 清行后的最终屏幕状态", () => {
    const result = applyTerminalOutput(
      {
        cells: [[]],
        ansiState: { ...ANSI_RESET_STATE },
        cursorRow: 0,
        cursorCol: 0
      },
      "hello\r\u001b[0Kworld",
      { bufferCols: 10, maxEntries: 20, maxBytes: 1024 }
    );
    const replayState = rebuildTerminalBufferStateFromReplayText(result.cleanText, {
      bufferCols: 10,
      maxEntries: 20,
      maxBytes: 1024
    });

    expect(replayState.cells.map((row: unknown[]) => lineCellsToText(row))).toEqual(["world"]);
    expect(replayState.cursorCol).toBe(5);
  });

  it("快照裁剪时保留尾部重放文本，便于恢复后按新列宽重建", () => {
    expect(trimTerminalReplayTextToMaxBytes("ab中cd", 5)).toBe("中cd");
    expect(trimTerminalReplayTextToMaxBytes("abcd", 8)).toBe("abcd");
  });

  it("宽字符输出在列数变化后仍可按 replay 文本重建", () => {
    const narrowResult = applyTerminalOutput(
      {
        cells: [[]],
        ansiState: { ...ANSI_RESET_STATE },
        cursorRow: 0,
        cursorCol: 0
      },
      "中AB",
      { bufferCols: 3, maxEntries: 20, maxBytes: 1024 }
    );
    const replayState = rebuildTerminalBufferStateFromReplayText(narrowResult.cleanText, {
      bufferCols: 4,
      maxEntries: 20,
      maxBytes: 1024
    });

    expect(narrowResult.state.cells.map((row: unknown[]) => lineCellsToText(row))).toEqual(["中A", "B"]);
    expect(replayState.cells.map((row: unknown[]) => lineCellsToText(row))).toEqual(["中AB"]);
    expect(replayState.cursorRow).toBe(0);
    expect(replayState.cursorCol).toBe(4);
  });

  it("按安全切片连续推进后，最终终端状态应与整段推进一致", () => {
    const options = { bufferCols: 10, bufferRows: 4, maxEntries: 20, maxBytes: 1024 };
    const source = "ab\r\n\u001b[31mcd\u001b[0mZ";
    const whole = applyTerminalOutput(createEmptyState(), source, options);

    let remaining = source;
    let state = createEmptyState();
    while (remaining) {
      const part = takeTerminalReplaySlice(remaining, 4);
      expect(part.slice.length).toBeGreaterThan(0);
      const partial = applyTerminalOutput(state, part.slice, options);
      state = partial.state;
      remaining = part.rest;
    }

    expect(state.cells.map((row: unknown[]) => lineCellsToText(row))).toEqual(
      whole.state.cells.map((row: unknown[]) => lineCellsToText(row))
    );
    expect(state.cursorRow).toBe(whole.state.cursorRow);
    expect(state.cursorCol).toBe(whole.state.cursorCol);
    expect(state.ansiState).toEqual(whole.state.ansiState);
  });

  it("stdout 运行态复用时，最终状态应与常规不可变推进一致", () => {
    const options = { bufferCols: 10, bufferRows: 4, maxEntries: 20, maxBytes: 1024 };
    const base = applyTerminalOutput(createEmptyState(), "ab\r\ncd", options);
    const regularBase = cloneTerminalBufferState(base.state, options);
    const runtimeBase = cloneTerminalBufferState(base.state, options, { cloneRows: false });
    const regular = applyTerminalOutput(regularBase, "\u001b[31mZ", options);
    const reused = applyTerminalOutput(runtimeBase, "\u001b[31mZ", options, {
      reuseState: true,
      reuseRows: true
    });

    expect(reused.state).toBe(runtimeBase);
    expect(reused.state.cells).toBe(reused.state.buffers.normal.cells);
    expect(reused.state.cells.map((row: unknown[]) => lineCellsToText(row))).toEqual(
      regular.state.cells.map((row: unknown[]) => lineCellsToText(row))
    );
    expect(reused.state.cursorRow).toBe(regular.state.cursorRow);
    expect(reused.state.cursorCol).toBe(regular.state.cursorCol);
    expect(reused.state.ansiState).toEqual(regular.state.ansiState);
  });

  it("1049 alt screen 切换后会保留 normal buffer 历史，并在退出时恢复", () => {
    const options = { bufferCols: 10, bufferRows: 4, maxEntries: 20, maxBytes: 1024 };
    const base = applyTerminalOutput(createEmptyState(), "shell>", options);
    const entered = applyTerminalOutput(base.state, "\u001b[?1049hTOP", options);
    const restored = applyTerminalOutput(entered.state, "\u001b[?1049l", options);

    expect(getActiveTerminalBuffer(entered.state).isAlt).toBe(true);
    expect(entered.state.activeBufferName).toBe("alt");
    expect(entered.state.cells.map((row: unknown[]) => lineCellsToText(row))).toEqual(["TOP", "", "", ""]);
    expect(restored.state.activeBufferName).toBe("normal");
    expect(restored.state.cells.map((row: unknown[]) => lineCellsToText(row))).toEqual(["shell>"]);
  });

  it("私有模式会驱动 Codex 依赖的关键终端模式位", () => {
    const options = { bufferCols: 10, bufferRows: 4, maxEntries: 20, maxBytes: 1024 };
    const hidden = applyTerminalOutput(
      createEmptyState(),
      "\u001b[?25l\u001b[?1h\u001b[?45h\u001b[?66h\u001b[?1004h\u001b[?2004h\u001b[4h",
      options
    );
    const shown = applyTerminalOutput(
      hidden.state,
      "\u001b[?25h\u001b[?1l\u001b[?45l\u001b[?66l\u001b[?1004l\u001b[?2004l\u001b[4l",
      options
    );

    expect(hidden.state.modes).toMatchObject({
      cursorHidden: true,
      applicationCursorKeys: true,
      applicationKeypad: true,
      reverseWraparound: true,
      sendFocus: true,
      bracketedPasteMode: true,
      insertMode: true
    });
    expect(shown.state.modes).toMatchObject({
      cursorHidden: false,
      applicationCursorKeys: false,
      applicationKeypad: false,
      reverseWraparound: false,
      sendFocus: false,
      bracketedPasteMode: false,
      insertMode: false
    });
  });

  it("DSR/CPR 查询会生成响应，而不会污染屏幕内容", () => {
    const options = { bufferCols: 10, bufferRows: 4, maxEntries: 20, maxBytes: 1024 };
    const result = applyTerminalOutput(createEmptyState(), "ab\u001b[6n\u001b[5n", options);

    expect(result.state.cells.map((row: unknown[]) => lineCellsToText(row))).toEqual(["ab"]);
    expect(result.responses).toEqual(["\u001b[1;3R", "\u001b[0n"]);
  });

  it("DA1/DA2 查询会分别返回 primary 和 secondary device attributes", () => {
    const options = { bufferCols: 10, bufferRows: 4, maxEntries: 20, maxBytes: 1024 };
    const result = applyTerminalOutput(createEmptyState(), "\u001b[c\u001b[>c", options);

    expect(result.state.cells.map((row: unknown[]) => lineCellsToText(row))).toEqual([""]);
    expect(result.responses).toEqual(["\u001b[?1;2c", "\u001b[>0;276;0c"]);
  });

  it("OSC 10/11/12 颜色查询会返回最小可用响应，而不会污染屏幕内容", () => {
    const options = { bufferCols: 10, bufferRows: 4, maxEntries: 20, maxBytes: 1024 };
    const result = applyTerminalOutput(
      createEmptyState(),
      "\u001b]10;?\u001b\\\u001b]11;?\u001b\\\u001b]12;?\u001b\\",
      options,
      {
        defaultForeground: "#112233",
        defaultBackground: "#445566",
        defaultCursor: "#778899"
      }
    );

    expect(result.state.cells.map((row: unknown[]) => lineCellsToText(row))).toEqual([""]);
    expect(result.responses).toEqual([
      "\u001b]10;rgb:1111/2222/3333\u001b\\",
      "\u001b]11;rgb:4444/5555/6666\u001b\\",
      "\u001b]12;rgb:7777/8888/9999\u001b\\"
    ]);
  });

  it("normal buffer 的绝对定位会以当前可视尾部为基准，而不是写回历史顶部", () => {
    const options = { bufferCols: 10, bufferRows: 4, maxEntries: 20, maxBytes: 1024 };
    const base = applyTerminalOutput(createEmptyState(), "1\r\n2\r\n3\r\n4\r\n5", options);
    const result = applyTerminalOutput(base.state, "\u001b[1;1HX", options);

    expect(result.state.cells.map((row: unknown[]) => lineCellsToText(row))).toEqual([
      "1",
      "X",
      "3",
      "4",
      "5"
    ]);
    expect(result.responses).toEqual([]);
  });

  it("CSI B 在 normal buffer 中下移时会真实扩出目标行，而不是钳死在 viewport 内", () => {
    const options = { bufferCols: 10, bufferRows: 2, maxEntries: 20, maxBytes: 1024 };
    const result = applyTerminalOutput(createEmptyState(), "\u001b[3BZ", options);

    expect(result.state.cells.map((row: unknown[]) => lineCellsToText(row))).toEqual(["", "", "", "Z"]);
    expect(result.state.cursorRow).toBe(3);
    expect(result.state.cursorCol).toBe(1);
  });

  it("origin mode 下的 VPA/CUP 会以滚动区顶部为基准定位", () => {
    const options = { bufferCols: 10, bufferRows: 4, maxEntries: 20, maxBytes: 1024 };
    const result = applyTerminalOutput(
      createEmptyState(),
      "\u001b[2;4r\u001b[?6h\u001b[2dA\u001b[1;3HZ",
      options
    );

    expect(result.state.cells.map((row: unknown[]) => lineCellsToText(row))).toEqual(["", "  Z", "A"]);
    expect(result.state.cursorRow).toBe(1);
    expect(result.state.cursorCol).toBe(3);
  });

  it("normal buffer 有历史时，开启 origin mode 会把光标归位到当前滚动区顶部", () => {
    const options = { bufferCols: 10, bufferRows: 4, maxEntries: 20, maxBytes: 1024 };
    const base = applyTerminalOutput(createEmptyState(), "1\r\n2\r\n3\r\n4\r\n5", options);
    const result = applyTerminalOutput(base.state, "\u001b[2;4r\u001b[?6hX", options);

    expect(result.state.cells.map((row: unknown[]) => lineCellsToText(row))).toEqual([
      "1",
      "2",
      "X",
      "4",
      "5"
    ]);
    expect(result.state.cursorRow).toBe(2);
    expect(result.state.cursorCol).toBe(1);
  });

  it("origin mode 下的 CUU/CUD/CNL/CPL 会被滚动区夹住，不越过固定区", () => {
    const options = { bufferCols: 8, bufferRows: 4, maxEntries: 20, maxBytes: 1024 };
    const movedUpDown = applyTerminalOutput(
      createEmptyState(),
      "\u001b[?1049h1\n2\n3\n4\u001b[2;4r\u001b[?6h\u001b[1;1H\u001b[AZ\u001b[3;1H\u001b[B#",
      options
    );
    const movedPrevNextLine = applyTerminalOutput(
      createEmptyState(),
      "\u001b[?1049h1\n2\n3\n4\u001b[2;4r\u001b[?6h\u001b[1;3H\u001b[FZ\u001b[3;3H\u001b[EQ",
      options
    );

    expect(movedUpDown.state.cells.map((row: unknown[]) => lineCellsToText(row))).toEqual(["1", "Z", "3", "#"]);
    expect(movedPrevNextLine.state.cells.map((row: unknown[]) => lineCellsToText(row))).toEqual(["1", "Z", "3", "Q"]);
  });

  it("normal buffer 有历史时，CUU/CPL 不会越过当前视口顶部并写回隐藏历史区", () => {
    const options = { bufferCols: 10, bufferRows: 4, maxEntries: 20, maxBytes: 1024 };
    const base = applyTerminalOutput(createEmptyState(), "1\r\n2\r\n3\r\n4\r\n5", options);
    const movedUp = applyTerminalOutput(base.state, "\u001b[1;1H\u001b[AZ", options);
    const movedPrevLine = applyTerminalOutput(base.state, "\u001b[1;3H\u001b[FQ", options);

    expect(movedUp.state.cells.map((row: unknown[]) => lineCellsToText(row))).toEqual([
      "1",
      "Z",
      "3",
      "4",
      "5"
    ]);
    expect(movedUp.state.cursorRow).toBe(1);
    expect(movedUp.state.cursorCol).toBe(1);

    expect(movedPrevLine.state.cells.map((row: unknown[]) => lineCellsToText(row))).toEqual([
      "1",
      "Q",
      "3",
      "4",
      "5"
    ]);
    expect(movedPrevLine.state.cursorRow).toBe(1);
    expect(movedPrevLine.state.cursorCol).toBe(1);
  });

  it("normal buffer 顶部滚动区上卷时会保留历史，并维持底部固定区", () => {
    const options = { bufferCols: 10, bufferRows: 4, maxEntries: 20, maxBytes: 1024 };
    const base = applyTerminalOutput(createEmptyState(), "1\r\n2\r\n3\r\n4", options);
    const result = applyTerminalOutput(base.state, "\u001b[1;3r\u001b[3;1H\n", options);

    expect(result.state.cells.map((row: unknown[]) => lineCellsToText(row))).toEqual([
      "1",
      "2",
      "3",
      "",
      "4"
    ]);
    expect(result.state.cells.slice(-4).map((row: unknown[]) => lineCellsToText(row))).toEqual([
      "2",
      "3",
      "",
      "4"
    ]);
  });

  it("normal buffer 的 ESC M 会在局部滚动区顶部插入空行", () => {
    const options = { bufferCols: 10, bufferRows: 6, maxEntries: 20, maxBytes: 1024 };
    const base = applyTerminalOutput(createEmptyState(), "1\r\n2\r\n3\r\n4\r\n5\r\n6", options);
    const result = applyTerminalOutput(base.state, "\u001b[4;6r\u001b[4;1H\u001bM", options);

    expect(result.state.cells.map((row: unknown[]) => lineCellsToText(row))).toEqual([
      "1",
      "2",
      "3",
      "",
      "4",
      "5"
    ]);
  });

  it("ESC D / ESC E / ESC M 在 alt buffer 固定头尾区域时，不会误滚中间滚动区", () => {
    const options = { bufferCols: 8, bufferRows: 4, maxEntries: 20, maxBytes: 1024 };
    const indResult = applyTerminalOutput(
      createEmptyState(),
      "\u001b[?1049h1\n2\n3\n4\u001b[2;3r\u001b[4;1H\u001bD#",
      options
    );
    const nelResult = applyTerminalOutput(
      createEmptyState(),
      "\u001b[?1049h1\n2\n3\n4\u001b[2;3r\u001b[4;1H\u001bE#",
      options
    );
    const riResult = applyTerminalOutput(
      createEmptyState(),
      "\u001b[?1049h1\n2\n3\n4\u001b[2;3r\u001b[1;1H\u001bM#",
      options
    );

    expect(indResult.state.cells.map((row: unknown[]) => lineCellsToText(row))).toEqual(["1", "2", "3", "#"]);
    expect(indResult.state.cursorRow).toBe(3);
    expect(indResult.state.cursorCol).toBe(1);
    expect(nelResult.state.cells.map((row: unknown[]) => lineCellsToText(row))).toEqual(["1", "2", "3", "#"]);
    expect(nelResult.state.cursorRow).toBe(3);
    expect(nelResult.state.cursorCol).toBe(1);
    expect(riResult.state.cells.map((row: unknown[]) => lineCellsToText(row))).toEqual(["#", "2", "3", "4"]);
    expect(riResult.state.cursorRow).toBe(0);
    expect(riResult.state.cursorCol).toBe(1);
  });

  it("ESC D / ESC M 在 normal buffer 固定头尾区域时，不会误滚正文区或回写历史区", () => {
    const options = { bufferCols: 8, bufferRows: 4, maxEntries: 20, maxBytes: 1024 };
    const base = applyTerminalOutput(createEmptyState(), "1\r\n2\r\n3\r\n4\r\n5\r\n6", options);
    const indResult = applyTerminalOutput(base.state, "\u001b[2;3r\u001b[4;1H\u001bD#", options);
    const riResult = applyTerminalOutput(base.state, "\u001b[2;3r\u001b[1;1H\u001bM#", options);

    expect(indResult.state.cells.map((row: unknown[]) => lineCellsToText(row))).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
      "#"
    ]);
    expect(indResult.state.cursorRow).toBe(5);
    expect(indResult.state.cursorCol).toBe(1);

    expect(riResult.state.cells.map((row: unknown[]) => lineCellsToText(row))).toEqual([
      "1",
      "2",
      "#",
      "4",
      "5",
      "6"
    ]);
    expect(riResult.state.cursorRow).toBe(2);
    expect(riResult.state.cursorCol).toBe(1);
  });

  it("normal buffer 的 CPR 会返回可视窗口内的行号，而不是历史绝对行号", () => {
    const options = { bufferCols: 10, bufferRows: 4, maxEntries: 20, maxBytes: 1024 };
    const base = applyTerminalOutput(createEmptyState(), "1\r\n2\r\n3\r\n4\r\n5", options);
    const result = applyTerminalOutput(base.state, "\u001b[1;1H\u001b[6n", options);

    expect(result.responses).toEqual(["\u001b[1;1R"]);
  });

  it("接近 codex /status 的 normal buffer 重排后，不会只停在 Permissions 这一行", () => {
    const options = { bufferCols: 80, bufferRows: 24, maxEntries: 200, maxBytes: 8192 };
    const historyText = Array.from({ length: 30 }, (_, index) => `pre${index + 1}`).join("\r\n");
    const base = applyTerminalOutput(createEmptyState(), historyText, options);
    const statusPayload =
      "\u001b[18;1H\u001b[J\u001b[18;24r\u001b[18;1H\u001bM\u001bM\u001b[r\u001b[1;19r\u001b[17;1H" +
      "\r\n/status\r\n\r\nStatusHeader\r\nModel\r\nDirectory\r\nPermissions\r\nAgents\r\nAccount\r\n" +
      "Collaboration\r\nSession\r\nLimit5h\r\nLimitReset\r\nWeekly\r\nWeeklyReset\r\n" +
      "\u001b[r\u001b[21;3H";
    const result = applyTerminalOutput(base.state, statusPayload, options);
    const visibleTail = result.state.cells.slice(-24).map((row: unknown[]) => lineCellsToText(row));

    expect(visibleTail).toContain("Permissions");
    expect(visibleTail).toContain("Weekly");
    expect(visibleTail).toContain("WeeklyReset");
  });

  it("DECRQM 会按当前实现真实维护的模式位返回状态", () => {
    const options = { bufferCols: 10, bufferRows: 4, maxEntries: 20, maxBytes: 1024 };
    const result = applyTerminalOutput(
      createEmptyState(),
      "\u001b[?1004h\u001b[4h\u001b[?1049$p\u001b[?1004$p\u001b[4$p\u001b[?2026$p",
      options
    );

    expect(result.state.cells.map((row: unknown[]) => lineCellsToText(row))).toEqual([""]);
    expect(result.responses).toEqual([
      "\u001b[?1049;2$y",
      "\u001b[?1004;1$y",
      "\u001b[4;1$y",
      "\u001b[?2026;0$y"
    ]);
  });

  it("DCS $ q 状态字符串查询会返回最小可用响应", () => {
    const options = { bufferCols: 10, bufferRows: 4, maxEntries: 20, maxBytes: 1024 };
    const result = applyTerminalOutput(
      createEmptyState(),
      "\u001bP$qm\u001b\\\u001bP$qr\u001b\\\u001bP$q q\u001b\\\u001bP$qz\u001b\\",
      options
    );

    expect(result.state.cells.map((row: unknown[]) => lineCellsToText(row))).toEqual([""]);
    expect(result.responses).toEqual([
      "\u001bP1$r0m\u001b\\",
      "\u001bP1$r1;4r\u001b\\",
      "\u001bP1$r2 q\u001b\\",
      "\u001bP0$r\u001b\\"
    ]);
  });

  it("DECSTR 会软重置模式位、样式和滚动区域，但保留现有屏幕内容", () => {
    const options = { bufferCols: 10, bufferRows: 4, maxEntries: 20, maxBytes: 1024 };
    const result = applyTerminalOutput(
      createEmptyState(),
      "\u001b[?1049h\u001b[2;3r\u001b[?25l\u001b[?1h\u001b[?2004h\u001b[31mX\u001b[!p",
      options
    );
    const active = getActiveTerminalBuffer(result.state);

    expect(result.state.cells.map((row: unknown[]) => lineCellsToText(row))).toEqual(["X", "", "", ""]);
    expect(result.state.ansiState).toEqual(ANSI_RESET_STATE);
    expect(result.state.modes).toMatchObject({
      applicationCursorKeys: false,
      originMode: false,
      wraparound: true,
      cursorHidden: false,
      bracketedPasteMode: false
    });
    expect(active.scrollTop).toBe(0);
    expect(active.scrollBottom).toBe(3);
    expect(active.savedCursorRow).toBe(0);
    expect(active.savedCursorCol).toBe(0);
    expect(active.savedAnsiState).toEqual(ANSI_RESET_STATE);
  });

  it("CSI 2J 清屏后保留当前光标位置，后续输出不会错位到左上角", () => {
    const options = { bufferCols: 6, bufferRows: 4, maxEntries: 20, maxBytes: 1024 };
    const result = applyTerminalOutput(createEmptyState(), "ABCD\u001b[1;3H\u001b[2JX", options);

    expect(result.state.cells.map((row: unknown[]) => lineCellsToText(row))).toEqual(["  X", "", "", ""]);
    expect(result.state.cursorRow).toBe(0);
    expect(result.state.cursorCol).toBe(3);
  });

  it("带背景色的清屏会把整屏空白位也染成当前擦除背景，而不是只给文字底部上色", () => {
    const options = { bufferCols: 6, bufferRows: 4, maxEntries: 20, maxBytes: 1024 };
    const result = applyTerminalOutput(createEmptyState(), "\u001b[100m\u001b[2JX", options);
    const firstRow = result.state.cells[0];
    const secondRow = result.state.cells[1];

    expect(result.state.cells.map((row: unknown[]) => lineCellsToText(row))).toEqual(["X", "", "", ""]);
    expect(firstRow[1]).toMatchObject({
      placeholder: true,
      style: { bg: "#666666" }
    });
    expect(secondRow[0]).toMatchObject({
      placeholder: true,
      style: { bg: "#666666" }
    });
  });

  it("CSI X 会从当前光标起按列擦除字符而不左移后续内容", () => {
    const options = { bufferCols: 8, bufferRows: 4, maxEntries: 20, maxBytes: 1024 };
    const result = applyTerminalOutput(createEmptyState(), "abcdef\u001b[1;3H\u001b[2X", options);

    expect(result.state.cells.map((row: unknown[]) => lineCellsToText(row))).toEqual(["ab  ef"]);
    expect(result.state.cursorRow).toBe(0);
    expect(result.state.cursorCol).toBe(2);
  });

  it("CSI @ / P 会按当前光标插删行内字符，而不是重写整行", () => {
    const options = { bufferCols: 8, bufferRows: 4, maxEntries: 20, maxBytes: 1024 };
    const inserted = applyTerminalOutput(createEmptyState(), "abcd\u001b[1;3H\u001b[@Z", options);
    const deleted = applyTerminalOutput(createEmptyState(), "abcdef\u001b[1;3H\u001b[2P", options);

    expect(inserted.state.cells.map((row: unknown[]) => lineCellsToText(row))).toEqual(["abZcd"]);
    expect(inserted.state.cursorRow).toBe(0);
    expect(inserted.state.cursorCol).toBe(3);
    expect(deleted.state.cells.map((row: unknown[]) => lineCellsToText(row))).toEqual(["abef"]);
    expect(deleted.state.cursorRow).toBe(0);
    expect(deleted.state.cursorCol).toBe(2);
  });

  it("CSI @ / P 切进宽字符中间时，不会留下悬空 continuation 或半个宽字符", () => {
    const options = { bufferCols: 5, bufferRows: 4, maxEntries: 20, maxBytes: 1024 };
    const inserted = applyTerminalOutput(createEmptyState(), "A中BC\u001b[1;3H\u001b[@", options);
    const deleted = applyTerminalOutput(createEmptyState(), "A中BC\u001b[1;2H\u001b[P", options);

    expect(inserted.state.cells.map((row: unknown[]) => lineCellsToText(row))).toEqual(["A   B"]);
    expect(deleted.state.cells.map((row: unknown[]) => lineCellsToText(row))).toEqual(["A BC"]);
    expect(
      inserted.state.cells[0].some((cell: { continuation?: boolean }) => !!cell && !!cell.continuation)
    ).toBe(false);
    expect(
      deleted.state.cells[0].some((cell: { continuation?: boolean }) => !!cell && !!cell.continuation)
    ).toBe(false);
  });

  it("normal buffer 有历史和固定头尾时，CSI L / M / S / T 只作用于当前滚动区", () => {
    const options = { bufferCols: 8, bufferRows: 4, maxEntries: 20, maxBytes: 1024 };
    const base = applyTerminalOutput(createEmptyState(), "1\r\n2\r\n3\r\n4\r\n5\r\n6", options);
    const inserted = applyTerminalOutput(base.state, "\u001b[2;3r\u001b[2;1H\u001b[L", options);
    const deleted = applyTerminalOutput(base.state, "\u001b[2;3r\u001b[2;1H\u001b[M", options);
    const scrolledUp = applyTerminalOutput(base.state, "\u001b[2;3r\u001b[S", options);
    const scrolledDown = applyTerminalOutput(base.state, "\u001b[2;3r\u001b[T", options);

    expect(inserted.state.cells.map((row: unknown[]) => lineCellsToText(row))).toEqual([
      "1",
      "2",
      "3",
      "",
      "4",
      "6"
    ]);
    expect(deleted.state.cells.map((row: unknown[]) => lineCellsToText(row))).toEqual([
      "1",
      "2",
      "3",
      "5",
      "",
      "6"
    ]);
    expect(scrolledUp.state.cells.map((row: unknown[]) => lineCellsToText(row))).toEqual([
      "1",
      "2",
      "3",
      "5",
      "",
      "6"
    ]);
    expect(scrolledDown.state.cells.map((row: unknown[]) => lineCellsToText(row))).toEqual([
      "1",
      "2",
      "3",
      "",
      "4",
      "6"
    ]);
  });

  it("CSI L / M 会在 alt buffer 当前行插删整行", () => {
    const options = { bufferCols: 8, bufferRows: 4, maxEntries: 20, maxBytes: 1024 };
    const inserted = applyTerminalOutput(
      createEmptyState(),
      "\u001b[?1049h1\n2\n3\n4\u001b[2;1H\u001b[L",
      options
    );
    const deleted = applyTerminalOutput(
      createEmptyState(),
      "\u001b[?1049h1\n2\n3\n4\u001b[2;1H\u001b[M",
      options
    );

    expect(inserted.state.cells.map((row: unknown[]) => lineCellsToText(row))).toEqual(["1", "", "2", "3"]);
    expect(inserted.state.cursorRow).toBe(1);
    expect(inserted.state.cursorCol).toBe(0);
    expect(deleted.state.cells.map((row: unknown[]) => lineCellsToText(row))).toEqual(["1", "3", "4", ""]);
    expect(deleted.state.cursorRow).toBe(1);
    expect(deleted.state.cursorCol).toBe(0);
  });

  it("CSI S / T 会在当前滚动区内上卷和下卷，而不改动其它语义", () => {
    const options = { bufferCols: 8, bufferRows: 4, maxEntries: 20, maxBytes: 1024 };
    const scrolledUp = applyTerminalOutput(createEmptyState(), "\u001b[?1049h1\n2\n3\n4\u001b[S", options);
    const scrolledDown = applyTerminalOutput(createEmptyState(), "\u001b[?1049h1\n2\n3\n4\u001b[T", options);

    expect(scrolledUp.state.cells.map((row: unknown[]) => lineCellsToText(row))).toEqual(["2", "3", "4", ""]);
    expect(scrolledUp.state.cursorRow).toBe(3);
    expect(scrolledUp.state.cursorCol).toBe(1);
    expect(scrolledDown.state.cells.map((row: unknown[]) => lineCellsToText(row))).toEqual(["", "1", "2", "3"]);
    expect(scrolledDown.state.cursorRow).toBe(3);
    expect(scrolledDown.state.cursorCol).toBe(1);
  });

  it("CSI r 只给顶部参数时会把底边默认到最后一行", () => {
    const options = { bufferCols: 8, bufferRows: 4, maxEntries: 20, maxBytes: 1024 };
    const base = applyTerminalOutput(createEmptyState(), "1\r\n2\r\n3\r\n4", options);
    const result = applyTerminalOutput(base.state, "\u001b[2r\u001b[4;1H\n", options);

    expect(result.state.cells.map((row: unknown[]) => lineCellsToText(row))).toEqual(["1", "3", "4", ""]);
    expect(result.state.cursorRow).toBe(3);
    expect(result.state.cursorCol).toBe(0);
  });

  it("insert mode 打开后，普通打印会按当前光标位置插入而不是覆盖", () => {
    const options = { bufferCols: 8, bufferRows: 4, maxEntries: 20, maxBytes: 1024 };
    const result = applyTerminalOutput(createEmptyState(), "abcd\u001b[1;3H\u001b[4hZ", options);

    expect(result.state.cells.map((row: unknown[]) => lineCellsToText(row))).toEqual(["abZcd"]);
    expect(result.state.cursorRow).toBe(0);
    expect(result.state.cursorCol).toBe(3);
    expect(result.state.modes.insertMode).toBe(true);
  });

  it("ESC D / ESC E / ESC M 会按滚动区域语义推进全屏缓冲", () => {
    const options = { bufferCols: 8, bufferRows: 4, maxEntries: 20, maxBytes: 1024 };
    const indResult = applyTerminalOutput(
      createEmptyState(),
      "\u001b[?1049h1\n2\n3\n4\u001b[2;4r\u001b[4;1H\u001bD",
      options
    );
    const nelResult = applyTerminalOutput(indResult.state, "\u001bE#", options);
    const riResult = applyTerminalOutput(nelResult.state, "\u001b[2;1H\u001bM", options);

    expect(indResult.state.cells.map((row: unknown[]) => lineCellsToText(row))).toEqual(["1", "3", "4", ""]);
    expect(nelResult.state.cells.map((row: unknown[]) => lineCellsToText(row))).toEqual(["1", "4", "", "#"]);
    expect(nelResult.state.cursorRow).toBe(3);
    expect(nelResult.state.cursorCol).toBe(1);
    expect(riResult.state.cells.map((row: unknown[]) => lineCellsToText(row))).toEqual(["1", "", "4", ""]);
    expect(riResult.state.cursorRow).toBe(1);
    expect(riResult.state.cursorCol).toBe(0);
  });

  it("CSI s/u 与 ESC 7/8 会恢复之前保存的光标位置", () => {
    const options = { bufferCols: 8, bufferRows: 4, maxEntries: 20, maxBytes: 1024 };
    const csiResult = applyTerminalOutput(createEmptyState(), "ab\u001b[scd\u001b[uZ", options);
    const escResult = applyTerminalOutput(createEmptyState(), "ab\u001b7cd\u001b8Z", options);

    expect(csiResult.state.cells.map((row: unknown[]) => lineCellsToText(row))).toEqual(["abZd"]);
    expect(csiResult.state.cursorRow).toBe(0);
    expect(csiResult.state.cursorCol).toBe(3);
    expect(escResult.state.cells.map((row: unknown[]) => lineCellsToText(row))).toEqual(["abZd"]);
    expect(escResult.state.cursorRow).toBe(0);
    expect(escResult.state.cursorCol).toBe(3);
  });

  it("带 > 私有标记的 CSI u 不应误当成光标恢复", () => {
    const options = { bufferCols: 8, bufferRows: 4, maxEntries: 20, maxBytes: 1024 };
    const result = applyTerminalOutput(createEmptyState(), "abc\u001b[>7uZ", options);

    expect(result.state.cells.map((row: unknown[]) => lineCellsToText(row))).toEqual(["abcZ"]);
    expect(result.state.cursorRow).toBe(0);
    expect(result.state.cursorCol).toBe(4);
  });
});

function createEmptyState() {
  return {
    cells: [[]],
    ansiState: { ...ANSI_RESET_STATE },
    cursorRow: 0,
    cursorCol: 0
  };
}
