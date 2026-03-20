import { describe, expect, it } from "vitest";

const {
  TOUCH_SHIFT_MODE_LOCK,
  TOUCH_SHIFT_MODE_OFF,
  TOUCH_SHIFT_MODE_ONCE,
  applyTouchShiftToValue,
  isTouchShiftActive,
  normalizeTouchShiftMode,
  resolveTouchShiftModeOnTap
} = require("./touchShiftState.js");

describe("touchShiftState", () => {
  it("shift 单击进入单次大写，双击进入锁定，再点一次退出", () => {
    expect(resolveTouchShiftModeOnTap(TOUCH_SHIFT_MODE_OFF, 0, 1000, 320)).toBe(TOUCH_SHIFT_MODE_ONCE);
    expect(resolveTouchShiftModeOnTap(TOUCH_SHIFT_MODE_ONCE, 1000, 1200, 320)).toBe(TOUCH_SHIFT_MODE_LOCK);
    expect(resolveTouchShiftModeOnTap(TOUCH_SHIFT_MODE_LOCK, 0, 1500, 320)).toBe(TOUCH_SHIFT_MODE_OFF);
  });

  it("状态归一化和激活判断正确", () => {
    expect(normalizeTouchShiftMode("once")).toBe(TOUCH_SHIFT_MODE_ONCE);
    expect(normalizeTouchShiftMode("lock")).toBe(TOUCH_SHIFT_MODE_LOCK);
    expect(normalizeTouchShiftMode("unknown")).toBe(TOUCH_SHIFT_MODE_OFF);
    expect(isTouchShiftActive(TOUCH_SHIFT_MODE_OFF)).toBe(false);
    expect(isTouchShiftActive(TOUCH_SHIFT_MODE_ONCE)).toBe(true);
    expect(isTouchShiftActive(TOUCH_SHIFT_MODE_LOCK)).toBe(true);
  });

  it("单次大写只把下一次英文输入转成大写，并在命中字母后消费", () => {
    expect(applyTouchShiftToValue("", "a", TOUCH_SHIFT_MODE_ONCE)).toEqual({
      value: "A",
      consumedOnce: true,
      touchedLetter: true,
      transformed: true
    });
    expect(applyTouchShiftToValue("A", "A1", TOUCH_SHIFT_MODE_ONCE)).toEqual({
      value: "A1",
      consumedOnce: false,
      touchedLetter: false,
      transformed: false
    });
  });

  it("锁定大写会持续转换后续英文输入", () => {
    expect(applyTouchShiftToValue("A", "Ab", TOUCH_SHIFT_MODE_LOCK)).toEqual({
      value: "AB",
      consumedOnce: false,
      touchedLetter: true,
      transformed: true
    });
  });

  it("替换中间文本时只转换新增的英文片段", () => {
    expect(applyTouchShiftToValue("abZ", "acZ", TOUCH_SHIFT_MODE_ONCE)).toEqual({
      value: "aCZ",
      consumedOnce: true,
      touchedLetter: true,
      transformed: true
    });
  });
});
