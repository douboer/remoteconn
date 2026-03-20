/* global module */

/**
 * 终端视口层只关心两件事：
 * 1. 当前到底应该渲染多少行，避免 normal buffer 在 prompt 下方保留虚假空白尾部；
 * 2. 当前内容理论上的最大滚动值，保证 scroll-view 与 overlay 使用同一套边界。
 *
 * 这里不改 VT buffer 本身，只做页面投影。
 */

const TERMINAL_VIEWPORT_TARGET_RENDER_ROWS = 160;
const TERMINAL_VIEWPORT_MIN_EDGE_BUFFER_ROWS = 24;
const TERMINAL_VIEWPORT_SCROLL_TARGET_RENDER_ROWS = 224;
const TERMINAL_VIEWPORT_SCROLL_MIN_EDGE_BUFFER_ROWS = 40;
const TERMINAL_VIEWPORT_DIRECTIONAL_LEAD_RATIO = 0.7;

function normalizeNonNegativeInteger(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.round(parsed));
}

function normalizeRows(rows) {
  return Array.isArray(rows) && rows.length > 0 ? rows : [[]];
}

function normalizeOptionalNonNegativeInteger(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.round(parsed));
}

function normalizeActiveBufferName(activeBufferName) {
  return activeBufferName === "alt" ? "alt" : "normal";
}

function normalizeScrollDirection(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  if (parsed > 0) return 1;
  if (parsed < 0) return -1;
  return 0;
}

function lineHasVisibleText(line) {
  if (!Array.isArray(line) || line.length === 0) {
    return false;
  }
  return line.some((cell) => {
    if (!cell || cell.continuation) {
      return false;
    }
    return String(cell.text || "").length > 0;
  });
}

function resolveLastNonEmptyRow(rows) {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    if (lineHasVisibleText(rows[index])) {
      return index;
    }
  }
  return 0;
}

/**
 * normal buffer 的 live tail 应该以当前 cursor 行为上界。
 * 否则哪怕 prompt 已经到底，scroll-view 仍会因为尾部空行继续给出可滚动空间。
 *
 * alternate screen 维持整屏语义，不做裁剪。
 */
function resolveTerminalRenderRows(bufferRows, cursorRow, activeBufferName) {
  const rows = normalizeRows(bufferRows);
  if (normalizeActiveBufferName(activeBufferName) === "alt") {
    return rows;
  }
  const cursorExclusive = normalizeNonNegativeInteger(cursorRow, 0) + 1;
  const contentExclusive = resolveLastNonEmptyRow(rows) + 1;
  const tailExclusive = Math.max(1, Math.min(rows.length, Math.max(cursorExclusive, contentExclusive)));
  return rows.slice(0, tailExclusive);
}

function resolveTerminalMaxScrollTop(renderRowCount, visibleRows, lineHeight) {
  const rows = Math.max(1, normalizeNonNegativeInteger(renderRowCount, 1));
  const viewportRows = Math.max(1, normalizeNonNegativeInteger(visibleRows, 1));
  const px = Math.max(1, normalizeNonNegativeInteger(lineHeight, 1));
  return Math.max(0, (rows - viewportRows) * px);
}

function resolveTerminalTargetRenderRows(contentRowCount, visibleRows, minEdgeBufferRows, targetRenderRows) {
  const rows = Math.max(1, normalizeNonNegativeInteger(contentRowCount, 1));
  const viewportRows = Math.max(1, normalizeNonNegativeInteger(visibleRows, 1));
  const edgeBufferRows = Math.max(
    0,
    normalizeNonNegativeInteger(minEdgeBufferRows, TERMINAL_VIEWPORT_MIN_EDGE_BUFFER_ROWS)
  );
  const targetRows = Math.max(
    1,
    normalizeNonNegativeInteger(targetRenderRows, TERMINAL_VIEWPORT_TARGET_RENDER_ROWS)
  );
  const minimumRows = viewportRows + edgeBufferRows * 2;
  return Math.min(rows, Math.max(minimumRows, targetRows));
}

