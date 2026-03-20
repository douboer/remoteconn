import { defineStore } from "pinia";
import { computed, ref } from "vue";
import type { SessionState, ServerProfile } from "@/types/app";
import { allStates, buildCdCommand, buildCodexPlan } from "@remoteconn/shared";
import type { StdinMeta } from "@remoteconn/shared";
import { useSettingsStore } from "./settingsStore";
import { useServerStore } from "./serverStore";
import { useLogStore } from "./logStore";
import { useAppStore } from "./appStore";
import { createTransport } from "@/services/transport/factory";
import type { TerminalTransport } from "@/services/transport/terminalTransport";
import { emitSessionEvent } from "@/services/sessionEventBus";
import { formatActionError, toFriendlyDisconnectReason, toFriendlyError } from "@/utils/feedback";

interface StoredSessionSnapshotV1 {
  version: 1;
  savedAt: number;
  lines: string[];
  currentServerId: string;
  reconnectServerId: string;
  activeAiProvider?: string;
  codexSandboxMode?: string;
}

interface TerminalBufferBucket {
  lines: string[];
  chunkBytes: number[];
  bufferedBytes: number;
  updatedAt: number;
}

interface CodexBootstrapGuard {
  active: boolean;
  connectionKey: string;
  projectPath: string;
  buffer: string;
  notifiedDirMissing: boolean;
  notifiedCodexMissing: boolean;
  releaseTimer: number | null;
  timeoutTimer: number | null;
  settleResult: (result: boolean) => void;
  settleError: (error: Error) => void;
}

interface StoredSessionSnapshotV2 {
  version: 2;
  savedAt: number;
  activeConnectionKey: string;
  lines: string[];
  currentServerId: string;
  reconnectServerId: string;
  activeAiProvider?: string;
  codexSandboxMode?: string;
}

type StoredSessionSnapshot = StoredSessionSnapshotV1 | StoredSessionSnapshotV2;
type CodexSandboxMode = "" | "read-only" | "workspace-write" | "danger-full-access";
type ActiveAiProvider = "" | "codex" | "copilot";
type CopilotCommand = "copilot" | "copilot --experimental" | "copilot --allow-all";

/**
 * 会话生命周期管理：连接、命令执行、重连、断开、Codex 编排。
 */
