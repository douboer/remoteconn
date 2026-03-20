/* global module, require */

const {
  buildLineCellRenderRuns,
  createBlankCell,
  createContinuationCell,
  createTerminalCell,
  measureCharDisplayColumns
} = require("./terminalCursorModel.js");

/**
 * 终端快照样式做最小化存储：
 * 1. 仅保留当前渲染真正需要的 fg/bg/bold/underline；
 * 2. 同一份样式进入 style table 去重，line runs 只保留索引；
 * 3. 这样比直接存整行 cell 更省空间，也避免恢复时回退成纯文本。
 */
function normalizeSnapshotStyle(style) {
  const source = style && typeof style === "object" ? style : null;
  if (!source) return null;
  const fg = String(source.fg || "").trim();
  const bg = String(source.bg || "").trim();
  const bold = source.bold === true;
  const underline = source.underline === true;
  if (!fg && !bg && !bold && !underline) {
    return null;
  }
  return {
    fg,
    bg,
    bold,
    underline
  };
}

function buildSnapshotStyleSignature(style) {
  const normalized = normalizeSnapshotStyle(style);
  if (!normalized) return "";
  return `${normalized.fg || ""}|${normalized.bg || ""}|${normalized.bold ? 1 : 0}|${normalized.underline ? 1 : 0}`;
}

function cloneSnapshotStyle(style) {
  const normalized = normalizeSnapshotStyle(style);
  return normalized ? { ...normalized } : null;
}

function measureTextDisplayColumns(text) {
  const value = String(text || "");
  if (!value) return 0;
  let columns = 0;
  for (let index = 0; index < value.length; ) {
    const codePoint = value.codePointAt(index);
    if (!Number.isFinite(codePoint)) break;
    const ch = String.fromCodePoint(codePoint);
    index += ch.length;
    const width = measureCharDisplayColumns(ch);
    if (width > 0) {
      columns += width;
    }
  }
  return columns;
}

function appendStyledTextCells(cells, text, style) {
  const value = String(text || "");
  if (!value) return;
  for (let index = 0; index < value.length; ) {
    const codePoint = value.codePointAt(index);
    if (!Number.isFinite(codePoint)) break;
    const ch = String.fromCodePoint(codePoint);
    index += ch.length;
    const width = measureCharDisplayColumns(ch);
    if (width <= 0) {
      for (let ownerIndex = cells.length - 1; ownerIndex >= 0; ownerIndex -= 1) {
        if (cells[ownerIndex] && !cells[ownerIndex].continuation) {
          cells[ownerIndex].text = `${cells[ownerIndex].text || ""}${ch}`;
          break;
        }
      }
      continue;
    }
    cells.push(createTerminalCell(ch, cloneSnapshotStyle(style), width));
    for (let rest = width - 1; rest > 0; rest -= 1) {
      cells.push(createContinuationCell(cloneSnapshotStyle(style)));
    }
  }
}

function serializeTerminalSnapshotRows(rowsInput) {
  const rows = Array.isArray(rowsInput) ? rowsInput : [];
  const styleTable = [];
  const styleIndexBySignature = new Map();
  const styledLines = rows.map((lineCells) => {
    const runs = buildLineCellRenderRuns(Array.isArray(lineCells) ? lineCells : []);
    return runs.map((run) => {
      const entry = {};
      const text = String((run && run.text) || "");
      const columns = Math.max(0, Math.round(Number(run && run.columns) || 0));
      if (text) {
        entry.t = text;
      }
      if (columns > 0) {
        entry.c = columns;
      }
      if (run && run.fixed) {
        entry.f = 1;
      }
      const styleSignature = buildSnapshotStyleSignature(run && run.style);
      if (styleSignature) {
        let styleIndex = styleIndexBySignature.get(styleSignature);
        if (!Number.isInteger(styleIndex)) {
          styleIndex = styleTable.length;
          styleIndexBySignature.set(styleSignature, styleIndex);
          styleTable.push(cloneSnapshotStyle(run.style));
        }
        entry.s = styleIndex;
      }
      return entry;
    });
  });
  return {
    styleTable,
    styledLines
  };
}

function deserializeTerminalSnapshotRows(linesInput, styleTableInput) {
  const styleTable = Array.isArray(styleTableInput) ? styleTableInput.map((style) => cloneSnapshotStyle(style)) : [];
  const lines = Array.isArray(linesInput) ? linesInput : [];
  return lines.map((lineRuns) => {
    const cells = [];
    const runs = Array.isArray(lineRuns) ? lineRuns : [];
    runs.forEach((run) => {
      const source = run && typeof run === "object" ? run : {};
      const text = String(source.t || "");
      const columns = Math.max(
        0,
        Math.round(Number(source.c !== undefined ? source.c : measureTextDisplayColumns(text)) || 0)
      );
      const styleIndex = Number(source.s);
      const style =
        Number.isInteger(styleIndex) && styleIndex >= 0 && styleIndex < styleTable.length
          ? styleTable[styleIndex]
          : null;
      if (!text) {
        for (let index = 0; index < columns; index += 1) {
          cells.push(createBlankCell(cloneSnapshotStyle(style)));
        }
        return;
      }
      appendStyledTextCells(cells, text, style);
    });
    return cells;
  });
}

module.exports = {
  deserializeTerminalSnapshotRows,
  serializeTerminalSnapshotRows
};
