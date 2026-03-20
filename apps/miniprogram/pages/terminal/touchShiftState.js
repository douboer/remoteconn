/* global module */

const TOUCH_SHIFT_MODE_OFF = "off";
const TOUCH_SHIFT_MODE_ONCE = "once";
const TOUCH_SHIFT_MODE_LOCK = "lock";
const TOUCH_SHIFT_DOUBLE_TAP_MS = 320;

function normalizeTouchShiftMode(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (normalized === TOUCH_SHIFT_MODE_ONCE) return TOUCH_SHIFT_MODE_ONCE;
  if (normalized === TOUCH_SHIFT_MODE_LOCK) return TOUCH_SHIFT_MODE_LOCK;
  return TOUCH_SHIFT_MODE_OFF;
}

function isTouchShiftActive(mode) {
  const normalized = normalizeTouchShiftMode(mode);
  return normalized === TOUCH_SHIFT_MODE_ONCE || normalized === TOUCH_SHIFT_MODE_LOCK;
}

function isAsciiLetter(value) {
  return /[A-Za-z]/.test(String(value || ""));
}

function resolveTouchShiftModeOnTap(currentMode, lastTapAt, now, doubleTapWindowMs) {
  const normalizedMode = normalizeTouchShiftMode(currentMode);
  const currentTime = Number.isFinite(Number(now)) ? Number(now) : Date.now();
  const previousTapAt = Number(lastTapAt);
  const windowMs = Number.isFinite(Number(doubleTapWindowMs))
    ? Math.max(0, Number(doubleTapWindowMs))
    : TOUCH_SHIFT_DOUBLE_TAP_MS;

  if (normalizedMode === TOUCH_SHIFT_MODE_LOCK) {
    return TOUCH_SHIFT_MODE_OFF;
  }
  if (
    normalizedMode === TOUCH_SHIFT_MODE_ONCE &&
    Number.isFinite(previousTapAt) &&
    currentTime >= previousTapAt &&
    currentTime - previousTapAt <= windowMs
  ) {
    return TOUCH_SHIFT_MODE_LOCK;
  }
  return TOUCH_SHIFT_MODE_ONCE;
}

function findCommonPrefixLength(previousValue, nextValue) {
  const max = Math.min(previousValue.length, nextValue.length);
  let index = 0;
  while (index < max && previousValue[index] === nextValue[index]) {
    index += 1;
  }
  return index;
}

function findCommonSuffixLength(previousValue, nextValue, prefixLength) {
  const previousRemain = previousValue.length - prefixLength;
  const nextRemain = nextValue.length - prefixLength;
  const max = Math.min(previousRemain, nextRemain);
  let index = 0;
  while (
    index < max &&
    previousValue[previousValue.length - 1 - index] === nextValue[nextValue.length - 1 - index]
  ) {
    index += 1;
  }
  return index;
}

function applyTouchShiftToValue(previousValue, nextValue, mode) {
  const previousText = String(previousValue || "");
  const nextText = String(nextValue || "");
  const normalizedMode = normalizeTouchShiftMode(mode);

  if (!isTouchShiftActive(normalizedMode) || !nextText) {
    return {
      value: nextText,
      consumedOnce: false,
      touchedLetter: false,
      transformed: false
    };
  }

  const prefixLength = findCommonPrefixLength(previousText, nextText);
  const suffixLength = findCommonSuffixLength(previousText, nextText, prefixLength);
  const insertedEnd = nextText.length - suffixLength;
  const insertedText = nextText.slice(prefixLength, insertedEnd);

  if (!insertedText) {
    return {
      value: nextText,
      consumedOnce: false,
      touchedLetter: false,
      transformed: false
    };
  }

  const touchedLetter = isAsciiLetter(insertedText);
  const transformedInserted = insertedText.replace(/[a-z]/g, (match) => match.toUpperCase());
  const transformed = transformedInserted !== insertedText;
  const value = transformed
    ? `${nextText.slice(0, prefixLength)}${transformedInserted}${nextText.slice(insertedEnd)}`
    : nextText;

  return {
    value,
    consumedOnce: normalizedMode === TOUCH_SHIFT_MODE_ONCE && touchedLetter,
    touchedLetter,
    transformed
  };
}

module.exports = {
  TOUCH_SHIFT_DOUBLE_TAP_MS,
  TOUCH_SHIFT_MODE_LOCK,
  TOUCH_SHIFT_MODE_OFF,
  TOUCH_SHIFT_MODE_ONCE,
  applyTouchShiftToValue,
  isTouchShiftActive,
  normalizeTouchShiftMode,
  resolveTouchShiftModeOnTap
};
