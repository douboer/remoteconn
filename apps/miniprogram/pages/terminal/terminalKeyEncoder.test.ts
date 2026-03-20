import { describe, expect, it } from "vitest";

const {
  TERMINAL_TOUCH_ACTION_BUTTONS,
  TERMINAL_TOUCH_DIRECTION_KEYS,
  encodeTerminalKey,
  encodeTerminalPaste,
  normalizeTerminalKeyModes
} = require("./terminalKeyEncoder.js");

describe("terminalKeyEncoder", () => {
  it("方向键和 Home/End 会按 application cursor mode 切换编码", () => {
    expect(encodeTerminalKey("up", { applicationCursorKeys: false })).toBe("\u001b[A");
    expect(encodeTerminalKey("up", { applicationCursorKeys: true })).toBe("\u001bOA");
    expect(encodeTerminalKey("home", { applicationCursorKeys: false })).toBe("\u001b[H");
    expect(encodeTerminalKey("home", { applicationCursorKeys: true })).toBe("\u001bOH");
  });

  it("常用编辑键和 Ctrl 组合会编码成 VT 控制序列", () => {
    expect(encodeTerminalKey("esc")).toBe("\u001b");
    expect(encodeTerminalKey("backspace")).toBe("\u007f");
    expect(encodeTerminalKey("delete")).toBe("\u001b[3~");
    expect(encodeTerminalKey("insert")).toBe("\u001b[2~");
    expect(encodeTerminalKey("pageup")).toBe("\u001b[5~");
    expect(encodeTerminalKey("ctrla")).toBe("\u0001");
    expect(encodeTerminalKey("ctrlc")).toBe("\u0003");
    expect(encodeTerminalKey("ctrle")).toBe("\u0005");
    expect(encodeTerminalKey("ctrlw")).toBe("\u0017");
    expect(encodeTerminalKey("ctrlz")).toBe("\u001a");
  });

  it("Alt/Meta 组合会编码为 ESC 前缀加基础键序列", () => {
    expect(encodeTerminalKey("alt-a")).toBe("\u001ba");
    expect(encodeTerminalKey("meta-z")).toBe("\u001bz");
    expect(encodeTerminalKey("alt-up", { applicationCursorKeys: false })).toBe("\u001b\u001b[A");
    expect(encodeTerminalKey("meta-home", { applicationCursorKeys: true })).toBe("\u001b\u001bOH");
  });

  it("Shift 修饰键会编码常用的反向 tab 和方向键序列", () => {
    expect(encodeTerminalKey("tab", undefined, { shift: true })).toBe("\u001b[Z");
    expect(encodeTerminalKey("up", undefined, { shift: true })).toBe("\u001b[1;2A");
    expect(encodeTerminalKey("right", undefined, { shift: true })).toBe("\u001b[1;2C");
    expect(encodeTerminalKey("delete", undefined, { shift: true })).toBe("\u001b[3;2~");
  });

  it("开启 bracketed paste 后，粘贴文本会自动包裹 2004 序列", () => {
    expect(encodeTerminalPaste("hello", { bracketedPasteMode: false })).toBe("hello");
    expect(encodeTerminalPaste("hello", { bracketedPasteMode: true })).toBe("\u001b[200~hello\u001b[201~");
  });

  it("模式位归一化会补齐默认值", () => {
    expect(normalizeTerminalKeyModes({ applicationCursorKeys: true })).toEqual({
      applicationCursorKeys: true,
      applicationKeypad: false,
      bracketedPasteMode: false
    });
  });

  it("触屏键盘区配置符合 SH 精简集", () => {
    expect(TERMINAL_TOUCH_DIRECTION_KEYS.map((item) => item.key)).toEqual(["up", "left", "down", "right"]);
    expect(TERMINAL_TOUCH_ACTION_BUTTONS.map((item) => item.key)).toEqual([
      "enter",
      "home",
      "shift",
      "backspace",
      "paste",
      "esc",
      "ctrlc",
      "tab"
    ]);
    expect(TERMINAL_TOUCH_ACTION_BUTTONS.find((item) => item.key === "paste")?.action).toBe("paste");
    expect(TERMINAL_TOUCH_ACTION_BUTTONS.find((item) => item.key === "backspace")?.icon).toBe(
      "/assets/icons/backspace.svg"
    );
    expect(TERMINAL_TOUCH_ACTION_BUTTONS.find((item) => item.key === "shift")?.icon).toBe(
      "/assets/icons/shift.svg"
    );
    expect(TERMINAL_TOUCH_ACTION_BUTTONS.find((item) => item.key === "home")?.icon).toBe(
      "/assets/icons/home.svg"
    );
  });
});
