import { describe, expect, it } from "vitest";

const {
  consumeTerminalSyncUpdateFrames,
  createTerminalSyncUpdateState,
  extractLooseAnsiSgr,
  takeTerminalReplaySlice
} = require("./vtParser.js");

describe("vtParser", () => {
  it("不会把 CSI 控制序列从中间切开", () => {
    const result = takeTerminalReplaySlice("ab\u001b[31mcd", 4);

    expect(result).toEqual({
      slice: "ab",
      rest: "\u001b[31mcd"
    });
  });

  it("不会把 CRLF 从中间拆开", () => {
    expect(takeTerminalReplaySlice("ab\r\ncd", 3)).toEqual({
      slice: "ab",
      rest: "\r\ncd"
    });
    expect(takeTerminalReplaySlice("ab\r\ncd", 4)).toEqual({
      slice: "ab\r\n",
      rest: "cd"
    });
  });

  it("文本开头是完整长控制序列时会整段前进，避免卡死在零进度", () => {
    const result = takeTerminalReplaySlice("\u001b]10;?\u001b\\X", 3);

    expect(result).toEqual({
      slice: "\u001b]10;?\u001b\\",
      rest: "X"
    });
  });

  it("文本前缀是不完整控制序列时会返回空 slice，交由上层缓存尾巴", () => {
    const result = takeTerminalReplaySlice("\u001b[31", 16);

    expect(result).toEqual({
      slice: "",
      rest: "\u001b[31"
    });
  });

  it("会识别不带 ESC 的松散 SGR 复位片段", () => {
    expect(extractLooseAnsiSgr("39mtext", 0)).toEqual({
      end: 2,
      codes: [39]
    });
    expect(extractLooseAnsiSgr("[1;31mtext", 0)).toEqual({
      end: 5,
      codes: [1, 31]
    });
  });

  it("非可信 SGR 数字串不会被误识别成样式序列", () => {
    expect(extractLooseAnsiSgr("123mtext", 0)).toBeNull();
  });

  it("会把 `CSI ? 2026 h/l` 包裹的同步刷新窗口延后到结束时一次性吐出", () => {
    const first = consumeTerminalSyncUpdateFrames(
      "ab\u001b[?2026hcd",
      createTerminalSyncUpdateState()
    );

    expect(first.text).toBe("ab");
    expect(first.state).toEqual({
      depth: 1,
      carryText: "",
      bufferedText: "cd"
    });

    const second = consumeTerminalSyncUpdateFrames("ef\u001b[?2026lg", first.state);

    expect(second.text).toBe("cdefg");
    expect(second.state).toEqual({
      depth: 0,
      carryText: "",
      bufferedText: ""
    });
  });

  it("同步刷新起始序列若被 chunk 边界截断，会保留到下一帧继续拼", () => {
    const first = consumeTerminalSyncUpdateFrames(
      "ab\u001b[?2026",
      createTerminalSyncUpdateState()
    );

    expect(first.text).toBe("ab");
    expect(first.state).toEqual({
      depth: 0,
      carryText: "\u001b[?2026",
      bufferedText: ""
    });

    const second = consumeTerminalSyncUpdateFrames("hcd\u001b[?2026l", first.state);

    expect(second.text).toBe("cd");
    expect(second.state).toEqual({
      depth: 0,
      carryText: "",
      bufferedText: ""
    });
  });

  it("会按和 web 端一致的口径收口 `DCS = 1 s / = 2 s` 同步刷新窗口", () => {
    const first = consumeTerminalSyncUpdateFrames(
      "ab\u001bP=1s\u001b\\cd",
      createTerminalSyncUpdateState()
    );

    expect(first.text).toBe("ab");
    expect(first.state).toEqual({
      depth: 1,
      carryText: "",
      bufferedText: "cd"
    });

    const second = consumeTerminalSyncUpdateFrames("ef\u001bP=2s\u001b\\g", first.state);

    expect(second.text).toBe("cdefg");
    expect(second.state).toEqual({
      depth: 0,
      carryText: "",
      bufferedText: ""
    });
  });
});
