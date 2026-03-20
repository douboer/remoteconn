/* global TextEncoder, module, require */

/**
 * 终端缓冲推进器是“小程序终端逻辑光标”的唯一写入口。
 *
 * 顶级约束（用于规避后续 VT 扩展回归）：
 * 1. 所有 stdout/stderr 文本都必须先落到 cell buffer，再由视图层渲染；禁止回退到字符串拼接 +
 *    浏览器/原生组件自行换行。
 * 2. 任何 CSI / DECSET / DECRST 扩展都只能在“状态机 + buffer 切换”层增量实现，不能绕过
 *    writeChar / continuation / cursorRow / cursorCol 这套列语义。
 * 3. 如果后续引入 normal/alternate buffer，两套 buffer 都必须保持与当前 state 相同的数据形状；
 *    切屏只能切 active buffer 引用，不能直接覆盖 normal buffer 的历史内容。
 * 4. 几何变化后的重放重建能力必须保留；不能把旧列宽下的折行结果直接固化为唯一真相。
 */

const {
  createBlankCell,
  createContinuationCell,
  createTerminalCell,
  lineCellsToText,
  measureCharDisplayColumns
} = require("./terminalCursorModel.js");
const {
  cloneAnsiState,
  cloneTerminalBufferRows,
  cloneTerminalBufferState,
  createEmptyTerminalBufferState,
  getActiveTerminalBuffer,
  getTerminalModeState,
  normalizeTerminalBufferState,
  syncActiveBufferSnapshot
} = require("./terminalBufferSet.js");
const {
  extractAnsiCsi,
  extractDcsSequence,
  extractLooseAnsiSgr,
  extractOscSequence,
  normalizeTerminalReplayText,
  parseCsiParams,
  parseDcsHeader,
  parseOscContent
} = require("./vtParser.js");
const { createTerminalVtInputHandler } = require("./vtInputHandler.js");

const ANSI_RESET_STATE = Object.freeze({
  fg: "",
  bg: "",
  bold: false,
  underline: false
});
const ANSI_BASE_COLORS = [
  "#000000",
  "#cd3131",
  "#0dbc79",
  "#e5e510",
  "#2472c8",
  "#bc3fbc",
  "#11a8cd",
  "#e5e5e5"
];
const ANSI_BRIGHT_COLORS = [
  "#666666",
  "#f14c4c",
  "#23d18b",
  "#f5f543",
  "#3b8eea",
  "#d670d6",
  "#29b8db",
  "#ffffff"
];
const ANSI_CUBE_LEVELS = [0, 95, 135, 175, 215, 255];
const DEFAULT_TERMINAL_RUNTIME_COLORS = Object.freeze({
  defaultForeground: "#e6f0ff",
  defaultBackground: "#192b4d",
  defaultCursor: "#9ca9bf"
});

function utf8ByteLength(text) {
  const value = String(text || "");
  if (!value) return 0;
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(value).length;
  }
  try {
    return encodeURIComponent(value).replace(/%[0-9A-F]{2}/gi, "U").length;
  } catch {
    return value.length;
  }
}

function clampRgbChannel(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  if (parsed < 0) return 0;
  if (parsed > 255) return 255;
  return Math.round(parsed);
}