export const useSessionStore = defineStore("session", () => {
  const SESSION_SNAPSHOT_STORAGE_KEY = "remoteconn_session_snapshot_v1";
  const SESSION_SNAPSHOT_VERSION = 2;
  const SESSION_SNAPSHOT_PERSIST_DELAY_MS = 120;
  const LATENCY_SAMPLE_WINDOW = 6;
  const MAX_BUFFER_BUCKETS = 10;
  const DEFAULT_CONNECTION_KEY = "session::default";
  const RESUME_HIGHLIGHT_WINDOW_MS = 20_000;

  const settingsStore = useSettingsStore();
  const state = ref<SessionState>("idle");
  const activeConnectionKey = ref<string>(DEFAULT_CONNECTION_KEY);
  const resumableServerId = ref<string>("");
  const resumableExpiresAt = ref<number>(0);
  const buffersByKey = ref<Record<string, TerminalBufferBucket>>({});
  const lines = computed(() => getOrCreateBucket(activeConnectionKey.value).lines);
  const outputRevision = ref(0);
  const latencyMs = ref<number>(0);
  const reconnectAttempts = ref(0);
  const currentSessionId = ref<string>("");
  const currentServerId = ref<string>("");

  let transport: TerminalTransport | null = null;
  let offTransport: (() => void) | null = null;
  let reconnectTimer: number | null = null;
  let pendingLfAfterCr = false;
  let shellCompatBootstrapped = false;
  let ensureShellCompatibility: (() => Promise<void>) | null = null;
  const utf8Encoder = new TextEncoder();
  const MIN_TERMINAL_BUFFER_MAX_ENTRIES = 200;
  const MIN_TERMINAL_BUFFER_MAX_BYTES = 64 * 1024;
  const CODEX_BOOTSTRAP_TOKEN_DIR_MISSING = "__RC_CODEX_DIR_MISSING__";
  const CODEX_BOOTSTRAP_TOKEN_CODEX_MISSING = "__RC_CODEX_BIN_MISSING__";
  const CODEX_BOOTSTRAP_TOKEN_READY = "__RC_CODEX_READY__";
  const CODEX_BOOTSTRAP_WAIT_TIMEOUT_MS = 6000;
  const CODEX_BOOTSTRAP_RELEASE_DELAY_MS = 260;
  const CODEX_BOOTSTRAP_BUFFER_MAX_CHARS = 8192;
  const AI_RUNTIME_EXIT_OSC_IDENT = 633;
  const CODEX_RESUME_DEFAULT_SANDBOX = "workspace-write";
  const AI_RUNTIME_EXIT_MARKERS: Record<Exclude<ActiveAiProvider, "">, string> = {
    codex: `\u001b]${AI_RUNTIME_EXIT_OSC_IDENT};RemoteConn;ai-exit=codex\u0007`,
    copilot: `\u001b]${AI_RUNTIME_EXIT_OSC_IDENT};RemoteConn;ai-exit=copilot\u0007`
  };
  let snapshotPersistTimer: number | null = null;
  let resumableExpireTimer: number | null = null;
  let sessionBootstrapped = false;
  let autoReconnectInFlight = false;
  /**
   * 自动重连抑制标记：
   * 1. 用户手动断开；
   * 2. 切换服务器导致的本地断开；
   * 3. 指纹拒绝等本地明确终止场景。
   * 上述情况都不应再被后续 transport disconnect 事件反向触发重连。
   */
  let autoReconnectSuppressed = false;
  let onPageLifecyclePersist: (() => void) | null = null;
  let onVisibilityPersist: (() => void) | null = null;
  let bootstrapPromise: Promise<void> | null = null;
  const latencySamples: number[] = [];
  let codexBootstrapGuard: CodexBootstrapGuard | null = null;
  let lastSentCols = 0;
  let lastSentRows = 0;
  /** 最近一次连接是否为续接（session resume），用于跳过不必要的 resize。 */
  let lastConnectWasResume = false;
  const activeAiProvider = ref<ActiveAiProvider>("");
  const activeCodexSandboxMode = ref<CodexSandboxMode>("");
  let aiRuntimeExitCarry = "";
  let pendingCodexResumeAfterReconnect = false;
  const AUTO_RECONNECT_IGNORED_REASONS = new Set(["manual", "switch", "host_key_rejected", "ws_peer_normal_close"]);

  /**
   * 转义正则元字符，避免 token 文本参与正则语义。
   */
  function escapeRegExpLiteral(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  /**
   * Web 端当前允许识别 Codex / Copilot 两档 AI 前台态：
   * - Codex 需要参与断线恢复与 sandbox 保留；
   * - Copilot 主要用于 UI 高亮与退出解锁；
   * - 其它值统一视为“无 AI 前台态”，避免把历史脏值误恢复。
   */
  function normalizeActiveAiProvider(value: unknown): ActiveAiProvider {
    const normalized = String(value || "").trim();
    if (normalized === "codex" || normalized === "copilot") {
      return normalized;
    }
    return "";
  }

  /**
   * Web 端仅保留 Codex 支持的三档 sandbox：
   * - 空值表示当前没有 Codex 前台态；
   * - 脏值统一回退到 `workspace-write`，避免恢复时权限漂移到未知状态。
   */
  function normalizeCodexSandboxMode(value: unknown): CodexSandboxMode {
    const normalized = String(value || "").trim();
    if (!normalized) {
      return "";
    }
    if (
      normalized === "read-only" ||
      normalized === "workspace-write" ||
      normalized === "danger-full-access"
    ) {
      return normalized;
    }
    return CODEX_RESUME_DEFAULT_SANDBOX;
  }

  /**
   * 同步当前会话内的 AI 前台态。
   * 清空时同时丢弃退出标记残片与自动恢复意图，避免旧状态污染新连接。
   */
  function syncActiveAiProvider(provider: unknown): ActiveAiProvider {
    const normalized = normalizeActiveAiProvider(provider);
    activeAiProvider.value = normalized;
    if (!normalized) {
      activeCodexSandboxMode.value = "";
      aiRuntimeExitCarry = "";
      pendingCodexResumeAfterReconnect = false;
    }
    if (["connecting", "auth_pending", "connected", "reconnecting"].includes(state.value)) {
      persistSnapshotLater();
    }
    return normalized;
  }

  /**
   * 仅匹配“独立一行”的 bootstrap token。
   * 说明：预检命令回显里会包含 token 字符串（如 printf '__RC_CODEX_*'），
   * 若用 includes 全文匹配会误判为失败。这里改为“按行精确匹配”。
   */
  function hasCodexBootstrapTokenLine(source: string, token: string): boolean {
    const pattern = new RegExp(`(^|\\r?\\n)${escapeRegExpLiteral(token)}(?=\\r?\\n|$)`);
    return pattern.test(source);
  }

  /**
   * 删除独立 token 行，避免其残留到后续缓冲。
   */
  function stripCodexBootstrapTokenLine(source: string, token: string): string {
    const pattern = new RegExp(`(^|\\r?\\n)${escapeRegExpLiteral(token)}(?=\\r?\\n|$)`, "g");
    return source.replace(pattern, "$1");
  }

  /**
   * 提取“首个 token 行”之后的内容：
   * - 用于 READY 判定，避免命令回显中的 token 字面量触发“提前成功”；
   * - 仅当 token 作为独立一行出现时才视为真实信号。
   */
  function extractAfterFirstCodexBootstrapTokenLine(
    source: string,
    token: string
  ): { found: true; after: string } | { found: false } {
    const pattern = new RegExp(`(^|\\r?\\n)${escapeRegExpLiteral(token)}(\\r?\\n|$)`);
    const match = pattern.exec(source);
    if (!match) {
      return { found: false };
    }
    const prefix = match[1] ?? "";
    const suffix = match[2] ?? "";
    const tokenStart = match.index + prefix.length;
    const tokenEnd = tokenStart + token.length + suffix.length;
    return { found: true, after: source.slice(tokenEnd) };
  }

  /**
   * 仅在“当前活跃连接”仍保持 connected 时提示 bootstrap 失败原因。
   * 避免旧连接残留输出或状态切换期间触发误报 toast。
   */
  function shouldNotifyCodexBootstrapIssue(guard: CodexBootstrapGuard): boolean {
    return state.value === "connected" && guard.connectionKey === activeConnectionKey.value;
  }

  /**
   * 将脚本文本安全嵌入到 `sh -lc "..."` 的双引号参数中：
   * - 统一转义双引号、反斜杠、变量符、反引号与 csh 历史展开符；
   * - 目标是让“当前默认 shell（可能是 csh/tcsh）”只负责转发，不参与脚本语义。
   */
  function escapeForDoubleQuotedShellArg(script: string): string {
    return script
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\$/g, "\\$")
      .replace(/`/g, "\\`")
      .replace(/!/g, "\\!");
  }

  /**
   * AI 退出后打印一次未知 OSC：
   * - Web 端据此解除“当前会话仍有 AI 前台”的判断；
   * - Codex / Copilot 共享同一协议，只是 provider 名称不同；
   * - 标记本身不会污染终端可见内容。
   */
  function buildAiExitPrintfCommand(provider: Exclude<ActiveAiProvider, "">): string {
    return `printf '\\033]${AI_RUNTIME_EXIT_OSC_IDENT};RemoteConn;ai-exit=${provider}\\a'`;
  }

  /**
   * 从 stdout/stderr 中剥离 AI 退出标记。
   * 若标记跨 chunk 到达，则只缓存尾巴，不阻塞普通文本渲染。
   */
  function consumeAiRuntimeOutput(data: string): string {
    let working = `${aiRuntimeExitCarry}${String(data || "")}`;
    if (!working) {
      return working;
    }

    const exitedProviders: Exclude<ActiveAiProvider, "">[] = [];
    let changed = true;
    while (changed) {
      changed = false;
      for (const provider of Object.keys(AI_RUNTIME_EXIT_MARKERS) as Exclude<ActiveAiProvider, "">[]) {
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

    aiRuntimeExitCarry = "";
    const lastEscIndex = working.lastIndexOf("\u001b");
    if (lastEscIndex >= 0) {
      const suffix = working.slice(lastEscIndex);
      const mayBeMarkerTail = (Object.values(AI_RUNTIME_EXIT_MARKERS) as string[]).some((marker) =>
        marker.startsWith(suffix)
      );
      if (mayBeMarkerTail) {
        aiRuntimeExitCarry = suffix;
        working = working.slice(0, lastEscIndex);
      }
    }

    if (exitedProviders.some((provider) => !activeAiProvider.value || activeAiProvider.value === provider)) {
      syncActiveAiProvider("");
    }
    return working;
  }

  /**
   * 用于修复 zsh 中文输入回显乱码的会话初始化命令。
   * 目标：
   * 1) 强制 UTF-8 locale（LANG/LC_CTYPE/LC_ALL）；
   * 2) 开启 `stty iutf8`，让行编辑按 UTF-8 处理退格/宽字符；
   * 3) 开启 zsh `MULTIBYTE` + `PRINT_EIGHT_BIT`；
   * 4) 保留此前已验证的 `%` 行尾标记抑制。
   */
  const shellCompatInitCommand =
    'if [ -n "$ZSH_VERSION" ]; then export LANG="${LANG:-zh_CN.UTF-8}"; export LC_CTYPE="${LC_CTYPE:-$LANG}"; if [ -z "$LC_ALL" ]; then export LC_ALL="$LANG"; fi; stty iutf8 2>/dev/null; setopt MULTIBYTE PRINT_EIGHT_BIT 2>/dev/null; unsetopt PROMPT_SP 2>/dev/null; PROMPT_EOL_MARK=\'\'; fi\r';

  const connected = computed(() => state.value === "connected");

  function createBufferBucket(initialLines: string[] = []): TerminalBufferBucket {
    const chunkBytes = initialLines.map((chunk) => utf8Encoder.encode(chunk).byteLength);
    const bufferedBytes = chunkBytes.reduce((sum, size) => sum + size, 0);
    return {
      lines: [...initialLines],
      chunkBytes,
      bufferedBytes,
      updatedAt: Date.now()
    };
  }

  /**
   * 清理“可续接态”标记：
   * - 用于手动断开、切换连接、续接成功后等场景；
   * - 避免按钮长期停留在强调色造成状态误导。
   */
  function clearResumableState(): void {
    if (resumableExpireTimer !== null && typeof window !== "undefined") {
      window.clearTimeout(resumableExpireTimer);
      resumableExpireTimer = null;
    }
    resumableServerId.value = "";
    resumableExpiresAt.value = 0;
  }

  /**
   * 标记“可续接态”窗口：
   * - 与网关侧驻留窗口保持一致（默认 20s）；
   * - 仅在 WS 断开但可能仍可续接 SSH 的场景使用。
   */
  function markResumableState(serverId: string): void {
    if (!serverId) {
      clearResumableState();
      return;
    }
    clearResumableState();
    const expiresAt = Date.now() + RESUME_HIGHLIGHT_WINDOW_MS;
    resumableServerId.value = serverId;
    resumableExpiresAt.value = expiresAt;
    if (typeof window !== "undefined") {
      resumableExpireTimer = window.setTimeout(() => {
        clearResumableState();
      }, RESUME_HIGHLIGHT_WINDOW_MS);
    }
  }

  /**
   * 某服务器当前是否处于“可续接”窗口。
   */
  function isServerResumable(serverId: string): boolean {
    return Boolean(serverId) && resumableServerId.value === serverId && resumableExpiresAt.value > Date.now();
  }

  /**
   * AI 高亮态与连接态保持一致：
   * 1. 当前服务器已连接且存在 AI 前台 provider；
   * 2. 或处于短暂可续接窗口，且快照仍记得 AI 前台态；
   * 3. 这样连接页的 AI 按钮就能和连接按钮一样表达“这台机器上还有活跃 AI 会话”。
   */
  function isServerAiActive(serverId: string): boolean {
    if (!serverId || !activeAiProvider.value) {
      return false;
    }
    if (state.value === "connected" && currentServerId.value === serverId) {
      return true;
    }
    return isServerResumable(serverId);
  }

  function getOrCreateBucket(key: string): TerminalBufferBucket {
    const existing = buffersByKey.value[key];
    if (existing) {
      return existing;
    }
    const next = createBufferBucket();
    buffersByKey.value[key] = next;
    return next;
  }

  function touchBucket(key: string): void {
    const bucket = getOrCreateBucket(key);
    bucket.updatedAt = Date.now();
  }

  function trimBucketCount(): void {
    const keys = Object.keys(buffersByKey.value);
    if (keys.length <= MAX_BUFFER_BUCKETS) {
      return;
    }
    const candidates = keys
      .filter((key) => key !== activeConnectionKey.value)
      .sort((a, b) => (buffersByKey.value[a]?.updatedAt ?? 0) - (buffersByKey.value[b]?.updatedAt ?? 0));

    while (Object.keys(buffersByKey.value).length > MAX_BUFFER_BUCKETS && candidates.length > 0) {
      const removed = candidates.shift();
      if (removed) {
        delete buffersByKey.value[removed];
      }
    }
  }

  function createConnectionKey(serverId: string): string {
    return `${serverId}::${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function findLatestConnectionKeyForServer(serverId: string): string | null {
    const prefix = `${serverId}::`;
    const keys = Object.keys(buffersByKey.value)
      .filter((key) => key.startsWith(prefix))
      .sort((a, b) => (buffersByKey.value[b]?.updatedAt ?? 0) - (buffersByKey.value[a]?.updatedAt ?? 0));
    return keys[0] ?? null;
  }

  /**
   * 解析本次连接应使用的缓冲 key：
   * 1) 自动重连：始终复用该服务器最近 key，保持上下文连续；
   * 2) 手动连接同一服务器：复用最近 key，避免“重连后历史丢失”；
   * 3) 手动连接不同服务器：创建新 key，保持跨服务器隔离。
   */
  function resolveConnectionKeyForConnect(
    serverId: string,
    isReconnectAttempt: boolean,
    previousServerId: string
  ): string {
    const latest = findLatestConnectionKeyForServer(serverId);
    const canReuseLatest =
      Boolean(latest) &&
      (isReconnectAttempt || previousServerId === serverId || previousServerId.length === 0);
    if (canReuseLatest && latest) {
      return latest;
    }
    return createConnectionKey(serverId);
  }

  function assertState(next: SessionState): void {
    if (!allStates().includes(next)) {
      throw new Error(`未知状态: ${next}`);
    }
    state.value = next;
  }

  function canUseStorage(): boolean {
    return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
  }

  function shouldReconnectAfterReload(): boolean {
    return (
      ["connecting", "auth_pending", "connected", "reconnecting"].includes(state.value) &&
      Boolean(currentServerId.value)
    );
  }

  function normalizeBufferLimit(value: number, fallback: number, min: number): number {
    if (!Number.isFinite(value)) {
      return fallback;
    }
    return Math.max(min, Math.round(value));
  }

  /**
   * 从全局设置读取终端缓冲阈值：
   * - 字节上限用于稳定控制内存占用；
   * - 条目上限作为碎片化输出兜底；
   * - 均做最小值收敛，避免异常配置导致“缓冲失控”。
   */
  function resolveTerminalBufferLimits(): { maxEntries: number; maxBytes: number } {
    const maxEntries = normalizeBufferLimit(
      settingsStore.settings.terminalBufferMaxEntries,
      5000,
      MIN_TERMINAL_BUFFER_MAX_ENTRIES
    );
    const maxBytes = normalizeBufferLimit(
      settingsStore.settings.terminalBufferMaxBytes,
      4 * 1024 * 1024,
      MIN_TERMINAL_BUFFER_MAX_BYTES
    );
    return { maxEntries, maxBytes };
  }

  function trimByEntries(bucket: TerminalBufferBucket, maxEntries: number): void {
    if (bucket.lines.length <= maxEntries) {
      return;
    }
    const removeCount = bucket.lines.length - maxEntries;
    const removedBytes = bucket.chunkBytes.splice(0, removeCount).reduce((sum, size) => sum + size, 0);
    bucket.lines.splice(0, removeCount);
    bucket.bufferedBytes = Math.max(0, bucket.bufferedBytes - removedBytes);
  }

  function trimByBytes(bucket: TerminalBufferBucket, maxBytes: number): void {
    if (bucket.bufferedBytes <= maxBytes || bucket.lines.length <= 1) {
      return;
    }
    let removeCount = 0;
    let removedBytes = 0;
    // 至少保留最新一条，避免在“单条超大输出”场景下出现空白闪烁。
    while (bucket.bufferedBytes - removedBytes > maxBytes && removeCount < bucket.chunkBytes.length - 1) {
      removedBytes += bucket.chunkBytes[removeCount] ?? 0;
      removeCount += 1;
    }
    if (removeCount <= 0) {
      return;
    }
    bucket.chunkBytes.splice(0, removeCount);
    bucket.lines.splice(0, removeCount);
    bucket.bufferedBytes = Math.max(0, bucket.bufferedBytes - removedBytes);
  }

  /**
   * 终端原始输出缓冲：保持字节流语义，避免逐字符被当成“行”导致每键一换行。
   * 裁剪策略：
   * 1) 优先按条目上限兜底；
   * 2) 再按 UTF-8 字节上限收敛内存；
   * 3) 两个阈值均来自全局配置，可在设置页调整。
   */
  function appendTerminal(text: string): void {
    const bucket = getOrCreateBucket(activeConnectionKey.value);
    const { maxEntries, maxBytes } = resolveTerminalBufferLimits();
    const chunkBytes = utf8Encoder.encode(text).byteLength;
    bucket.lines.push(text);
    bucket.chunkBytes.push(chunkBytes);
    bucket.bufferedBytes += chunkBytes;
    bucket.updatedAt = Date.now();
    trimByEntries(bucket, maxEntries);
    trimByBytes(bucket, maxBytes);
    trimBucketCount();
    outputRevision.value += 1;
    persistSnapshotLater();
  }

  function buildSnapshot(
    linesForPersist = getOrCreateBucket(activeConnectionKey.value).lines
  ): StoredSessionSnapshotV2 {
    return {
      version: SESSION_SNAPSHOT_VERSION,
      savedAt: Date.now(),
      activeConnectionKey: activeConnectionKey.value,
      lines: [...linesForPersist],
      currentServerId: currentServerId.value,
      reconnectServerId: shouldReconnectAfterReload() ? currentServerId.value : "",
      activeAiProvider: activeAiProvider.value,
      codexSandboxMode: activeAiProvider.value === "codex" ? activeCodexSandboxMode.value : ""
    };
  }

  /**
   * 写入会话快照：
   * - 优先完整保存；
   * - 若命中浏览器配额，自动退化到“后半段输出”重试，保证刷新后至少可恢复最近上下文。
   */
  function persistSnapshotNow(): void {
    if (!canUseStorage()) {
      return;
    }
    if (snapshotPersistTimer) {
      window.clearTimeout(snapshotPersistTimer);
      snapshotPersistTimer = null;
    }

    let candidateLines = getOrCreateBucket(activeConnectionKey.value).lines;
    while (true) {
      const snapshot = buildSnapshot(candidateLines);
      try {
        window.sessionStorage.setItem(SESSION_SNAPSHOT_STORAGE_KEY, JSON.stringify(snapshot));
        return;
      } catch {
        if (candidateLines.length <= 200) {
          return;
        }
        candidateLines = candidateLines.slice(Math.floor(candidateLines.length / 2));
      }
    }
  }

  function persistSnapshotLater(): void {
    if (!canUseStorage()) {
      return;
    }
    if (snapshotPersistTimer) {
      window.clearTimeout(snapshotPersistTimer);
    }
    snapshotPersistTimer = window.setTimeout(() => {
      persistSnapshotNow();
    }, SESSION_SNAPSHOT_PERSIST_DELAY_MS);
  }

  /**
   * 恢复刷新前的终端上下文：
   * - 输出缓冲（lines）；
   * - 当前服务器 ID；
   * - 自动重连意图（reconnectServerId）。
   */
  function restoreSnapshot(): string {
    if (!canUseStorage()) {
      return "";
    }
    try {
      const raw = window.sessionStorage.getItem(SESSION_SNAPSHOT_STORAGE_KEY);
      if (!raw) {
        return "";
      }
      const parsed = JSON.parse(raw) as Partial<StoredSessionSnapshot>;
      if (parsed.version !== 1 && parsed.version !== 2) {
        return "";
      }
      const restoredLines = Array.isArray(parsed.lines)
        ? parsed.lines.filter((item): item is string => typeof item === "string")
        : [];
      const restoredKey =
        parsed.version === 2 && typeof parsed.activeConnectionKey === "string" && parsed.activeConnectionKey
          ? parsed.activeConnectionKey
          : DEFAULT_CONNECTION_KEY;

      activeConnectionKey.value = restoredKey;
      buffersByKey.value[restoredKey] = createBufferBucket(restoredLines);
      trimBucketCount();
      if (restoredLines.length > 0) {
        outputRevision.value += 1;
      }
      if (typeof parsed.currentServerId === "string") {
        currentServerId.value = parsed.currentServerId;
      }
      syncActiveAiProvider(parsed.activeAiProvider);
      activeCodexSandboxMode.value =
        activeAiProvider.value === "codex" ? normalizeCodexSandboxMode(parsed.codexSandboxMode) : "";
      pendingCodexResumeAfterReconnect =
        typeof parsed.reconnectServerId === "string" && parsed.reconnectServerId
          ? activeAiProvider.value === "codex"
          : false;
      if (typeof parsed.reconnectServerId === "string") {
        return parsed.reconnectServerId;
      }
    } catch {
      // 快照损坏时静默跳过，避免阻塞主流程。
    }
    return "";
  }

  /**
   * 刷新恢复重连：
   * - `fromReload=true` 时表示“页面刷新后的会话恢复”，不受 autoReconnect 开关影响；
   * - 断线后的常规自动重连仍由 autoReconnect 开关控制（见 disconnect 事件分支）。
   */
  async function tryAutoReconnect(reconnectServerId: string, fromReload = false): Promise<void> {
    if (!reconnectServerId || autoReconnectInFlight) {
      return;
    }
    if (!fromReload && !settingsStore.settings.autoReconnect) {
      return;
    }
    if (!["idle", "disconnected", "error"].includes(state.value)) {
      return;
    }
    const serverStore = useServerStore();
    const appStore = useAppStore();
    const target = serverStore.servers.find((item) => item.id === reconnectServerId);
    if (!target) {
      return;
    }

    autoReconnectInFlight = true;
    try {
      appStore.notify(
        "info",
        `检测到页面刷新，正在自动重连：${target.username}@${target.host}:${target.port}`
      );
      await connect(
        {
          ...target,
          projectPresets: [...target.projectPresets],
          tags: [...target.tags]
        },
        true
      );
    } catch (error) {
      appStore.notify("warn", formatActionError("刷新后自动重连失败", error));
    } finally {
      autoReconnectInFlight = false;
    }
  }

  /**
   * 会话层启动：
   * 1) 恢复 sessionStorage 中的输出上下文；
   * 2) 注册页面生命周期持久化（beforeunload/pagehide/hidden）；
   * 3) 根据快照自动发起重连。
   */
  async function ensureBootstrapped(): Promise<void> {
    if (sessionBootstrapped) {
      return;
    }
    if (bootstrapPromise) {
      await bootstrapPromise;
      return;
    }

    bootstrapPromise = (async () => {
      sessionBootstrapped = true;
      const reconnectServerId = restoreSnapshot();
      if (reconnectServerId) {
        markResumableState(reconnectServerId);
      } else {
        clearResumableState();
      }
      persistSnapshotLater();
      if (typeof window !== "undefined") {
        onPageLifecyclePersist = () => {
          persistSnapshotNow();
        };
        onVisibilityPersist = () => {
          if (document.visibilityState === "hidden") {
            persistSnapshotNow();
          }
        };
        window.addEventListener("beforeunload", onPageLifecyclePersist, { capture: true });
        window.addEventListener("pagehide", onPageLifecyclePersist, { capture: true });
        document.addEventListener("visibilitychange", onVisibilityPersist, { capture: true });
      }
      await tryAutoReconnect(reconnectServerId, true);
    })();

    try {
      await bootstrapPromise;
    } finally {
      bootstrapPromise = null;
    }
  }

  async function bootstrap(): Promise<void> {
    await ensureBootstrapped();
  }

  /**
   * 统一用户输入中的换行语义：
   * - 终端交互协议更稳妥的是 CR（`\r`）作为回车；
   * - 移动端/输入法可能产生 `\n` 或 `\r\n`，这里统一折叠为 `\r`，
   *   避免在部分 shell + pty 组合下出现“按一次回车多一个空行”。
   */
  function normalizeEnter(input: string): string {
    if (!input) return input;

    let output = "";
    let index = 0;

    if (pendingLfAfterCr && input.startsWith("\n")) {
      index = 1;
    }
    pendingLfAfterCr = false;

    for (; index < input.length; index += 1) {
      const ch = input[index];
      if (ch === "\r") {
        output += "\r";
        pendingLfAfterCr = true;
        continue;
      }

      if (ch === "\n") {
        if (pendingLfAfterCr) {
          pendingLfAfterCr = false;
          continue;
        }
        output += "\r";
        continue;
      }

      pendingLfAfterCr = false;
      output += ch;
    }

    return output;
  }

  function clearCodexBootstrapGuard(target?: CodexBootstrapGuard): void {
    const guard = target ?? codexBootstrapGuard;
    if (!guard) return;
    if (guard.releaseTimer !== null) {
      window.clearTimeout(guard.releaseTimer);
      guard.releaseTimer = null;
    }
    if (guard.timeoutTimer !== null) {
      window.clearTimeout(guard.timeoutTimer);
      guard.timeoutTimer = null;
    }
    if (codexBootstrapGuard === guard) {
      codexBootstrapGuard = null;
    }
  }

  function settleCodexBootstrapGuardAsResult(result: boolean, target?: CodexBootstrapGuard): void {
    const guard = target ?? codexBootstrapGuard;
    if (!guard) return;
    clearCodexBootstrapGuard(guard);
    guard.settleResult(result);
  }

  function settleCodexBootstrapGuardAsError(error: Error, target?: CodexBootstrapGuard): void {
    const guard = target ?? codexBootstrapGuard;
    if (!guard) return;
    clearCodexBootstrapGuard(guard);
    guard.settleError(error);
  }

  function scheduleCodexBootstrapGuardRelease(target?: CodexBootstrapGuard): void {
    const guard = target ?? codexBootstrapGuard;
    if (!guard || guard.releaseTimer !== null) return;
    guard.releaseTimer = window.setTimeout(() => {
      clearCodexBootstrapGuard(guard);
    }, CODEX_BOOTSTRAP_RELEASE_DELAY_MS);
  }

  /**
   * Codex 启动阶段输出拦截：
   * 1) 在预检阶段吞掉命令回显与探测细节，避免终端出现“cd/command -v/codex not found”等噪音；
   * 2) 仅通过“独立 token 行”触发业务提示（目录不存在、服务器未装 codex）；
   * 3) 收到 READY token 后解除拦截，并透传后续真实 Codex 输出。
   */
  function consumeCodexBootstrapOutput(data: string): string {
    const guard = codexBootstrapGuard;
    if (!guard?.active) {
      return data;
    }

    guard.buffer = `${guard.buffer}${data}`;
    if (guard.buffer.length > CODEX_BOOTSTRAP_BUFFER_MAX_CHARS) {
      guard.buffer = guard.buffer.slice(-CODEX_BOOTSTRAP_BUFFER_MAX_CHARS);
    }

    let working = guard.buffer;
    const hasDirMissing = hasCodexBootstrapTokenLine(working, CODEX_BOOTSTRAP_TOKEN_DIR_MISSING);
    const hasCodexMissing = hasCodexBootstrapTokenLine(working, CODEX_BOOTSTRAP_TOKEN_CODEX_MISSING);
    const shouldNotify = shouldNotifyCodexBootstrapIssue(guard);

    if (hasDirMissing && !guard.notifiedDirMissing) {
      guard.notifiedDirMissing = true;
      if (shouldNotify) {
        const appStore = useAppStore();
        appStore.notify("warn", `codex工作目录${guard.projectPath}不存在`);
      }
    }

    if (hasCodexMissing && !guard.notifiedCodexMissing) {
      guard.notifiedCodexMissing = true;
      if (shouldNotify) {
        const appStore = useAppStore();
        appStore.notify("warn", "服务器未装codex");
      }
    }

    if (hasDirMissing) {
      working = stripCodexBootstrapTokenLine(working, CODEX_BOOTSTRAP_TOKEN_DIR_MISSING);
    }
    if (hasCodexMissing) {
      working = stripCodexBootstrapTokenLine(working, CODEX_BOOTSTRAP_TOKEN_CODEX_MISSING);
    }

    const readyLine = extractAfterFirstCodexBootstrapTokenLine(working, CODEX_BOOTSTRAP_TOKEN_READY);
    if (readyLine.found) {
      const afterReady = readyLine.after.replace(/^\r?\n/, "");
      settleCodexBootstrapGuardAsResult(true, guard);
      return afterReady;
    }

    // 任一失败 token 出现后即判定本次启动失败，并短暂维持拦截吞掉尾部提示符。
    if (guard.notifiedDirMissing || guard.notifiedCodexMissing) {
      guard.buffer = "";
      guard.settleResult(false);
      scheduleCodexBootstrapGuardRelease(guard);
      return "";
    }

    guard.buffer = working;
    return "";
  }

  function startCodexBootstrapGuard(projectPath: string): Promise<boolean> {
    if (codexBootstrapGuard?.active) {
      throw new Error("Codex 正在启动中");
    }

    return new Promise<boolean>((resolve, reject) => {
      let settled = false;
      let guardRef: CodexBootstrapGuard | null = null;

      const settleResult = (result: boolean): void => {
        if (settled) return;
        settled = true;
        resolve(result);
      };
      const settleError = (error: Error): void => {
        if (settled) return;
        settled = true;
        reject(error);
      };

      const timeoutTimer = window.setTimeout(() => {
        settleCodexBootstrapGuardAsError(new Error("等待 Codex 启动结果超时"), guardRef ?? undefined);
      }, CODEX_BOOTSTRAP_WAIT_TIMEOUT_MS);

      const guard: CodexBootstrapGuard = {
        active: true,
        connectionKey: activeConnectionKey.value,
        projectPath,
        buffer: "",
        notifiedDirMissing: false,
        notifiedCodexMissing: false,
        releaseTimer: null,
        timeoutTimer,
        settleResult,
        settleError
      };
      guardRef = guard;
      codexBootstrapGuard = guard;
    });
  }

  /**
   * 构造“恢复最近一次 Codex 会话”的命令：
   * 1. 先切到项目目录，确保 CLI 的 cwd 过滤命中当前仓库；
   * 2. 失败或正常退出时都打印退出标记，避免前台锁残留。
   */
  function buildCodexResumeCommand(projectPath: string): string {
    const plan = buildCodexPlan({
      projectPath,
      sandbox: (activeCodexSandboxMode.value || CODEX_RESUME_DEFAULT_SANDBOX) as Exclude<
        CodexSandboxMode,
        ""
      >,
      resumeLast: true
    });
    const cdStep = plan.find((step) => step.step === "cd");
    const runStep = plan.find((step) => step.step === "run");
    if (!cdStep || !runStep) {
      throw new Error("Codex 恢复计划不完整");
    }

    const script =
      `${cdStep.command} && ${runStep.command}; ` +
      `__rc_ai_exit_code=$?; ${buildAiExitPrintfCommand("codex")}; exit "$__rc_ai_exit_code"`;
    return `sh -lc "${escapeForDoubleQuotedShellArg(script)}"`;
  }

  /**
   * 新 shell 建立后，如断线前 Codex 仍在前台，则尝试恢复最近一次 CLI 会话。
   * 只在“未命中网关旧 SSH 续接”时触发，避免对已恢复的 TUI 再注入命令。
   */
  async function resumeCodexAfterReconnect(projectPath: string): Promise<void> {
    if (state.value !== "connected" || activeAiProvider.value !== "codex") {
      pendingCodexResumeAfterReconnect = false;
      return;
    }
    pendingCodexResumeAfterReconnect = false;
    const appStore = useAppStore();
    appStore.notify("info", "检测到上次 Codex 会话，正在尝试恢复");
    try {
      await sendCommand(buildCodexResumeCommand(projectPath), "codex", "run");
    } catch (error) {
      syncActiveAiProvider("");
      appStore.notify("warn", formatActionError("Codex 自动恢复失败", error));
    }
  }

  async function connect(server: ServerProfile, isReconnectAttempt = false): Promise<void> {
    const serverStore = useServerStore();
    const logStore = useLogStore();
    const appStore = useAppStore();
    const previousServerId = currentServerId.value;
    const previousAiProvider = activeAiProvider.value;
    const previousCodexSandboxMode = activeCodexSandboxMode.value;
    const previousPendingCodexResume = pendingCodexResumeAfterReconnect;
    const shouldCarryAiState = previousServerId === server.id && !!previousAiProvider;

    clearResumableState();
    await disconnect("switch", false);
    if (shouldCarryAiState) {
      activeAiProvider.value = previousAiProvider;
      activeCodexSandboxMode.value = previousCodexSandboxMode;
      pendingCodexResumeAfterReconnect = previousPendingCodexResume || previousAiProvider === "codex";
    }
    assertState("connecting");

    if (!isReconnectAttempt) {
      reconnectAttempts.value = 0;
      autoReconnectSuppressed = false;
    }
    activeConnectionKey.value = resolveConnectionKeyForConnect(
      server.id,
      isReconnectAttempt,
      previousServerId
    );
    getOrCreateBucket(activeConnectionKey.value);

    touchBucket(activeConnectionKey.value);
    trimBucketCount();
    latencyMs.value = 0;
    latencySamples.length = 0;
    currentServerId.value = server.id;
    persistSnapshotLater();

    const sessionId = await logStore.startLog(server.id);
    currentSessionId.value = sessionId;

    let credentials: Awaited<ReturnType<typeof serverStore.resolveCredentialBundle>>;
    try {
      credentials = await serverStore.resolveCredentialBundle(
        server.id,
        server.jumpHost?.enabled ? server.jumpHost.authType : null
      );
    } catch (error) {
      const reason = `凭据读取失败，请在服务器设置页重新保存凭据: ${(error as Error).message}`;
      assertState("error");
      await logStore.markStatus(sessionId, "error", reason);
      throw new Error(reason);
    }

    transport = createTransport(server.transportMode, {
      gatewayUrl: settingsStore.gatewayUrl,
      gatewayToken: settingsStore.gatewayToken
    });
    let markedConnected = false;
    /**
     * gateway 模式由网关侧静默初始化 shell 兼容项，不再由前端注入；
     * ios-native 仍保留前端兜底注入。
     */
    shellCompatBootstrapped = server.transportMode === "gateway";

    /**
     * 终端连接建立后，自动执行一次 zsh 兼容初始化：
     * 1) `MULTIBYTE` 确保 zle 以多字节模式处理中文输入；
     * 2) `PRINT_EIGHT_BIT` 避免把高位字节渲染成 `\M-^X`；
     * 3) 继续保留此前验证有效的 `%` 行尾标记抑制设置。
     *
     * 说明：该命令带 shell 条件判断，bash/fish 等非 zsh 环境会直接跳过。
     */
    ensureShellCompatibility = async (): Promise<void> => {
      if (!transport || shellCompatBootstrapped) {
        return;
      }
      shellCompatBootstrapped = true;
      try {
        await transport.send(shellCompatInitCommand);
      } catch {
        // 不阻塞主连接：失败时仅回退为“不注入兼容命令”。
      }
    };

    const markConnectedState = async (): Promise<void> => {
      if (markedConnected) return;
      markedConnected = true;
      clearResumableState();
      reconnectAttempts.value = 0;
      assertState("connected");
      await logStore.markStatus(sessionId, "connected");
      await serverStore.markConnected(server.id);
      appStore.notify("info", "SSH 通道已建立");
      emitSessionEvent("connected", { serverId: server.id, serverName: server.name });
      await ensureShellCompatibility?.();
    };

    offTransport = transport.on(async (event) => {
      if (event.type === "stdout") {
        await markConnectedState();
        const nextData = consumeAiRuntimeOutput(consumeCodexBootstrapOutput(event.data));
        if (nextData) {
          appendTerminal(nextData);
          emitSessionEvent("stdout", { data: nextData, serverId: server.id });
        }
      }

      if (event.type === "stderr") {
        const nextData = consumeAiRuntimeOutput(consumeCodexBootstrapOutput(event.data));
        if (nextData) {
          appendTerminal(nextData);
          emitSessionEvent("stderr", { data: nextData, serverId: server.id });
        }
      }

      if (event.type === "latency") {
        latencySamples.push(event.data);
        if (latencySamples.length > LATENCY_SAMPLE_WINDOW) {
          latencySamples.shift();
        }
        const average = Math.round(
          latencySamples.reduce((sum, sample) => sum + sample, 0) / latencySamples.length
        );
        latencyMs.value = average;
        emitSessionEvent("latency", { latency: average, serverId: server.id });
      }

      if (event.type === "disconnect") {
        settleCodexBootstrapGuardAsResult(false);
        assertState("disconnected");
        latencyMs.value = 0;
        latencySamples.length = 0;
        if (event.reason === "ws_closed" && currentServerId.value) {
          markResumableState(currentServerId.value);
          pendingCodexResumeAfterReconnect = activeAiProvider.value === "codex";
        } else {
          clearResumableState();
          syncActiveAiProvider("");
        }
        appStore.notify("warn", toFriendlyDisconnectReason(event.reason));
        await logStore.markStatus(sessionId, "disconnected", event.reason);
        emitSessionEvent("disconnected", { reason: event.reason, serverId: server.id });

        if (
          settingsStore.settings.autoReconnect &&
          !autoReconnectSuppressed &&
          !AUTO_RECONNECT_IGNORED_REASONS.has(event.reason) &&
          reconnectAttempts.value < settingsStore.settings.reconnectLimit
        ) {
          scheduleReconnect(server);
        } else {
          persistSnapshotLater();
        }
      }

      if (event.type === "connected") {
        if (event.fingerprint) {
          const trusted = await settingsStore.verifyAndPersistHostFingerprint(
            event.fingerprintHostPort || `${server.host}:${server.port}`,
            event.fingerprint
          );
          if (!trusted) {
            await disconnect("host_key_rejected", false);
            const appStore = useAppStore();
            appStore.notify("error", "主机指纹未被信任，连接已断开");
            return;
          }
          return;
        }
        // 无指纹的 connected 事件表示网关侧 shell 已就绪。
        lastConnectWasResume = event.resumed === true;
        await markConnectedState();
        if (lastConnectWasResume) {
          pendingCodexResumeAfterReconnect = false;
        } else if (pendingCodexResumeAfterReconnect && activeAiProvider.value === "codex") {
          void resumeCodexAfterReconnect(server.projectPath);
        }
      }

      if (event.type === "error") {
        settleCodexBootstrapGuardAsResult(false);
        assertState("error");
        latencyMs.value = 0;
        latencySamples.length = 0;
        clearResumableState();
        syncActiveAiProvider("");
        appStore.notify("error", `连接错误：${toFriendlyError(event.message || event.code)}`);
        await logStore.markStatus(sessionId, "error", event.message);
        persistSnapshotLater();
      }
    });

    try {
      assertState("auth_pending");
      await transport.connect({
        host: server.jumpHost?.enabled ? server.jumpHost.host : server.host,
        port: server.jumpHost?.enabled ? server.jumpHost.port : server.port,
        username: server.jumpHost?.enabled ? server.jumpHost.username : server.username,
        clientSessionKey: activeConnectionKey.value,
        credential: server.jumpHost?.enabled && credentials.jump ? credentials.jump : credentials.target,
        ...(server.jumpHost?.enabled && credentials.jump
          ? {
              jumpHost: {
                host: server.host,
                port: server.port,
                username: server.username,
                credential: credentials.target,
                knownHostFingerprint: settingsStore.knownHosts[`${server.host}:${server.port}`]
              }
            }
          : {}),
        knownHostFingerprint: server.jumpHost?.enabled
          ? settingsStore.knownHosts[`${server.jumpHost.host}:${server.jumpHost.port}`]
          : settingsStore.knownHosts[`${server.host}:${server.port}`],
        cols: 140,
        rows: 40
      });
      persistSnapshotLater();
    } catch (error) {
      assertState("error");
      await logStore.markStatus(sessionId, "error", (error as Error).message);
      persistSnapshotLater();
      throw error;
    }
  }

  async function disconnect(reason = "manual", userInitiated = true): Promise<void> {
    if (reconnectTimer) {
      window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    /**
     * 本地明确发起的断开不应进入“SSH 非主动断开自动重连”分支。
     * 下一次用户显式连接时会在 connect() 开头重置该标记。
     */
    autoReconnectSuppressed = true;
    if (transport) {
      await transport.disconnect(reason);
      transport = null;
    }
    pendingLfAfterCr = false;
    shellCompatBootstrapped = false;
    ensureShellCompatibility = null;
    lastSentCols = 0;
    lastSentRows = 0;
    lastConnectWasResume = false;

    offTransport?.();
    offTransport = null;
    settleCodexBootstrapGuardAsResult(false);
    clearResumableState();
    syncActiveAiProvider("");

    if (userInitiated) {
      assertState("disconnected");
      const appStore = useAppStore();
      appStore.notify("info", "已断开连接");
    }
    if (userInitiated && reason === "manual") {
      currentServerId.value = "";
    }
    persistSnapshotLater();
  }

  async function sendCommand(
    command: string,
    source: "manual" | "codex" | "copilot" | "plugin" = "manual",
    markerType: "manual" | "cd" | "check" | "run" = "manual"
  ): Promise<void> {
    if (!transport || state.value !== "connected") {
      throw new Error("会话未连接");
    }

    const startedAt = performance.now();
    await transport.send(`${command}\r`);
    const elapsed = Math.round(performance.now() - startedAt);
    /**
     * 不再在客户端本地追加“$ 命令”行：
     * 1) 远端 shell 本身会回显命令；
     * 2) 本地注入额外文本会打乱“终端显示状态”与“远端 shell 认知状态”的一致性，
     *    在 zsh 下可能表现为每次回车后出现额外 `%` 行尾标记。
     * 命令审计信息仍通过 logStore.addMarker 保留，不影响日志能力。
     */

    const logStore = useLogStore();
    if (currentSessionId.value) {
      await logStore.addMarker(currentSessionId.value, {
        command,
        source,
        markerType,
        code: 0,
        elapsedMs: elapsed
      });
    }
  }

  async function sendInput(input: string, meta?: StdinMeta): Promise<void> {
    if (!transport || state.value !== "connected") {
      throw new Error("会话未连接");
    }
    /**
     * 仅在包含非 ASCII 字符时，再次确保 shell UTF-8 初始化已执行。
     * 这样可以覆盖“初次 connected 时机过早，兼容命令尚未生效”的场景，
     * 尤其是输入法空格选词触发 composition commit 的路径。
     */
    if (/[^\p{ASCII}]/u.test(input)) {
      await ensureShellCompatibility?.();
    }
    await transport.send(normalizeEnter(input), meta);
  }

  async function runCodex(
    projectPath: string,
    sandbox: "read-only" | "workspace-write" | "danger-full-access"
  ): Promise<boolean> {
    const plan = buildCodexPlan({
      projectPath,
      sandbox
    });
    const cdStep = plan.find((step) => step.step === "cd");
    const runStep = plan.find((step) => step.step === "run");
    if (!cdStep || !runStep) {
      throw new Error("Codex 启动计划不完整");
    }

    const normalizedPath = String(projectPath || "~").trim() || "~";
    const bootstrapResultPromise = startCodexBootstrapGuard(normalizedPath);

    const bootstrapScript =
      `__rc_codex_path_ok=1; __rc_codex_bin_ok=1; ${cdStep.command} >/dev/null 2>&1 || __rc_codex_path_ok=0; ` +
      `command -v codex >/dev/null 2>&1 || __rc_codex_bin_ok=0; ` +
      `[ "$__rc_codex_path_ok" -eq 1 ] || printf '${CODEX_BOOTSTRAP_TOKEN_DIR_MISSING}\\n'; ` +
      `[ "$__rc_codex_bin_ok" -eq 1 ] || printf '${CODEX_BOOTSTRAP_TOKEN_CODEX_MISSING}\\n'; ` +
      `if [ "$__rc_codex_path_ok" -eq 1 ] && [ "$__rc_codex_bin_ok" -eq 1 ]; then printf '${CODEX_BOOTSTRAP_TOKEN_READY}\\n'; ${runStep.command}; __rc_ai_exit_code=$?; ${buildAiExitPrintfCommand("codex")}; exit "$__rc_ai_exit_code"; fi`;
    /**
     * 强制在 POSIX sh 下执行 bootstrap：
     * - 远端默认 shell 可能是 csh/tcsh，`>/dev/null 2>&1` 等重定向语法会报
     *   “Ambiguous output redirect.”，导致 token 无法产出；
     * - 统一走 `sh -lc`，让预检与 token 协议稳定可解析。
     */
    const bootstrapCommand = `sh -lc "${escapeForDoubleQuotedShellArg(bootstrapScript)}"`;

    try {
      await sendCommand(bootstrapCommand, "codex", "run");
    } catch (error) {
      settleCodexBootstrapGuardAsError(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }

    const launched = await bootstrapResultPromise;
    if (launched) {
      pendingCodexResumeAfterReconnect = false;
      activeCodexSandboxMode.value = normalizeCodexSandboxMode(sandbox);
      syncActiveAiProvider("codex");
    } else {
      syncActiveAiProvider("");
    }
    return launched;
  }

  /**
   * Copilot 没有 Codex 的 bootstrap token，但仍需：
   * 1. 先切换到服务器配置的项目目录；
   * 2. 退出时打印 AI 退出标记，确保前台锁和按钮高亮能自动回落；
   * 3. 仅接受固定命令枚举，避免命令注入。
   */
  async function runCopilot(projectPath: string, command: CopilotCommand): Promise<boolean> {
    const script =
      `${buildCdCommand(projectPath)} && ${command}; ` +
      `__rc_ai_exit_code=$?; ${buildAiExitPrintfCommand("copilot")}; exit "$__rc_ai_exit_code"`;
    const wrappedCommand = `sh -lc "${escapeForDoubleQuotedShellArg(script)}"`;
    await sendCommand(wrappedCommand, "copilot", "run");
    syncActiveAiProvider("copilot");
    return true;
  }

  function clearTerminal(): void {
    /**
     * Codex 前台态下保留当前屏幕：
     * 1. 用户此时处于 AI 交互上下文，手动清空本地缓冲没有实际价值；
     * 2. UI 会同步把 Clear 按钮置灰，这里再兜底一次，避免漏判后误清。
     */
    if (state.value === "connected" && activeAiProvider.value === "codex") {
      return;
    }
    buffersByKey.value[activeConnectionKey.value] = createBufferBucket();
    outputRevision.value += 1;
    persistSnapshotLater();
  }

  async function resize(cols: number, rows: number): Promise<void> {
    if (!transport || state.value !== "connected") return;
    if (cols === lastSentCols && rows === lastSentRows) return;
    lastSentCols = cols;
    lastSentRows = rows;
    await transport.resize(cols, rows);
  }

  function scheduleReconnect(server: ServerProfile): void {
    reconnectAttempts.value += 1;
    assertState("reconnecting");
    persistSnapshotLater();
    const delay = Math.min(5000, reconnectAttempts.value * 1200);
    reconnectTimer = window.setTimeout(() => {
      connect(server, true).catch((error) => {
        const appStore = useAppStore();
        appStore.notify("error", formatActionError("自动重连失败", error));
      });
    }, delay);
  }

  function cancelReconnect(reason = "route_leave"): void {
    autoReconnectSuppressed = true;
    if (reconnectTimer) {
      window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    if (["reconnecting", "connecting", "auth_pending"].includes(state.value)) {
      assertState("disconnected");
      const appStore = useAppStore();
      appStore.notify("info", `已停止自动重连：${reason}`);
      persistSnapshotLater();
    }
  }

  return {
    ensureBootstrapped,
    bootstrap,
    state,
    activeAiProvider,
    lines,
    outputRevision,
    latencyMs,
    connected,
    currentServerId,
    isServerAiActive,
    isServerResumable,
    get lastConnectWasResume() {
      return lastConnectWasResume;
    },
    connect,
    disconnect,
    sendInput,
    sendCommand,
    runCodex,
    runCopilot,
    clearTerminal,
    resize,
    cancelReconnect
  };
});
