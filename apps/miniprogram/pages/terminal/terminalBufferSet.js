/* global module, require */

const { cloneTerminalCell } = require("./terminalCursorModel.js");

const TERMINAL_BUFFER_STATE_VERSION = 2;
const DEFAULT_ACTIVE_BUFFER = "normal";
const DEFAULT_TERMINAL_MODES = Object.freeze({
  applicationCursorKeys: false,
  applicationKeypad: false,
  originMode: false,
  reverseWraparound: false,
  sendFocus: false,
  wraparound: true,
  cursorHidden: false,
  bracketedPasteMode: false,
  insertMode: false
});

function cloneAnsiState(state) {
  const source = state && typeof state === "object" ? state : null;
  return {
    fg: source && source.fg ? String(source.fg) : "",
    bg: source && source.bg ? String(source.bg) : "",
    bold: !!(source && source.bold),
    underline: !!(source && source.underline)
  };
}

function cloneTerminalBufferRows(rows) {
  const source = Array.isArray(rows) && rows.length > 0 ? rows : [[]];
  return source.map((lineCells) =>
    Array.isArray(lineCells) ? lineCells.map((cell) => cloneTerminalCell(cell)) : []
  );
}

function clampNonNegativeInteger(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.round(parsed));
}

function clampBufferRows(value) {
  return Math.max(1, clampNonNegativeInteger(value, 24));
}

function createEmptyRows(count) {
  const total = Math.max(1, clampNonNegativeInteger(count, 1));
  return Array.from({ length: total }, () => []);
}

function normalizeScreenBuffer(input, options) {
  const source = input && typeof input === "object" ? input : null;
  const isAlt = !!(options && options.isAlt);
  const bufferRows = clampBufferRows(options && options.bufferRows);
  let cells = cloneTerminalBufferRows(source && source.cells);

  if (isAlt) {
    if (cells.length > bufferRows) {
      cells = cells.slice(0, bufferRows);
    }
    while (cells.length < bufferRows) {
      cells.push([]);
    }
  } else if (cells.length === 0) {
    cells = [[]];
  }

  const cursorRowFallback = 0;
  const cursorRow = clampNonNegativeInteger(source && source.cursorRow, cursorRowFallback);
  const cursorCol = clampNonNegativeInteger(source && source.cursorCol, 0);
  const maxRow = isAlt ? bufferRows - 1 : Math.max(0, Math.max(cells.length - 1, cursorRow));

  if (!isAlt) {
    while (cells.length <= cursorRow) {
      cells.push([]);
    }
  }

  const normalizedCursorRow = Math.max(0, Math.min(cursorRow, maxRow));
  const savedCursorRow = clampNonNegativeInteger(source && source.savedCursorRow, normalizedCursorRow);
  const normalizedSavedCursorRow = Math.max(0, Math.min(savedCursorRow, maxRow));
  const scrollTop = Math.max(
    0,
    Math.min(clampNonNegativeInteger(source && source.scrollTop, 0), bufferRows - 1)
  );
  const scrollBottom = Math.max(
    scrollTop,
    Math.min(clampNonNegativeInteger(source && source.scrollBottom, bufferRows - 1), bufferRows - 1)
  );

  return {
    isAlt,
    cells,
    ansiState: cloneAnsiState(source && source.ansiState),
    cursorRow: normalizedCursorRow,
    cursorCol,
    savedCursorRow: normalizedSavedCursorRow,
    savedCursorCol: clampNonNegativeInteger(source && source.savedCursorCol, cursorCol),
    savedAnsiState: cloneAnsiState(
      source && source.savedAnsiState ? source.savedAnsiState : source && source.ansiState
    ),
    scrollTop,
    scrollBottom
  };
}

function normalizeTerminalModes(input) {
  const source = input && typeof input === "object" ? input : null;
  return {
    applicationCursorKeys:
      source && source.applicationCursorKeys !== undefined
        ? !!source.applicationCursorKeys
        : DEFAULT_TERMINAL_MODES.applicationCursorKeys,
    applicationKeypad:
      source && source.applicationKeypad !== undefined
        ? !!source.applicationKeypad
        : DEFAULT_TERMINAL_MODES.applicationKeypad,
    originMode:
      source && source.originMode !== undefined ? !!source.originMode : DEFAULT_TERMINAL_MODES.originMode,
    reverseWraparound:
      source && source.reverseWraparound !== undefined
        ? !!source.reverseWraparound
        : DEFAULT_TERMINAL_MODES.reverseWraparound,
    sendFocus:
      source && source.sendFocus !== undefined ? !!source.sendFocus : DEFAULT_TERMINAL_MODES.sendFocus,
    wraparound:
      source && source.wraparound !== undefined ? !!source.wraparound : DEFAULT_TERMINAL_MODES.wraparound,
    cursorHidden:
      source && source.cursorHidden !== undefined
        ? !!source.cursorHidden
        : DEFAULT_TERMINAL_MODES.cursorHidden,
    bracketedPasteMode:
      source && source.bracketedPasteMode !== undefined
        ? !!source.bracketedPasteMode
        : DEFAULT_TERMINAL_MODES.bracketedPasteMode,
    insertMode:
      source && source.insertMode !== undefined ? !!source.insertMode : DEFAULT_TERMINAL_MODES.insertMode
  };
}

