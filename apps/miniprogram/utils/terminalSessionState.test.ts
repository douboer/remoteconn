import { describe, expect, it } from "vitest";

const {
  DEFAULT_TERMINAL_RESUME_MINUTES,
  MAX_TERMINAL_RESUME_MINUTES,
  buildTerminalSessionSnapshot,
  isTerminalSessionAiHighlighted,
  isTerminalSessionConnecting,
  isTerminalSessionHighlighted,
  normalizeCodexSandboxMode,
  normalizeTerminalResumeMinutes,
  normalizeTerminalSessionSnapshot,
  resolveTerminalResumeGraceMs
} = require("./terminalSessionState");

describe("terminalSessionState", () => {
  it("收敛后台保活分钟数到合法区间", () => {
    expect(normalizeTerminalResumeMinutes(undefined)).toBe(DEFAULT_TERMINAL_RESUME_MINUTES);
    expect(normalizeTerminalResumeMinutes(0)).toBe(1);
    expect(normalizeTerminalResumeMinutes(MAX_TERMINAL_RESUME_MINUTES + 10)).toBe(
      MAX_TERMINAL_RESUME_MINUTES
    );
  });

  it("根据设置生成毫秒级续接窗口", () => {
    expect(resolveTerminalResumeGraceMs({ backgroundSessionKeepAliveMinutes: 15 })).toBe(15 * 60 * 1000);
  });

  it("保留未过期的可续接快照", () => {
    const now = 1_700_000_000_000;
    const snapshot = buildTerminalSessionSnapshot(
      {
        serverId: "srv-1",
        serverLabel: "server-1",
        sessionId: "mini-1",
        sessionKey: "mini-key-1",
        status: "resumable",
        activeAiProvider: "codex",
        codexSandboxMode: "danger-full-access",
        resumeGraceMs: 15 * 60 * 1000
      },
      now
    );

    expect(snapshot).toBeTruthy();
    expect(snapshot && snapshot.codexSandboxMode).toBe("danger-full-access");
    expect(normalizeTerminalSessionSnapshot(snapshot, now + 1000)).toEqual(snapshot);
    expect(normalizeTerminalSessionSnapshot(snapshot, now + 15 * 60 * 1000 + 1)).toBeNull();
  });

  it("仅在 Codex 前台态下保留 sandbox，并收敛脏值", () => {
    const now = 1_700_000_000_000;

    expect(normalizeCodexSandboxMode("danger-full-access")).toBe("danger-full-access");
    expect(normalizeCodexSandboxMode("invalid")).toBe("workspace-write");
    expect(normalizeCodexSandboxMode("")).toBe("");

    const codexSnapshot = buildTerminalSessionSnapshot(
      {
        serverId: "srv-codex",
        sessionId: "mini-codex",
        sessionKey: "mini-key-codex",
        status: "connected",
        activeAiProvider: "codex",
        codexSandboxMode: "invalid",
        resumeGraceMs: 15 * 60 * 1000
      },
      now
    );
    const copilotSnapshot = buildTerminalSessionSnapshot(
      {
        serverId: "srv-copilot",
        sessionId: "mini-copilot",
        sessionKey: "mini-key-copilot",
        status: "connected",
        activeAiProvider: "copilot",
        codexSandboxMode: "danger-full-access",
        resumeGraceMs: 15 * 60 * 1000
      },
      now
    );

    expect(codexSnapshot && codexSnapshot.codexSandboxMode).toBe("workspace-write");
    expect(copilotSnapshot && copilotSnapshot.codexSandboxMode).toBe("");
  });

  it("区分高亮态与连接中态", () => {
    const now = 1_700_000_000_000;
    const resumable = buildTerminalSessionSnapshot(
      {
        serverId: "srv-2",
        sessionId: "mini-2",
        sessionKey: "mini-key-2",
        status: "resumable",
        activeAiProvider: "copilot",
        resumeGraceMs: 15 * 60 * 1000
      },
      now
    );
    const connecting = buildTerminalSessionSnapshot(
      {
        serverId: "srv-3",
        sessionId: "mini-3",
        sessionKey: "mini-key-3",
        status: "connecting",
        activeAiProvider: "invalid",
        resumeGraceMs: 15 * 60 * 1000
      },
      now
    );

    expect(isTerminalSessionHighlighted(resumable, "srv-2", now)).toBe(true);
    expect(isTerminalSessionConnecting(resumable, "srv-2", now)).toBe(false);
    expect(isTerminalSessionConnecting(connecting, "srv-3", now)).toBe(true);
    expect(isTerminalSessionHighlighted(connecting, "srv-3", now)).toBe(false);
    expect(connecting && connecting.activeAiProvider).toBe("");
  });

  it("仅在目标服务器存在 AI 前台态时点亮 AI 按钮", () => {
    const now = 1_700_000_000_000;
    const aiResumable = buildTerminalSessionSnapshot(
      {
        serverId: "srv-ai",
        sessionId: "mini-ai",
        sessionKey: "mini-key-ai",
        status: "resumable",
        activeAiProvider: "copilot",
        resumeGraceMs: 15 * 60 * 1000
      },
      now
    );
    const plainConnected = buildTerminalSessionSnapshot(
      {
        serverId: "srv-shell",
        sessionId: "mini-shell",
        sessionKey: "mini-key-shell",
        status: "connected",
        activeAiProvider: "",
        resumeGraceMs: 15 * 60 * 1000
      },
      now
    );

    expect(isTerminalSessionAiHighlighted(aiResumable, "srv-ai", now)).toBe(true);
    expect(isTerminalSessionAiHighlighted(aiResumable, "srv-other", now)).toBe(false);
    expect(isTerminalSessionAiHighlighted(plainConnected, "srv-shell", now)).toBe(false);
    expect(isTerminalSessionAiHighlighted(null, "srv-ai", now)).toBe(false);
  });
});