function resolveTerminalDirectionalBuffers(extraRows, direction, minEdgeBufferRows) {
  const remainingRows = Math.max(0, normalizeNonNegativeInteger(extraRows, 0));
  const normalizedDirection = normalizeScrollDirection(direction);
  const edgeBufferRows = Math.max(
    0,
    normalizeNonNegativeInteger(minEdgeBufferRows, TERMINAL_VIEWPORT_MIN_EDGE_BUFFER_ROWS)
  );
  if (normalizedDirection === 0) {
    const backwardRows = Math.floor(remainingRows / 2);
    return {
      backwardRows,
      forwardRows: remainingRows - backwardRows
    };
  }
  const trailingRows = Math.min(
    remainingRows,
    Math.max(
      edgeBufferRows,
      Math.floor(remainingRows * (1 - TERMINAL_VIEWPORT_DIRECTIONAL_LEAD_RATIO))
    )
  );
  const leadingRows = Math.max(0, remainingRows - trailingRows);
  return normalizedDirection > 0
    ? {
        backwardRows: trailingRows,
        forwardRows: leadingRows
      }
    : {
        backwardRows: leadingRows,
        forwardRows: trailingRows
      };
}

function fillTerminalRenderWindow(renderStartRow, renderEndRow, contentRowCount, targetRenderRows) {
  let startRow = Math.max(0, normalizeNonNegativeInteger(renderStartRow, 0));
  let endRow = Math.max(startRow, normalizeNonNegativeInteger(renderEndRow, startRow));
  const rows = Math.max(1, normalizeNonNegativeInteger(contentRowCount, 1));
  const targetRows = Math.max(1, normalizeNonNegativeInteger(targetRenderRows, 1));
  let missingRows = Math.max(0, targetRows - (endRow - startRow));
  if (missingRows <= 0) {
    return {
      renderStartRow: startRow,
      renderEndRow: endRow
    };
  }
  const extendBackward = Math.min(startRow, missingRows);
  startRow -= extendBackward;
  missingRows -= extendBackward;
  if (missingRows > 0) {
    const extendForward = Math.min(rows - endRow, missingRows);
    endRow += extendForward;
    missingRows -= extendForward;
  }
  if (missingRows > 0) {
    const extendBackwardAgain = Math.min(startRow, missingRows);
    startRow -= extendBackwardAgain;
  }
  return {
    renderStartRow: startRow,
    renderEndRow: endRow
  };
}

/**
 * 小程序 scroll-view 一旦挂上几百行富文本，`setData` 和布局都会明显变重。
 * 这里基于“当前目标 scrollTop + 固定总预算”只截出一个窗口，靠上下 spacer 维持完整滚动高度。
 * 预算固定后，再根据最近滚动方向把更多余量分配到前方，兼顾性能与快速滑动时的预取需求。
 */