/**
 * 统一把旧版单缓冲状态和新版双缓冲状态收敛成同一种结构：
 * 1. `normal/alt` 两套 buffer 永远同形；
 * 2. 页面层只消费 active buffer 的镜像字段；
 * 3. 未来补更多 VT 模式时，只在这里扩展，不再把状态分散在页面运行时里。
 */
function normalizeTerminalBufferState(input, options, runtimeOptions) {
  const source = input && typeof input === "object" ? input : null;
  const bufferRows = clampBufferRows(options && options.bufferRows);

  const legacyBuffer =
    source &&
    (!source.version || !source.buffers) &&
    (source.cells || source.cursorRow !== undefined || source.cursorCol !== undefined)
      ? source
      : null;

  const normalSource =
    source && source.version === TERMINAL_BUFFER_STATE_VERSION && source.buffers
      ? source.buffers.normal
      : legacyBuffer;
  const altSource =
    source && source.version === TERMINAL_BUFFER_STATE_VERSION && source.buffers ? source.buffers.alt : null;

  const activeBuffer =
    source && source.version === TERMINAL_BUFFER_STATE_VERSION && source.activeBuffer === "alt"
      ? "alt"
      : DEFAULT_ACTIVE_BUFFER;

  const normalized = {
    version: TERMINAL_BUFFER_STATE_VERSION,
    buffers: {
      normal: normalizeScreenBuffer(normalSource, { isAlt: false, bufferRows }),
      alt: normalizeScreenBuffer(altSource, { isAlt: true, bufferRows })
    },
    activeBuffer,
    modes: normalizeTerminalModes(source && source.modes ? source.modes : source)
  };

  return syncActiveBufferSnapshot(normalized, options, runtimeOptions);
}

function cloneTerminalBufferState(input, options, runtimeOptions) {
  return normalizeTerminalBufferState(input, options, runtimeOptions);
}

function getActiveTerminalBuffer(state) {
  const source = state && typeof state === "object" ? state : null;
  if (!source || !source.buffers) {
    return normalizeScreenBuffer(null, { isAlt: false, bufferRows: 24 });
  }
  return source.activeBuffer === "alt" ? source.buffers.alt : source.buffers.normal;
}

function getTerminalModeState(state) {
  return normalizeTerminalModes(state && state.modes ? state.modes : state);
}

function syncActiveBufferSnapshot(state, options, runtimeOptions) {
  const source = state && typeof state === "object" ? state : normalizeTerminalBufferState(null, options);
  const active = source.activeBuffer === "alt" ? source.buffers.alt : source.buffers.normal;
  const cloneRows = !(runtimeOptions && runtimeOptions.cloneRows === false);
  const activeCells =
    Array.isArray(active && active.cells) && active.cells.length > 0
      ? active.cells
      : active && active.isAlt
        ? createEmptyRows(clampBufferRows(options && options.bufferRows))
        : [[]];
  source.cells = cloneRows ? cloneTerminalBufferRows(activeCells) : activeCells;
  source.ansiState = cloneAnsiState(active && active.ansiState);
  source.cursorRow = clampNonNegativeInteger(active && active.cursorRow, 0);
  source.cursorCol = clampNonNegativeInteger(active && active.cursorCol, 0);
  source.cursorHidden = !!(source.modes && source.modes.cursorHidden);
  source.applicationCursorKeys = !!(source.modes && source.modes.applicationCursorKeys);
  source.applicationKeypad = !!(source.modes && source.modes.applicationKeypad);
  source.bracketedPasteMode = !!(source.modes && source.modes.bracketedPasteMode);
  source.reverseWraparound = !!(source.modes && source.modes.reverseWraparound);
  source.sendFocus = !!(source.modes && source.modes.sendFocus);
  source.insertMode = !!(source.modes && source.modes.insertMode);
  source.activeBufferName = source.activeBuffer === "alt" ? "alt" : "normal";
  return source;
}

function createEmptyTerminalBufferState(options) {
  return normalizeTerminalBufferState(null, options);
}

module.exports = {
  DEFAULT_TERMINAL_MODES,
  TERMINAL_BUFFER_STATE_VERSION,
  cloneAnsiState,
  cloneTerminalBufferRows,
  cloneTerminalBufferState,
  createEmptyRows,
  createEmptyTerminalBufferState,
  getActiveTerminalBuffer,
  getTerminalModeState,
  normalizeTerminalBufferState,
  syncActiveBufferSnapshot
};
