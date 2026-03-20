import { describe, expect, it } from "vitest";

const {
  createBlankCell,
  createContinuationCell,
  createTerminalCell,
  lineCellsToText
} = require("./terminalCursorModel.js");
const {
  deserializeTerminalSnapshotRows,
  serializeTerminalSnapshotRows
} = require("./terminalSnapshotCodec.js");

describe("terminalSnapshotCodec", () => {
  it("会用压缩 run 快照往返恢复 ANSI 样式与占位空白", () => {
    const styleA = { fg: "#ff5f56", bg: "#1f2937", bold: true, underline: false };
    const styleB = { fg: "#5bd2ff", bg: "", bold: false, underline: true };
    const rows = [
      [
        createTerminalCell("E", styleA, 1),
        createTerminalCell("R", styleA, 1),
        createTerminalCell("R", styleA, 1),
        createBlankCell(styleA),
        createTerminalCell("中", styleB, 2),
        createContinuationCell(styleB),
        createTerminalCell("A", styleB, 1)
      ]
    ];

    const snapshot = serializeTerminalSnapshotRows(rows);
    const restored = deserializeTerminalSnapshotRows(snapshot.styledLines, snapshot.styleTable);
    const restoredRow = restored[0] || [];

    expect(lineCellsToText(restoredRow)).toBe("ERR 中A");
    expect(restoredRow[0]?.style).toEqual(styleA);
    expect(restoredRow[3]?.placeholder).toBe(true);
    expect(restoredRow[3]?.style).toEqual(styleA);
    expect(restoredRow[4]?.style).toEqual(styleB);
    expect(restoredRow[5]?.continuation).toBe(true);
    expect(restoredRow[6]?.style).toEqual(styleB);
  });
});