function resolveTerminalRenderWindow(contentRowCount, visibleRows, lineHeight, options) {
  const source = options && typeof options === "object" ? options : {};
  const rows = Math.max(1, normalizeNonNegativeInteger(contentRowCount, 1));
  const viewportRows = Math.max(1, normalizeNonNegativeInteger(visibleRows, 1));
  const px = Math.max(1, normalizeNonNegativeInteger(lineHeight, 1));
  const maxScrollTop = resolveTerminalMaxScrollTop(rows, viewportRows, px);
  const normalizedScrollTop = normalizeOptionalNonNegativeInteger(source.scrollTop);
  const followTail = source.followTail === true;
  const scrollDirection = normalizeScrollDirection(source.scrollDirection);
  const scrollViewport = source.scrollViewport === true;
  const minEdgeBufferRows = scrollViewport
    ? TERMINAL_VIEWPORT_SCROLL_MIN_EDGE_BUFFER_ROWS
    : TERMINAL_VIEWPORT_MIN_EDGE_BUFFER_ROWS;
  const targetRenderRows = resolveTerminalTargetRenderRows(
    rows,
    viewportRows,
    minEdgeBufferRows,
    scrollViewport ? TERMINAL_VIEWPORT_SCROLL_TARGET_RENDER_ROWS : TERMINAL_VIEWPORT_TARGET_RENDER_ROWS
  );

  let clampedScrollTop = 0;
  let windowed = false;
  if (followTail) {
    clampedScrollTop = maxScrollTop;
    windowed = true;
  } else if (normalizedScrollTop !== null) {
    clampedScrollTop = Math.min(maxScrollTop, normalizedScrollTop);
    windowed = true;
  }

  if (!windowed) {
    return {
      clampedScrollTop,
      visibleStartRow: 0,
      visibleEndRow: rows,
      renderStartRow: 0,
      renderEndRow: rows,
      topSpacerHeight: 0,
      bottomSpacerHeight: 0,
      backwardBufferRows: 0,
      forwardBufferRows: 0
    };
  }

  const maxVisibleStart = Math.max(0, rows - viewportRows);
  const visibleStartRow = Math.min(maxVisibleStart, Math.max(0, Math.floor(clampedScrollTop / px)));
  const visibleEndRow = Math.min(rows, visibleStartRow + viewportRows);
  const extraRows = Math.max(0, targetRenderRows - viewportRows);
  const directionalBuffers = resolveTerminalDirectionalBuffers(extraRows, scrollDirection, minEdgeBufferRows);
  const filledWindow = fillTerminalRenderWindow(
    Math.max(0, visibleStartRow - directionalBuffers.backwardRows),
    Math.min(rows, visibleEndRow + directionalBuffers.forwardRows),
    rows,
    targetRenderRows
  );
  const renderStartRow = filledWindow.renderStartRow;
  const renderEndRow = filledWindow.renderEndRow;
  return {
    clampedScrollTop,
    visibleStartRow,
    visibleEndRow,
    renderStartRow,
    renderEndRow,
    topSpacerHeight: renderStartRow * px,
    bottomSpacerHeight: Math.max(0, rows - renderEndRow) * px,
    backwardBufferRows: Math.max(0, visibleStartRow - renderStartRow),
    forwardBufferRows: Math.max(0, renderEndRow - visibleEndRow)
  };
}

function buildTerminalViewportState(options) {
  const source = options && typeof options === "object" ? options : {};
  const contentRows = resolveTerminalRenderRows(source.bufferRows, source.cursorRow, source.activeBufferName);
  const contentRowCount = contentRows.length;
  const windowState = resolveTerminalRenderWindow(
    contentRowCount,
    source.visibleRows,
    source.lineHeight,
    source
  );
  const renderRows = contentRows.slice(windowState.renderStartRow, windowState.renderEndRow);
  const renderRowCount = renderRows.length;
  const maxScrollTop = resolveTerminalMaxScrollTop(contentRowCount, source.visibleRows, source.lineHeight);
  return {
    activeBufferName: normalizeActiveBufferName(source.activeBufferName),
    contentRows,
    contentRowCount,
    clampedScrollTop: Math.min(maxScrollTop, Math.max(0, windowState.clampedScrollTop)),
    renderRows,
    renderRowCount,
    visibleStartRow: windowState.visibleStartRow,
    visibleEndRow: windowState.visibleEndRow,
    renderStartRow: windowState.renderStartRow,
    renderEndRow: windowState.renderEndRow,
    topSpacerHeight: windowState.topSpacerHeight,
    bottomSpacerHeight: windowState.bottomSpacerHeight,
    backwardBufferRows: windowState.backwardBufferRows,
    forwardBufferRows: windowState.forwardBufferRows,
    maxScrollTop
  };
}

module.exports = {
  buildTerminalViewportState,
  normalizeActiveBufferName,
  resolveTerminalMaxScrollTop,
  resolveTerminalRenderRows
};
