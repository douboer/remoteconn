/* global module */

const DEFAULT_TERMINAL_KEY_MODES = Object.freeze({
  applicationCursorKeys: false,
  applicationKeypad: false,
  bracketedPasteMode: false
});

const DEFAULT_TERMINAL_KEY_MODIFIERS = Object.freeze({
  shift: false
});

const CTRL_KEY_MAP = Object.freeze({
  ctrla: "\u0001",
  ctrlc: "\u0003",
  ctrld: "\u0004",
  ctrle: "\u0005",
  ctrlk: "\u000b",
  ctrll: "\u000c",
  ctrlu: "\u0015",
  ctrlw: "\u0017",
  ctrlz: "\u001a"
});

/**
 * 触屏方向区直接对应 Figma frame 2250 内部的四向布局。
 * 这里保留静态资源路径作为单一真相源，页面层可按主题把路径再映射为 data URI。
 */
const TERMINAL_TOUCH_DIRECTION_KEYS = Object.freeze([
  Object.freeze({
    key: "up",
    icon: "/assets/icons/up.svg",
    slotClass: "terminal-touch-direction-btn-up"
  }),
  Object.freeze({
    key: "left",
    icon: "/assets/icons/left.svg",
    slotClass: "terminal-touch-direction-btn-left"
  }),
  Object.freeze({
    key: "down",
    icon: "/assets/icons/down.svg",
    slotClass: "terminal-touch-direction-btn-down"
  }),
  Object.freeze({
    key: "right",
    icon: "/assets/icons/right.svg",
    slotClass: "terminal-touch-direction-btn-right"
  })
]);

/**
 * SH 键盘区只保留最常用的辅助键：
 * 1. 仅保留移动端高频键，`home` 复用为“回到服务器工作目录”快捷键；
 * 2. Figma 这一版左列示意用了 backspace/shift，带 backspace 图标的按钮发送真实退格序列；
 * 3. 页面层会把 shift 当成“输入框大写状态键”，这里仅保留图标和基础 key；
 * 4. 方向键承担基础导航，纵向操作区保留 enter/home/shift/backspace/paste/esc/ctrl+c/tab；
 * 5. paste 走独立剪贴板链路，home 走页面层 shell 命令，其余按钮统一映射为 VT 控制序列。
 */
const TERMINAL_TOUCH_ACTION_BUTTONS = Object.freeze([
  Object.freeze({
    key: "enter",
    icon: "/assets/icons/enter.svg",
    action: "control",
    slotClass: "terminal-touch-action-btn-enter"
  }),
  Object.freeze({
    key: "home",
    icon: "/assets/icons/home.svg",
    action: "control",
    slotClass: "terminal-touch-action-btn-home"
  }),
  Object.freeze({
    key: "shift",
    icon: "/assets/icons/shift.svg",
    action: "modifier",
    slotClass: "terminal-touch-action-btn-shift"
  }),
  Object.freeze({
    key: "backspace",
    icon: "/assets/icons/backspace.svg",
    action: "control",
    slotClass: "terminal-touch-action-btn-delete"
  }),
  Object.freeze({
    key: "paste",
    icon: "/assets/icons/paste.svg",
    action: "paste",
    slotClass: "terminal-touch-action-btn-paste"
  }),
  Object.freeze({
    key: "esc",
    icon: "/assets/icons/esc.svg",
    action: "control",
    slotClass: "terminal-touch-action-btn-esc"
  }),
  Object.freeze({
    key: "ctrlc",
    icon: "/assets/icons/ctrlc.svg",
    action: "control",
    slotClass: "terminal-touch-action-btn-ctrlc"
  }),
  Object.freeze({
    key: "tab",
    icon: "/assets/icons/tab.svg",
    action: "control",
    slotClass: "terminal-touch-action-btn-tab"
  })
]);

function normalizeTerminalKeyModes(input) {
  const source = input && typeof input === "object" ? input : null;
  return {
    applicationCursorKeys:
      source && source.applicationCursorKeys !== undefined
        ? !!source.applicationCursorKeys
        : DEFAULT_TERMINAL_KEY_MODES.applicationCursorKeys,
    applicationKeypad:
      source && source.applicationKeypad !== undefined
        ? !!source.applicationKeypad
        : DEFAULT_TERMINAL_KEY_MODES.applicationKeypad,
    bracketedPasteMode:
      source && source.bracketedPasteMode !== undefined
        ? !!source.bracketedPasteMode
        : DEFAULT_TERMINAL_KEY_MODES.bracketedPasteMode
  };
}

