import { describe, expect, it } from "vitest";

const {
  DEFAULT_AI_PROVIDER,
  AI_RUNTIME_EXIT_OSC_IDENT,
  CODEX_BOOTSTRAP_TOKEN_CODEX_MISSING,
  CODEX_BOOTSTRAP_TOKEN_DIR_MISSING,
  CODEX_BOOTSTRAP_TOKEN_READY,
  DEFAULT_CODEX_SANDBOX_MODE,
  DEFAULT_COPILOT_PERMISSION_MODE,
  buildAiRuntimeExitMarker,
  buildCopilotLaunchCommand,
  buildCopilotCommand,
  buildCdCommand,
  buildCodexBootstrapCommand,
  buildCodexResumeCommand,
  consumeAiRuntimeExitMarkers,
  isAiSessionReady,
  normalizeAiProvider,
  normalizeCodexSandboxMode,
  normalizeCopilotPermissionMode
} = require("./aiLaunch.js");

describe("miniprogram aiLaunch", () => {
  it("保留 HOME 展开语义", () => {
    expect(buildCdCommand("~")).toBe('cd "$HOME"');
    expect(buildCdCommand("~/workspace/remoteconn")).toBe("cd \"$HOME\"/'workspace/remoteconn'");
  });

  it("对普通路径做单引号转义", () => {
    expect(buildCdCommand("/var/www/my app")).toBe("cd '/var/www/my app'");
    expect(buildCdCommand("/tmp/it's here")).toBe("cd '/tmp/it'\\''s here'");
  });

  it("生成与 Web 对齐的 Codex bootstrap 命令", () => {
    const plan = buildCodexBootstrapCommand("~/workspace/demo", "danger-full-access");

    expect(plan.projectPath).toBe("~/workspace/demo");
    expect(plan.command.startsWith('sh -lc "')).toBe(true);
    expect(plan.command).toContain("codex --sandbox danger-full-access");
    expect(plan.command).toContain(CODEX_BOOTSTRAP_TOKEN_DIR_MISSING);
    expect(plan.command).toContain(CODEX_BOOTSTRAP_TOKEN_CODEX_MISSING);
    expect(plan.command).toContain(CODEX_BOOTSTRAP_TOKEN_READY);
    expect(plan.command).toContain(
      `printf '\\\\033]${AI_RUNTIME_EXIT_OSC_IDENT};RemoteConn;ai-exit=codex\\\\a'`
    );
  });

  it("生成 Codex 恢复命令时应使用 resume --last 并保留退出标记", () => {
    const plan = buildCodexResumeCommand("~/workspace/demo", "danger-full-access");

    expect(plan.projectPath).toBe("~/workspace/demo");
    expect(plan.command.startsWith('sh -lc "')).toBe(true);
    expect(plan.command).toContain("workspace/demo");
    expect(plan.command).toContain("codex resume --last --sandbox danger-full-access;");
    expect(plan.command).toContain(
      `printf '\\\\033]${AI_RUNTIME_EXIT_OSC_IDENT};RemoteConn;ai-exit=codex\\\\a'`
    );
  });

  it("AI 模式脏值会回退到稳定默认值", () => {
    expect(normalizeAiProvider("")).toBe(DEFAULT_AI_PROVIDER);
    expect(normalizeAiProvider("invalid")).toBe(DEFAULT_AI_PROVIDER);
    expect(normalizeCodexSandboxMode("")).toBe(DEFAULT_CODEX_SANDBOX_MODE);
    expect(normalizeCodexSandboxMode("invalid")).toBe(DEFAULT_CODEX_SANDBOX_MODE);
    expect(normalizeCopilotPermissionMode("")).toBe(DEFAULT_COPILOT_PERMISSION_MODE);
    expect(normalizeCopilotPermissionMode("invalid")).toBe(DEFAULT_COPILOT_PERMISSION_MODE);
  });

  it("会按 Copilot 权限模式构造启动命令", () => {
    expect(buildCopilotCommand("default")).toBe("copilot");
    expect(buildCopilotCommand("experimental")).toBe("copilot --experimental");
    expect(buildCopilotCommand("allow-all")).toBe("copilot --allow-all");
    expect(buildCopilotCommand("invalid")).toBe("copilot");
  });

  it("Copilot 启动命令也会携带退出标记，供前端解除前台 AI 保护", () => {
    const plan = buildCopilotLaunchCommand("~/workspace/demo", "allow-all");

    expect(plan.projectPath).toBe("~/workspace/demo");
    expect(plan.command.startsWith('sh -lc "')).toBe(true);
    expect(plan.command).toContain("copilot --allow-all");
    expect(plan.command).toContain(
      `printf '\\\\033]${AI_RUNTIME_EXIT_OSC_IDENT};RemoteConn;ai-exit=copilot\\\\a'`
    );
  });

  it("能消费完整或跨 chunk 的 AI 退出标记，而不污染可见文本", () => {
    const codexExitMarker = buildAiRuntimeExitMarker("codex");

    expect(consumeAiRuntimeExitMarkers(`prefix${codexExitMarker}suffix`, "")).toEqual({
      text: "prefixsuffix",
      carry: "",
      exitedProviders: ["codex"]
    });

    const first = consumeAiRuntimeExitMarkers(`before${codexExitMarker.slice(0, 8)}`, "");
    expect(first).toEqual({
      text: "before",
      carry: codexExitMarker.slice(0, 8),
      exitedProviders: []
    });

    expect(consumeAiRuntimeExitMarkers(`${codexExitMarker.slice(8)}after`, first.carry)).toEqual({
      text: "after",
      carry: "",
      exitedProviders: ["codex"]
    });
  });

  it("只有收到显式 shell-ready 信号后，才认为 AI 会话可发命令", () => {
    expect(isAiSessionReady("connected", true, false)).toBe(false);
    expect(isAiSessionReady("connected", true, true)).toBe(true);
    expect(isAiSessionReady("connecting", true, true)).toBe(false);
    expect(isAiSessionReady("connected", false, true)).toBe(false);
  });
});
