import { describe, expect, it } from "vitest";

const { decodeCodexTtyCapture20260311 } = require("./codexCaptureFixture.js");
const {
  consumeTerminalSyncUpdateFrames,
  createTerminalSyncUpdateState
} = require("./vtParser.js");
const {
  getActiveTerminalBuffer,
  rebuildTerminalBufferStateFromReplayText
} = require("./terminalBufferState.js");
const { buildTerminalViewportState } = require("./terminalViewportModel.js");

function splitTextIntoChunks(text: string, chunkSize: number) {
  const chunks = [];
  for (let index = 0; index < text.length; index += chunkSize) {
    chunks.push(text.slice(index, index + chunkSize));
  }
  return chunks;
}

function serializeViewportLines(replayText: string) {
  const state = rebuildTerminalBufferStateFromReplayText(replayText, {
    bufferCols: 80,
    bufferRows: 24
  });
  const active = getActiveTerminalBuffer(state);
  const viewport = buildTerminalViewportState({
    bufferRows: active.cells,
    cursorRow: active.cursorRow,
    activeBufferName: state.activeBufferName,
    visibleRows: 24,
    lineHeight: 20
  });
  return viewport.renderRows
    .map((line) =>
      (Array.isArray(line) ? line : [])
        .filter((cell) => cell && !cell.continuation)
        .map((cell) => cell.text || " ")
        .join("")
        .replace(/\s+$/, "")
    )
    .filter(Boolean);
}

describe("codexCaptureReplay", () => {
  it("真实 Codex 抓包回放时，会在交互进行中同时保留 Working 行和底部 footer", () => {
    const sample = decodeCodexTtyCapture20260311();

    expect(sample).toContain("\u001b[?2026h");
    expect(sample).toContain("Working");
    expect(sample).toContain("gpt-5.4 xhigh");

    let syncState = createTerminalSyncUpdateState();
    let replayText = "";
    let matchedLines: string[] | null = null;

    splitTextIntoChunks(sample, 97).forEach((chunk) => {
      if (matchedLines) {
        return;
      }
      const result = consumeTerminalSyncUpdateFrames(chunk, syncState);
      syncState = result.state;
      if (!result.text) {
        return;
      }
      replayText += result.text;
      const lines = serializeViewportLines(replayText);
      const hasWorking = lines.some((line) => line.includes("Working"));
      const hasFooter = lines.some(
        (line) => line.includes("gpt-5.4 xhigh") && line.includes("~/remoteconn")
      );
      const hasConversation = lines.some(
        (line) =>
          line.includes("Reply with the single word OK and then stop.") ||
          line.includes("Summarize recent commits")
      );
      if (hasWorking && hasFooter && hasConversation) {
        matchedLines = lines;
      }
    });

    expect(matchedLines).not.toBeNull();
    expect(matchedLines).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Working"),
        expect.stringContaining("gpt-5.4 xhigh"),
        expect.stringContaining("Summarize recent commits")
      ])
    );
  });

  it("真实 Codex 抓包完整回放后，normal buffer viewport 仍会保留底部 footer", () => {
    let syncState = createTerminalSyncUpdateState();
    let replayText = "";

    splitTextIntoChunks(decodeCodexTtyCapture20260311(), 97).forEach((chunk) => {
      const result = consumeTerminalSyncUpdateFrames(chunk, syncState);
      syncState = result.state;
      replayText += result.text;
    });

    expect(syncState).toEqual({
      depth: 0,
      carryText: "",
      bufferedText: ""
    });

    const lines = serializeViewportLines(replayText);

    expect(
      lines.some((line) => line.includes("gpt-5.4 xhigh") && line.includes("~/remoteconn"))
    ).toBe(true);
    expect(lines).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Conversation interrupted"),
        expect.stringContaining("Summarize recent commits")
      ])
    );
  });
});
