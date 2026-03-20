import { describe, expect, it } from "vitest";

const {
  buildLineCellRenderRuns,
  createBlankCell,
  cloneTerminalCell,
  createContinuationCell,
  createTerminalCell,
  lineCellsToText,
  measureCharDisplayColumns,
  measureLineCellsDisplayColumns,
  resolveUniformLineBackground
} = require("./terminalCursorModel.js");

describe("terminalCursorModel", () => {
  it("按 cell 列宽处理宽字符和组合字符", () => {
    expect(measureCharDisplayColumns("a")).toBe(1);
    expect(measureCharDisplayColumns("中")).toBe(2);
    expect(measureCharDisplayColumns("\u0301")).toBe(0);
    expect(measureCharDisplayColumns("😀")).toBe(2);
  });

  it("按固定列缓冲区统计显示列宽，不把 continuation 重复计数", () => {
    const row = [
      createTerminalCell("A", null, 1),
      createTerminalCell("中", null, 2),
      createContinuationCell(null),
      createTerminalCell("B", null, 1)
    ];

    expect(lineCellsToText(row)).toBe("A中B");
    expect(measureLineCellsDisplayColumns(row)).toBe(4);
  });

  it("渲染 run 会把宽字符 owner 独立出来，并跳过 continuation 占位格", () => {
    const styleA = { fg: "#fff", bg: "", bold: false, underline: false };
    const styleB = { fg: "#0f0", bg: "", bold: false, underline: false };
    const row = [
      createTerminalCell("A", styleA, 1),
      createTerminalCell("B", styleA, 1),
      createTerminalCell("中", styleA, 2),
      createContinuationCell(styleA),
      createTerminalCell("C", styleB, 1)
    ];

    expect(buildLineCellRenderRuns(row)).toEqual([
      { text: "AB", style: styleA, columns: 2, fixed: false },
      { text: "中", style: styleA, columns: 2, fixed: true },
      { text: "C", style: styleB, columns: 1, fixed: false }
    ]);
  });

  it("placeholder blank cell 会保留列宽背景，但不会把尾随补位写进文本快照", () => {
    const style = { fg: "", bg: "#666666", bold: false, underline: false };
    const row = [
      createBlankCell(style),
      createBlankCell(style),
      createTerminalCell("X", style, 1),
      createBlankCell(style),
      createBlankCell(style)
    ];

    expect(lineCellsToText(row)).toBe("  X");
    expect(buildLineCellRenderRuns(row)).toEqual([
      { text: "", style, columns: 2, fixed: true },
      { text: "X", style, columns: 1, fixed: false },
      { text: "", style, columns: 2, fixed: true }
    ]);
  });

  it("整行 run 若共享同一个非空背景色，会返回可提升到 line 层的背景", () => {
    const bg = "#203040";
    const styleA = { fg: "#ffffff", bg, bold: false, underline: false };
    const styleB = { fg: "#89c2ff", bg, bold: true, underline: false };
    const row = [
      createBlankCell(styleA),
      createTerminalCell(">", styleA, 1),
      createTerminalCell(" ", styleA, 1),
      createTerminalCell("U", styleB, 1),
      createTerminalCell("s", styleB, 1),
      createTerminalCell("e", styleB, 1),
      createBlankCell(styleB)
    ];

    expect(resolveUniformLineBackground(buildLineCellRenderRuns(row))).toBe(bg);
  });

  it("只要一行里存在无背景或不同背景的 run，就不会提升到 line 层", () => {
    const rowWithGap = [
      createTerminalCell("A", { fg: "#fff", bg: "#111111", bold: false, underline: false }, 1),
      createTerminalCell("B", { fg: "#fff", bg: "", bold: false, underline: false }, 1)
    ];
    const rowWithMixedBg = [
      createTerminalCell("A", { fg: "#fff", bg: "#111111", bold: false, underline: false }, 1),
      createTerminalCell("B", { fg: "#fff", bg: "#222222", bold: false, underline: false }, 1)
    ];

    expect(resolveUniformLineBackground(buildLineCellRenderRuns(rowWithGap))).toBe("");
    expect(resolveUniformLineBackground(buildLineCellRenderRuns(rowWithMixedBg))).toBe("");
  });

  it("克隆 cell 时会复制样式对象，避免覆盖时污染原对象", () => {
    const original = createTerminalCell("A", { fg: "#fff", bold: true }, 1);
    const cloned = cloneTerminalCell(original);

    cloned.style.fg = "#000";
    expect(original.style.fg).toBe("#fff");
    expect(cloned.style.fg).toBe("#000");
    expect(cloned.width).toBe(1);
  });
});
