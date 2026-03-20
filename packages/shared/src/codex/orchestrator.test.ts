import { describe, expect, it } from "vitest";
import { buildCdCommand, buildCodexPlan } from "./orchestrator";

describe("buildCdCommand", () => {
  it("`~` 应展开为 HOME", () => {
    expect(buildCdCommand("~")).toBe('cd "$HOME"');
  });

  it("`~/...` 应保留 HOME 前缀并安全引用余下路径", () => {
    expect(buildCdCommand("~/workspace/remoteconn")).toBe("cd \"$HOME\"/'workspace/remoteconn'");
  });

  it("普通绝对路径应保持单引号安全转义", () => {
    expect(buildCdCommand("/var/www/my app")).toBe("cd '/var/www/my app'");
  });
});

describe("buildCodexPlan", () => {
  it("首条命令应使用 cd 计划且包含 sandbox 启动命令", () => {
    const plan = buildCodexPlan({
      projectPath: "~/workspace/remoteconn",
      sandbox: "workspace-write"
    });

    expect(plan).toHaveLength(3);
    const cdStep = plan[0];
    const checkStep = plan[1];
    const runStep = plan[2];
    expect(cdStep).toBeDefined();
    expect(checkStep).toBeDefined();
    expect(runStep).toBeDefined();
    if (!cdStep || !checkStep || !runStep) {
      throw new Error("Codex 计划步骤缺失");
    }

    expect(cdStep).toEqual({
      step: "cd",
      command: "cd \"$HOME\"/'workspace/remoteconn'",
      markerType: "cd"
    });
    expect(checkStep.command).toBe("command -v codex");
    expect(runStep.command).toBe("codex --sandbox workspace-write");
  });

  it("resumeLast=true 时应改为恢复最近一次会话", () => {
    const plan = buildCodexPlan({
      projectPath: "~/workspace/remoteconn",
      sandbox: "danger-full-access",
      resumeLast: true
    });

    expect(plan[2]?.command).toBe("codex resume --last --sandbox danger-full-access");
  });
});
