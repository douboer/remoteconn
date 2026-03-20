import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createTerminalFrameCaptureRecorder } from "./terminalFrameCapture";

const ORIGINAL_CAPTURE_DIR = process.env.RC_TERMINAL_CAPTURE_DIR;

afterEach(() => {
  if (ORIGINAL_CAPTURE_DIR === undefined) {
    delete process.env.RC_TERMINAL_CAPTURE_DIR;
  } else {
    process.env.RC_TERMINAL_CAPTURE_DIR = ORIGINAL_CAPTURE_DIR;
  }
});

describe("terminalFrameCapture", () => {
  it("未配置目录时不会开启录制", () => {
    delete process.env.RC_TERMINAL_CAPTURE_DIR;
    const recorder = createTerminalFrameCaptureRecorder({
      ip: "127.0.0.1",
      host: "example.com",
      port: 22,
      username: "gavin"
    });

    expect(recorder).toBeNull();
  });

  it("会把 meta、frame 和 close 事件写入 jsonl 文件", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "remoteconn-capture-"));
    process.env.RC_TERMINAL_CAPTURE_DIR = tempDir;

    const recorder = createTerminalFrameCaptureRecorder({
      ip: "127.0.0.1",
      host: "example.com",
      port: 22,
      username: "gavin",
      clientSessionKey: "session-1"
    });

    expect(recorder).not.toBeNull();
    recorder?.record("stdin", "hello\n");
    recorder?.record("stdout", "world\r\n");
    recorder?.close("shell_closed");

    const filePath = recorder?.filePath;
    expect(filePath).toBeTruthy();
    const lines = fs
      .readFileSync(String(filePath), "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));

    expect(lines[0]).toMatchObject({
      kind: "meta",
      host: "example.com",
      username: "gavin",
      clientSessionKey: "session-1"
    });
    expect(lines[1]).toMatchObject({
      kind: "frame",
      type: "stdin",
      data: "hello\n"
    });
    expect(lines[2]).toMatchObject({
      kind: "frame",
      type: "stdout",
      data: "world\r\n"
    });
    expect(lines[3]).toMatchObject({
      kind: "close",
      reason: "shell_closed"
    });

    fs.rmSync(tempDir, { recursive: true, force: true });
  });
});
