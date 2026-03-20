/* global module */

const CODEX_BOOTSTRAP_TOKEN_DIR_MISSING = "__RC_CODEX_DIR_MISSING__";
const CODEX_BOOTSTRAP_TOKEN_CODEX_MISSING = "__RC_CODEX_BIN_MISSING__";
const CODEX_BOOTSTRAP_TOKEN_READY = "__RC_CODEX_READY__";
const AI_RUNTIME_EXIT_OSC_IDENT = 633;
const DEFAULT_AI_PROVIDER = "codex";
const DEFAULT_CODEX_SANDBOX_MODE = "workspace-write";
const DEFAULT_COPILOT_PERMISSION_MODE = "default";

const AI_PROVIDER_VALUES = new Set(["codex", "copilot"]);
const CODEX_SANDBOX_MODE_VALUES = new Set(["read-only", "workspace-write", "danger-full-access"]);
const COPILOT_PERMISSION_MODE_VALUES = new Set(["default", "experimental", "allow-all"]);
const AI_RUNTIME_EXIT_MARKERS = {
  codex: `\u001b]${AI_RUNTIME_EXIT_OSC_IDENT};RemoteConn;ai-exit=codex\u0007`,
  copilot: `\u001b]${AI_RUNTIME_EXIT_OSC_IDENT};RemoteConn;ai-exit=copilot\u0007`
};

/**
 * AI 默认入口只允许 Codex / Copilot 两档：
 * 1. 新装默认走 Codex；
 * 2. 历史空值和脏值统一回退到 Codex。
 */
function normalizeAiProvider(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  return AI_PROVIDER_VALUES.has(normalized) ? normalized : DEFAULT_AI_PROVIDER;
}

/**
 * Codex sandbox 模式只接受三档预设值：
 * 1. 旧版本/脏数据回落到项目目录读写；
 * 2. 保持与当前弹窗默认选项一致，避免升级后行为突变。
 */
function normalizeCodexSandboxMode(value) {
  const normalized = String(value || "").trim();
  return CODEX_SANDBOX_MODE_VALUES.has(normalized) ? normalized : DEFAULT_CODEX_SANDBOX_MODE;
}

/**
 * Copilot 权限模式同样收口为固定三档：
 * 1. 默认；
 * 2. experimental；
 * 3. allow-all。
 */
function normalizeCopilotPermissionMode(value) {
  const normalized = String(value || "").trim();
  return COPILOT_PERMISSION_MODE_VALUES.has(normalized) ? normalized : DEFAULT_COPILOT_PERMISSION_MODE;
}

/**
 * 对 shell 参数做最小安全转义，避免单引号截断。
 */
function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

/**
 * 构造项目目录切换命令：
 * 1. `~` 和 `~/...` 需要保留 HOME 展开语义；
 * 2. 其他路径统一做单引号转义，避免空格或特殊字符破坏命令。
 */
