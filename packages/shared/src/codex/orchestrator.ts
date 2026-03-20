/**
 * Codex 模式编排命令。
 */
export interface CodexCommandPlan {
  step: "cd" | "check" | "run";
  command: string;
  markerType: "cd" | "check" | "run";
}

export interface CodexRunOptions {
  projectPath: string;
  sandbox: "read-only" | "workspace-write" | "danger-full-access";
  /**
   * 是否改为恢复最近一次 Codex 会话：
   * - `true` 时生成 `codex resume --last --sandbox ...`；
   * - `false/undefined` 时沿用全新启动命令。
   */
  resumeLast?: boolean;
}

/**
 * 对路径做最小安全转义，防止单引号截断。
 */
export function shellQuote(value: string): string {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

/**
 * 构造 `cd` 命令：
 * - `~` 与 `~/...` 需要保留 HOME 展开语义，不能整体单引号包裹；
 * - 其他路径走单引号最小转义，避免空格/特殊字符破坏命令。
 */
export function buildCdCommand(projectPath: string): string {
  const normalized = String(projectPath || "~").trim() || "~";

  if (normalized === "~") {
    return 'cd "$HOME"';
  }

  if (normalized.startsWith("~/")) {
    const relative = normalized.slice(2);
    return relative ? `cd "$HOME"/${shellQuote(relative)}` : 'cd "$HOME"';
  }

  return `cd ${shellQuote(normalized)}`;
}

/**
 * 生成 Codex 模式三步命令。
 */
export function buildCodexPlan(options: CodexRunOptions): CodexCommandPlan[] {
  const runCommand = options.resumeLast
    ? `codex resume --last --sandbox ${options.sandbox}`
    : `codex --sandbox ${options.sandbox}`;
  return [
    {
      step: "cd",
      command: buildCdCommand(options.projectPath),
      markerType: "cd"
    },
    {
      step: "check",
      command: "command -v codex",
      markerType: "check"
    },
    {
      step: "run",
      command: runCommand,
      markerType: "run"
    }
  ];
}
