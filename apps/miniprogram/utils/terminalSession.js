/* global wx, console, module, require */

const { buildTerminalSessionSnapshot, normalizeTerminalSessionSnapshot } = require("./terminalSessionState");

const TERMINAL_SESSION_STORAGE_KEY = "remoteconn.terminal.session.v1";
const TERMINAL_BUFFER_STORAGE_KEY = "remoteconn.terminal.buffer.v1";

function normalizePositiveInt(value, fallback, min) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const normalized = Math.round(parsed);
  if (normalized < min) return fallback;
  return normalized;
}

function normalizeTerminalSnapshotStyle(input) {
  const source = input && typeof input === "object" ? input : null;
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

function normalizeTerminalSnapshotStyleTable(input) {
  const rows = Array.isArray(input) ? input : [];
  return rows.map((item) => normalizeTerminalSnapshotStyle(item)).filter(Boolean);
}

function normalizeTerminalSnapshotRun(input, styleCount) {
  const source = input && typeof input === "object" ? input : null;
  if (!source) return null;
  const text =
    typeof source.t === "string" ? source.t : typeof source.text === "string" ? source.text : "";
  const rawColumns = Number(source.c !== undefined ? source.c : source.columns);
  const columns = Number.isFinite(rawColumns) ? Math.max(0, Math.round(rawColumns)) : 0;
  if (!text && columns <= 0) {
    return null;
  }
  const next = {};
  if (text) next.t = text;
  if (columns > 0) next.c = columns;
  if (source.f === 1 || source.fixed === true) {
    next.f = 1;
  }
  const rawStyleIndex = Number(source.s !== undefined ? source.s : source.styleIndex);
  if (Number.isInteger(rawStyleIndex) && rawStyleIndex >= 0 && rawStyleIndex < styleCount) {
    next.s = rawStyleIndex;
  }
  return next;
}

function normalizeTerminalSnapshotStyledLines(input, styleTable) {
  const rows = Array.isArray(input) ? input : [];
  const styleCount = Array.isArray(styleTable) ? styleTable.length : 0;
  return rows.map((line) => {
    const runs = Array.isArray(line) ? line : [];
    return runs.map((run) => normalizeTerminalSnapshotRun(run, styleCount)).filter(Boolean);
  });
}

function readTerminalSessionRaw() {
  try {
    const value = wx.getStorageSync(TERMINAL_SESSION_STORAGE_KEY);
    return value && typeof value === "object" ? value : null;
  } catch (error) {
    console.warn("[terminalSession.read]", error);
    return null;
  }
}

function getTerminalSessionSnapshot(now = Date.now()) {
  const snapshot = normalizeTerminalSessionSnapshot(readTerminalSessionRaw(), now);
  if (snapshot) {
    return snapshot;
  }
  clearTerminalSessionSnapshot();
  return null;
}

function saveTerminalSessionSnapshot(snapshot, now = Date.now()) {
  const normalized = normalizeTerminalSessionSnapshot(snapshot, now);
  if (!normalized) {
    clearTerminalSessionSnapshot();
    return null;
  }
  try {
    wx.setStorageSync(TERMINAL_SESSION_STORAGE_KEY, normalized);
    return normalized;
  } catch (error) {
    console.warn("[terminalSession.write]", error);
    return null;
  }
}

function createTerminalSessionSnapshot(input, now = Date.now()) {
  const snapshot = buildTerminalSessionSnapshot(input, now);
  if (!snapshot) return null;
  return saveTerminalSessionSnapshot(snapshot, now);
}

function markTerminalSessionResumable(patch, now = Date.now()) {
  return createTerminalSessionSnapshot({ ...(patch || {}), status: "resumable" }, now);
}

function normalizeTerminalBufferSnapshot(input, now = Date.now()) {
  const source = input && typeof input === "object" ? input : null;
  if (!source) return null;
  const sessionKey = String(source.sessionKey || "").trim();
  if (!sessionKey) return null;
  const lines = Array.isArray(source.lines) ? source.lines.filter((item) => typeof item === "string") : [];
  const styleTable = normalizeTerminalSnapshotStyleTable(source.styleTable);
  const styledLines = normalizeTerminalSnapshotStyledLines(source.styledLines, styleTable);
  const replayText = typeof source.replayText === "string" ? source.replayText : "";
  const cursorRow = Number(source.cursorRow);
  const cursorCol = Number(source.cursorCol);
  const savedAt = Number(source.savedAt);
  const bufferCols = normalizePositiveInt(source.bufferCols, 80, 1);
  const bufferRows = normalizePositiveInt(source.bufferRows, 24, 1);
  return {
    version: styledLines.length > 0 ? 2 : 1,
    sessionKey,
    lines,
    styleTable,
    styledLines,
    replayText,
    bufferCols,
    bufferRows,
    cursorRow: Number.isFinite(cursorRow) ? Math.max(0, Math.round(cursorRow)) : 0,
    cursorCol: Number.isFinite(cursorCol) ? Math.max(0, Math.round(cursorCol)) : 0,
    savedAt: Number.isFinite(savedAt) ? Math.round(savedAt) : now
  };
}

function saveTerminalBufferSnapshot(snapshot, now = Date.now()) {
  const normalized = normalizeTerminalBufferSnapshot(snapshot, now);
  if (!normalized) {
    clearTerminalBufferSnapshot();
    return null;
  }
  try {
    wx.setStorageSync(TERMINAL_BUFFER_STORAGE_KEY, normalized);
    return normalized;
  } catch (error) {
    console.warn("[terminalBuffer.write]", error);
    return null;
  }
}

function getTerminalBufferSnapshot(sessionKey, now = Date.now()) {
  const targetSessionKey = String(sessionKey || "").trim();
  if (!targetSessionKey) return null;
  try {
    const raw = wx.getStorageSync(TERMINAL_BUFFER_STORAGE_KEY);
    const normalized = normalizeTerminalBufferSnapshot(raw, now);
    if (!normalized || normalized.sessionKey !== targetSessionKey) {
      return null;
    }
    return normalized;
  } catch (error) {
    console.warn("[terminalBuffer.read]", error);
    return null;
  }
}

function clearTerminalBufferSnapshot() {
  try {
    wx.removeStorageSync(TERMINAL_BUFFER_STORAGE_KEY);
  } catch (error) {
    console.warn("[terminalBuffer.clear]", error);
  }
}

function clearTerminalSessionSnapshot() {
  try {
    wx.removeStorageSync(TERMINAL_SESSION_STORAGE_KEY);
  } catch (error) {
    console.warn("[terminalSession.clear]", error);
  }
  clearTerminalBufferSnapshot();
}

module.exports = {
  getTerminalSessionSnapshot,
  saveTerminalSessionSnapshot,
  createTerminalSessionSnapshot,
  markTerminalSessionResumable,
  getTerminalBufferSnapshot,
  saveTerminalBufferSnapshot,
  clearTerminalBufferSnapshot,
  clearTerminalSessionSnapshot
};
