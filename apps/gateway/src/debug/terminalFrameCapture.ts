import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

export type TerminalCaptureFrameType = "stdin" | "stdout" | "stderr";

export interface TerminalFrameCaptureRecorder {
  filePath: string;
  record(type: TerminalCaptureFrameType, data: string): void;
  close(reason?: string): void;
}

interface TerminalFrameCaptureMeta {
  ip: string;
  host: string;
  port: number;
  username: string;
  clientSessionKey?: string;
  captureDir?: string;
}

function sanitizePathToken(input: string): string {
  return String(input || "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "") || "unknown";
}

function resolveCaptureDir(preferredDir?: string): string {
  return String(preferredDir || process.env.RC_TERMINAL_CAPTURE_DIR || "").trim();
}

export function createTerminalFrameCaptureRecorder(
  meta: TerminalFrameCaptureMeta
): TerminalFrameCaptureRecorder | null {
  const captureDir = resolveCaptureDir(meta.captureDir);
  if (!captureDir) {
    return null;
  }

  fs.mkdirSync(captureDir, { recursive: true });
  const startedAt = Date.now();
  const fileName = [
    new Date(startedAt).toISOString().replace(/[:.]/g, "-"),
    sanitizePathToken(meta.username),
    "@",
    sanitizePathToken(meta.host),
    `-${Number(meta.port) || 22}`,
    `-${randomUUID().slice(0, 8)}.jsonl`
  ].join("");
  const filePath = path.join(captureDir, fileName);
  let closed = false;

  const writeLine = (payload: Record<string, unknown>): void => {
    fs.appendFileSync(filePath, `${JSON.stringify(payload)}\n`, "utf8");
  };

  writeLine({
    kind: "meta",
    version: 1,
    startedAt,
    ip: meta.ip,
    host: meta.host,
    port: meta.port,
    username: meta.username,
    clientSessionKey: meta.clientSessionKey || ""
  });

  return {
    filePath,
    record(type, data) {
      if (closed || !data) {
        return;
      }
      const now = Date.now();
      writeLine({
        kind: "frame",
        at: now,
        offsetMs: Math.max(0, now - startedAt),
        type,
        data
      });
    },
    close(reason) {
      if (closed) {
        return;
      }
      closed = true;
      writeLine({
        kind: "close",
        at: Date.now(),
        offsetMs: Math.max(0, Date.now() - startedAt),
        reason: reason || ""
      });
    }
  };
}