function rgbToHex(r, g, b) {
  const toHex = (value) => clampRgbChannel(value).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function normalizeHexColor(color, fallback) {
  const value = String(color || "").trim();
  return /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function hexToRgbChannels(color) {
  const normalized = String(color || "").trim();
  const match = /^#([0-9a-f]{6})$/i.exec(normalized);
  if (!match) return null;
  const hex = match[1];
  return [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
}

function toOscRgbString(color) {
  const channels = hexToRgbChannels(color);
  if (!channels) return "";
  return `rgb:${channels.map((value) => value.toString(16).padStart(2, "0").repeat(2)).join("/")}`;
}

function resolveTerminalRuntimeColors(runtimeOptions) {
  const source = runtimeOptions && typeof runtimeOptions === "object" ? runtimeOptions : null;
  return {
    defaultForeground: normalizeHexColor(
      source && source.defaultForeground,
      DEFAULT_TERMINAL_RUNTIME_COLORS.defaultForeground
    ),
    defaultBackground: normalizeHexColor(
      source && source.defaultBackground,
      DEFAULT_TERMINAL_RUNTIME_COLORS.defaultBackground
    ),
    defaultCursor: normalizeHexColor(
      source && source.defaultCursor,
      DEFAULT_TERMINAL_RUNTIME_COLORS.defaultCursor
    )
  };
}

function buildBlankTerminalLine(bufferCols, style) {
  const columns = Math.max(1, Math.round(Number(bufferCols) || 0));
  const cellStyle = cloneAnsiState(style || ANSI_RESET_STATE);
  return Array.from({ length: columns }, () => createBlankCell(cloneAnsiState(cellStyle)));
}

function resolveAnsiBasicColor(index, bright) {
  const palette = bright ? ANSI_BRIGHT_COLORS : ANSI_BASE_COLORS;
  return palette[index] || "";
}

function resolveAnsi256Color(index) {
  const value = Number(index);
  if (!Number.isFinite(value) || value < 0 || value > 255) return "";
  if (value < 8) return ANSI_BASE_COLORS[value];
  if (value < 16) return ANSI_BRIGHT_COLORS[value - 8];
  if (value >= 232) {
    const gray = 8 + (value - 232) * 10;
    return rgbToHex(gray, gray, gray);
  }
  const cubeIndex = value - 16;
  const r = ANSI_CUBE_LEVELS[Math.floor(cubeIndex / 36) % 6];
  const g = ANSI_CUBE_LEVELS[Math.floor(cubeIndex / 6) % 6];
  const b = ANSI_CUBE_LEVELS[cubeIndex % 6];
  return rgbToHex(r, g, b);
}

function applyAnsiSgrCodes(state, codes) {
  const next = cloneAnsiState(state || ANSI_RESET_STATE);
  const values = Array.isArray(codes) && codes.length > 0 ? codes : [0];

  for (let i = 0; i < values.length; i += 1) {
    const rawCode = Number(values[i]);
    const code = Number.isFinite(rawCode) ? rawCode : 0;

    if (code === 0) {
      next.fg = "";
      next.bg = "";
      next.bold = false;
      next.underline = false;
      continue;
    }
    if (code === 1) {
      next.bold = true;
      continue;
    }
    if (code === 22) {
      next.bold = false;
      continue;
    }
    if (code === 4) {
      next.underline = true;
      continue;
    }
    if (code === 24) {
      next.underline = false;
      continue;
    }
    if (code >= 30 && code <= 37) {
      next.fg = resolveAnsiBasicColor(code - 30, false);
      continue;
    }
    if (code >= 90 && code <= 97) {
      next.fg = resolveAnsiBasicColor(code - 90, true);
      continue;
    }
    if (code === 39) {
      next.fg = "";
      continue;
    }
    if (code >= 40 && code <= 47) {
      next.bg = resolveAnsiBasicColor(code - 40, false);
      continue;
    }
    if (code >= 100 && code <= 107) {
      next.bg = resolveAnsiBasicColor(code - 100, true);
      continue;
    }
    if (code === 49) {
      next.bg = "";
      continue;
    }
    if (code === 38 || code === 48) {
      const isForeground = code === 38;
      const mode = Number(values[i + 1]);
      if (mode === 5) {
        const color = resolveAnsi256Color(values[i + 2]);
        if (color) {
          if (isForeground) next.fg = color;
          else next.bg = color;
        }
        i += 2;
        continue;
      }
      if (mode === 2) {
        const r = values[i + 2];
        const g = values[i + 3];
        const b = values[i + 4];
        if ([r, g, b].every((channel) => Number.isFinite(Number(channel)))) {
          const color = rgbToHex(r, g, b);
          if (isForeground) next.fg = color;
          else next.bg = color;
        }
        i += 4;
      }
    }
  }
  return next;
}

function normalizePositiveInt(value, fallback, min) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const normalized = Math.round(parsed);
  if (normalized < min) return fallback;
  return normalized;
}

function normalizeTerminalBufferOptions(options) {
  const source = options && typeof options === "object" ? options : {};
  return {
    bufferCols: normalizePositiveInt(source.bufferCols, 80, 1),
    bufferRows: normalizePositiveInt(source.bufferRows, 24, 1),
    maxEntries: normalizePositiveInt(source.maxEntries, 5000, 1),
    maxBytes: normalizePositiveInt(source.maxBytes, 4 * 1024 * 1024, 1),
    debugLog: typeof source.debugLog === "function" ? source.debugLog : null
  };
}

/**
 * stdout 时间片任务会先复制出一份独立运行态，后续 slice 都在这份运行态上推进。
 * 这里显式判断是否可以“复用已隔离状态”，避免每个 slice 再把 normal/alt buffer 整份深拷贝一遍。
 */
function canReuseTerminalRuntimeState(previousState, runtimeOptions) {
  if (!(runtimeOptions && runtimeOptions.reuseState)) {
    return false;
  }
  const source = previousState && typeof previousState === "object" ? previousState : null;
  return !!(source && source.version && source.buffers && source.buffers.normal && source.buffers.alt);
}

function createBlankScreenBuffer(isAlt, bufferRows, bufferCols) {
  return {
    isAlt: !!isAlt,
    cells: isAlt
      ? Array.from({ length: Math.max(1, Math.round(Number(bufferRows) || 0)) }, () =>
          buildBlankTerminalLine(bufferCols, ANSI_RESET_STATE)
        )
      : [[]],
    ansiState: cloneAnsiState(ANSI_RESET_STATE),
    cursorRow: 0,
    cursorCol: 0,
    savedCursorRow: 0,
    savedCursorCol: 0,
    savedAnsiState: cloneAnsiState(ANSI_RESET_STATE),
    scrollTop: 0,
    scrollBottom: Math.max(0, bufferRows - 1)
  };
}

function trimLineToBufferCols(line, bufferCols, createSpaceCell) {
  if (!Array.isArray(line) || line.length <= bufferCols) {
    return;
  }
  line.length = bufferCols;
  while (line.length > 0 && line[line.length - 1] && line[line.length - 1].continuation) {
    line.pop();
  }
  if (line.length === 0) {
    return;
  }
  const last = line[line.length - 1];
  if (last && !last.continuation && Number(last.width) === 2 && line.length === bufferCols) {
    line[line.length - 1] = createSpaceCell();
  }
}

function applySanitizedTerminalOutput(previousState, cleanText, options, runtimeOptions) {
  const normalizedText = String(cleanText || "");
  const normalizedOptions = normalizeTerminalBufferOptions(options);
  const { bufferCols, bufferRows, maxEntries, maxBytes, debugLog } = normalizedOptions;
  const runtimeColors = resolveTerminalRuntimeColors(runtimeOptions);
  const reuseState = canReuseTerminalRuntimeState(previousState, runtimeOptions);
  const reuseRows = !!(runtimeOptions && runtimeOptions.reuseRows);
  const runtimeState = reuseState
    ? previousState
    : normalizeTerminalBufferState(previousState, normalizedOptions, {
        cloneRows: !reuseRows
      });
  const responses = [];
  const log = (tag, payload) => {
    if (debugLog) {
      debugLog(tag, payload);
    }
  };

  let activeBuffer = null;
  let cellsLines = [[]];
  let ansiState = cloneAnsiState(ANSI_RESET_STATE);
  let cursorRow = 0;
  let cursorCol = 0;
  let scrollTop = 0;
  let scrollBottom = Math.max(0, bufferRows - 1);
  const metrics = {
    trimCostMs: 0,
    maxEntriesTrimmedRows: 0,
    maxBytesTrimmedRows: 0,
    maxBytesTrimmedColumns: 0,
    lineCount: 0,
    activeBufferName: "normal"
  };
  const modes = runtimeState.modes || getTerminalModeState(runtimeState);

  const createBlankRuntimeCell = () => createBlankCell(cloneAnsiState(ansiState));
  const createBlankRuntimeLine = () => buildBlankTerminalLine(bufferCols, ansiState);

  function ensureViewportRows() {
    if (activeBuffer && activeBuffer.isAlt) {
      while (cellsLines.length < bufferRows) {
        cellsLines.push(
          buildBlankTerminalLine(
            bufferCols,
            activeBuffer && activeBuffer.ansiState ? activeBuffer.ansiState : ANSI_RESET_STATE
          )
        );
      }
      if (cellsLines.length > bufferRows) {
        cellsLines = cellsLines.slice(0, bufferRows);
      }
      return;
    }
    if (cellsLines.length === 0) {
      cellsLines = [[]];
    }
  }

  function ensureLine(lineIndex) {
    const normalizedIndex = Math.max(0, Math.round(Number(lineIndex) || 0));
    if (activeBuffer && activeBuffer.isAlt) {
      ensureViewportRows();
      const target = Math.max(0, Math.min(normalizedIndex, bufferRows - 1));
      if (!Array.isArray(cellsLines[target])) {
        cellsLines[target] = [];
      }
      return cellsLines[target];
    }
    while (cellsLines.length <= normalizedIndex) {
      cellsLines.push([]);
    }
    if (!Array.isArray(cellsLines[normalizedIndex])) {
      cellsLines[normalizedIndex] = [];
    }
    return cellsLines[normalizedIndex];
  }

  function ensureCursorLine() {
    return ensureLine(cursorRow);
  }

  function ensureLineLength(line, length) {
    const target = Math.max(0, Math.min(Math.round(Number(length) || 0), bufferCols));
    while (line.length < target) {
      line.push(createBlankRuntimeCell());
    }
  }

  function setCell(line, column, cell) {
    if (column < 0 || column >= bufferCols) return;
    if (column >= line.length) {
      line.push(cell);
      return;
    }
    line[column] = cell;
  }

  function getViewportBaseRow() {
    if (activeBuffer && activeBuffer.isAlt) {
      return 0;
    }
    return Math.max(0, cellsLines.length - bufferRows);
  }

  function getAbsoluteScreenRow(screenRow) {
    const normalizedScreenRow = Math.max(0, Math.min(Math.round(Number(screenRow) || 0), bufferRows - 1));
    return getViewportBaseRow() + normalizedScreenRow;
  }

  function getScreenCursorRow() {
    if (activeBuffer && activeBuffer.isAlt) {
      return cursorRow;
    }
    return Math.max(0, cursorRow - getViewportBaseRow());
  }

  function resolveAbsoluteCursorRow(screenRow, restrictToRegion) {
    const minScreen = restrictToRegion ? scrollTop : 0;
    const maxScreen = restrictToRegion ? scrollBottom : Math.max(0, bufferRows - 1);
    const normalizedScreenRow = Math.max(minScreen, Math.min(Math.round(Number(screenRow) || 0), maxScreen));
    return getAbsoluteScreenRow(normalizedScreenRow);
  }

  /**
   * 光标纵向落点必须继续由当前 buffer 形态决定：
   * 1. alt buffer 只能夹在视口内；
   * 2. normal buffer 允许把历史行真实扩出来，不能误裁成固定 viewport。
   */
  function setCursorRowWithinActiveBuffer(nextRow) {
    const normalized = Math.max(0, Math.round(Number(nextRow) || 0));
    if (activeBuffer && activeBuffer.isAlt) {
      cursorRow = Math.min(bufferRows - 1, normalized);
      return;
    }
    cursorRow = normalized;
    ensureLine(cursorRow);
  }

  /**
   * normal buffer 的隐藏历史不属于“当前这块屏幕”。
   * 像 CUU/CPL 这种相对向上移动，在 normal buffer 有历史时只能退到当前视口顶部，
   * 否则分页器或局部重绘会把内容错误写回隐藏历史区。
   */
  function setCursorRowWithinVisibleViewport(nextRow) {
    const normalized = Math.max(0, Math.round(Number(nextRow) || 0));
    if (activeBuffer && activeBuffer.isAlt) {
      cursorRow = Math.min(bufferRows - 1, normalized);
      return;
    }
    cursorRow = Math.max(getViewportBaseRow(), normalized);
  }

  /**
   * origin mode 打开后，光标纵向移动必须被夹在当前滚动区内；
   * 否则多区界面会把正文区的相对移动写到标题区或状态栏里。
   */
  function setCursorRowWithinOriginRegion(nextRow) {
    const normalized = Math.max(0, Math.round(Number(nextRow) || 0));
    const { top, bottom } = getScrollBounds();
    cursorRow = Math.max(top, Math.min(normalized, bottom));
    ensureLine(cursorRow);
  }

  function resetCursorForOriginMode(enabled) {
    if (enabled) {
      const { top } = getScrollBounds();
      cursorRow = top;
    } else {
      cursorRow = resolveAbsoluteCursorRow(0, false);
    }
    cursorCol = 0;
    ensureLine(cursorRow);
  }

  function commitActiveBuffer() {
    ensureViewportRows();
    activeBuffer.cells = reuseRows ? cellsLines : cloneTerminalBufferRows(cellsLines);
    activeBuffer.ansiState = cloneAnsiState(ansiState);
    activeBuffer.cursorRow = Math.max(0, Math.round(Number(cursorRow) || 0));
    activeBuffer.cursorCol = Math.max(0, Math.round(Number(cursorCol) || 0));
    activeBuffer.scrollTop = scrollTop;
    activeBuffer.scrollBottom = scrollBottom;
    syncActiveBufferSnapshot(runtimeState, normalizedOptions, {
      cloneRows: !reuseRows
    });
  }

  function loadActiveBuffer() {
    activeBuffer = getActiveTerminalBuffer(runtimeState);
    if (reuseRows) {
      const activeCells =
        Array.isArray(activeBuffer && activeBuffer.cells) && activeBuffer.cells.length > 0
          ? activeBuffer.cells
          : activeBuffer && activeBuffer.isAlt
            ? Array.from({ length: bufferRows }, () =>
                buildBlankTerminalLine(
                  bufferCols,
                  activeBuffer && activeBuffer.ansiState ? activeBuffer.ansiState : ANSI_RESET_STATE
                )
              )
            : [[]];
      cellsLines = activeCells;
      activeBuffer.cells = activeCells;
    } else {
      cellsLines = cloneTerminalBufferRows(activeBuffer && activeBuffer.cells);
    }
    ensureViewportRows();
    ansiState = cloneAnsiState(
      activeBuffer && activeBuffer.ansiState ? activeBuffer.ansiState : ANSI_RESET_STATE
    );
    cursorRow = Math.max(0, Math.round(Number(activeBuffer && activeBuffer.cursorRow) || 0));
    cursorCol = Math.max(
      0,
      Math.min(Math.round(Number(activeBuffer && activeBuffer.cursorCol) || 0), bufferCols)
    );
    scrollTop = Math.max(0, Math.min(Number(activeBuffer && activeBuffer.scrollTop) || 0, bufferRows - 1));
    scrollBottom = Math.max(
      scrollTop,
      Math.min(Number(activeBuffer && activeBuffer.scrollBottom) || bufferRows - 1, bufferRows - 1)
    );

    if (activeBuffer && activeBuffer.isAlt) {
      cursorRow = Math.max(0, Math.min(cursorRow, bufferRows - 1));
    } else {
      ensureLine(cursorRow);
    }
  }

  function saveCurrentCursor() {
    activeBuffer.savedCursorRow = Math.max(0, Math.round(Number(cursorRow) || 0));
    activeBuffer.savedCursorCol = Math.max(0, Math.round(Number(cursorCol) || 0));
    activeBuffer.savedAnsiState = cloneAnsiState(ansiState);
  }

  function restoreCurrentCursor() {
    cursorRow = Math.max(0, Math.round(Number(activeBuffer.savedCursorRow) || 0));
    cursorCol = Math.max(0, Math.min(Math.round(Number(activeBuffer.savedCursorCol) || 0), bufferCols));
    ansiState = cloneAnsiState(activeBuffer.savedAnsiState || ANSI_RESET_STATE);
    if (activeBuffer.isAlt) {
      cursorRow = Math.max(0, Math.min(cursorRow, bufferRows - 1));
    } else {
      ensureLine(cursorRow);
    }
  }

  function switchActiveBuffer(target, clearTarget) {
    commitActiveBuffer();
    const targetName = target === "alt" ? "alt" : "normal";
    if (targetName === "alt" && clearTarget) {
      runtimeState.buffers.alt = createBlankScreenBuffer(true, bufferRows, bufferCols);
    }
    runtimeState.activeBuffer = targetName;
    loadActiveBuffer();
  }

  function getScrollBounds() {
    return {
      top: getAbsoluteScreenRow(scrollTop),
      bottom: getAbsoluteScreenRow(scrollBottom)
    };
  }

  /**
   * 当前“可视屏幕”的绝对行范围。
   * normal buffer 有历史时，screen top 不是绝对 `0`，而是当前 viewport base。
   */
  function getViewportBounds() {
    return {
      top: getViewportBaseRow(),
      bottom: getAbsoluteScreenRow(bufferRows - 1)
    };
  }

  function clearOverwrittenWideCell(line, column) {
    if (!Array.isArray(line) || column <= 0 || column >= line.length) return;
    const currentCell = line[column];
    const ownerCell = line[column - 1];
    if (!currentCell || !currentCell.continuation) return;
    if (!ownerCell || Number(ownerCell.width) !== 2) return;
    log("buffer.clear_overwritten_wide", {
      row: cursorRow,
      column,
      ownerText: String(ownerCell.text || ""),
      ownerWidth: Number(ownerCell.width) || 0
    });
    line[column - 1] = createBlankRuntimeCell();
    line[column] = createBlankRuntimeCell();
  }

  function clearDanglingContinuationCells(line, startColumn) {
    if (!Array.isArray(line)) return;
    let column = Math.max(0, Math.round(Number(startColumn) || 0));
    while (column < line.length && line[column] && line[column].continuation) {
      log("buffer.clear_dangling_continuation", { row: cursorRow, column });
      line[column] = createBlankRuntimeCell();
      column += 1;
    }
  }

  /**
   * ICH/DCH 这类“按列平移”的编辑指令会直接 splice 行数据。
   * 如果平移刚好切进宽字符中间，行里可能留下：
   * 1. 前面没有 owner 的 continuation；
   * 2. 后面没有 continuation 的宽字符 owner。
   * 这里在编辑后做一遍轻量收口，避免分页/编辑场景出现半个宽字符或脏尾巴。
   */
  function sanitizeLineWideCells(line) {
    if (!Array.isArray(line) || line.length === 0) {
      return;
    }
    for (let column = 0; column < line.length; column += 1) {
      const current = line[column];
      if (!current) {
        continue;
      }
      if (current.continuation) {
        const owner = column > 0 ? line[column - 1] : null;
        if (!owner || owner.continuation || Number(owner.width) !== 2) {
          log("buffer.clear_orphan_continuation", { row: cursorRow, column });
          line[column] = createBlankRuntimeCell();
        }
        continue;
      }
      if (Number(current.width) === 2) {
        const continuation = line[column + 1];
        if (!continuation || !continuation.continuation) {
          log("buffer.clear_truncated_wide", {
            row: cursorRow,
            column,
            ownerText: String(current.text || "")
          });
          line[column] = createBlankRuntimeCell();
        }
      }
    }
  }

  function appendCombiningText(value) {
    const line = ensureCursorLine();
    if (cursorCol <= 0 || line.length === 0) return;
    let ownerColumn = Math.min(cursorCol - 1, line.length - 1);
    while (ownerColumn > 0 && line[ownerColumn] && line[ownerColumn].continuation) {
      ownerColumn -= 1;
    }
    const ownerCell = line[ownerColumn];
    if (!ownerCell || Number(ownerCell.width) <= 0) return;
    ownerCell.text = `${ownerCell.text || ""}${value}`;
  }

  function scrollRegionUp(count) {
    const initialBounds = getScrollBounds();
    const amount = Math.max(
      1,
      Math.min(Math.round(Number(count) || 1), initialBounds.bottom - initialBounds.top + 1)
    );
    ensureViewportRows();
    for (let index = 0; index < amount; index += 1) {
      const { top, bottom } = getScrollBounds();
      if (activeBuffer && activeBuffer.isAlt) {
        cellsLines.splice(top, 1);
        cellsLines.splice(bottom, 0, createBlankRuntimeLine());
        continue;
      }
      const viewportBase = getViewportBaseRow();
      if (top === viewportBase) {
        cellsLines.splice(bottom + 1, 0, createBlankRuntimeLine());
      } else {
        cellsLines.splice(top, 1);
        cellsLines.splice(bottom, 0, createBlankRuntimeLine());
      }
    }
    ensureViewportRows();
  }

  function scrollRegionDown(count) {
    const initialBounds = getScrollBounds();
    const amount = Math.max(
      1,
      Math.min(Math.round(Number(count) || 1), initialBounds.bottom - initialBounds.top + 1)
    );
    ensureViewportRows();
    for (let index = 0; index < amount; index += 1) {
      const { top, bottom } = getScrollBounds();
      if (activeBuffer && activeBuffer.isAlt) {
        cellsLines.splice(bottom, 1);
        cellsLines.splice(top, 0, createBlankRuntimeLine());
        continue;
      }
      cellsLines.splice(top, 0, createBlankRuntimeLine());
      cellsLines.splice(bottom + 1, 1);
    }
    ensureViewportRows();
  }

  function moveToNextLine() {
    const { top, bottom } = getScrollBounds();
    const { bottom: viewportBottom } = getViewportBounds();
    // 光标在滚动区外时，只能在当前可视屏幕内下移，不能误把固定 footer 也卷进正文区。
    if (cursorRow < top || cursorRow > bottom) {
      cursorRow = Math.min(viewportBottom, cursorRow + 1);
      ensureCursorLine();
      cursorCol = 0;
      return;
    }
    if (cursorRow >= bottom) {
      scrollRegionUp(1);
      cursorRow = getScrollBounds().bottom;
      cursorCol = 0;
      ensureCursorLine();
      return;
    }
    cursorRow += 1;
    ensureCursorLine();
    cursorCol = 0;
  }

  function indexDown() {
    const { top, bottom } = getScrollBounds();
    const { bottom: viewportBottom } = getViewportBounds();
    // `ESC D` 与 `LF` 一样，只有命中滚动区底边才触发上卷；固定区只做普通下移。
    if (cursorRow < top || cursorRow > bottom) {
      cursorRow = Math.min(viewportBottom, cursorRow + 1);
      ensureCursorLine();
      return;
    }
    if (cursorRow >= bottom) {
      scrollRegionUp(1);
      cursorRow = getScrollBounds().bottom;
      ensureCursorLine();
      return;
    }
    cursorRow += 1;
    ensureCursorLine();
  }

  function nextLine() {
    indexDown();
    cursorCol = 0;
  }

  function reverseIndex() {
    const { top, bottom } = getScrollBounds();
    // `ESC M` 在滚动区外只是普通上移；normal buffer 有历史时也不能回写隐藏历史区。
    if (cursorRow < top || cursorRow > bottom) {
      setCursorRowWithinVisibleViewport(cursorRow - 1);
      ensureCursorLine();
      return;
    }
    if (cursorRow <= top) {
      scrollRegionDown(1);
      cursorRow = top;
      ensureCursorLine();
      return;
    }
    setCursorRowWithinVisibleViewport(cursorRow - 1);
    ensureCursorLine();
  }

  function writeChar(value, width) {
    const normalizedWidth = Math.max(0, Math.round(Number(width) || 0));
    if (normalizedWidth > bufferCols) return;
    if (normalizedWidth === 0) {
      appendCombiningText(value);
      return;
    }
    if (!modes.wraparound && cursorCol + normalizedWidth > bufferCols) {
      cursorCol = Math.max(0, bufferCols - normalizedWidth);
    }
    if (cursorCol + normalizedWidth - 1 >= bufferCols) {
      log("buffer.auto_wrap", {
        row: cursorRow,
        column: cursorCol,
        bufferCols,
        charWidth: normalizedWidth,
        charPreview: String(value || "")
      });
      moveToNextLine();
    }
    if (modes.insertMode) {
      insertChars(normalizedWidth);
    }
    const line = ensureCursorLine();
    ensureLineLength(line, cursorCol);
    clearOverwrittenWideCell(line, cursorCol);
    const cellStyle = cloneAnsiState(ansiState);
    setCell(line, cursorCol, createTerminalCell(value, cellStyle, normalizedWidth));
    cursorCol += 1;
    for (let rest = normalizedWidth - 1; rest > 0; rest -= 1) {
      ensureLineLength(line, cursorCol);
      setCell(line, cursorCol, createContinuationCell(cloneAnsiState(ansiState)));
      cursorCol += 1;
    }
    clearDanglingContinuationCells(line, cursorCol);
  }

  function clearLineByMode(mode) {
    const line = ensureCursorLine();
    const normalizedMode = Number.isFinite(mode) ? mode : 0;
    if (normalizedMode === 2) {
      const blankLine = createBlankRuntimeLine();
      line.length = 0;
      line.push(...blankLine);
      return;
    }
    if (normalizedMode === 1) {
      const limit = Math.min(bufferCols, Math.max(0, cursorCol + 1));
      ensureLineLength(line, limit);
      for (let index = 0; index < limit; index += 1) {
        line[index] = createBlankRuntimeCell();
      }
      return;
    }
    ensureLineLength(line, bufferCols);
    for (let index = Math.max(0, cursorCol); index < bufferCols; index += 1) {
      line[index] = createBlankRuntimeCell();
    }
  }

  function clearDisplayByMode(mode) {
    const normalizedMode = Number.isFinite(mode) ? mode : 0;
    if (normalizedMode === 2) {
      // `CSI 2 J` 只清屏，不应把光标错误重置到左上角，否则后续局部重绘会直接错位。
      cellsLines = Array.from({ length: Math.max(bufferRows, cursorRow + 1, 1) }, () =>
        createBlankRuntimeLine()
      );
      ensureCursorLine();
      return;
    }
    if (normalizedMode === 1) {
      for (let row = 0; row < cursorRow; row += 1) {
        cellsLines[row] = createBlankRuntimeLine();
      }
      const line = ensureCursorLine();
      const limit = Math.min(bufferCols, Math.max(0, cursorCol + 1));
      ensureLineLength(line, limit);
      for (let index = 0; index < limit; index += 1) {
        line[index] = createBlankRuntimeCell();
      }
      return;
    }
    const line = ensureCursorLine();
    ensureLineLength(line, bufferCols);
    for (let index = Math.max(0, cursorCol); index < bufferCols; index += 1) {
      line[index] = createBlankRuntimeCell();
    }
    for (let row = cursorRow + 1; row < cellsLines.length; row += 1) {
      cellsLines[row] = createBlankRuntimeLine();
    }
  }

  function insertChars(count) {
    const amount = Math.max(1, Math.min(Math.round(Number(count) || 1), bufferCols));
    const line = ensureCursorLine();
    ensureLineLength(line, cursorCol);
    const blanks = Array.from({ length: amount }, () => createBlankRuntimeCell());
    line.splice(cursorCol, 0, ...blanks);
    trimLineToBufferCols(line, bufferCols, createBlankRuntimeCell);
    sanitizeLineWideCells(line);
  }

  function deleteChars(count) {
    const amount = Math.max(1, Math.min(Math.round(Number(count) || 1), bufferCols));
    const line = ensureCursorLine();
    ensureLineLength(line, cursorCol + amount);
    line.splice(cursorCol, amount);
    while (line.length < bufferCols) {
      line.push(createBlankRuntimeCell());
    }
    trimLineToBufferCols(line, bufferCols, createBlankRuntimeCell);
    sanitizeLineWideCells(line);
  }

  function eraseChars(count) {
    const amount = Math.max(1, Math.min(Math.round(Number(count) || 1), Math.max(0, bufferCols - cursorCol)));
    if (amount <= 0) {
      return;
    }
    const line = ensureCursorLine();
    ensureLineLength(line, cursorCol + amount);
    for (let index = 0; index < amount; index += 1) {
      const column = cursorCol + index;
      clearOverwrittenWideCell(line, column);
      line[column] = createBlankRuntimeCell();
    }
    clearDanglingContinuationCells(line, Math.min(bufferCols, cursorCol + amount));
    trimLineToBufferCols(line, bufferCols, createBlankRuntimeCell);
  }

  function insertLines(count) {
    const { top, bottom } = getScrollBounds();
    if (cursorRow < top || cursorRow > bottom) {
      return;
    }
    const amount = Math.max(1, Math.min(Math.round(Number(count) || 1), bottom - cursorRow + 1));
    for (let index = 0; index < amount; index += 1) {
      cellsLines.splice(cursorRow, 0, createBlankRuntimeLine());
      cellsLines.splice(bottom + 1, 1);
    }
    ensureViewportRows();
  }

  function deleteLines(count) {
    const { top, bottom } = getScrollBounds();
    if (cursorRow < top || cursorRow > bottom) {
      return;
    }
    const amount = Math.max(1, Math.min(Math.round(Number(count) || 1), bottom - cursorRow + 1));
    for (let index = 0; index < amount; index += 1) {
      cellsLines.splice(cursorRow, 1);
      cellsLines.splice(bottom, 0, createBlankRuntimeLine());
    }
    ensureViewportRows();
  }

  function setScrollRegion(topValue, bottomValue) {
    const normalizedTop = Math.max(1, Math.min(Math.round(Number(topValue) || 1), bufferRows));
    const normalizedBottom = Math.max(
      normalizedTop,
      Math.min(Math.round(Number(bottomValue) || bufferRows), bufferRows)
    );
    scrollTop = normalizedTop - 1;
    scrollBottom = normalizedBottom - 1;
    cursorRow = resolveAbsoluteCursorRow(modes.originMode ? scrollTop : 0, modes.originMode);
    cursorCol = 0;
  }

  const vtInputHandler = createTerminalVtInputHandler({
    ansiResetState: ANSI_RESET_STATE,
    bufferCols,
    bufferRows,
    cloneAnsiState,
    getActiveBuffer: () => activeBuffer,
    getCursorCol: () => cursorCol,
    getScreenCursorRow,
    getScrollBottom: () => scrollBottom,
    getScrollTop: () => scrollTop,
    responses,
    restoreCurrentCursor,
    runtimeColors,
    runtimeState,
    saveCurrentCursor,
    moveCursorUp: (delta) => {
      if (modes.originMode) {
        setCursorRowWithinOriginRegion(cursorRow - delta);
        return;
      }
      setCursorRowWithinVisibleViewport(cursorRow - delta);
    },
    moveCursorDown: (delta) => {
      if (modes.originMode) {
        setCursorRowWithinOriginRegion(cursorRow + delta);
        return;
      }
      setCursorRowWithinActiveBuffer(cursorRow + delta);
    },
    moveCursorRight: (delta) => {
      cursorCol = Math.min(bufferCols, cursorCol + delta);
    },
    moveCursorLeft: (delta) => {
      cursorCol = Math.max(0, cursorCol - delta);
    },
    moveCursorNextLine: (delta) => {
      if (modes.originMode) {
        setCursorRowWithinOriginRegion(cursorRow + delta);
        cursorCol = 0;
        return;
      }
      setCursorRowWithinActiveBuffer(cursorRow + delta);
      cursorCol = 0;
    },
    moveCursorPreviousLine: (delta) => {
      if (modes.originMode) {
        setCursorRowWithinOriginRegion(cursorRow - delta);
        cursorCol = 0;
        return;
      }
      setCursorRowWithinVisibleViewport(cursorRow - delta);
      cursorCol = 0;
    },
    setCursorColumn1: (column) => {
      cursorCol = Math.min(bufferCols, Math.max(1, Math.round(Number(column) || 1)) - 1);
    },
    setCursorRow1: (row) => {
      const baseRow = runtimeState.modes.originMode ? scrollTop : 0;
      cursorRow = resolveAbsoluteCursorRow(
        baseRow + Math.max(1, Math.round(Number(row) || 1)) - 1,
        runtimeState.modes.originMode
      );
      ensureLine(cursorRow);
    },
    setCursorPosition1: (row, column) => {
      const baseRow = runtimeState.modes.originMode ? scrollTop : 0;
      cursorRow = resolveAbsoluteCursorRow(
        baseRow + Math.max(1, Math.round(Number(row) || 1)) - 1,
        runtimeState.modes.originMode
      );
      cursorCol = Math.min(bufferCols, Math.max(1, Math.round(Number(column) || 1)) - 1);
      ensureLine(cursorRow);
    },
    clearDisplayByMode,
    clearLineByMode,
    eraseChars,
    insertChars,
    deleteChars,
    insertLines,
    deleteLines,
    scrollRegionUp,
    scrollRegionDown,
    setScrollRegion,
    resetCursorForOriginMode,
    indexDown,
    nextLine,
    reverseIndex,
    setAnsiState: (value) => {
      ansiState = cloneAnsiState(value);
    },
    setCursorCol: (value) => {
      cursorCol = value;
    },
    setCursorRow: (value) => {
      cursorRow = value;
    },
    setScrollBottom: (value) => {
      scrollBottom = value;
    },
    setScrollTop: (value) => {
      scrollTop = value;
    },
    switchActiveBuffer,
    toOscRgbString
  });

  loadActiveBuffer();

  if (!normalizedText) {
    commitActiveBuffer();
    return {
      state: runtimeState,
      responses
    };
  }

  for (let index = 0; index < normalizedText.length; ) {
    const osc = extractOscSequence(normalizedText, index);
    if (osc) {
      const { ident, data } = parseOscContent(osc.content);
      if (Number.isFinite(ident)) {
        vtInputHandler.handleOscSequence(ident, data);
      }
      index = osc.end + 1;
      continue;
    }

    const dcs = extractDcsSequence(normalizedText, index);
    if (dcs) {
      const { privateMarker, intermediates } = parseDcsHeader(dcs.header);
      if (!privateMarker && intermediates === "$" && dcs.final === "q") {
        vtInputHandler.pushStatusStringResponse(dcs.data);
      }
      index = dcs.end + 1;
      continue;
    }

    const csi = extractAnsiCsi(normalizedText, index);
    if (csi) {
      const { privateMarker, intermediates, values } = parseCsiParams(csi.paramsRaw);
      if (csi.final === "m") {
        const codes = (values || []).map((value) => (Number.isFinite(value) ? value : 0));
        ansiState = applyAnsiSgrCodes(ansiState, codes.length > 0 ? codes : [0]);
        index = csi.end + 1;
        continue;
      }
      if (vtInputHandler.handleCsiControl(privateMarker, intermediates, csi.final, values)) {
        index = csi.end + 1;
        continue;
      }
      index = csi.end + 1;
      continue;
    }

    const looseSgr = extractLooseAnsiSgr(normalizedText, index);
    if (looseSgr) {
      ansiState = applyAnsiSgrCodes(ansiState, looseSgr.codes);
      index = looseSgr.end + 1;
      continue;
    }

    if (normalizedText[index] === "\u001b") {
      const escFinal = normalizedText[index + 1];
      if (escFinal === "]" || escFinal === "P") {
        index += 2;
        continue;
      }
      if (vtInputHandler.handleEscControl(escFinal)) {
        index += 2;
        continue;
      }
    }

    const codePoint = normalizedText.codePointAt(index);
    if (!Number.isFinite(codePoint)) break;
    const ch = String.fromCodePoint(codePoint);
    index += ch.length;
    if (ch === "\u0007") {
      continue;
    }
    if (ch === "\n") {
      moveToNextLine();
      continue;
    }
    if (ch === "\r") {
      cursorCol = 0;
      continue;
    }
    if (ch === "\b") {
      cursorCol = Math.max(0, cursorCol - 1);
      continue;
    }
    if (ch === "\t") {
      const spaces = 4 - (cursorCol % 4 || 0);
      const count = spaces <= 0 ? 4 : spaces;
      for (let pad = 0; pad < count; pad += 1) {
        writeChar(" ", 1);
      }
      continue;
    }
    writeChar(ch, measureCharDisplayColumns(ch));
  }

  if (!activeBuffer || !activeBuffer.isAlt) {
    const trimStartedAt = Date.now();
    if (cellsLines.length > maxEntries) {
      const removed = cellsLines.length - maxEntries;
      cellsLines = cellsLines.slice(removed);
      cursorRow = Math.max(0, cursorRow - removed);
      metrics.maxEntriesTrimmedRows += removed;
    }

    let lineTexts = cellsLines.map((lineCells) => lineCellsToText(lineCells));
    let totalBytes = lineTexts.reduce((acc, line) => acc + utf8ByteLength(line) + 1, 0);
    while (totalBytes > maxBytes && lineTexts.length > 1) {
      const removed = lineTexts.shift();
      cellsLines.shift();
      totalBytes -= utf8ByteLength(removed) + 1;
      cursorRow = Math.max(0, cursorRow - 1);
      metrics.maxBytesTrimmedRows += 1;
    }
    if (totalBytes > maxBytes && lineTexts.length === 1) {
      const singleCells = cellsLines[0] || [];
      const shiftLeadingDisplayCell = () => {
        while (singleCells.length > 0) {
          const current = singleCells.shift();
          const removedWidth = Math.max(0, Math.round(Number(current && current.width) || 0));
          if (removedWidth <= 0) {
            continue;
          }
          for (let rest = removedWidth - 1; rest > 0; rest -= 1) {
            if (singleCells[0] && singleCells[0].continuation) {
              singleCells.shift();
            }
          }
          return removedWidth;
        }
        return 0;
      };
      while (singleCells.length > 0 && utf8ByteLength(lineCellsToText(singleCells)) > maxBytes) {
        const removedWidth = shiftLeadingDisplayCell();
        if (cursorRow === 0 && cursorCol > 0 && removedWidth > 0) {
          cursorCol = Math.max(0, cursorCol - removedWidth);
        }
        metrics.maxBytesTrimmedColumns += Math.max(0, removedWidth);
      }
      cellsLines[0] = singleCells;
    }
    if (cellsLines.length === 0) {
      cellsLines = [[]];
      cursorRow = 0;
      cursorCol = 0;
    }
    metrics.trimCostMs = Date.now() - trimStartedAt;
  }

  cursorCol = Math.max(0, Math.min(Math.round(cursorCol), bufferCols));
  if (activeBuffer && activeBuffer.isAlt) {
    cursorRow = Math.max(0, Math.min(Math.round(cursorRow), bufferRows - 1));
  } else {
    cursorRow = Math.max(0, Math.min(Math.round(cursorRow), cellsLines.length - 1));
  }

  commitActiveBuffer();
  metrics.lineCount = Array.isArray(cellsLines) ? cellsLines.length : 0;
  metrics.activeBufferName = activeBuffer && activeBuffer.isAlt ? "alt" : "normal";
  return {
    state: runtimeState,
    responses,
    metrics
  };
}

function applyTerminalOutput(previousState, input, options, runtimeOptions) {
  const cleanText = normalizeTerminalReplayText(input);
  const reuseState = canReuseTerminalRuntimeState(previousState, runtimeOptions);
  const reuseRows = !!(runtimeOptions && runtimeOptions.reuseRows);
  if (!cleanText) {
    return {
      cleanText,
      state: reuseState
        ? previousState
        : cloneTerminalBufferState(previousState, options, {
            cloneRows: !reuseRows
          }),
      responses: [],
      metrics: {
        trimCostMs: 0,
        maxEntriesTrimmedRows: 0,
        maxBytesTrimmedRows: 0,
        maxBytesTrimmedColumns: 0,
        lineCount: 0,
        activeBufferName: "normal"
      }
    };
  }
  const result = applySanitizedTerminalOutput(previousState, cleanText, options, runtimeOptions);
  return {
    cleanText,
    state: result.state,
    responses: result.responses,
    metrics: result.metrics
  };
}

function buildTerminalCellsFromText(text) {
  const value = String(text || "");
  if (!value) return [];
  const cells = [];
  const appendCombining = (ch) => {
    for (let index = cells.length - 1; index >= 0; index -= 1) {
      if (cells[index] && !cells[index].continuation) {
        cells[index].text = `${cells[index].text || ""}${ch}`;
        return;
      }
    }
  };
  for (let index = 0; index < value.length; ) {
    const codePoint = value.codePointAt(index);
    if (!Number.isFinite(codePoint)) break;
    const ch = String.fromCodePoint(codePoint);
    index += ch.length;
    const width = measureCharDisplayColumns(ch);
    if (width <= 0) {
      appendCombining(ch);
      continue;
    }
    cells.push(createTerminalCell(ch, null, width));
    for (let rest = width - 1; rest > 0; rest -= 1) {
      cells.push(createContinuationCell(null));
    }
  }
  return cells;
}

function rebuildTerminalBufferStateFromReplayText(replayText, options, runtimeOptions) {
  const normalizedText = String(replayText || "");
  if (!normalizedText) {
    return createEmptyTerminalBufferState(options);
  }
  return applySanitizedTerminalOutput(
    createEmptyTerminalBufferState(options),
    normalizedText,
    options,
    runtimeOptions
  ).state;
}

/**
 * 为避免把旧字号下的折行固化到快照里，持久化时优先保留最近一段“可重放原始输出”。
 * 这里按 UTF-8 字节从尾部截断，恢复时再按当前列宽重建 buffer。
 */
function trimTerminalReplayTextToMaxBytes(text, maxBytes) {
  const value = String(text || "");
  const limit = Math.max(0, Math.round(Number(maxBytes) || 0));
  if (!value || limit <= 0) return "";
  if (utf8ByteLength(value) <= limit) return value;

  const chars = Array.from(value);
  let total = 0;
  let startIndex = chars.length;
  while (startIndex > 0) {
    const next = chars[startIndex - 1];
    const nextBytes = utf8ByteLength(next);
    if (total + nextBytes > limit) {
      break;
    }
    total += nextBytes;
    startIndex -= 1;
  }
  return chars.slice(startIndex).join("");
}

module.exports = {
  ANSI_RESET_STATE,
  applyTerminalOutput,
  buildTerminalCellsFromText,
  cloneAnsiState,
  cloneTerminalBufferState,
  createEmptyTerminalBufferState,
  getActiveTerminalBuffer,
  getTerminalModeState,
  rebuildTerminalBufferStateFromReplayText,
  syncActiveBufferSnapshot,
  trimTerminalReplayTextToMaxBytes,
  utf8ByteLength
};