function buildCdCommand(projectPath) {
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
 * 由全局配置推导 Copilot 启动命令：
 * 1. 默认模式直接执行 `copilot`；
 * 2. 其它模式只追加稳定 flag，不在页面层散落命令字符串。
 */
function buildCopilotCommand(mode) {
  const normalized = normalizeCopilotPermissionMode(mode);
  if (normalized === "experimental") return "copilot --experimental";
  if (normalized === "allow-all") return "copilot --allow-all";
  return "copilot";
}

/**
 * AI 前台态退出标记：
 * 1. 使用未知 OSC，既能被前端原始流识别，也不会污染终端可见内容；
 * 2. 远端 AI 进程退出回到 shell 时打印一次，用于解除“当前已有 AI 在前台”的保护。
 */
function buildAiRuntimeExitMarker(provider) {
  const normalized = normalizeAiProvider(provider);
  return AI_RUNTIME_EXIT_MARKERS[normalized] || AI_RUNTIME_EXIT_MARKERS[DEFAULT_AI_PROVIDER];
}

function buildAiRuntimeExitPrintfCommand(provider) {
  const normalized = normalizeAiProvider(provider);
  return `printf '\\033]${AI_RUNTIME_EXIT_OSC_IDENT};RemoteConn;ai-exit=${normalized}\\a'`;
}

/**
 * AI 启动前的“会话可发命令”判定：
 * 1. 不能只看页面状态是否显示为 connected，因为首段 banner/stdout 可能早于 shell 真正 ready；
 * 2. 小程序自动建链后立刻点 AI 的场景里，必须等待网关显式 `control.connected`；
 * 3. 这样可以避免把 Codex/Copilot 启动命令打进尚未就绪的 shell，导致后续 bootstrap token 永远等不到。
 */
function isAiSessionReady(status, hasClient, shellReady) {
  return String(status || "").trim() === "connected" && !!hasClient && shellReady === true;
}

/**
 * 将脚本文本安全嵌入到 `sh -lc "..."` 的双引号参数中。
 * 说明：远端默认 shell 可能不是 POSIX shell，因此需要显式把 bootstrap
 * 转交给 `sh -lc` 解释，避免 csh/tcsh 在重定向语法上报错。
 */
function escapeForDoubleQuotedShellArg(script) {
  return String(script || "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\$/g, "\\$")
    .replace(/`/g, "\\`")
    .replace(/!/g, "\\!");
}

/**
 * 从原始 stdout/stderr 中消费 AI 退出标记：
 * 1. 已完成的 OSC 标记直接剥离，并返回退出的 provider；
 * 2. 若 chunk 末尾只收到半段标记，则仅缓存那段 `ESC ] ...` 尾巴；
 * 3. 不延迟普通文本输出，避免为等标记而卡住终端刷新。
 */
function consumeAiRuntimeExitMarkers(input, previousCarry) {
  let working = `${String(previousCarry || "")}${String(input || "")}`;
  const exitedProviders = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (const provider of Object.keys(AI_RUNTIME_EXIT_MARKERS)) {
      const marker = AI_RUNTIME_EXIT_MARKERS[provider];
      const index = working.indexOf(marker);
      if (index < 0) {
        continue;
      }
      exitedProviders.push(provider);
      working = `${working.slice(0, index)}${working.slice(index + marker.length)}`;
      changed = true;
    }
  }

  let carry = "";
  const lastEscIndex = working.lastIndexOf("\u001b");
  if (lastEscIndex >= 0) {
    const suffix = working.slice(lastEscIndex);
    const mayBeMarkerTail = Object.values(AI_RUNTIME_EXIT_MARKERS).some((marker) =>
      marker.startsWith(suffix)
    );
    if (mayBeMarkerTail) {
      carry = suffix;
      working = working.slice(0, lastEscIndex);
    }
  }

  return {
    text: working,
    carry,
    exitedProviders
  };
}

/**
 * 生成小程序端 Codex 启动预检命令。
 * 目标与 Web 端保持一致：
 * 1. 先验证项目目录是否存在；
 * 2. 再验证服务器是否安装 `codex`；
 * 3. 仅在两项都通过时，进入目标目录并启动 Codex。
 */
function buildCodexBootstrapCommand(projectPath, sandbox) {
  const normalizedPath = String(projectPath || "~").trim() || "~";
  const cdCommand = buildCdCommand(normalizedPath);
  const runCommand = `codex --sandbox ${normalizeCodexSandboxMode(sandbox)}`;
  const exitPrintfCommand = buildAiRuntimeExitPrintfCommand("codex");
  const bootstrapScript =
    `__rc_codex_path_ok=1; __rc_codex_bin_ok=1; ${cdCommand} >/dev/null 2>&1 || __rc_codex_path_ok=0; ` +
    `command -v codex >/dev/null 2>&1 || __rc_codex_bin_ok=0; ` +
    `[ "$__rc_codex_path_ok" -eq 1 ] || printf '${CODEX_BOOTSTRAP_TOKEN_DIR_MISSING}\\n'; ` +
    `[ "$__rc_codex_bin_ok" -eq 1 ] || printf '${CODEX_BOOTSTRAP_TOKEN_CODEX_MISSING}\\n'; ` +
    `if [ "$__rc_codex_path_ok" -eq 1 ] && [ "$__rc_codex_bin_ok" -eq 1 ]; then printf '${CODEX_BOOTSTRAP_TOKEN_READY}\\n'; ${runCommand}; __rc_ai_exit_code=$?; ${exitPrintfCommand}; exit "$__rc_ai_exit_code"; fi`;

  return {
    projectPath: normalizedPath,
    command: `sh -lc "${escapeForDoubleQuotedShellArg(bootstrapScript)}"`
  };
}

/**
 * 生成小程序端 Codex 恢复命令：
 * 1. 仅用于“旧 SSH 未续上，但本地记得上一轮前台是 Codex”的场景；
 * 2. 走 `codex resume --last --sandbox ...`，显式保持上次会话权限；
 * 3. 无论恢复成功还是快速失败，都会打印退出标记，便于页面解除前台锁。
 */
function buildCodexResumeCommand(projectPath, sandbox) {
  const normalizedPath = String(projectPath || "~").trim() || "~";
  const exitPrintfCommand = buildAiRuntimeExitPrintfCommand("codex");
  const script =
    `${buildCdCommand(normalizedPath)} && codex resume --last --sandbox ${normalizeCodexSandboxMode(sandbox)}; ` +
    `__rc_ai_exit_code=$?; ${exitPrintfCommand}; exit "$__rc_ai_exit_code"`;

  return {
    projectPath: normalizedPath,
    command: `sh -lc "${escapeForDoubleQuotedShellArg(script)}"`
  };
}

/**
 * Copilot 没有 Codex 那套独立的 bootstrap token，但仍需要：
 * 1. 先切到项目目录；
 * 2. 退出时打印同源 OSC 标记，方便前端解除互斥保护。
 */
function buildCopilotLaunchCommand(projectPath, mode) {
  const normalizedPath = String(projectPath || "~").trim() || "~";
  const runCommand = buildCopilotCommand(mode);
  const script = `${buildCdCommand(normalizedPath)} && ${runCommand}; __rc_ai_exit_code=$?; ${buildAiRuntimeExitPrintfCommand(
    "copilot"
  )}; exit "$__rc_ai_exit_code"`;
  return {
    projectPath: normalizedPath,
    command: `sh -lc "${escapeForDoubleQuotedShellArg(script)}"`
  };
}

module.exports = {
  CODEX_BOOTSTRAP_TOKEN_DIR_MISSING,
  CODEX_BOOTSTRAP_TOKEN_CODEX_MISSING,
  CODEX_BOOTSTRAP_TOKEN_READY,
  AI_RUNTIME_EXIT_OSC_IDENT,
  DEFAULT_AI_PROVIDER,
  DEFAULT_CODEX_SANDBOX_MODE,
  DEFAULT_COPILOT_PERMISSION_MODE,
  shellQuote,
  normalizeAiProvider,
  normalizeCodexSandboxMode,
  normalizeCopilotPermissionMode,
  buildCdCommand,
  buildAiRuntimeExitMarker,
  consumeAiRuntimeExitMarkers,
  isAiSessionReady,
  buildCopilotCommand,
  buildCopilotLaunchCommand,
  buildCodexResumeCommand,
  escapeForDoubleQuotedShellArg,
  buildCodexBootstrapCommand
};
