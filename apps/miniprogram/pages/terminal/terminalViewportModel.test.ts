import { describe, expect, it } from "vitest";

const {
  buildTerminalViewportState,
  resolveTerminalMaxScrollTop,
  resolveTerminalRenderRows
} = require("./terminalViewportModel.js");

describe("terminalViewportModel", () => {
  it("normal buffer 会裁掉 cursor 行之后的虚假尾部，避免 prompt 下方继续可滚动", () => {
    const rows = [[{ text: "a" }], [{ text: "b" }], [], []];

    const renderRows = resolveTerminalRenderRows(rows, 1, "normal");

    expect(renderRows).toHaveLength(2);
    expect(renderRows).toEqual(rows.slice(0, 2));
  });

  it("alternate screen 保留整屏行数，不裁掉底部空白", () => {
    const rows = [[{ text: "a" }], [], [], []];

    const renderRows = resolveTerminalRenderRows(rows, 0, "alt");

    expect(renderRows).toHaveLength(4);
    expect(renderRows).toEqual(rows);
  });

  it("normal buffer 在 cursor 行之后若仍有真实 footer，会保留到最后一个非空行", () => {
    const rows = [[{ text: "prompt" }], [], [{ text: "footer" }], []];

    const renderRows = resolveTerminalRenderRows(rows, 0, "normal");

    expect(renderRows).toHaveLength(3);
    expect(renderRows).toEqual(rows.slice(0, 3));
  });

  it("最大滚动值基于最终渲染行数，而不是旧尾部空行", () => {
    const viewport = buildTerminalViewportState({
      bufferRows: [[{ text: "a" }], [{ text: "b" }], [], []],
      cursorRow: 1,
      activeBufferName: "normal",
      visibleRows: 1,
      lineHeight: 20
    });

    expect(viewport.renderRowCount).toBe(2);
    expect(viewport.maxScrollTop).toBe(20);
    expect(resolveTerminalMaxScrollTop(2, 1, 20)).toBe(20);
  });

  it("最大滚动值会把 cursor 后的真实 footer 也算进去，而不是只看 cursor 行", () => {
    const viewport = buildTerminalViewportState({
      bufferRows: [[{ text: "prompt" }], [], [{ text: "footer" }], []],
      cursorRow: 0,
      activeBufferName: "normal",
      visibleRows: 1,
      lineHeight: 20
    });

    expect(viewport.renderRowCount).toBe(3);
    expect(viewport.maxScrollTop).toBe(40);
  });

  it("followTail 模式只渲染底部可视区附近窗口，并用 spacer 保留完整滚动高度", () => {
    const rows = Array.from({ length: 400 }, (_, index) => [{ text: `row-${index}` }]);

    const viewport = buildTerminalViewportState({
      bufferRows: rows,
      cursorRow: 399,
      activeBufferName: "normal",
      visibleRows: 5,
      lineHeight: 10,
      followTail: true,
      scrollDirection: 1
    });

    expect(viewport.contentRowCount).toBe(400);
    expect(viewport.maxScrollTop).toBe(3950);
    expect(viewport.clampedScrollTop).toBe(3950);
    expect(viewport.renderStartRow).toBe(240);
    expect(viewport.renderEndRow).toBe(400);
    expect(viewport.renderRowCount).toBe(160);
    expect(viewport.topSpacerHeight).toBe(2400);
    expect(viewport.bottomSpacerHeight).toBe(0);
    expect(viewport.backwardBufferRows).toBe(155);
    expect(viewport.forwardBufferRows).toBe(0);
    expect(viewport.renderRows[0]).toEqual(rows[240]);
    expect(viewport.renderRows.at(-1)).toEqual(rows[399]);
  });

  it("传入 scrollTop 时，会围绕当前滚动窗口裁出中段正文", () => {
    const rows = Array.from({ length: 400 }, (_, index) => [{ text: `row-${index}` }]);

    const viewport = buildTerminalViewportState({
      bufferRows: rows,
      cursorRow: 399,
      activeBufferName: "normal",
      visibleRows: 5,
      lineHeight: 10,
      scrollTop: 1000,
      scrollDirection: 1
    });

    expect(viewport.clampedScrollTop).toBe(1000);
    expect(viewport.renderStartRow).toBe(54);
    expect(viewport.renderEndRow).toBe(214);
    expect(viewport.renderRowCount).toBe(160);
    expect(viewport.topSpacerHeight).toBe(540);
    expect(viewport.bottomSpacerHeight).toBe(1860);
    expect(viewport.backwardBufferRows).toBe(46);
    expect(viewport.forwardBufferRows).toBe(109);
    expect(viewport.renderRows[0]).toEqual(rows[54]);
    expect(viewport.renderRows.at(-1)).toEqual(rows[213]);
  });

  it("滚动补刷模式会扩大窗口预算，减少快速滑动时频繁换窗", () => {
    const rows = Array.from({ length: 400 }, (_, index) => [{ text: `row-${index}` }]);

    const viewport = buildTerminalViewportState({
      bufferRows: rows,
      cursorRow: 399,
      activeBufferName: "normal",
      visibleRows: 5,
      lineHeight: 10,
      scrollTop: 1000,
      scrollDirection: -1,
      scrollViewport: true
    });

    expect(viewport.renderRowCount).toBe(224);
    expect(viewport.renderStartRow).toBe(0);
    expect(viewport.renderEndRow).toBe(224);
    expect(viewport.topSpacerHeight).toBe(0);
    expect(viewport.bottomSpacerHeight).toBe(1760);
  });
});