function normalizeTerminalKeyModifiers(input) {
  const source = input && typeof input === "object" ? input : null;
  return {
    shift: source && source.shift !== undefined ? !!source.shift : DEFAULT_TERMINAL_KEY_MODIFIERS.shift
  };
}

/**
 * Alt/Meta 在终端里通常表现为“额外前置一个 ESC”，
 * 因此这里把组合键统一编码成 `ESC + 基础键序列`。
 */
function encodeTerminalAltSequence(normalizedKey, modes) {
  const match = /^(alt|meta)(?:[+:-]|_)?(.+)$/.exec(normalizedKey);
  if (!match) return "";
  const nestedKey = String(match[2] || "")
    .trim()
    .toLowerCase();
  if (!nestedKey) return "";
  if (nestedKey.length === 1) {
    return `\u001b${nestedKey}`;
  }
  const nestedSequence = encodeTerminalKey(nestedKey, modes);
  return nestedSequence ? `\u001b${nestedSequence}` : "";
}

function encodeShiftModifiedKey(normalizedKey) {
  if (normalizedKey === "tab") return "\u001b[Z";
  if (normalizedKey === "up") return "\u001b[1;2A";
  if (normalizedKey === "down") return "\u001b[1;2B";
  if (normalizedKey === "right") return "\u001b[1;2C";
  if (normalizedKey === "left") return "\u001b[1;2D";
  if (normalizedKey === "home") return "\u001b[1;2H";
  if (normalizedKey === "end") return "\u001b[1;2F";
  if (normalizedKey === "insert") return "\u001b[2;2~";
  if (normalizedKey === "delete") return "\u001b[3;2~";
  if (normalizedKey === "pageup") return "\u001b[5;2~";
  if (normalizedKey === "pagedown") return "\u001b[6;2~";
  return "";
}

function encodeTerminalKey(key, modes, modifiers) {
  const normalizedKey = String(key || "")
    .trim()
    .toLowerCase();
  const normalizedModes = normalizeTerminalKeyModes(modes);
  const normalizedModifiers = normalizeTerminalKeyModifiers(modifiers);
  const applicationPrefix = normalizedModes.applicationCursorKeys ? "\u001bO" : "\u001b[";
  const altSequence = encodeTerminalAltSequence(normalizedKey, normalizedModes);
  if (altSequence) return altSequence;
  if (normalizedModifiers.shift) {
    const shiftedSequence = encodeShiftModifiedKey(normalizedKey);
    if (shiftedSequence) return shiftedSequence;
  }

  if (normalizedKey === "up") return `${applicationPrefix}A`;
  if (normalizedKey === "down") return `${applicationPrefix}B`;
  if (normalizedKey === "right") return `${applicationPrefix}C`;
  if (normalizedKey === "left") return `${applicationPrefix}D`;
  if (normalizedKey === "home") return `${applicationPrefix}H`;
  if (normalizedKey === "end") return `${applicationPrefix}F`;
  if (normalizedKey === "enter") return "\r";
  if (normalizedKey === "tab") return "\t";
  if (normalizedKey === "esc") return "\u001b";
  if (normalizedKey === "backspace") return "\u007f";
  if (normalizedKey === "delete") return "\u001b[3~";
  if (normalizedKey === "insert") return "\u001b[2~";
  if (normalizedKey === "pageup") return "\u001b[5~";
  if (normalizedKey === "pagedown") return "\u001b[6~";
  if (CTRL_KEY_MAP[normalizedKey]) return CTRL_KEY_MAP[normalizedKey];
  return "";
}

function encodeTerminalPaste(text, modes) {
  const value = String(text || "");
  if (!value) return "";
  const normalizedModes = normalizeTerminalKeyModes(modes);
  if (!normalizedModes.bracketedPasteMode) {
    return value;
  }
  return `\u001b[200~${value}\u001b[201~`;
}

module.exports = {
  DEFAULT_TERMINAL_KEY_MODIFIERS,
  DEFAULT_TERMINAL_KEY_MODES,
  TERMINAL_TOUCH_DIRECTION_KEYS,
  TERMINAL_TOUCH_ACTION_BUTTONS,
  encodeTerminalKey,
  encodeTerminalPaste,
  normalizeTerminalKeyModifiers,
  normalizeTerminalKeyModes
};
