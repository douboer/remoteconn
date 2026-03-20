/* global Page, wx, require, clearTimeout, setTimeout, clearInterval, setInterval, console */

const {
  listServers,
  markServerConnected,
  appendLog,
  addRecord,
  getSettings,
  DEFAULT_TERMINAL_BUFFER_SNAPSHOT_MAX_LINES,
  MIN_TERMINAL_BUFFER_SNAPSHOT_MAX_LINES,
  MAX_TERMINAL_BUFFER_SNAPSHOT_MAX_LINES,
  DEFAULT_VOICE_RECORD_CATEGORY_FALLBACK,
  normalizeVoiceRecordCategories,
  normalizeVoiceRecordDefaultCategory
} = require("../../utils/storage");
const { createGatewayClient } = require("../../utils/gateway");
const { createAsrGatewayClient } = require("../../utils/asrGateway");
const { synthesizeTerminalSpeech } = require("../../utils/ttsGateway");
const { getOpsConfig, isOpsConfigReady } = require("../../utils/opsConfig");
const { validateServerForConnect } = require("../../utils/serverValidation");
const { resolveSocketDomainHint } = require("../../utils/socketDomain");
const { resolveSyncBaseUrl } = require("../../utils/syncAuth");
const { buildThemeStyle, applyNavigationBarTheme } = require("../../utils/themeStyle");
const {
  buildActiveButtonIconMap,
  buildAccentButtonIconMap,
  buildButtonIconMap,
  resolveButtonIcon
} = require("../../utils/themedIcons");
const { buildTerminalToolActiveIconMap, buildTerminalToolIconMap } = require("../../utils/terminalIcons");
const {
  DEFAULT_TTS_SPEAKABLE_MAX_CHARS,
  DEFAULT_TTS_SEGMENT_MAX_CHARS,
  normalizeTtsSpeakableMaxChars,
  normalizeTtsSegmentMaxChars
} = require("../../utils/ttsSettings");
const { getWindowMetrics } = require("../../utils/systemInfoCompat");
const { emitSessionEvent, setActiveSessionSender } = require("../../utils/sessionBus");
const { buildSvgButtonPressData, createSvgButtonPressMethods } = require("../../utils/svgButtonFeedback");
const {
  buildPageCopy,
  formatTemplate,
  getStatusLabel,
  localizeServerValidationMessage,
  normalizeUiLanguage
} = require("../../utils/i18n");
const {
  CODEX_BOOTSTRAP_TOKEN_DIR_MISSING,
  CODEX_BOOTSTRAP_TOKEN_CODEX_MISSING,
  CODEX_BOOTSTRAP_TOKEN_READY,
  buildCdCommand,
  buildCopilotLaunchCommand,
  buildCodexBootstrapCommand,
  buildCodexResumeCommand,
  consumeAiRuntimeExitMarkers,
  isAiSessionReady,
  normalizeAiProvider,
  normalizeCodexSandboxMode,
  normalizeCopilotPermissionMode
} = require("../../utils/aiLaunch");
const { getPendingTerminalIntent, clearPendingTerminalIntent } = require("../../utils/terminalIntent");
const {
  getTerminalSessionSnapshot,
  createTerminalSessionSnapshot,
  markTerminalSessionResumable,
  getTerminalBufferSnapshot,
  saveTerminalBufferSnapshot,
  clearTerminalSessionSnapshot
} = require("../../utils/terminalSession");
const { resolveTerminalResumeGraceMs } = require("../../utils/terminalSessionState");
const {
  buildLineCellRenderRuns,
  cloneTerminalCell,
  lineCellsToText,
  resolveUniformLineBackground
} = require("./terminalCursorModel");
const {
  deserializeTerminalSnapshotRows,
  serializeTerminalSnapshotRows
} = require("./terminalSnapshotCodec.js");
const { buildTerminalSessionInfoModel } = require("./terminalSessionInfo.js");
const {
  appendDiagnosticSample,
  buildCombinedDiagnosticSparkline
} = require("./connectionDiagnosticsSparkline");
const {
  buildSpeakableTerminalText,
  isSpeakableTextLikelyComplete,
  splitSpeakableTextForTts
} = require("./terminalSpeakableText");
const {
  ANSI_RESET_STATE,
  applyTerminalOutput,
  buildTerminalCellsFromText,
  cloneAnsiState,
  cloneTerminalBufferState,
  createEmptyTerminalBufferState,
  getActiveTerminalBuffer,
  getTerminalModeState,
  rebuildTerminalBufferStateFromReplayText,
  syncActiveBufferSnapshot,
  trimTerminalReplayTextToMaxBytes,
  utf8ByteLength
} = require("./terminalBufferState");
const {
  consumeTerminalSyncUpdateFrames,
  createTerminalSyncUpdateState,
  takeTerminalReplaySlice
} = require("./vtParser.js");
const {
  TERMINAL_TOUCH_DIRECTION_KEYS,
  TERMINAL_TOUCH_ACTION_BUTTONS,
  encodeTerminalKey,
  encodeTerminalPaste
} = require("./terminalKeyEncoder");
const {
  TOUCH_SHIFT_MODE_OFF,
  TOUCH_SHIFT_MODE_ONCE,
  TOUCH_SHIFT_DOUBLE_TAP_MS,
  applyTouchShiftToValue,
  resolveTouchShiftModeOnTap
} = require("./touchShiftState");
const { createTerminalPerfLogBuffer, pickPerfScore } = require("./terminalPerfLogBuffer");
const { createTerminalRenderScheduler } = require("./terminalRenderScheduler");
const {
  resolveTerminalStdoutOverlayDecision,
  resolveTerminalStdoutRenderDecision
} = require("./terminalStdoutRenderPolicy");
const { buildTerminalViewportState, normalizeActiveBufferName } = require("./terminalViewportModel");
const { resolveVoicePrivacyErrorMessage } = require("./voicePrivacy");
const { resolveVoiceGatewayErrorState } = require("./voiceGatewayError");

/**
 * 终端页只负责“几何测量、渲染投影、键盘代理”。
 *
 * 顶级约束（后续补 VT 功能时不得破坏）：
 * 1. 原生 `input` 仅作为键盘代理，不再承担终端视觉 caret 职责。
 * 2. `outputRenderLines`、overlay caret、激活带必须共享同一份 buffer cursor 结果；
 *    禁止重新引入 prompt 正则猜测、字符串长度推光标或浏览器软换行回推。
 * 3. `cols/rows` 必须来自真实输出区域几何；列数变化时必须允许按 replay 文本重建 buffer。
 * 4. 后续即使增加 alternate screen，也只能改变“当前渲染使用哪份 buffer”，不能把页面层改回
 *    直接依赖自然文本流的实现。
 * 5. 继承仓库级移动端终端交互约束：键盘弹起/收起必须顺畅、滚动必须保留原生惯性、长按选区链路
 *    优先级高于自定义手势、键盘过渡期间当前命令行必须保持可见。
 */

const RECONNECT_STATES = new Set(["idle", "disconnected", "error"]);
const AUTO_RECONNECT_IGNORED_REASONS = new Set(["manual", "host_key_rejected", "ws_peer_normal_close"]);
const CONNECTION_DIAGNOSTIC_SAMPLE_LIMIT = 30;
const CONNECTION_DIAGNOSTIC_SAMPLE_INTERVAL_MS = 10000;
const CONNECTION_DIAGNOSTIC_PANEL_SAMPLE_INTERVAL_MS = 3000;
const CONNECTION_DIAGNOSTIC_NETWORK_TIMEOUT_MS = 6000;
const VOICE_CLOSE_TIMEOUT_MS = 2600;
const VOICE_HOLD_DELAY_MS = 180;
const VOICE_DRAG_THRESHOLD_PX = 10;
const VOICE_FLOAT_GAP_PX = 16;
const VOICE_BUTTON_SIZE_RPX = 64;
const VOICE_PANEL_MIN_WIDTH_PX = 220;
const VOICE_PANEL_FALLBACK_HEIGHT_PX = 220;
const VOICE_IDLE_OPACITY = 1;
const VOICE_ACTIVE_OPACITY = 1;
const VOICE_MAIN_BUTTON_SIZE_PX = 32;
const VOICE_SECONDARY_BUTTON_SIZE_PX = 25;
const VOICE_SIDE_ACTION_BUTTON_RPX = 48;
const VOICE_ACTION_BUTTON_GAP_PX = 16;
const VOICE_ACTIONS_SIDE_PADDING_PX = 16;
const VOICE_ACTIONS_VERTICAL_PADDING_PX = 8;
const VOICE_ACTIONS_MIN_HEIGHT_RPX = 70;
const VOICE_CATEGORY_PILL_MIN_HEIGHT_RPX = 52;
const VOICE_CATEGORY_BOTTOM_PADDING_PX = 12;
const VOICE_FRAME_BOTTOM_PADDING_RPX = 10;
const OUTPUT_HORIZONTAL_PADDING_RPX = 16;
const OUTPUT_RIGHT_SAFE_PADDING_PX = 8;
const SHELL_ACTIVATION_RADIUS_LINES = 2;
const SHELL_CHAR_WIDTH_FACTOR = 0.62;
const SHELL_INPUT_MIN_WIDTH_PX = 1;
const OUTPUT_LONG_PRESS_SUPPRESS_MS = 420;
const ENABLE_SHELL_ACTIVATION_DEBUG_OVERLAY = true;
const DISCONNECTED_HINT_TEXT = "请点击右上角“重连”开关或左上角AI按钮，重新连接。";
const DEFAULT_BUFFER_MAX_ENTRIES = 5000;
const DEFAULT_BUFFER_MAX_BYTES = 4 * 1024 * 1024;
const TERMINAL_BUFFER_SNAPSHOT_MAX_BYTES = 128 * 1024;
const SHELL_METRICS_ASCII_PROBE_TEXT = "WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW";
const SHELL_METRICS_WIDE_PROBE_TEXT = "汉汉汉汉汉汉汉汉汉汉汉汉汉汉汉汉";
const RECORDER_OPTIONS = {
  duration: 600000,
  sampleRate: 16000,
  numberOfChannels: 1,
  encodeBitRate: 96000,
  format: "PCM",
  frameSize: 4
};
const CODEX_BOOTSTRAP_WAIT_TIMEOUT_MS = 6000;
const CODEX_BOOTSTRAP_RELEASE_DELAY_MS = 260;
const CODEX_BOOTSTRAP_BUFFER_MAX_CHARS = 8192;
const TTS_STABLE_SENTENCE_MS = 700;
const TTS_STABLE_INCOMPLETE_MS = 1400;
const TTS_STABLE_CONFIRM_MS = 150;
/**
 * `InnerAudioContext` 在部分机型上会出现两类不稳定：
 * 1. `src` 已切换，但 `onCanplay` 迟迟不触发；
 * 2. 本地缓存文件偶发加载失败，而同一资源的远端地址其实可播。
 *
 * 这里保留两级兜底：
 * 1. 短延迟主动 `play()` 一次，补偿 `onCanplay` 偶发不触发；
 * 2. 超时后优先回退到远端 URL，再决定是否报错。
 */
const TTS_PLAYBACK_START_KICK_MS = 220;
const TTS_PLAYBACK_LOAD_TIMEOUT_MS = 4000;
const TTS_ROUND_TEXT_MAX_CHARS = 24000;
// 终端 perf 日志默认关闭。当前仍有性能遗留问题，常态输出会进一步放大 console 压力；
// 调试性能问题时，可临时改为 true 收集 `perf.summary / perf.snapshot` 现场。
const ENABLE_TERMINAL_PERF_LOGS = false;
const TERMINAL_PERF_LOG_PREFIX = "[terminal.perf]";
const TERMINAL_PERF_LOG_WINDOW_MS = 5000;
// 终端性能日志默认只关心“肉眼明显可感知”的慢步骤，避免 Codex 启动期间被碎片输出刷屏。
const TERMINAL_PERF_SLOW_STEP_MS = 1000;
const TERMINAL_PERF_LONG_TASK_MS = 1000;
const TERMINAL_OUTPUT_RENDER_BATCH_MS = 16;
/**
 * 小程序 terminal 的 stdout 处理、`setData` 桥接、overlay 同步和点击事件共用同一条页面主线程。
 * 这里把单次 VT slice 再压短一点，优先保证“按钮/输入先有响应”，吞吐留给后续 slice 续跑。
 */
const TERMINAL_OUTPUT_WRITE_SLICE_MS = 6;
const TERMINAL_OUTPUT_WRITE_SLICE_CHARS = 1024;
const TERMINAL_OUTPUT_WRITE_SLICE_INITIAL_LOG_LIMIT = 3;
const TERMINAL_VIEWPORT_SCROLL_REFRESH_MARGIN_ROWS = 24;
const TERMINAL_SCROLL_OVERLAY_THROTTLE_MS = 32;
const TERMINAL_SCROLL_VIEWPORT_PREFETCH_DELAY_MS = 16;
const TERMINAL_SCROLL_VIEWPORT_PREFETCH_THROTTLE_MS = 48;
const TERMINAL_SCROLL_IDLE_SETTLE_MS = 96;
const TERMINAL_PERF_LAG_SAMPLE_MS = 1000;
const TERMINAL_PERF_LAG_WARN_MS = 180;
const TERMINAL_PERF_INITIAL_FRAME_LOG_LIMIT = 6;
const TERMINAL_PERF_RECENT_RECORD_LIMIT = 24;
const TERMINAL_PERF_DIAG_SNAPSHOT_LIMIT = 8;
const TERMINAL_PERF_DIAG_SNAPSHOT_COOLDOWN_MS = 4000;
const TERMINAL_PERF_STDOUT_BACKLOG_WARN_MS = 400;
const TERMINAL_PERF_STDOUT_BACKLOG_WARN_BYTES = 48 * 1024;
const TERMINAL_CARET_STABILITY_MS = 120;

const TERMINAL_PERF_RECENT_NUMERIC_KEYS = Object.freeze([
  "totalCostMs",
  "costMs",
  "driftMs",
  "queueWaitMs",
  "schedulerWaitMs",
  "cloneCostMs",
  "applyCostMs",
  "trimCostMs",
  "stateApplyCostMs",
  "layoutCostMs",
  "setDataCostMs",
  "postLayoutCostMs",
  "overlayCostMs",
  "buildCostMs",
  "renderBuildCostMs",
  "batchWaitMs",
  "remainingBytes",
  "visibleBytes",
  "chunkCount",
  "sliceCount",
  "renderPassCount",
  "layoutPassCount",
  "overlayPassCount",
  "deferredRenderPassCount",
  "skippedOverlayPassCount",
  "totalRenderBuildCostMs",
  "totalSetDataCostMs",
  "totalPostLayoutCostMs",
  "maxLayoutCostMs",
  "maxRenderBuildCostMs",
  "maxSetDataCostMs",
  "maxPostLayoutCostMs",
  "maxOverlayCostMs",
  "renderRowCount",
  "activeRowCount",
  "activeCellCount",
  "pendingStdoutSamples",
  "pendingStdoutBytes",
  "activeStdoutAgeMs",
  "activeStdoutBytes"
]);

function escapeRegExpLiteral(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 仅匹配“独立一行”的 bootstrap token，避免命令回显中的字面量误判。
 */
function hasCodexBootstrapTokenLine(source, token) {
  const pattern = new RegExp(`(^|\\r?\\n)${escapeRegExpLiteral(token)}(?=\\r?\\n|$)`);
  return pattern.test(String(source || ""));
}

function stripCodexBootstrapTokenLine(source, token) {
  const pattern = new RegExp(`(^|\\r?\\n)${escapeRegExpLiteral(token)}(?=\\r?\\n|$)`, "g");
  return String(source || "").replace(pattern, "$1");
}

function extractAfterFirstCodexBootstrapTokenLine(source, token) {
  const pattern = new RegExp(`(^|\\r?\\n)${escapeRegExpLiteral(token)}(\\r?\\n|$)`);
  const match = pattern.exec(String(source || ""));
  if (!match) {
    return { found: false };
  }
  const prefix = match[1] || "";
  const suffix = match[2] || "";
  const tokenStart = match.index + prefix.length;
  const tokenEnd = tokenStart + token.length + suffix.length;
  return {
    found: true,
    after: String(source || "").slice(tokenEnd)
  };
}

function buildStableTextHash(source) {
  let hash = 2166136261;
  const text = String(source || "");
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function countTerminalRows(rows) {
  return Array.isArray(rows) ? rows.length : 0;
}

function countTerminalCells(rows) {
  const source = Array.isArray(rows) ? rows : [];
  let total = 0;
  for (let index = 0; index < source.length; index += 1) {
    total += Array.isArray(source[index]) ? source[index].length : 0;
  }
  return total;
}

function cloneTerminalCaretSnapshot(caret) {
  const source = caret && typeof caret === "object" ? caret : null;
  if (!source) {
    return null;
  }
  return {
    left: Math.round(Number(source.left) || 0),
    top: Math.round(Number(source.top) || 0),
    height: Math.max(0, Math.round(Number(source.height) || 0)),
    visible: !!source.visible,
    cursorRow: Math.max(0, Math.round(Number(source.cursorRow) || 0)),
    cursorCol: Math.max(0, Math.round(Number(source.cursorCol) || 0)),
    scrollTop: Math.max(0, Math.round(Number(source.scrollTop) || 0)),
    rawTop: Math.round(Number(source.rawTop) || 0),
    rawLeft: Math.round(Number(source.rawLeft) || 0),
    rectWidth: Math.max(0, Math.round(Number(source.rectWidth) || 0)),
    rectHeight: Math.max(0, Math.round(Number(source.rectHeight) || 0)),
    lineHeight: Math.max(0, Math.round(Number(source.lineHeight) || 0)),
    charWidth: Math.max(0, Number(source.charWidth) || 0)
  };
}

function isSameTerminalCaretSnapshot(left, right) {
  const prev = left && typeof left === "object" ? left : null;
  const next = right && typeof right === "object" ? right : null;
  if (!prev || !next) {
    return prev === next;
  }
  return (
    prev.visible === next.visible &&
    prev.left === next.left &&
    prev.top === next.top &&
    prev.height === next.height &&
    prev.cursorRow === next.cursorRow &&
    prev.cursorCol === next.cursorCol &&
    prev.scrollTop === next.scrollTop
  );
}

function pickTerminalPerfSuspectedBottleneck(payload) {
  const source = payload && typeof payload === "object" ? payload : {};
  const candidates = [
    ["scheduler_backlog", Number(source.queueWaitMs) || 0],
    ["state_clone", Number(source.cloneCostMs) || 0],
    ["stdout_apply", Number(source.applyCostMs) || 0],
    ["buffer_trim", Number(source.trimCostMs) || 0],
    ["state_projection", Number(source.stateApplyCostMs) || 0],
    ["layout_build", Number(source.buildCostMs) || 0],
    ["render_rows", Number(source.renderBuildCostMs) || 0],
    ["set_data", Number(source.setDataCostMs) || 0],
    ["post_layout", Number(source.postLayoutCostMs) || 0],
    ["overlay", Number(source.overlayCostMs) || 0],
    ["main_thread_lag", Number(source.driftMs) || 0]
  ];
  let bestLabel = "";
  let bestScore = 0;
  for (let index = 0; index < candidates.length; index += 1) {
    const [label, score] = candidates[index];
    if (score > bestScore) {
      bestLabel = label;
      bestScore = score;
    }
  }
  if (!bestLabel && (Number(source.pendingStdoutSamples) > 0 || Number(source.pendingStdoutBytes) > 0)) {
    return "scheduler_backlog";
  }
  return bestLabel;
}

function buildCompactTerminalPerfRecord(record) {
  const source = record && typeof record === "object" ? record : {};
  const compact = {
    event: String(source.event || ""),
    at: Number(source.at) || 0,
    scoreMs: pickPerfScore(source)
  };
  if (source.status) {
    compact.status = String(source.status);
  }
  if (source.renderReason) {
    compact.renderReason = String(source.renderReason);
  }
  if (source.lastRenderDecisionReason) {
    compact.lastRenderDecisionReason = String(source.lastRenderDecisionReason);
  }
  if (source.lastRenderDecisionPolicy) {
    compact.lastRenderDecisionPolicy = String(source.lastRenderDecisionPolicy);
  }
  const suspectedBottleneck = source.suspectedBottleneck || pickTerminalPerfSuspectedBottleneck(source) || "";
  if (suspectedBottleneck) {
    compact.suspectedBottleneck = suspectedBottleneck;
  }
  for (let index = 0; index < TERMINAL_PERF_RECENT_NUMERIC_KEYS.length; index += 1) {
    const key = TERMINAL_PERF_RECENT_NUMERIC_KEYS[index];
    const value = Number(source[key]);
    if (Number.isFinite(value) && value > 0) {
      compact[key] = value;
    }
  }
  return compact;
}

const recorderManager = wx.getRecorderManager();
let recorderBound = false;
let activeTerminalPage = null;
const connectionDiagnosticSampleCache = new Map();

function resolveActivationDebugSetting(settings) {
  if (!settings || typeof settings !== "object") return ENABLE_SHELL_ACTIVATION_DEBUG_OVERLAY;
  if (settings.shellActivationDebugOutline === undefined) return ENABLE_SHELL_ACTIVATION_DEBUG_OVERLAY;
  return !!settings.shellActivationDebugOutline;
}

function resolveVoiceInputButtonSetting(settings) {
  if (!settings || typeof settings !== "object") return true;
  if (settings.showVoiceInputButton === undefined) return true;
  return !!settings.showVoiceInputButton;
}

function resolveTtsSpeakableMaxChars(settings) {
  if (!settings || typeof settings !== "object") {
    return DEFAULT_TTS_SPEAKABLE_MAX_CHARS;
  }
  return normalizeTtsSpeakableMaxChars(settings.ttsSpeakableMaxChars);
}

function resolveTtsSegmentMaxChars(settings) {
  if (!settings || typeof settings !== "object") {
    return DEFAULT_TTS_SEGMENT_MAX_CHARS;
  }
  return normalizeTtsSegmentMaxChars(settings.ttsSegmentMaxChars);
}

function resolveDisconnectedHintVisible(status) {
  const normalized = String(status || "");
  return normalized === "disconnected" || normalized === "error";
}

function normalizePositiveInt(value, fallback, min) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const normalized = Math.round(parsed);
  if (normalized < min) return fallback;
  return normalized;
}

/**
 * 诊断曲线的来源既有运行时内存，也有本地缓存。
 * 这里统一做一次归一化，确保：
 * 1. 只保留非负数；
 * 2. 全部取整，避免图表 meta 出现小数；
 * 3. 长度始终截断到最近 30 个点。
 */
function normalizeConnectionDiagnosticSamples(samplesInput) {
  const samples = Array.isArray(samplesInput)
    ? samplesInput
        .map((sample) => Number(sample))
        .filter((sample) => Number.isFinite(sample) && sample >= 0)
        .map((sample) => Math.round(sample))
    : [];
  return samples.slice(-CONNECTION_DIAGNOSTIC_SAMPLE_LIMIT);
}

function resolveTouchClientPoint(event) {
  const point =
    (event && event.touches && event.touches[0]) ||
    (event && event.changedTouches && event.changedTouches[0]) ||
    null;
  if (!point) return null;
  const x = Number(point.clientX);
  const y = Number(point.clientY);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

function resolveTapClientPoint(event) {
  if (event && event.detail) {
    const x = Number(event.detail.x);
    const y = Number(event.detail.y);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      return { x, y };
    }
  }
  return resolveTouchClientPoint(event);
}

function cloneOutputRectSnapshot(rect) {
  if (!rect || typeof rect !== "object") {
    return null;
  }
  return {
    left: Number(rect.left) || 0,
    top: Number(rect.top) || 0,
    right: Number(rect.right) || 0,
    bottom: Number(rect.bottom) || 0,
    width: Number(rect.width) || 0,
    height: Number(rect.height) || 0
  };
}

function resolveRuntimeMessage(error, fallback) {
  if (!error) return fallback;
  if (typeof error === "string") return error;
  if (typeof error.message === "string" && error.message.trim()) return error.message.trim();
  if (typeof error.errMsg === "string" && error.errMsg.trim()) return error.errMsg.trim();
  if (typeof error.msg === "string" && error.msg.trim()) return error.msg.trim();
  return fallback;
}

function isRecorderBusyError(error) {
  const message = resolveRuntimeMessage(error, "").toLowerCase();
  return /is recording or paused|operateRecorder:fail/i.test(message);
}

function isRecorderNotStartError(error) {
  const message = resolveRuntimeMessage(error, "").toLowerCase();
  return /operateRecorder:fail recorder not start|recorder not start/i.test(message);
}

function isNormalVoiceCloseError(error) {
  const message = resolveRuntimeMessage(error, "");
  return /语音连接已关闭\(1000\)(?::\s*.*)?$/i.test(message);
}

function isBenignVoiceRuntimeError(error) {
  if (!error) return false;
  if (isRecorderNotStartError(error)) return true;
  if (isNormalVoiceCloseError(error)) return true;
  return false;
}

function buildAnsiInlineStyle(state, options) {
  const source = state || ANSI_RESET_STATE;
  const normalizedOptions = options && typeof options === "object" ? options : {};
  const lineBackground = String(normalizedOptions.lineBackground || "");
  const styles = [];
  if (source.fg) styles.push(`color:${source.fg}`);
  if (source.bg && source.bg !== lineBackground) {
    styles.push(`background-color:${source.bg}`);
  }
  if (source.bold) styles.push("font-weight:700");
  if (source.underline) styles.push("text-decoration:underline");
  return styles.join(";");
}

function buildRenderSegmentStyle(state, renderMetrics, run, options) {
  const style = buildAnsiInlineStyle(state, options);
  const styles = style ? [style] : [];
  if (run && run.fixed) {
    const columns = Math.max(1, Math.round(Number(run.columns) || 1));
    const charWidth = Math.max(1, Number(renderMetrics && renderMetrics.charWidth) || 1);
    const widthPx = (columns * charWidth).toFixed(3).replace(/\.?0+$/, "");
    styles.push(`width:${widthPx}px`);
  }
  return styles.join(";");
}

function buildRenderSegmentsFromLineCells(lineCells, renderMetrics) {
  const runs = buildLineCellRenderRuns(lineCells);
  if (runs.length === 0) {
    return {
      lineStyle: "",
      segments: []
    };
  }
  const lineBackground = resolveUniformLineBackground(runs);
  return {
    lineStyle: lineBackground ? `background-color:${lineBackground};` : "",
    segments: runs.map((run) => ({
      text: run.text,
      fixed: !!run.fixed,
      style: buildRenderSegmentStyle((run && run.style) || ANSI_RESET_STATE, renderMetrics, run, {
        lineBackground
      })
    }))
  };
}

function normalizeAuthType(value) {
  const authType = String(value || "").trim();
  if (authType === "privateKey" || authType === "certificate") return authType;
  return "password";
}

function resolveCredential(server, prefix) {
  const source = server && typeof server === "object" ? server : {};
  const fieldPrefix = String(prefix || "");
  const authType = normalizeAuthType(
    fieldPrefix ? source.jumpHost && source.jumpHost.authType : source.authType
  );
  const passwordKey = fieldPrefix ? `${fieldPrefix}Password` : "password";
  const privateKeyKey = fieldPrefix ? `${fieldPrefix}PrivateKey` : "privateKey";
  const passphraseKey = fieldPrefix ? `${fieldPrefix}Passphrase` : "passphrase";
  const certificateKey = fieldPrefix ? `${fieldPrefix}Certificate` : "certificate";
  if (authType === "privateKey") {
    return {
      type: "privateKey",
      privateKey: String(source[privateKeyKey] || ""),
      passphrase: String(source[passphraseKey] || "")
    };
  }
  if (authType === "certificate") {
    return {
      type: "certificate",
      privateKey: String(source[privateKeyKey] || ""),
      passphrase: String(source[passphraseKey] || ""),
      certificate: String(source[certificateKey] || "")
    };
  }
  return {
    type: "password",
    password: String(source[passwordKey] || "")
  };
}

function bindRecorderEvents() {
  if (recorderBound) return;
  recorderBound = true;

  recorderManager.onFrameRecorded((event) => {
    if (activeTerminalPage && typeof activeTerminalPage.handleRecorderFrame === "function") {
      activeTerminalPage.handleRecorderFrame(event);
    }
  });

  recorderManager.onStart(() => {
    if (activeTerminalPage && typeof activeTerminalPage.handleRecorderStart === "function") {
      activeTerminalPage.handleRecorderStart();
    }
  });

  recorderManager.onStop((event) => {
    if (activeTerminalPage && typeof activeTerminalPage.handleRecorderStop === "function") {
      activeTerminalPage.handleRecorderStop(event);
    }
  });

  recorderManager.onError((error) => {
    if (activeTerminalPage && typeof activeTerminalPage.handleRecorderError === "function") {
      activeTerminalPage.handleRecorderError(error);
    }
  });
}

function resolveVoiceRecordCategories(settings) {
  const source = settings && typeof settings === "object" ? settings : {};
  const categories = normalizeVoiceRecordCategories(source.voiceRecordCategories);
  return categories.length > 0 ? categories : [DEFAULT_VOICE_RECORD_CATEGORY_FALLBACK];
}

function resolveProjectDirectoryName(projectPath) {
  const normalized = String(projectPath || "")
    .trim()
    .replace(/\/+$/g, "");
  if (!normalized) return "";
  const segments = normalized.split("/").filter(Boolean);
  return segments[segments.length - 1] || "";
}

function buildTerminalTouchDirectionKeys(iconMap, pressedIconMap) {
  return TERMINAL_TOUCH_DIRECTION_KEYS.map((item) => ({
    ...item,
    pressKey: `terminal:direction:${item.key}`,
    icon: resolveButtonIcon(item.icon, iconMap),
    pressedIcon: resolveButtonIcon(item.icon, pressedIconMap)
  }));
}

function buildTerminalTouchActionButtons(iconMap, pressedIconMap) {
  return TERMINAL_TOUCH_ACTION_BUTTONS.map((item) => ({
    ...item,
    pressKey: `terminal:action:${item.key}`,
    icon: resolveButtonIcon(item.icon, iconMap),
    pressedIcon: resolveButtonIcon(item.icon, pressedIconMap)
  }));
}

function buildTerminalThemePayload(settings) {
  const terminalToolIcons = buildTerminalToolIconMap(settings);
  const terminalToolActiveIcons = buildTerminalToolActiveIconMap(settings);
  return {
    themeStyle: buildThemeStyle(settings),
    uiButtonIcons: buildButtonIconMap(settings),
    uiButtonActiveIcons: buildActiveButtonIconMap(settings),
    uiButtonAccentIcons: buildAccentButtonIconMap(settings),
    terminalToolIcons,
    terminalToolActiveIcons,
    terminalTouchDirectionKeys: buildTerminalTouchDirectionKeys(terminalToolIcons, terminalToolActiveIcons),
    terminalTouchActionButtons: buildTerminalTouchActionButtons(terminalToolIcons, terminalToolActiveIcons),
    terminalTouchToggleIcon: resolveButtonIcon("/assets/icons/keyboard.svg", terminalToolIcons),
    terminalTouchTogglePressedIcon: resolveButtonIcon("/assets/icons/keyboard.svg", terminalToolActiveIcons)
  };
}

function buildTerminalRuntimeTheme(settings) {
  const source = settings && typeof settings === "object" ? settings : {};
  return {
    defaultForeground: String(source.shellTextColor || "#e6f0ff"),
    defaultBackground: String(source.shellBgColor || "#192b4d"),
    defaultCursor: String(source.shellAccentColor || source.shellTextColor || "#9ca9bf")
  };
}

function parseHexColor(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (!match) return null;
  const normalized =
    match[1].length === 3
      ? match[1]
          .split("")
          .map((char) => char + char)
          .join("")
      : match[1];
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16)
  };
}

function toHexChannel(value) {
  const normalized = Math.max(0, Math.min(255, Math.round(Number(value) || 0)));
  return normalized.toString(16).padStart(2, "0");
}

function mixThemeHexColor(leftInput, rightInput, ratio, fallback) {
  const left = parseHexColor(leftInput);
  const right = parseHexColor(rightInput);
  if (!left || !right) {
    return String(fallback || leftInput || rightInput || "#192b4d");
  }
  const t = Math.max(0, Math.min(1, Number(ratio) || 0));
  return `#${toHexChannel(left.r + (right.r - left.r) * t)}${toHexChannel(
    left.g + (right.g - left.g) * t
  )}${toHexChannel(left.b + (right.b - left.b) * t)}`;
}

function invertThemeHexColor(value, fallback) {
  const rgb = parseHexColor(value);
  if (!rgb) {
    return String(fallback || "#e6f0ff");
  }
  return `#${toHexChannel(255 - rgb.r)}${toHexChannel(255 - rgb.g)}${toHexChannel(255 - rgb.b)}`;
}

/**
 * 相对亮度用于判断“该颜色上面应该压深字还是浅字”。
 * 这里只做主题对比度推断，不参与业务数据计算。
 */
function getThemeRelativeLuminance(value) {
  const rgb = parseHexColor(value);
  if (!rgb) {
    return 0;
  }
  const normalizeChannel = (channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * normalizeChannel(rgb.r) + 0.7152 * normalizeChannel(rgb.g) + 0.0722 * normalizeChannel(rgb.b)
  );
}

/**
 * 根据底色挑一组稳定的高对比文案色：
 * - 亮底返回深色；
 * - 暗底返回浅色；
 * - 这样图表背景随终端主题翻转时，文字和网格不需要再写死成白色。
 */
function resolveThemeContrastColor(backgroundInput, darkColor, lightColor) {
  const background = String(backgroundInput || "");
  return getThemeRelativeLuminance(background) >= 0.42
    ? String(darkColor || "#07101d")
    : String(lightColor || "#f5f8ff");
}

function toThemeRgba(value, alpha, fallback) {
  const rgb = parseHexColor(value);
  if (!rgb) {
    return String(fallback || `rgba(25, 43, 77, ${alpha})`);
  }
  const safeAlpha = Math.max(0, Math.min(1, Number(alpha) || 0));
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${safeAlpha})`;
}

/**
 * 诊断曲线卡的主底色直接跟终端前景色走，
 * 深浅终端再分别切一套响应色：
 * - 终端背景偏暗时，卡片会落到浅底，因此曲线与数值改用更深的蓝橙；
 * - 终端背景偏亮时，继续使用当前亮色高光，保证暗底上能看清。
 */
function buildConnectionDiagnosticThemeStyles(runtimeThemeInput) {
  const runtimeTheme =
    runtimeThemeInput && typeof runtimeThemeInput === "object"
      ? runtimeThemeInput
      : buildTerminalRuntimeTheme({});
  const foreground = String(runtimeTheme.defaultForeground || "#e6f0ff");
  const background = String(runtimeTheme.defaultBackground || "#192b4d");
  const panelBackground = foreground;
  const contentBackground = background;
  const isDarkTerminal = getThemeRelativeLuminance(background) < 0.36;
  const panelText = resolveThemeContrastColor(panelBackground, "#07101d", "#f5f8ff");
  const mixedPanelBottom = mixThemeHexColor(panelBackground, contentBackground, 0.14, panelBackground);
  const metricSurface = mixThemeHexColor(panelBackground, contentBackground, 0.08, panelBackground);
  const chartSurface = mixThemeHexColor(panelBackground, contentBackground, 0.05, panelBackground);
  const cardOutline = mixThemeHexColor(panelBackground, panelText, 0.22, panelText);
  const metricOutline = mixThemeHexColor(panelBackground, panelText, 0.18, panelText);
  const invertedForeground = invertThemeHexColor(panelBackground, contentBackground);
  const responsePalette = isDarkTerminal
    ? {
        line: "#0E7AA7",
        glow: "#0B5F82"
      }
    : {
        line: "#67D1FF",
        glow: "#B7F1FF"
      };
  const networkPalette = isDarkTerminal
    ? {
        line: "#B66A0A",
        glow: "#8A4F00"
      }
    : {
        line: "#FFB35C",
        glow: "#FFE0A3"
      };
  return {
    cardStyle: `background: radial-gradient(circle at top left, rgba(103, 209, 255, 0.16), transparent 38%), radial-gradient(circle at top right, rgba(255, 179, 92, 0.16), transparent 38%), linear-gradient(180deg, ${toThemeRgba(
      panelBackground,
      0.98,
      "rgba(230, 240, 255, 0.98)"
    )}, ${toThemeRgba(mixedPanelBottom, 0.96, "rgba(215, 226, 243, 0.96)")}); border-color: ${toThemeRgba(
      cardOutline,
      0.18,
      "rgba(7, 16, 29, 0.18)"
    )}; box-shadow: 0 18rpx 40rpx -28rpx ${toThemeRgba(
      contentBackground,
      0.32,
      "rgba(9, 16, 29, 0.32)"
    )}, inset 0 1rpx 0 ${toThemeRgba(panelText, 0.05, "rgba(7, 16, 29, 0.05)")}; color: ${panelText};`,
    responseMetricStyle: `background: linear-gradient(180deg, ${toThemeRgba(
      metricSurface,
      0.94,
      "rgba(230, 240, 255, 0.94)"
    )}, ${toThemeRgba(panelBackground, 0.98, "rgba(230, 240, 255, 0.98)")}), linear-gradient(90deg, ${toThemeRgba(
      responsePalette.line,
      0.1,
      "rgba(103, 209, 255, 0.1)"
    )}, transparent 72%); border-color: ${toThemeRgba(
      metricOutline,
      0.18,
      "rgba(7, 16, 29, 0.18)"
    )}; --diagnostic-stat-label-color: ${toThemeRgba(
      panelText,
      0.74,
      "rgba(7, 16, 29, 0.74)"
    )}; --diagnostic-stat-divider-color: ${toThemeRgba(
      panelText,
      0.56,
      "rgba(7, 16, 29, 0.56)"
    )}; --diagnostic-axis-pill-bg: ${toThemeRgba(
      responsePalette.line,
      isDarkTerminal ? 0.12 : 0.14,
      "rgba(103, 209, 255, 0.14)"
    )}; --diagnostic-axis-pill-border: ${toThemeRgba(
      responsePalette.line,
      isDarkTerminal ? 0.26 : 0.22,
      "rgba(103, 209, 255, 0.22)"
    )}; --diagnostic-axis-pill-color: ${isDarkTerminal ? responsePalette.line : responsePalette.glow}; --diagnostic-stat-value-border: ${toThemeRgba(
      responsePalette.line,
      isDarkTerminal ? 0.34 : 0.24,
      "rgba(103, 209, 255, 0.24)"
    )}; --diagnostic-stat-value-color: ${isDarkTerminal ? responsePalette.line : responsePalette.glow};`,
    networkMetricStyle: `background: linear-gradient(180deg, ${toThemeRgba(
      metricSurface,
      0.94,
      "rgba(230, 240, 255, 0.94)"
    )}, ${toThemeRgba(panelBackground, 0.98, "rgba(230, 240, 255, 0.98)")}), linear-gradient(90deg, ${toThemeRgba(
      networkPalette.line,
      0.1,
      "rgba(255, 179, 92, 0.1)"
    )}, transparent 72%); border-color: ${toThemeRgba(
      metricOutline,
      0.18,
      "rgba(7, 16, 29, 0.18)"
    )}; --diagnostic-stat-label-color: ${toThemeRgba(
      panelText,
      0.74,
      "rgba(7, 16, 29, 0.74)"
    )}; --diagnostic-stat-divider-color: ${toThemeRgba(
      panelText,
      0.56,
      "rgba(7, 16, 29, 0.56)"
    )}; --diagnostic-axis-pill-bg: ${toThemeRgba(
      networkPalette.line,
      isDarkTerminal ? 0.12 : 0.16,
      "rgba(255, 179, 92, 0.16)"
    )}; --diagnostic-axis-pill-border: ${toThemeRgba(
      networkPalette.line,
      isDarkTerminal ? 0.28 : 0.24,
      "rgba(255, 179, 92, 0.24)"
    )}; --diagnostic-axis-pill-color: ${isDarkTerminal ? networkPalette.line : networkPalette.glow}; --diagnostic-stat-value-border: ${toThemeRgba(
      networkPalette.line,
      isDarkTerminal ? 0.34 : 0.26,
      "rgba(255, 179, 92, 0.26)"
    )}; --diagnostic-stat-value-color: ${isDarkTerminal ? networkPalette.line : networkPalette.glow};`,
    chartCardBgColor: toThemeRgba(chartSurface, 0.98, "rgba(18, 29, 49, 0.98)"),
    chartCardBorderColor: "transparent",
    chartCardGlowColor: toThemeRgba(invertedForeground, 0.08, "rgba(151, 194, 255, 0.08)"),
    chartGridColor: toThemeRgba(panelText, 0.16, "rgba(7, 16, 29, 0.16)"),
    responseLineColor: responsePalette.line,
    responseGlowColor: responsePalette.glow,
    responseFillColor: responsePalette.line,
    networkLineColor: networkPalette.line,
    networkGlowColor: networkPalette.glow,
    networkFillColor: networkPalette.line,
    chartImageShellStyle: `background: ${toThemeRgba(chartSurface, 0.98, "rgba(230, 240, 255, 0.98)")};`
  };
}

/**
 * 会话信息浮层与时延浮层保持同源配色：
 * - 外层卡片直接复用时延面板的主题底色；
 * - 通过 CSS 变量把 hero、胶囊、明细卡的颜色一次性下发给 WXML；
 * - 这样页面层可以大胆重排结构，但仍保持和终端主题同一套色彩逻辑。
 */
function buildSessionInfoThemeStyles(runtimeThemeInput) {
  const runtimeTheme =
    runtimeThemeInput && typeof runtimeThemeInput === "object"
      ? runtimeThemeInput
      : buildTerminalRuntimeTheme({});
  const foreground = String(runtimeTheme.defaultForeground || "#e6f0ff");
  const background = String(runtimeTheme.defaultBackground || "#192b4d");
  const panelBackground = foreground;
  const contentBackground = background;
  const panelText = resolveThemeContrastColor(panelBackground, "#07101d", "#f5f8ff");
  const rowSurfaceTop = mixThemeHexColor(panelBackground, contentBackground, 0.1, panelBackground);
  const rowSurfaceBottom = mixThemeHexColor(panelBackground, contentBackground, 0.04, panelBackground);
  const rowOutline = mixThemeHexColor(panelBackground, panelText, 0.18, panelText);
  const accent = String(runtimeTheme.defaultCursor || "#5bd2ff");
  const accentSoft = mixThemeHexColor(accent, panelBackground, 0.18, accent);
  const warmAccent = mixThemeHexColor("#ffb35c", accent, 0.18, "#ffb35c");
  const successAccent = mixThemeHexColor("#34c759", accent, 0.12, "#34c759");
  const dangerAccent = mixThemeHexColor("#ff6b6b", panelText, 0.08, "#ff6b6b");
  const themeCard = buildConnectionDiagnosticThemeStyles(runtimeTheme);
  return {
    cardStyle: `${themeCard.cardStyle}; --session-info-text: ${panelText}; --session-info-muted: ${toThemeRgba(
      panelText,
      0.68,
      "rgba(7, 16, 29, 0.68)"
    )}; --session-info-outline: ${toThemeRgba(rowOutline, 0.16, "rgba(7, 16, 29, 0.16)")}; --session-info-outline-strong: ${toThemeRgba(
      rowOutline,
      0.3,
      "rgba(7, 16, 29, 0.3)"
    )}; --session-info-shadow: ${toThemeRgba(contentBackground, 0.22, "rgba(9, 16, 29, 0.22)")}; --session-info-surface-top: ${toThemeRgba(
      rowSurfaceTop,
      0.94,
      "rgba(230, 240, 255, 0.94)"
    )}; --session-info-surface-bottom: ${toThemeRgba(
      rowSurfaceBottom,
      0.98,
      "rgba(230, 240, 255, 0.98)"
    )}; --session-info-accent: ${accent}; --session-info-accent-soft: ${toThemeRgba(
      accentSoft,
      0.28,
      "rgba(91, 210, 255, 0.28)"
    )}; --session-info-warm: ${warmAccent}; --session-info-warm-soft: ${toThemeRgba(
      warmAccent,
      0.24,
      "rgba(255, 179, 92, 0.24)"
    )}; --session-info-success: ${successAccent}; --session-info-success-soft: ${toThemeRgba(
      successAccent,
      0.18,
      "rgba(52, 199, 89, 0.18)"
    )}; --session-info-danger: ${dangerAccent}; --session-info-danger-soft: ${toThemeRgba(
      dangerAccent,
      0.16,
      "rgba(255, 107, 107, 0.16)"
    )};`,
    titleStyle: `color: ${panelText};`,
    heroStyle: `box-shadow: inset 0 0 0 1rpx ${toThemeRgba(
      rowOutline,
      0.12,
      "rgba(7, 16, 29, 0.12)"
    )}, 0 24rpx 50rpx -34rpx ${toThemeRgba(contentBackground, 0.28, "rgba(9, 16, 29, 0.28)")};`
  };
}

function localizeTerminalMessage(language, copyInput, rawMessage, extra) {
  const copy = copyInput && typeof copyInput === "object" ? copyInput : buildPageCopy(language, "terminal");
  const message = String(rawMessage || "").trim();
  if (!message) return message;
  const errors = (copy && copy.errors) || {};
  if (message === "服务器不存在") return errors.serverNotFound || message;
  if (message === "会话未连接") return errors.sessionNotConnected || message;
  if (message === "运维配置缺失，请联系管理员") return errors.opsConfigMissing || message;
  if (message === "网关错误") return errors.gatewayError || message;
  if (message === "连接异常") return errors.connectionException || message;
  if (message === "会话就绪超时") return errors.sessionReadyTimeout || message;
  if (message === "服务器配置不完整") return errors.serverConfigIncomplete || message;
  if (message === "连接失败") return errors.connectionFailed || message;
  if (message === "会话已断开") return errors.sessionDisconnected || message;
  if (message === "等待会话连接超时") return errors.waitSessionTimeout || message;
  if (message === "Codex 启动失败") return errors.codexLaunchFailed || message;
  if (message === "Copilot 启动失败") return errors.copilotLaunchFailed || message;
  if (message === "服务器未装codex") return errors.codexNotInstalled || message;
  if (message === "Codex 正在启动中") return errors.codexLaunching || message;
  if (message === "等待 Codex 启动结果超时") return errors.waitCodexTimeout || message;
  if (message === "隐私授权失败") return errors.privacyAuthFailed || message;
  if (message === "未同意隐私协议，暂时无法使用录音") return errors.privacyDenied || message;
  if (
    message ===
    "小程序后台未完成隐私声明，录音接口已被微信平台禁用，请在微信公众平台补充用户隐私保护指引后重新提审并发布"
  ) {
    return errors.privacyApiBanned || message;
  }
  if (
    message ===
    "小程序隐私指引未声明录音相关用途，请在微信公众平台“服务内容声明-用户隐私保护指引”补充麦克风采集说明"
  ) {
    return errors.privacyScopeUndeclared || message;
  }
  if (message === "麦克风权限未开启，请在设置中允许录音") return errors.micPermissionDenied || message;
  if (message === "读取麦克风权限失败") return errors.micPermissionReadFailed || message;
  if (message === "录音器忙，请稍后重试") return errors.recorderBusy || message;
  if (message === "录音采集失败") return errors.recordCaptureFailed || message;
  if (message === "语音识别失败") return errors.asrFailed || message;
  if (message === "语音网关连接失败，请检查小程序 socket 合法域名") return errors.asrGatewayFailed || message;
  if (message === "语音网关连接失败，请检查网络或网关配置") {
    return errors.asrGatewayConnectFailed || message;
  }
  if (message === "语音服务连接超时，请稍后重试") return errors.asrTimeout || message;
  if (message === "剪贴板为空") return errors.clipboardEmpty || message;
  if (message === "读取剪贴板失败") return errors.clipboardReadFailed || message;
  if (message === "无可记录内容") return errors.noRecordContent || message;
  if (message === "已记录到闪念列表") return errors.recordSaved || message;
  if (message === "当前没有可播报内容") return errors.noSpeakableContent || message;
  if (message === "当前内容不适合播报") return errors.contentNotSpeakable || message;
  if (message === "播报文本过长") return errors.ttsTextTooLong || message;
  if (message === "语音生成超时，请稍后重试") return errors.ttsTimeout || message;
  if (message.startsWith("TTS 上游鉴权或权限失败，请检查密钥、地域和账号权限")) {
    return errors.ttsUpstreamRejected || message;
  }
  if (message === "语音生成失败") return errors.ttsSynthesizeFailed || message;
  if (message === "音频播放失败，请检查网络") return errors.ttsPlayFailed || message;
  if (message === "TTS 服务未配置") return errors.ttsUnavailable || message;
  if (/^codex工作目录(.+)不存在$/.test(message)) {
    const matched = message.match(/^codex工作目录(.+)不存在$/);
    const projectPath = matched ? matched[1] : (extra && extra.projectPath) || "";
    if (errors.codexWorkingDirMissing) {
      return formatTemplate(errors.codexWorkingDirMissing, { projectPath });
    }
    if (normalizeUiLanguage(language) === "en")
      return `Codex working directory ${projectPath} does not exist`;
    if (normalizeUiLanguage(language) === "zh-Hant") return `codex 工作目錄 ${projectPath} 不存在`;
  }
  return localizeServerValidationMessage(language, message);
}

/**
 * 终端页（对齐 Web TerminalView 的视觉骨架）：
 * 1. 顶部工具栏：codex/清屏 + 状态/时延芯片 + 连接动作开关；
 * 2. 中部：输出区 + 输入区；
 * 3. 底部：Frame2256 语音区（voice/record/send + clear/cancel）。
 */
Page({
  data: {
    ...buildSvgButtonPressData(),
    themeStyle: "",
    uiButtonIcons: {},
    uiButtonActiveIcons: {},
    uiButtonAccentIcons: {},
    terminalToolIcons: {},
    terminalToolActiveIcons: {},
    terminalTouchToggleIcon: "",
    terminalTouchTogglePressedIcon: "",
    copy: buildPageCopy("zh-Hans", "terminal"),
    serverId: "",
    serverLabel: "remoteconn",
    sessionId: "-",
    statusText: "idle",
    statusLabel: getStatusLabel("zh-Hans", "idle"),
    statusClass: "idle",
    disconnectedHintVisible: false,
    disconnectedHintText: DISCONNECTED_HINT_TEXT,
    latencyMs: "--",
    connectionDiagnosticsVisible: false,
    sessionInfoVisible: false,
    sessionInfoTitle: "会话信息",
    sessionInfoHero: {
      eyebrow: "",
      name: "",
      subtitle: "",
      routeLabel: "",
      route: ""
    },
    sessionInfoStatusChips: [],
    sessionInfoDetailItems: [],
    sessionInfoTheme: {
      cardStyle: "",
      titleStyle: "",
      heroStyle: ""
    },
    connectionDiagnosticResponseSamples: [],
    connectionDiagnosticNetworkSamples: [],
    connectionDiagnosticCombinedChart: {
      imageUri: "",
      cardStyle: "",
      responseMetricStyle: "",
      responseCardLabel: "网关响应(ms)",
      responseStatItems: [],
      networkMetricStyle: "",
      networkCardLabel: "网络时延(ms)",
      networkStatItems: [],
      chartImageShellStyle: ""
    },
    connectionActionText: "重连",
    connectionActionReconnect: true,
    connectionActionDisabled: false,
    ttsEnabled: false,
    ttsState: "idle",
    ttsRoundId: "",
    ttsCurrentRoundText: "",
    ttsLastStableHash: "",
    ttsLastAudioUrl: "",
    ttsErrorMessage: "",
    ttsSpeakableMaxChars: DEFAULT_TTS_SPEAKABLE_MAX_CHARS,
    ttsSegmentMaxChars: DEFAULT_TTS_SEGMENT_MAX_CHARS,
    aiLaunchBusy: false,
    activeAiProvider: "",
    outputRenderLines: [],
    outputScrollTop: 0,
    outputTopSpacerPx: 0,
    outputBottomSpacerPx: 0,
    outputKeyboardInsetPx: 0,
    outputLineHeightPx: 21,
    shellInputFocus: false,
    shellInputValue: "",
    shellInputCursor: 0,
    terminalCaretVisible: false,
    terminalCaretLeftPx: 0,
    terminalCaretTopPx: 0,
    terminalCaretHeightPx: 24,
    activationDebugEnabled: ENABLE_SHELL_ACTIVATION_DEBUG_OVERLAY,
    shellMetricsAsciiProbeText: SHELL_METRICS_ASCII_PROBE_TEXT,
    shellMetricsWideProbeText: SHELL_METRICS_WIDE_PROBE_TEXT,
    activationDebugVisible: ENABLE_SHELL_ACTIVATION_DEBUG_OVERLAY,
    activationDebugTopPx: 0,
    activationDebugHeightPx: 0,
    inputText: "",
    draftText: "",
    showVoiceInputButton: true,
    voiceRecordCategories: [],
    selectedRecordCategory: "",
    voicePanelVisible: false,
    voiceFloatLeft: VOICE_FLOAT_GAP_PX,
    voiceFloatBottom: VOICE_FLOAT_GAP_PX,
    voicePanelWidthPx: 320,
    voiceButtonSizePx: 32,
    voiceActionsOffsetX: 0,
    frameOpacity: VOICE_IDLE_OPACITY,
    voiceHolding: false,
    touchToolsExpanded: false,
    touchShiftMode: TOUCH_SHIFT_MODE_OFF,
    terminalTouchDirectionKeys: TERMINAL_TOUCH_DIRECTION_KEYS,
    terminalTouchActionButtons: TERMINAL_TOUCH_ACTION_BUTTONS
  },

  getCurrentLanguage(settingsInput) {
    const source = settingsInput && typeof settingsInput === "object" ? settingsInput : getSettings();
    return normalizeUiLanguage(source.uiLanguage);
  },

  applyLocale(settingsInput, statusInput) {
    const settings = settingsInput && typeof settingsInput === "object" ? settingsInput : getSettings();
    const language = this.getCurrentLanguage(settings);
    const copy = buildPageCopy(language, "terminal");
    const status = String(statusInput || this.data.statusText || "idle");
    wx.setNavigationBarTitle({ title: copy.navTitle || "终端" });
    return {
      copy,
      statusLabel: getStatusLabel(language, status),
      disconnectedHintText: copy.disconnectedHint || DISCONNECTED_HINT_TEXT,
      connectionActionText: RECONNECT_STATES.has(status)
        ? copy?.connectionAction?.reconnect || "重连"
        : copy?.connectionAction?.disconnect || "断开"
    };
  },

  localizeTerminalMessage(rawMessage, extra) {
    return localizeTerminalMessage(this.getCurrentLanguage(), this.data.copy, rawMessage, extra);
  },

  showLocalizedToast(rawMessage, icon, extra) {
    wx.showToast({
      title: this.localizeTerminalMessage(rawMessage, extra),
      icon: icon || "none"
    });
  },

  normalizeActiveAiProvider(provider) {
    const normalized = String(provider || "").trim();
    return normalized === "codex" || normalized === "copilot" ? normalized : "";
  },

  resolveActiveAiProviderLabel(provider) {
    return this.normalizeActiveAiProvider(provider) === "copilot" ? "Copilot" : "Codex";
  },

  /**
   * AI 前台态需要跟着当前终端会话一起续接：
   * 1. 挂起/恢复时保留 provider，避免回到旧会话后又把启动命令打进正在运行的 AI；
   * 2. 断开/异常时清空，避免把已销毁的前台态误带到新 SSH 会话。
   */
  syncActiveAiProvider(provider, options) {
    const normalized = this.normalizeActiveAiProvider(provider);
    this.activeAiProvider = normalized;
    if (this.data.activeAiProvider !== normalized) {
      this.setData({
        activeAiProvider: normalized,
        ...this.buildSessionInfoPayload({ activeAiProvider: normalized })
      });
    }
    if (normalized !== "codex") {
      this.activeCodexSandboxMode = "";
    }
    if (!normalized) {
      this.aiRuntimeExitCarry = "";
      this.pendingCodexResumeAfterReconnect = false;
    }
    if (this.ttsRuntime && normalized !== "codex") {
      this.ttsRuntime.codexReady = false;
    }
    if (options && options.persist === false) {
      return normalized;
    }
    const status = String(this.data.statusText || "");
    if (["connecting", "auth_pending", "connected"].includes(status)) {
      this.persistTerminalSessionStatus(status);
    }
    return normalized;
  },

  notifyAiAlreadyRunning(provider) {
    const label = this.resolveActiveAiProviderLabel(provider || this.activeAiProvider);
    const template =
      (this.data.copy && this.data.copy.toast && this.data.copy.toast.aiAlreadyRunning) ||
      "{provider} 正在当前会话中运行，请先退出后再重启";
    wx.showToast({
      title: formatTemplate(template, { provider: label }),
      icon: "none"
    });
  },

  ensureAiLaunchAllowed() {
    const activeProvider = this.normalizeActiveAiProvider(this.activeAiProvider);
    if (!activeProvider) {
      return true;
    }
    this.notifyAiAlreadyRunning(activeProvider);
    return false;
  },

  /**
   * 退出标记使用未知 OSC：
   * - 命中时解除当前会话的 AI 前台锁；
   * - 不命中时原样透传文本，不影响 VT 语义；
   * - 若 chunk 末尾只到了一半控制序列，仅缓存那段 `ESC ] ...` 尾巴。
   */
  consumeAiRuntimeOutput(data) {
    const chunk = String(data || "");
    if (!chunk) {
      return chunk;
    }
    const result = consumeAiRuntimeExitMarkers(chunk, this.aiRuntimeExitCarry);
    this.aiRuntimeExitCarry = result.carry;
    if (Array.isArray(result.exitedProviders) && result.exitedProviders.length > 0) {
      const exitedProvider = this.normalizeActiveAiProvider(
        result.exitedProviders[result.exitedProviders.length - 1]
      );
      if (!this.activeAiProvider || !exitedProvider || this.activeAiProvider === exitedProvider) {
        this.syncActiveAiProvider("");
      }
    }
    return result.text;
  },

  applyTtsInnerAudioOptions() {
    if (typeof wx === "undefined" || typeof wx.setInnerAudioOption !== "function") {
      return;
    }
    try {
      wx.setInnerAudioOption({
        mixWithOther: true,
        obeyMuteSwitch: false,
        fail: (error) => {
          console.warn("[terminal.tts.set_inner_audio_option]", error);
        }
      });
    } catch (error) {
      console.warn("[terminal.tts.set_inner_audio_option]", error);
    }
  },

  initTtsRuntime() {
    this.ttsRuntime = {
      codexReady: false,
      roundSeq: 0,
      round: null,
      stableTimer: null,
      confirmTimer: null,
      audioContext: null,
      pendingAudioUrl: "",
      playbackJobSeq: 0,
      activePlaybackJobId: 0,
      playQueue: [],
      playingSegmentIndex: -1,
      playbackPhase: "idle",
      playbackKickTimer: null,
      playbackLoadTimer: null
    };
  },

  getTtsSpeakableBuildOptions() {
    return {
      maxChars: normalizeTtsSpeakableMaxChars(this.data.ttsSpeakableMaxChars)
    };
  },

  getTtsSegmentSplitOptions() {
    return {
      maxChars: normalizeTtsSegmentMaxChars(this.data.ttsSegmentMaxChars)
    };
  },

  clearTtsStabilityTimers() {
    if (!this.ttsRuntime) return;
    if (this.ttsRuntime.stableTimer) {
      clearTimeout(this.ttsRuntime.stableTimer);
      this.ttsRuntime.stableTimer = null;
    }
    if (this.ttsRuntime.confirmTimer) {
      clearTimeout(this.ttsRuntime.confirmTimer);
      this.ttsRuntime.confirmTimer = null;
    }
  },

  clearTtsPlaybackTimers() {
    if (!this.ttsRuntime) return;
    if (this.ttsRuntime.playbackKickTimer) {
      clearTimeout(this.ttsRuntime.playbackKickTimer);
      this.ttsRuntime.playbackKickTimer = null;
    }
    if (this.ttsRuntime.playbackLoadTimer) {
      clearTimeout(this.ttsRuntime.playbackLoadTimer);
      this.ttsRuntime.playbackLoadTimer = null;
    }
  },

  finishTtsRoundCapture() {
    if (!this.ttsRuntime) return;
    this.clearTtsStabilityTimers();
    this.ttsRuntime.round = null;
    this.setData({
      ttsRoundId: "",
      ttsCurrentRoundText: ""
    });
  },

  clearTtsPlaybackQueue() {
    if (!this.ttsRuntime) return;
    this.clearTtsPlaybackTimers();
    this.ttsRuntime.activePlaybackJobId = 0;
    this.ttsRuntime.playQueue = [];
    this.ttsRuntime.playingSegmentIndex = -1;
    this.ttsRuntime.pendingAudioUrl = "";
    this.ttsRuntime.playbackPhase = "idle";
  },

  createTtsPlaybackJob(segments) {
    if (!this.ttsRuntime) {
      this.initTtsRuntime();
    }
    const runtime = this.ttsRuntime;
    runtime.playbackJobSeq += 1;
    runtime.activePlaybackJobId = runtime.playbackJobSeq;
    runtime.playQueue = (Array.isArray(segments) ? segments : []).map((text) => ({
      text: String(text || ""),
      playbackUrl: "",
      remoteAudioUrl: "",
      ready: false,
      promise: null,
      useRemotePlayback: false
    }));
    runtime.playingSegmentIndex = -1;
    runtime.pendingAudioUrl = "";
    runtime.playbackPhase = "idle";
    return runtime.activePlaybackJobId;
  },

  isActiveTtsPlaybackJob(jobId) {
    return !!this.ttsRuntime && Number(jobId) > 0 && this.ttsRuntime.activePlaybackJobId === Number(jobId);
  },

  async prepareTtsQueueItem(jobId, segmentIndex) {
    if (!this.isActiveTtsPlaybackJob(jobId) || !this.ttsRuntime) {
      return null;
    }
    const runtime = this.ttsRuntime;
    const item = runtime.playQueue[segmentIndex];
    if (!item) {
      return null;
    }
    if (item.ready && item.playbackUrl) {
      return item;
    }
    if (item.promise) {
      return item.promise;
    }

    const task = synthesizeTerminalSpeech({
      text: item.text
    })
      .then((response) => {
        if (!this.isActiveTtsPlaybackJob(jobId)) {
          return null;
        }
        item.playbackUrl = String(response.audioUrl || "").trim();
        item.remoteAudioUrl = String(response.remoteAudioUrl || response.audioUrl || "").trim();
        item.ready = !!item.playbackUrl;
        return item.ready ? item : null;
      })
      .finally(() => {
        if (item.promise === task) {
          item.promise = null;
        }
      });

    item.promise = task;
    return task;
  },

  prefetchNextTtsQueueItem(jobId, currentIndex) {
    if (!this.isActiveTtsPlaybackJob(jobId) || !this.ttsRuntime) {
      return;
    }
    const nextIndex = Number(currentIndex) + 1;
    const nextItem = this.ttsRuntime.playQueue[nextIndex];
    if (!nextItem || nextItem.ready || nextItem.promise) {
      return;
    }
    this.prepareTtsQueueItem(jobId, nextIndex).catch((error) => {
      if (!this.isActiveTtsPlaybackJob(jobId)) {
        return;
      }
      console.warn("[terminal.tts.prefetch]", error);
    });
  },

  failTtsPlayback(rawMessage) {
    const message = this.localizeTerminalMessage(rawMessage);
    if (this.ttsRuntime && this.ttsRuntime.audioContext) {
      this.clearTtsPlaybackTimers();
      this.ttsRuntime.playbackPhase = "stopping";
      this.ttsRuntime.pendingAudioUrl = "";
      try {
        this.ttsRuntime.audioContext.stop();
      } catch (error) {
        console.warn("[terminal.tts.fail.stop]", error);
      }
    }
    if (this.ttsRuntime) {
      this.clearTtsPlaybackQueue();
    }
    this.setData({
      ttsState: "error",
      ttsErrorMessage: message
    });
    this.showLocalizedToast(rawMessage, "none");
  },

  scheduleTtsPlaybackLoadGuards(jobId, segmentIndex, playbackUrl) {
    if (!this.isActiveTtsPlaybackJob(jobId) || !this.ttsRuntime || !this.ttsRuntime.audioContext) {
      return;
    }
    const runtime = this.ttsRuntime;
    const expectedUrl = String(playbackUrl || "").trim();
    if (!expectedUrl) {
      return;
    }
    this.clearTtsPlaybackTimers();
    runtime.playbackKickTimer = setTimeout(() => {
      if (!this.isActiveTtsPlaybackJob(jobId) || !this.ttsRuntime || !this.ttsRuntime.audioContext) {
        return;
      }
      if (this.ttsRuntime.playbackPhase !== "loading") {
        return;
      }
      if (this.ttsRuntime.playingSegmentIndex !== segmentIndex) {
        return;
      }
      const pendingAudioUrl = String(this.ttsRuntime.pendingAudioUrl || "");
      if (pendingAudioUrl !== expectedUrl) {
        return;
      }
      if (String(this.ttsRuntime.audioContext.src || "") !== expectedUrl) {
        return;
      }
      try {
        this.ttsRuntime.audioContext.play();
      } catch (error) {
        console.warn("[terminal.tts.play.kick]", error);
      }
    }, TTS_PLAYBACK_START_KICK_MS);
    runtime.playbackLoadTimer = setTimeout(() => {
      if (!this.isActiveTtsPlaybackJob(jobId) || !this.ttsRuntime) {
        return;
      }
      if (this.ttsRuntime.playbackPhase !== "loading") {
        return;
      }
      if (this.ttsRuntime.playingSegmentIndex !== segmentIndex) {
        return;
      }
      const pendingAudioUrl = String(this.ttsRuntime.pendingAudioUrl || "");
      if (pendingAudioUrl !== expectedUrl) {
        return;
      }
      const recovered = this.retryTtsQueueSegmentPlayback(jobId, segmentIndex, "load_timeout");
      if (!recovered) {
        this.failTtsPlayback("音频播放失败，请检查网络");
      }
    }, TTS_PLAYBACK_LOAD_TIMEOUT_MS);
  },

  retryTtsQueueSegmentPlayback(jobId, segmentIndex, reason) {
    if (!this.isActiveTtsPlaybackJob(jobId) || !this.ttsRuntime) {
      return false;
    }
    const item = this.ttsRuntime.playQueue[segmentIndex];
    if (!item) {
      return false;
    }
    const remoteAudioUrl = String(item.remoteAudioUrl || "").trim();
    const localAudioUrl = String(item.playbackUrl || "").trim();
    /**
     * 优先用本地缓存是为了缩短首播等待；
     * 但若缓存文件在个别机型上偶发不可播，则只允许回退一次远端 URL。
     */
    if (!remoteAudioUrl || remoteAudioUrl === localAudioUrl || item.useRemotePlayback) {
      return false;
    }
    const audioContext = this.replaceTtsAudioContext();
    item.useRemotePlayback = true;
    this.clearTtsPlaybackTimers();
    if (this.ttsRuntime) {
      this.ttsRuntime.playbackPhase = "switching";
    }
    if (!this.ttsRuntime) {
      return false;
    }
    this.ttsRuntime.pendingAudioUrl = remoteAudioUrl;
    this.ttsRuntime.playbackPhase = "loading";
    this.setData({
      ttsLastAudioUrl: remoteAudioUrl,
      ttsErrorMessage: "",
      ttsState: "preparing"
    });
    audioContext.src = remoteAudioUrl;
    this.scheduleTtsPlaybackLoadGuards(jobId, segmentIndex, remoteAudioUrl);
    console.warn("[terminal.tts.retry_remote]", { reason, segmentIndex });
    return true;
  },

  async playTtsQueueSegment(jobId, segmentIndex) {
    if (!this.isActiveTtsPlaybackJob(jobId) || !this.ttsRuntime) {
      return false;
    }
    const item = await this.prepareTtsQueueItem(jobId, segmentIndex);
    if (!item || !this.isActiveTtsPlaybackJob(jobId) || !this.ttsRuntime) {
      return false;
    }
    const playbackUrl =
      item.useRemotePlayback && item.remoteAudioUrl
        ? String(item.remoteAudioUrl || "").trim()
        : String(item.playbackUrl || "").trim();
    if (!playbackUrl) {
      return false;
    }
    const audioContext = this.replaceTtsAudioContext();
    this.ttsRuntime.playingSegmentIndex = segmentIndex;
    this.ttsRuntime.pendingAudioUrl = playbackUrl;
    this.ttsRuntime.playbackPhase = "loading";
    this.setData({
      ttsLastAudioUrl: item.remoteAudioUrl,
      ttsErrorMessage: "",
      ttsState: "preparing"
    });
    audioContext.src = playbackUrl;
    this.scheduleTtsPlaybackLoadGuards(jobId, segmentIndex, playbackUrl);
    return true;
  },

  async continueTtsPlaybackQueue(jobId) {
    if (!this.isActiveTtsPlaybackJob(jobId) || !this.ttsRuntime) {
      return;
    }
    const nextIndex = this.ttsRuntime.playingSegmentIndex + 1;
    if (nextIndex >= this.ttsRuntime.playQueue.length) {
      this.clearTtsPlaybackQueue();
      this.setData({ ttsState: "idle" });
      return;
    }
    try {
      const started = await this.playTtsQueueSegment(jobId, nextIndex);
      if (!started && this.isActiveTtsPlaybackJob(jobId)) {
        this.clearTtsPlaybackQueue();
        this.setData({ ttsState: "idle" });
      }
    } catch (error) {
      if (!this.isActiveTtsPlaybackJob(jobId)) {
        return;
      }
      this.clearTtsPlaybackQueue();
      const rawMessage = error instanceof Error && error.message ? error.message : "语音生成失败";
      const message = this.localizeTerminalMessage(rawMessage);
      this.setData({
        ttsState: "error",
        ttsErrorMessage: message
      });
      this.showLocalizedToast(rawMessage, "none");
    }
  },

  releaseTtsAudioContext(audioContext, logSuffix) {
    const target = audioContext || null;
    if (!target) {
      return;
    }
    try {
      if (typeof target.stop === "function") {
        target.stop();
      }
    } catch (error) {
      console.warn(`[terminal.tts.stop.${logSuffix || "release"}]`, error);
    }
    try {
      if (typeof target.destroy === "function") {
        target.destroy();
      }
    } catch (error) {
      console.warn(`[terminal.tts.destroy.${logSuffix || "release"}]`, error);
    }
  },

  createTtsAudioContext() {
    if (!this.ttsRuntime) {
      this.initTtsRuntime();
    }
    this.applyTtsInnerAudioOptions();
    const audioContext = wx.createInnerAudioContext();
    if ("autoplay" in audioContext) {
      audioContext.autoplay = false;
    }
    if ("obeyMuteSwitch" in audioContext) {
      audioContext.obeyMuteSwitch = false;
    }
    audioContext.onCanplay(() => {
      if (!this.data.ttsEnabled || !this.ttsRuntime) return;
      if (this.ttsRuntime.audioContext !== audioContext) return;
      if (this.ttsRuntime.playbackPhase !== "loading") return;
      if (!this.ttsRuntime.activePlaybackJobId) return;
      const pendingAudioUrl = String(this.ttsRuntime.pendingAudioUrl || "");
      if (!pendingAudioUrl) return;
      if (String(audioContext.src || "") !== pendingAudioUrl) return;
      try {
        audioContext.play();
      } catch (error) {
        console.warn("[terminal.tts.play.on_canplay]", error);
      }
    });
    audioContext.onPlay(() => {
      if (!this.data.ttsEnabled || !this.ttsRuntime) return;
      if (this.ttsRuntime.audioContext !== audioContext) return;
      if (!this.ttsRuntime.activePlaybackJobId) return;
      if (this.ttsRuntime.playbackPhase !== "loading" && this.ttsRuntime.playbackPhase !== "playing") {
        return;
      }
      this.clearTtsPlaybackTimers();
      this.ttsRuntime.playbackPhase = "playing";
      this.ttsRuntime.pendingAudioUrl = "";
      this.prefetchNextTtsQueueItem(this.ttsRuntime.activePlaybackJobId, this.ttsRuntime.playingSegmentIndex);
      this.setData({
        ttsState: "playing",
        ttsErrorMessage: ""
      });
    });
    audioContext.onEnded(() => {
      if (!this.data.ttsEnabled) return;
      if (!this.ttsRuntime || this.ttsRuntime.audioContext !== audioContext) {
        return;
      }
      if (!this.ttsRuntime || this.ttsRuntime.playbackPhase !== "playing") {
        return;
      }
      this.clearTtsPlaybackTimers();
      if (this.ttsRuntime) {
        this.ttsRuntime.pendingAudioUrl = "";
        this.ttsRuntime.playbackPhase = "advancing";
      }
      const jobId = this.ttsRuntime ? this.ttsRuntime.activePlaybackJobId : 0;
      if (jobId && this.ttsRuntime) {
        this.setData({ ttsState: "preparing" });
        this.continueTtsPlaybackQueue(jobId);
        return;
      }
      this.setData({ ttsState: "idle" });
    });
    audioContext.onStop(() => {
      if (!this.data.ttsEnabled) return;
      if (!this.ttsRuntime || this.ttsRuntime.audioContext !== audioContext) {
        return;
      }
      const playbackPhase = String((this.ttsRuntime && this.ttsRuntime.playbackPhase) || "idle");
      if (playbackPhase === "switching") {
        return;
      }
      const pendingAudioUrl = String((this.ttsRuntime && this.ttsRuntime.pendingAudioUrl) || "");
      const currentSrc = String(audioContext.src || "");
      /**
       * 切换到下一段音频前会先 `stop()` 当前播放，但 `onStop` 回调可能晚于新 `src` 赋值。
       * 这时若直接清掉 `pendingAudioUrl`，后续 `onCanplay` 将不会触发真正播放。
       */
      if (playbackPhase === "loading" && pendingAudioUrl && currentSrc === pendingAudioUrl) {
        return;
      }
      this.clearTtsPlaybackTimers();
      if (this.ttsRuntime) {
        this.ttsRuntime.pendingAudioUrl = "";
        this.ttsRuntime.playbackPhase = "idle";
      }
      if (this.data.ttsState === "error") return;
      this.setData({ ttsState: "idle" });
    });
    audioContext.onError((error) => {
      if (!this.data.ttsEnabled || !this.ttsRuntime) return;
      if (this.ttsRuntime.audioContext !== audioContext) return;
      const playbackPhase = String(this.ttsRuntime.playbackPhase || "idle");
      const jobId = this.ttsRuntime ? this.ttsRuntime.activePlaybackJobId : 0;
      const segmentIndex = this.ttsRuntime ? this.ttsRuntime.playingSegmentIndex : -1;
      if (
        !jobId ||
        playbackPhase === "idle" ||
        playbackPhase === "stopping" ||
        playbackPhase === "switching"
      ) {
        return;
      }
      if (
        jobId > 0 &&
        segmentIndex >= 0 &&
        this.retryTtsQueueSegmentPlayback(jobId, segmentIndex, "play_error")
      ) {
        return;
      }
      console.warn("[terminal.tts.play.error]", error);
      this.failTtsPlayback("音频播放失败，请检查网络");
    });
    return audioContext;
  },

  replaceTtsAudioContext() {
    if (!this.ttsRuntime) {
      this.initTtsRuntime();
    }
    const previousAudioContext = this.ttsRuntime.audioContext;
    this.ttsRuntime.audioContext = null;
    if (previousAudioContext) {
      /**
       * 每次切段或从本地缓存回退到远端 URL，都直接换一个全新的播放器实例。
       * 这样旧实例迟到的 `stop/error/ended` 事件会因为身份不匹配被丢弃，不再污染新片段状态。
       */
      this.releaseTtsAudioContext(previousAudioContext, "before_replace");
    }
    const nextAudioContext = this.createTtsAudioContext();
    this.ttsRuntime.audioContext = nextAudioContext;
    return nextAudioContext;
  },

  ensureTtsAudioContext() {
    if (!this.ttsRuntime) {
      this.initTtsRuntime();
    }
    if (this.ttsRuntime.audioContext) {
      return this.ttsRuntime.audioContext;
    }
    const audioContext = this.createTtsAudioContext();
    this.ttsRuntime.audioContext = audioContext;
    return audioContext;
  },

  stopTtsPlayback(options) {
    if (!this.ttsRuntime || !this.ttsRuntime.audioContext) {
      if (!options || options.clearQueue !== false) {
        this.clearTtsPlaybackQueue();
      }
      return;
    }
    if (!options || options.clearQueue !== false) {
      this.clearTtsPlaybackQueue();
    }
    this.clearTtsPlaybackTimers();
    this.ttsRuntime.playbackPhase = "stopping";
    this.ttsRuntime.pendingAudioUrl = "";
    try {
      this.ttsRuntime.audioContext.stop();
    } catch (error) {
      console.warn("[terminal.tts.stop]", error);
    }
  },

  destroyTtsAudioContext() {
    if (!this.ttsRuntime || !this.ttsRuntime.audioContext) {
      return;
    }
    const audioContext = this.ttsRuntime.audioContext;
    this.clearTtsPlaybackQueue();
    this.clearTtsPlaybackTimers();
    this.ttsRuntime.pendingAudioUrl = "";
    this.ttsRuntime.playbackPhase = "stopping";
    this.ttsRuntime.audioContext = null;
    this.releaseTtsAudioContext(audioContext, "before_destroy");
  },

  resetTtsRoundState(options) {
    const runtime = this.ttsRuntime;
    if (!runtime) return;
    const config = options && typeof options === "object" ? options : {};
    this.clearTtsStabilityTimers();
    runtime.round = null;
    if (config.stopPlayback !== false) {
      this.stopTtsPlayback();
    } else {
      this.clearTtsPlaybackQueue();
    }
    const nextData = {
      ttsRoundId: "",
      ttsCurrentRoundText: "",
      ttsLastStableHash: config.keepStableHash ? this.data.ttsLastStableHash : "",
      ttsLastAudioUrl: config.keepAudioUrl ? this.data.ttsLastAudioUrl : "",
      ttsState: config.keepState ? this.data.ttsState : "idle",
      ttsErrorMessage: config.keepError ? this.data.ttsErrorMessage : ""
    };
    if (config.enabled === false) {
      nextData.ttsEnabled = false;
    }
    this.setData(nextData);
  },

  setTtsEnabled(enabled) {
    const nextEnabled = !!enabled;
    if (!nextEnabled) {
      this.resetTtsRoundState({
        enabled: false,
        stopPlayback: true
      });
      return;
    }
    this.setData({
      ttsEnabled: true,
      ttsState: "idle",
      ttsErrorMessage: ""
    });
  },

  onToggleTts() {
    this.setTtsEnabled(!this.data.ttsEnabled);
  },

  maybeStartTtsRound(source) {
    if (!this.data.ttsEnabled || !this.ttsRuntime || !this.ttsRuntime.codexReady) {
      return;
    }
    this.clearTtsStabilityTimers();
    this.stopTtsPlayback();
    const roundId = `tts-${Date.now()}-${++this.ttsRuntime.roundSeq}`;
    this.ttsRuntime.round = {
      id: roundId,
      source: String(source || "unknown"),
      text: "",
      changeSeq: 0
    };
    this.setData({
      ttsRoundId: roundId,
      ttsCurrentRoundText: "",
      ttsLastStableHash: "",
      ttsLastAudioUrl: "",
      ttsState: "idle",
      ttsErrorMessage: ""
    });
  },

  appendTtsRoundOutput(text) {
    if (!this.data.ttsEnabled || !this.ttsRuntime || !this.ttsRuntime.round) {
      return;
    }
    const chunk = String(text || "");
    if (!chunk) {
      return;
    }
    const round = this.ttsRuntime.round;
    round.text = `${round.text}${chunk}`;
    if (round.text.length > TTS_ROUND_TEXT_MAX_CHARS) {
      round.text = round.text.slice(-TTS_ROUND_TEXT_MAX_CHARS);
    }
    round.changeSeq += 1;
    if (this.data.ttsState === "preparing") {
      this.setData({ ttsState: "idle" });
    }
    this.scheduleTtsStabilityCheck();
  },

  resolveTtsStableDelay() {
    if (!this.ttsRuntime || !this.ttsRuntime.round) {
      return TTS_STABLE_INCOMPLETE_MS;
    }
    const candidate = buildSpeakableTerminalText(
      this.ttsRuntime.round.text,
      this.getTtsSpeakableBuildOptions()
    );
    return isSpeakableTextLikelyComplete(candidate) ? TTS_STABLE_SENTENCE_MS : TTS_STABLE_INCOMPLETE_MS;
  },

  scheduleTtsStabilityCheck() {
    if (!this.ttsRuntime || !this.ttsRuntime.round) {
      return;
    }
    const roundId = this.ttsRuntime.round.id;
    const changeSeq = this.ttsRuntime.round.changeSeq;
    this.clearTtsStabilityTimers();
    this.ttsRuntime.stableTimer = setTimeout(() => {
      if (this.ttsRuntime) {
        this.ttsRuntime.stableTimer = null;
      }
      this.confirmTtsRoundStable(roundId, changeSeq);
    }, this.resolveTtsStableDelay());
  },

  confirmTtsRoundStable(roundId, changeSeq) {
    if (!this.data.ttsEnabled || !this.ttsRuntime || !this.ttsRuntime.round) {
      return;
    }
    const round = this.ttsRuntime.round;
    if (round.id !== roundId || round.changeSeq !== changeSeq) {
      return;
    }
    const speakableOptions = this.getTtsSpeakableBuildOptions();
    const firstText = buildSpeakableTerminalText(round.text, speakableOptions);
    const firstHash = buildStableTextHash(firstText);
    this.ttsRuntime.confirmTimer = setTimeout(() => {
      if (this.ttsRuntime) {
        this.ttsRuntime.confirmTimer = null;
      }
      if (!this.data.ttsEnabled || !this.ttsRuntime || !this.ttsRuntime.round) {
        return;
      }
      const activeRound = this.ttsRuntime.round;
      if (activeRound.id !== roundId || activeRound.changeSeq !== changeSeq) {
        return;
      }
      const stableText = buildSpeakableTerminalText(activeRound.text, speakableOptions);
      if (!stableText) {
        this.setData({
          ttsState: "idle",
          ttsCurrentRoundText: "",
          ttsErrorMessage: ""
        });
        return;
      }
      const stableHash = buildStableTextHash(stableText);
      if (stableHash !== firstHash) {
        this.scheduleTtsStabilityCheck();
        return;
      }
      if (this.data.ttsLastStableHash === stableHash) {
        return;
      }
      this.setData({
        ttsState: "preparing",
        ttsCurrentRoundText: stableText,
        ttsLastStableHash: stableHash,
        ttsErrorMessage: ""
      });
      this.requestTtsPlayback(roundId, changeSeq, stableText, stableHash);
    }, TTS_STABLE_CONFIRM_MS);
  },

  async requestTtsPlayback(roundId, changeSeq, stableText, stableHash) {
    try {
      const segments = splitSpeakableTextForTts(stableText, this.getTtsSegmentSplitOptions());
      if (!segments.length) {
        this.setData({
          ttsState: "idle",
          ttsCurrentRoundText: "",
          ttsErrorMessage: ""
        });
        this.finishTtsRoundCapture();
        return;
      }
      if (!this.data.ttsEnabled || !this.ttsRuntime || !this.ttsRuntime.round) {
        return;
      }
      const round = this.ttsRuntime.round;
      if (round.id !== roundId || round.changeSeq !== changeSeq) {
        return;
      }
      this.stopTtsPlayback();
      const playbackJobId = this.createTtsPlaybackJob(segments);
      this.setData({
        ttsLastStableHash: stableHash,
        ttsLastAudioUrl: "",
        ttsErrorMessage: "",
        ttsState: "preparing"
      });
      this.finishTtsRoundCapture();
      const started = await this.playTtsQueueSegment(playbackJobId, 0);
      if (!started && this.isActiveTtsPlaybackJob(playbackJobId)) {
        this.clearTtsPlaybackQueue();
        this.setData({
          ttsState: "idle",
          ttsErrorMessage: ""
        });
      }
    } catch (error) {
      if (!this.data.ttsEnabled || !this.ttsRuntime) {
        return;
      }
      const round = this.ttsRuntime.round;
      if (round && (round.id !== roundId || round.changeSeq !== changeSeq)) {
        return;
      }
      const rawMessage = error instanceof Error && error.message ? error.message : "语音生成失败";
      const message = this.localizeTerminalMessage(rawMessage);
      this.clearTtsPlaybackQueue();
      this.setData({
        ttsState: "error",
        ttsErrorMessage: message
      });
      this.showLocalizedToast(rawMessage, "none");
      this.finishTtsRoundCapture();
    }
  },

  /**
   * 单条时延序列的摘要信息单独计算：
   * 1. 返回标准化后的 samples，供合成曲线图直接复用；
   * 2. 统计只保留 min / max / avg，方便头部卡片压缩成两行；
   * 3. 单位统一由标题承担，因此数值本身不再重复拼 `ms`。
   */
  buildConnectionDiagnosticSeriesSummary(samplesInput) {
    const samples = normalizeConnectionDiagnosticSamples(samplesInput);
    const stats =
      samples.length === 0
        ? {
            min: null,
            max: null,
            avg: null
          }
        : {
            min: Math.min(...samples),
            max: Math.max(...samples),
            avg: Math.round(samples.reduce((total, sample) => total + sample, 0) / samples.length)
          };
    return {
      samples,
      stats
    };
  },

  /**
   * 头部指标卡固定输出 `min / max / avg` 三组数字：
   * - 标签使用英文短词，便于压缩到单行；
   * - 空态统一显示 `--`，避免布局跳动；
   * - 数字单独输出，供 WXML 套无底色描边胶囊。
   */
  buildConnectionDiagnosticStatItems(statsInput, dataInput) {
    const data = dataInput && typeof dataInput === "object" ? dataInput : this.data;
    const diagnosticsCopy = (data.copy && data.copy.diagnostics) || {};
    const stats = statsInput && typeof statsInput === "object" ? statsInput : {};
    const emptyValue = diagnosticsCopy.chartStatEmpty || "--";
    return [
      {
        key: "min",
        label: diagnosticsCopy.chartMinShort || "min",
        valueLabel: stats.min == null ? emptyValue : String(stats.min),
        divider: true
      },
      {
        key: "max",
        label: diagnosticsCopy.chartMaxShort || "max",
        valueLabel: stats.max == null ? emptyValue : String(stats.max),
        divider: true
      },
      {
        key: "avg",
        label: diagnosticsCopy.chartAvgShort || "avg",
        valueLabel: stats.avg == null ? emptyValue : String(stats.avg),
        divider: false
      }
    ];
  },

  /**
   * 诊断浮窗把两条时延序列叠到同一张平滑曲线图里：
   * 1. 网关响应与网络时延共享 x 轴时间窗口；
   * 2. 左轴保留网关响应量纲，右轴保留网络时延量纲，读数不再混在一起；
   * 3. 头部仍保留两组数值摘要，避免单图叠加后失去读数能力。
   */
  buildConnectionDiagnosticCombinedChartModel(dataInput) {
    const data = dataInput && typeof dataInput === "object" ? dataInput : this.data;
    const diagnosticsCopy = (data.copy && data.copy.diagnostics) || {};
    const chartThemeStyles = buildConnectionDiagnosticThemeStyles(
      this.terminalThemeRuntime || buildTerminalRuntimeTheme(getSettings())
    );
    const response = this.buildConnectionDiagnosticSeriesSummary(data.connectionDiagnosticResponseSamples);
    const network = this.buildConnectionDiagnosticSeriesSummary(data.connectionDiagnosticNetworkSamples);
    return {
      imageUri: buildCombinedDiagnosticSparkline(
        {
          responseSamples: response.samples,
          networkSamples: network.samples
        },
        {
          responseLineColor: chartThemeStyles.responseLineColor,
          responseGlowColor: chartThemeStyles.responseGlowColor,
          responseFillColor: chartThemeStyles.responseFillColor,
          networkLineColor: chartThemeStyles.networkLineColor,
          networkGlowColor: chartThemeStyles.networkGlowColor,
          networkFillColor: chartThemeStyles.networkFillColor,
          cardBgColor: chartThemeStyles.chartCardBgColor,
          cardBorderColor: chartThemeStyles.chartCardBorderColor,
          cardGlowColor: chartThemeStyles.chartCardGlowColor,
          gridColor: chartThemeStyles.chartGridColor
        }
      ),
      cardStyle: chartThemeStyles.cardStyle,
      responseMetricStyle: chartThemeStyles.responseMetricStyle,
      responseCardLabel: diagnosticsCopy.responseAxisCardLabel || "网关响应(ms)",
      responseStatItems: this.buildConnectionDiagnosticStatItems(response.stats, data),
      networkMetricStyle: chartThemeStyles.networkMetricStyle,
      networkCardLabel: diagnosticsCopy.networkAxisCardLabel || "网络时延(ms)",
      networkStatItems: this.buildConnectionDiagnosticStatItems(network.stats, data),
      chartImageShellStyle: chartThemeStyles.chartImageShellStyle
    };
  },

  buildConnectionDiagnosticPayload(extraData) {
    const nextExtra = extraData && typeof extraData === "object" ? extraData : {};
    const nextData = {
      ...this.data,
      ...nextExtra
    };
    return {
      ...nextExtra,
      connectionDiagnosticCombinedChart: this.buildConnectionDiagnosticCombinedChartModel(nextData)
    };
  },

  /**
   * 会话信息只依赖当前页已知的 server 配置与本地多语言文案。
   * 这里统一收口，避免模板层自己拼接 host/port/projectPath。
   */
  buildSessionInfoPayload(extraData) {
    const nextExtra = extraData && typeof extraData === "object" ? extraData : {};
    const nextData = {
      ...this.data,
      ...nextExtra
    };
    const sessionInfo = buildTerminalSessionInfoModel({
      server: this.server,
      serverLabel: nextData.serverLabel,
      copy: nextData.copy,
      statusText: nextData.statusText,
      activeAiProvider: nextData.activeAiProvider
    });
    const sessionInfoTheme = buildSessionInfoThemeStyles(
      this.terminalThemeRuntime || buildTerminalRuntimeTheme(getSettings())
    );
    return {
      sessionInfoTitle: sessionInfo.title,
      sessionInfoHero: sessionInfo.hero,
      sessionInfoStatusChips: sessionInfo.statusChips,
      sessionInfoDetailItems: sessionInfo.detailItems,
      sessionInfoTheme
    };
  },

  onOpenConnectionDiagnostics() {
    if (this.data.connectionDiagnosticsVisible) {
      this.syncConnectionDiagnosticSampling(true);
      return;
    }
    this.setData({ connectionDiagnosticsVisible: true, sessionInfoVisible: false }, () => {
      this.syncConnectionDiagnosticSampling(true);
    });
  },

  onCloseConnectionDiagnostics() {
    if (!this.data.connectionDiagnosticsVisible) {
      this.syncConnectionDiagnosticSampling(false);
      return;
    }
    this.setData({ connectionDiagnosticsVisible: false }, () => {
      this.syncConnectionDiagnosticSampling(false);
    });
  },

  onOpenSessionInfo() {
    if (this.data.sessionInfoVisible) {
      return;
    }
    const closeDiagnostics = !!this.data.connectionDiagnosticsVisible;
    this.setData(
      {
        ...this.buildSessionInfoPayload({}),
        sessionInfoVisible: true,
        connectionDiagnosticsVisible: false
      },
      () => {
        if (closeDiagnostics) {
          this.syncConnectionDiagnosticSampling(false);
        }
      }
    );
  },

  onCloseSessionInfo() {
    if (!this.data.sessionInfoVisible) {
      return;
    }
    this.setData({ sessionInfoVisible: false });
  },

  /**
   * 会话信息浮层里的两张状态卡各自复用主工具栏现有入口：
   * 1. SSH 卡片复用右上角连接开关，已连接时断开、断开时重连；
   * 2. AI 卡片复用左上角 AI 按钮，断开时会先自动建链再启动 AI；
   * 3. 两边都不新增独立分支，统一沿用已有的状态判断、提示与异常处理。
   */
  onSessionInfoStatusTap(event) {
    const key = String(event?.currentTarget?.dataset?.key || "").trim();
    if (key === "sshConnection") {
      if (this.data.connectionActionDisabled) {
        return;
      }
      this.onConnectionAction();
      return;
    }
    if (key !== "aiConnection" || this.data.aiLaunchBusy) {
      return;
    }
    void this.onOpenCodex();
  },

  /**
   * 诊断缓存按服务器维度隔离，并放在模块级内存里：
   * - 切到配置页再回来时可以复用上一段曲线；
   * - 切换到其他服务器时不会把采样串线；
   * - 不做持久化，保证读写足够轻。
   */
  getConnectionDiagnosticCacheKey(serverIdInput) {
    const serverId = String(serverIdInput || this.data.serverId || "").trim();
    return serverId || "";
  },

  restoreConnectionDiagnosticSamples(serverIdInput) {
    const cacheKey = this.getConnectionDiagnosticCacheKey(serverIdInput);
    if (!cacheKey) {
      return {
        connectionDiagnosticResponseSamples: [],
        connectionDiagnosticNetworkSamples: []
      };
    }
    const cached = connectionDiagnosticSampleCache.get(cacheKey);
    return {
      connectionDiagnosticResponseSamples: normalizeConnectionDiagnosticSamples(
        cached && cached.responseSamples
      ),
      connectionDiagnosticNetworkSamples: normalizeConnectionDiagnosticSamples(
        cached && cached.networkSamples
      )
    };
  },

  hasConnectionDiagnosticSamples(samplesInput) {
    const samples = samplesInput && typeof samplesInput === "object" ? samplesInput : {};
    const responseSamples = normalizeConnectionDiagnosticSamples(samples.connectionDiagnosticResponseSamples);
    const networkSamples = normalizeConnectionDiagnosticSamples(samples.connectionDiagnosticNetworkSamples);
    return responseSamples.length > 0 || networkSamples.length > 0;
  },

  /**
   * 同一服务器断线重连时优先复用上一段曲线：
   * 1. 旧点先回填，避免每次重连都从 0 开始；
   * 2. 错误文本清空，避免成功重连后仍残留旧报错；
   * 3. 后续新样本继续 append，直到窗口补满 30 个点。
   */
  applyConnectionDiagnosticSamples(samplesInput, serverIdInput) {
    const normalized = {
      connectionDiagnosticResponseSamples: normalizeConnectionDiagnosticSamples(
        samplesInput && samplesInput.connectionDiagnosticResponseSamples
      ),
      connectionDiagnosticNetworkSamples: normalizeConnectionDiagnosticSamples(
        samplesInput && samplesInput.connectionDiagnosticNetworkSamples
      )
    };
    const nextPayload = this.buildConnectionDiagnosticPayload(normalized);
    this.stopConnectionDiagnosticNetworkProbe();
    this.setData(nextPayload);
    this.persistConnectionDiagnosticSamples(nextPayload, serverIdInput);
  },

  persistConnectionDiagnosticSamples(dataInput, serverIdInput) {
    const cacheKey = this.getConnectionDiagnosticCacheKey(serverIdInput);
    if (!cacheKey) {
      return;
    }
    const data = dataInput && typeof dataInput === "object" ? dataInput : this.data;
    connectionDiagnosticSampleCache.set(cacheKey, {
      responseSamples: normalizeConnectionDiagnosticSamples(data.connectionDiagnosticResponseSamples),
      networkSamples: normalizeConnectionDiagnosticSamples(data.connectionDiagnosticNetworkSamples)
    });
  },

  /**
   * 每次开始新连接前清空采样窗口，避免把旧会话曲线混进来。
   * 错误文本也在这里顺手归零，避免成功重连后仍展示上次失败信息。
   */
  resetConnectionDiagnosticSamples() {
    const nextPayload = this.buildConnectionDiagnosticPayload({
      connectionDiagnosticResponseSamples: [],
      connectionDiagnosticNetworkSamples: []
    });
    this.stopConnectionDiagnosticNetworkProbe();
    this.setData(nextPayload);
    this.persistConnectionDiagnosticSamples(nextPayload);
  },

  /**
   * 网络时延不能直接在小程序里做 ICMP ping。
   * 这里统一退化为客户端对当前网关 `/health` 的 HTTPS RTT，既可执行也与当前接入链路一致。
   */
  resolveConnectionDiagnosticNetworkProbeUrl() {
    const baseUrl = String(resolveSyncBaseUrl() || "").trim();
    if (!baseUrl) {
      return "";
    }
    return `${baseUrl}/health?ts=${Date.now()}`;
  },

  sampleConnectionDiagnosticNetworkLatency(force) {
    const allowDisconnected = force === true;
    if (!allowDisconnected && String(this.data.statusText || "") !== "connected") {
      return;
    }
    if (typeof wx.request !== "function" || this.connectionDiagnosticNetworkProbePending) {
      return;
    }
    const url = this.resolveConnectionDiagnosticNetworkProbeUrl();
    if (!url) {
      return;
    }
    const startedAt = Date.now();
    this.connectionDiagnosticNetworkProbePending = true;
    wx.request({
      url,
      method: "GET",
      timeout: CONNECTION_DIAGNOSTIC_NETWORK_TIMEOUT_MS,
      success: (res) => {
        const statusCode = Number(res && res.statusCode);
        if (!(statusCode >= 200 && statusCode < 300)) {
          return;
        }
        const nextSamples = appendDiagnosticSample(
          this.data.connectionDiagnosticNetworkSamples,
          Date.now() - startedAt,
          CONNECTION_DIAGNOSTIC_SAMPLE_LIMIT
        );
        const nextPayload = this.buildConnectionDiagnosticPayload({
          connectionDiagnosticNetworkSamples: nextSamples
        });
        this.setData(nextPayload);
        this.persistConnectionDiagnosticSamples(nextPayload);
      },
      complete: () => {
        this.connectionDiagnosticNetworkProbePending = false;
      }
    });
  },

  resolveConnectionDiagnosticSampleIntervalMs() {
    return this.data.connectionDiagnosticsVisible
      ? CONNECTION_DIAGNOSTIC_PANEL_SAMPLE_INTERVAL_MS
      : CONNECTION_DIAGNOSTIC_SAMPLE_INTERVAL_MS;
  },

  /**
   * 时延面板展开时，两条曲线都切到 3 秒采样；
   * 收起后恢复默认 10 秒，避免后台长期高频请求。
   */
  syncConnectionDiagnosticSampling(forceImmediate) {
    const connected = String(this.data.statusText || "") === "connected";
    const intervalMs = this.resolveConnectionDiagnosticSampleIntervalMs();
    if (this.client && typeof this.client.setLatencySampleInterval === "function") {
      this.client.setLatencySampleInterval(intervalMs);
    }
    if (!connected || !this.client) {
      this.stopConnectionDiagnosticNetworkProbe();
      return;
    }
    this.startConnectionDiagnosticNetworkProbe(forceImmediate, intervalMs);
    if (forceImmediate && typeof this.client.sampleLatency === "function") {
      this.client.sampleLatency();
    }
  },

  startConnectionDiagnosticNetworkProbe(forceImmediate, intervalMsInput) {
    this.stopConnectionDiagnosticNetworkProbe();
    const intervalMs =
      Number.isFinite(Number(intervalMsInput)) && Number(intervalMsInput) >= 1000
        ? Math.round(Number(intervalMsInput))
        : this.resolveConnectionDiagnosticSampleIntervalMs();
    this.connectionDiagnosticNetworkProbeTimer = setInterval(() => {
      this.sampleConnectionDiagnosticNetworkLatency(false);
    }, intervalMs);
    if (forceImmediate) {
      this.sampleConnectionDiagnosticNetworkLatency(true);
    }
  },

  stopConnectionDiagnosticNetworkProbe() {
    if (this.connectionDiagnosticNetworkProbeTimer) {
      clearInterval(this.connectionDiagnosticNetworkProbeTimer);
      this.connectionDiagnosticNetworkProbeTimer = null;
    }
    this.connectionDiagnosticNetworkProbePending = false;
  },

  onLoad(options) {
    const settings = getSettings();
    applyNavigationBarTheme(settings);
    this.opsConfig = getOpsConfig();
    this.connectionDiagnosticNetworkProbeTimer = null;
    this.connectionDiagnosticNetworkProbePending = false;
    this.connectionDiagnosticKeepSamplesOnNextConnect = false;
    this.initTerminalPerfState();
    this.initTerminalRenderScheduler();
    this.syncTerminalThemeRuntime(settings);
    this.terminalBufferMaxEntries = normalizePositiveInt(
      this.opsConfig.terminalBufferMaxEntries,
      DEFAULT_BUFFER_MAX_ENTRIES,
      100
    );
    this.terminalBufferMaxBytes = normalizePositiveInt(
      this.opsConfig.terminalBufferMaxBytes,
      DEFAULT_BUFFER_MAX_BYTES,
      1024
    );
    this.terminalBufferSnapshotMaxLines = Math.min(
      MAX_TERMINAL_BUFFER_SNAPSHOT_MAX_LINES,
      normalizePositiveInt(
        settings.shellBufferSnapshotMaxLines,
        DEFAULT_TERMINAL_BUFFER_SNAPSHOT_MAX_LINES,
        MIN_TERMINAL_BUFFER_SNAPSHOT_MAX_LINES
      )
    );
    this.waitForConnectedTimer = null;
    this.aiConnectionWaitTimer = null;
    this.touchShiftLastTapAt = 0;
    this.isRecorderRunning = false;
    this.isRecorderStarting = false;
    this.stopRecorderAfterStart = false;
    this.outputCursorRow = 0;
    this.outputCursorCol = 0;
    this.outputCells = [[]];
    this.outputReplayText = "";
    this.outputReplayBytes = 0;
    this.outputAnsiState = cloneAnsiState(ANSI_RESET_STATE);
    this.outputRectWidth = 0;
    this.outputRectHeight = 0;
    this.stdoutReplayCarryText = "";
    this.terminalSyncUpdateState = createTerminalSyncUpdateState();
    this.terminalStdoutUserInputPending = false;
    this.shellInputPassiveBlurPending = false;
    this.terminalStableCaretSnapshot = null;
    this.terminalPendingCaretSnapshot = null;
    this.terminalPendingCaretSince = 0;
    this.terminalCols = 80;
    this.terminalRows = 24;
    this.outputTerminalState = createEmptyTerminalBufferState({
      bufferCols: this.terminalCols,
      bufferRows: this.terminalRows
    });
    this.applyTerminalBufferState(this.outputTerminalState);
    this.voiceRound = {
      phase: "idle",
      client: null,
      baseText: "",
      discardResults: false,
      stopRequestedBeforeReady: false,
      closeTimer: null
    };
    this.voiceHoldTimer = null;
    this.voiceGesture = {
      holdArmed: false,
      holdStarted: false,
      dragCandidate: false,
      dragActive: false,
      dragMoved: false,
      dragJustFinishedAt: 0,
      dragStartX: 0,
      dragStartY: 0,
      originLeft: VOICE_FLOAT_GAP_PX,
      originBottom: VOICE_FLOAT_GAP_PX
    };
    this.windowWidth = 375;
    this.windowHeight = 667;
    this.voicePanelHeightPx = VOICE_PANEL_FALLBACK_HEIGHT_PX;
    this.voiceActionsMaxOffsetPx = null;
    this.voiceActionsDrag = {
      active: false,
      moved: false,
      startX: 0,
      startOffset: 0
    };
    this.initVoiceFloatMetrics();
    this.currentOutputScrollTop = 0;
    this.outputRectSnapshot = null;
    this.outputViewportWindow = null;
    this.outputViewportScrollRefreshPending = false;
    this.terminalScrollOverlayTimer = null;
    this.terminalScrollIdleTimer = null;
    this.terminalScrollViewportPrefetchTimer = null;
    this.terminalScrollLastOverlayAt = 0;
    this.terminalScrollLastViewportRefreshAt = 0;
    this.terminalScrollDirection = 0;
    this.shellFontSizePx = 15;
    this.shellLineHeightRatio = 1.4;
    this.shellLineHeightPx = Math.round(this.shellFontSizePx * this.shellLineHeightRatio);
    this.shellCharWidthPx = Math.max(6, Math.round(this.shellFontSizePx * SHELL_CHAR_WIDTH_FACTOR));
    this.outputHorizontalPaddingPx = Math.max(
      4,
      Math.round((this.windowWidth * OUTPUT_HORIZONTAL_PADDING_RPX) / 750)
    );
    this.outputRightPaddingPx = OUTPUT_RIGHT_SAFE_PADDING_PX;
    this.lastOutputLongPressAt = 0;
    this.keyboardVisibleHeightPx = 0;
    this.keyboardRestoreScrollTop = null;
    this.keyboardSessionActive = false;
    this.keyboardHeightChangeHandler = null;
    this.sessionSuspended = false;
    this.codexBootstrapGuard = null;
    this.activeAiProvider = "";
    this.activeCodexSandboxMode = "";
    this.aiSessionShellReady = false;
    this.aiRuntimeExitCarry = "";
    this.pendingCodexResumeAfterReconnect = false;
    this.autoReconnectTimer = null;
    this.autoReconnectAttempts = 0;
    this.autoReconnectSuppressed = false;
    this.initTtsRuntime();
    this.pendingOpenCodex = String(options && options.openCodex) === "1";
    this.logTerminalPerf("page.load", {
      openCodex: this.pendingOpenCodex,
      hasServerId: !!(options && options.serverId)
    });

    const serverId = options.serverId || "";
    const rows = listServers();
    const server = rows.find((item) => item.id === serverId);
    if (!server) {
      clearTerminalSessionSnapshot();
      const language = this.getCurrentLanguage(settings);
      const copy = buildPageCopy(language, "terminal");
      wx.showToast({
        title: localizeTerminalMessage(language, copy, "服务器不存在"),
        icon: "none"
      });
      return;
    }

    bindRecorderEvents();
    activeTerminalPage = this;

    const sessionSnapshot = getTerminalSessionSnapshot();
    const reusableSnapshot =
      sessionSnapshot && sessionSnapshot.serverId === serverId ? sessionSnapshot : null;
    const sessionId = reusableSnapshot ? reusableSnapshot.sessionId : `mini-${Date.now()}`;
    const localePayload = this.applyLocale(settings, "connecting");
    const serverLabel = server.name || `${server.username || "-"}@${server.host || "-"}`;
    const restoredConnectionDiagnostics = this.restoreConnectionDiagnosticSamples(serverId);
    this.connectionDiagnosticKeepSamplesOnNextConnect = this.hasConnectionDiagnosticSamples(
      restoredConnectionDiagnostics
    );
    this.server = server;
    this.client = this.createTerminalGatewayClient();
    this.resumeGraceMs = resolveTerminalResumeGraceMs(settings);
    this.sessionKey =
      (reusableSnapshot && reusableSnapshot.sessionKey) ||
      `mini-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    this.syncActiveAiProvider(reusableSnapshot ? reusableSnapshot.activeAiProvider : "", { persist: false });
    this.activeCodexSandboxMode =
      this.normalizeActiveAiProvider(reusableSnapshot ? reusableSnapshot.activeAiProvider : "") === "codex"
        ? normalizeCodexSandboxMode(reusableSnapshot ? reusableSnapshot.codexSandboxMode : "")
        : "";
    this.pendingCodexResumeAfterReconnect =
      this.normalizeActiveAiProvider(reusableSnapshot ? reusableSnapshot.activeAiProvider : "") === "codex";
    this.restorePersistedTerminalBuffer();

    setActiveSessionSender((input, meta) => {
      if (!this.client) {
        throw new Error("会话未连接");
      }
      this.client.sendStdin(input, meta);
    });

    this.syncShellInputMetrics(settings);
    this.syncTerminalBufferLimits(settings);
    applyNavigationBarTheme(settings);
    createTerminalSessionSnapshot({
      serverId,
      serverLabel,
      sessionId,
      sessionKey: this.sessionKey,
      status: "connecting",
      activeAiProvider: this.normalizeActiveAiProvider(this.activeAiProvider),
      codexSandboxMode: this.activeAiProvider === "codex" ? this.activeCodexSandboxMode : "",
      resumeGraceMs: this.resumeGraceMs
    });
    this.setData(
      {
        ...buildTerminalThemePayload(settings),
        ...localePayload,
        activationDebugEnabled: resolveActivationDebugSetting(settings),
        activationDebugVisible: resolveActivationDebugSetting(settings),
        showVoiceInputButton: resolveVoiceInputButtonSetting(settings),
        ttsSpeakableMaxChars: resolveTtsSpeakableMaxChars(settings),
        ttsSegmentMaxChars: resolveTtsSegmentMaxChars(settings),
        voiceRecordCategories: resolveVoiceRecordCategories(settings),
        selectedRecordCategory: this.resolveSelectedRecordCategory(settings),
        voicePanelVisible: resolveVoiceInputButtonSetting(settings) ? this.data.voicePanelVisible : false,
        serverId,
        sessionId,
        serverLabel,
        statusText: "connecting",
        statusClass: this.normalizeStatusClass("connecting"),
        disconnectedHintVisible: resolveDisconnectedHintVisible("connecting"),
        ...restoredConnectionDiagnostics,
        ...this.buildSessionInfoPayload({
          ...localePayload,
          serverLabel,
          statusText: "connecting",
          activeAiProvider: this.activeAiProvider
        }),
        ...this.buildConnectionDiagnosticPayload({
          ...localePayload,
          serverLabel,
          statusText: "connecting",
          statusLabel: getStatusLabel(this.getCurrentLanguage(settings), "connecting"),
          statusClass: this.normalizeStatusClass("connecting"),
          disconnectedHintVisible: resolveDisconnectedHintVisible("connecting"),
          ...restoredConnectionDiagnostics
        })
      },
      () => {
        this.consumePendingAiLaunchRequest();
        this.runAfterTerminalLayout(() => {
          this.measureShellMetrics(() => {
            this.requestTerminalRender({}, () => {
              this.connectGateway();
            });
          });
        });
      }
    );
    this.syncConnectionAction("connecting");
  },

  onShow() {
    this.startTerminalPerfLagProbe();
    const sessionSnapshot = getTerminalSessionSnapshot();
    this.logTerminalPerf("page.show", {
      hasClient: !!this.client,
      resumed: !!sessionSnapshot
    });
    const settings = getSettings();
    applyNavigationBarTheme(settings);
    this.syncTerminalThemeRuntime(settings);
    this.resumeGraceMs = resolveTerminalResumeGraceMs(settings);
    const localePayload = this.applyLocale(settings);
    setActiveSessionSender((input, meta) => {
      if (!this.client) {
        throw new Error("会话未连接");
      }
      this.client.sendStdin(input, meta);
    });
    this.syncShellInputMetrics(settings);
    this.syncTerminalBufferLimits(settings);
    /**
     * 终端页可能在导航栈中保留多个隐藏实例。
     * 键盘/窗口类全局监听必须按可见态绑定，否则会在 onHide 后继续累积。
     */
    this.bindShellKeyboardHeightChange();
    this.setData(
      {
        ...buildTerminalThemePayload(settings),
        ...localePayload,
        activationDebugEnabled: resolveActivationDebugSetting(settings),
        activationDebugVisible: resolveActivationDebugSetting(settings),
        showVoiceInputButton: resolveVoiceInputButtonSetting(settings),
        ttsSpeakableMaxChars: resolveTtsSpeakableMaxChars(settings),
        ttsSegmentMaxChars: resolveTtsSegmentMaxChars(settings),
        voiceRecordCategories: resolveVoiceRecordCategories(settings),
        selectedRecordCategory: this.resolveSelectedRecordCategory(settings),
        voicePanelVisible: resolveVoiceInputButtonSetting(settings) ? this.data.voicePanelVisible : false,
        ...this.buildSessionInfoPayload(localePayload)
      },
      () => {
        this.consumePendingAiLaunchRequest();
        this.setData(this.buildConnectionDiagnosticPayload({}));
        if (this.client && String(this.data.statusText || "") === "connected") {
          this.syncConnectionDiagnosticSampling(true);
        }
        /**
         * 字号/行高切换后，CSS 变量要先真正提交到视图层，再测量隐藏 probe。
         * 否则这里可能仍拿到旧字号的字宽，导致 cols/rows 与实际显示不一致。
         */
        this.runAfterTerminalLayout(() => {
          this.measureShellMetrics(() => {
            this.requestTerminalRender({ sendResize: true }, () => {
              const snapshot = getTerminalSessionSnapshot();
              if (!this.client && snapshot && snapshot.serverId === this.data.serverId) {
                this.connectGateway();
                return;
              }
              if (
                !this.client &&
                !snapshot &&
                ["connecting", "auth_pending", "connected"].includes(String(this.data.statusText || ""))
              ) {
                this.setStatus("disconnected");
              }
            });
          });
        });
      }
    );
  },

  onHide() {
    this.logTerminalPerf("page.hide", {
      hasClient: !!this.client,
      sessionSuspended: !!this.sessionSuspended
    });
    this.suppressAutoReconnect();
    this.stopTerminalPerfLagProbe();
    this.flushTerminalPerfLogs("page_hide");
    this.persistConnectionDiagnosticSamples();
    this.connectionDiagnosticKeepSamplesOnNextConnect = true;
    this.stopConnectionDiagnosticNetworkProbe();
    this.clearPendingTerminalRender();
    this.clearTerminalScrollSyncTimers();
    this.shellInputPassiveBlurPending = false;
    this.resetTerminalCaretStabilityState();
    this.unbindShellKeyboardHeightChange();
    this.clearVoiceHoldTimer();
    this.clearWaitForConnectedTimer();
    this.clearAiConnectionWaitTimer();
    this.stopVoiceRound(true);
    this.teardownAsrClient("page_hide");
    this.resetTtsRoundState({
      keepAudioUrl: true,
      stopPlayback: true
    });
    this.destroyTtsAudioContext();
    this.sendFocusModeReport(false);
    if (this.voiceRound && this.voiceRound.closeTimer) {
      clearTimeout(this.voiceRound.closeTimer);
      this.voiceRound.closeTimer = null;
    }
    this.clearCodexBootstrapGuard();
    if (this.isRecorderRunning) {
      try {
        recorderManager.stop();
      } catch (error) {
        console.warn("[terminal.recorder.stop]", error);
      }
      this.isRecorderRunning = false;
    }
    this.isRecorderStarting = false;
    this.stopRecorderAfterStart = false;
    this.suspendTerminalSession("page_hide");
    setActiveSessionSender(null);
  },

  onUnload() {
    this.logTerminalPerf("page.unload", {
      hasClient: !!this.client,
      sessionSuspended: !!this.sessionSuspended
    });
    this.suppressAutoReconnect();
    this.stopTerminalPerfLagProbe();
    this.flushTerminalPerfLogs("page_unload");
    this.persistConnectionDiagnosticSamples();
    this.connectionDiagnosticKeepSamplesOnNextConnect = true;
    this.stopConnectionDiagnosticNetworkProbe();
    this.clearPendingTerminalRender();
    this.clearTerminalScrollSyncTimers();
    this.shellInputPassiveBlurPending = false;
    this.resetTerminalCaretStabilityState();
    this.unbindShellKeyboardHeightChange();
    this.clearVoiceHoldTimer();
    this.clearWaitForConnectedTimer();
    this.clearAiConnectionWaitTimer();
    this.stopVoiceRound(true);
    this.teardownAsrClient("page_unload");
    this.resetTtsRoundState({
      keepAudioUrl: true,
      stopPlayback: true
    });
    this.destroyTtsAudioContext();
    if (this.voiceRound && this.voiceRound.closeTimer) {
      clearTimeout(this.voiceRound.closeTimer);
      this.voiceRound.closeTimer = null;
    }
    this.clearCodexBootstrapGuard();
    if (this.isRecorderRunning) {
      try {
        recorderManager.stop();
      } catch (error) {
        console.warn("[terminal.recorder.stop]", error);
      }
      this.isRecorderRunning = false;
    }
    this.isRecorderStarting = false;
    this.stopRecorderAfterStart = false;
    this.suspendTerminalSession("page_unload");
    if (activeTerminalPage === this) {
      activeTerminalPage = null;
    }
    setActiveSessionSender(null);
  },

  /**
   * 同步当前终端会话快照，供连接页高亮与返回终端时续接使用。
   */
  persistTerminalSessionStatus(status) {
    if (!this.data.serverId || !this.data.sessionId || !this.sessionKey) {
      return null;
    }
    return createTerminalSessionSnapshot({
      serverId: this.data.serverId,
      serverLabel: this.data.serverLabel,
      sessionId: this.data.sessionId,
      sessionKey: this.sessionKey,
      status,
      activeAiProvider: this.normalizeActiveAiProvider(this.activeAiProvider),
      codexSandboxMode:
        this.normalizeActiveAiProvider(this.activeAiProvider) === "codex"
          ? normalizeCodexSandboxMode(this.activeCodexSandboxMode)
          : "",
      resumeGraceMs: this.resumeGraceMs
    });
  },

  buildTerminalBufferOptions() {
    return {
      bufferCols: Math.max(1, Math.round(Number(this.terminalCols) || 80)),
      bufferRows: Math.max(1, Math.round(Number(this.terminalRows) || 24)),
      maxEntries: normalizePositiveInt(this.terminalBufferMaxEntries, DEFAULT_BUFFER_MAX_ENTRIES, 100),
      maxBytes: normalizePositiveInt(this.terminalBufferMaxBytes, DEFAULT_BUFFER_MAX_BYTES, 1024)
    };
  },

  syncTerminalThemeRuntime(settings) {
    this.terminalThemeRuntime = buildTerminalRuntimeTheme(settings);
  },

  buildTerminalBufferRuntimeOptions(runtimeOptions) {
    return {
      ...(this.terminalThemeRuntime || buildTerminalRuntimeTheme(getSettings())),
      ...(runtimeOptions && typeof runtimeOptions === "object" ? runtimeOptions : {})
    };
  },

  captureTerminalBufferState(runtimeOptions) {
    return cloneTerminalBufferState(
      this.outputTerminalState,
      this.buildTerminalBufferOptions(),
      this.buildTerminalBufferRuntimeOptions(runtimeOptions)
    );
  },

  /**
   * 运行态同步只更新 JS 侧终端语义：
   * 1. 让 `getTerminalModes()`、cursor/ansi 等逻辑态跟上最新 VT 输出；
   * 2. 不立刻改 `outputCells`，避免 stdout backlog 期间每个 defer slice 都做一次页面投影。
   */
  applyTerminalBufferRuntimeState(state, runtimeOptions) {
    const useReferences = !!(runtimeOptions && runtimeOptions.useReferences);
    const options = this.buildTerminalBufferOptions();
    const normalized =
      useReferences && state && typeof state === "object"
        ? syncActiveBufferSnapshot(state, options, { cloneRows: false })
        : cloneTerminalBufferState(
            state && typeof state === "object" ? state : createEmptyTerminalBufferState(options),
            options,
            this.buildTerminalBufferRuntimeOptions(runtimeOptions)
          );
    this.outputTerminalState = normalized;
    const active = getActiveTerminalBuffer(normalized);
    const activeAnsiState =
      active && active.ansiState ? active.ansiState : normalized.ansiState || ANSI_RESET_STATE;
    this.outputAnsiState = cloneAnsiState(activeAnsiState);
    this.outputCursorRow = Math.max(0, Math.round(Number(active && active.cursorRow) || 0));
    this.outputCursorCol = Math.max(0, Math.round(Number(active && active.cursorCol) || 0));
    return normalized;
  },

  applyTerminalBufferState(state, runtimeOptions) {
    const useReferences = !!(runtimeOptions && runtimeOptions.useReferences);
    const normalized = this.applyTerminalBufferRuntimeState(state, runtimeOptions);
    const active = getActiveTerminalBuffer(normalized);
    const activeCells =
      Array.isArray(active && active.cells) && active.cells.length > 0 ? active.cells : [[]];
    this.outputCells = useReferences
      ? activeCells
      : activeCells.map((lineCells) =>
          Array.isArray(lineCells) ? lineCells.map((cell) => cloneTerminalCell(cell)) : []
        );
  },

  getTerminalModes() {
    return getTerminalModeState(this.outputTerminalState);
  },

  syncTerminalReplayBuffer(cleanText) {
    const chunk = String(cleanText || "");
    if (!chunk) {
      return;
    }
    const maxBytes = this.buildTerminalBufferOptions().maxBytes;
    this.outputReplayText = `${this.outputReplayText || ""}${chunk}`;
    this.outputReplayBytes += utf8ByteLength(chunk);
    if (this.outputReplayBytes <= maxBytes) {
      return;
    }
    this.outputReplayText = trimTerminalReplayTextToMaxBytes(this.outputReplayText, maxBytes);
    this.outputReplayBytes = utf8ByteLength(this.outputReplayText);
  },

  /**
   * 字号、行高、容器宽度变化时，旧字号下写死的自动折行必须按当前列宽重放重建。
   * 否则页面会继续显示“上一次连接时的几何”，看起来就像某个字号被永久锁死。
   */
  rebuildTerminalBufferFromReplay() {
    if (!this.outputReplayText) {
      return false;
    }
    const startedAt = Date.now();
    this.applyTerminalBufferState(
      rebuildTerminalBufferStateFromReplayText(
        this.outputReplayText,
        this.buildTerminalBufferOptions(),
        this.buildTerminalBufferRuntimeOptions()
      )
    );
    const costMs = Date.now() - startedAt;
    if (costMs >= TERMINAL_PERF_SLOW_STEP_MS) {
      this.logTerminalPerf("buffer.rebuild_from_replay", {
        costMs,
        replayBytes: this.outputReplayBytes,
        cols: this.terminalCols,
        rows: this.terminalRows
      });
    }
    return true;
  },

  /**
   * 将当前终端缓冲裁剪为“尾部可恢复快照”：
   * 1. 只保留最近若干行，避免本地存储被海量输出占满；
   * 2. 光标行按裁剪后的相对位置回写；
   * 3. 恢复目标是补回 prompt 和最近上下文，而不是替代完整 scrollback。
   */
  persistTerminalBufferSnapshot() {
    if (!this.sessionKey) {
      return null;
    }
    const rows = this.getOutputBufferRows();
    const cursorState = this.getOutputCursorState();
    /**
     * 续接快照只负责“离页后回来先看到最近上下文”。
     * 这里允许用户调大或调小快照行数，但仍会继续受字节上限约束，避免本地存储被单次会话挤爆。
     */
    const snapshotMaxLines = Math.min(
      MAX_TERMINAL_BUFFER_SNAPSHOT_MAX_LINES,
      normalizePositiveInt(
        this.terminalBufferSnapshotMaxLines,
        DEFAULT_TERMINAL_BUFFER_SNAPSHOT_MAX_LINES,
        MIN_TERMINAL_BUFFER_SNAPSHOT_MAX_LINES
      )
    );
    let startIndex = Math.max(0, rows.length - snapshotMaxLines);
    let trimmedRows = rows.slice(startIndex);
    let trimmedLines = trimmedRows.map((lineCells) => lineCellsToText(lineCells));
    let { styleTable, styledLines } = serializeTerminalSnapshotRows(trimmedRows);
    let snapshotVisualBytes = utf8ByteLength(
      JSON.stringify({
        lines: trimmedLines,
        styleTable,
        styledLines
      })
    );
    while (trimmedRows.length > 1 && snapshotVisualBytes > TERMINAL_BUFFER_SNAPSHOT_MAX_BYTES) {
      trimmedRows = trimmedRows.slice(1);
      startIndex += 1;
      trimmedLines = trimmedRows.map((lineCells) => lineCellsToText(lineCells));
      const nextStyledSnapshot = serializeTerminalSnapshotRows(trimmedRows);
      styleTable = nextStyledSnapshot.styleTable;
      styledLines = nextStyledSnapshot.styledLines;
      snapshotVisualBytes = utf8ByteLength(
        JSON.stringify({
          lines: trimmedLines,
          styleTable,
          styledLines
        })
      );
    }
    if (snapshotVisualBytes > TERMINAL_BUFFER_SNAPSHOT_MAX_BYTES) {
      styleTable = [];
      styledLines = [];
    }
    const cursorRow = Math.max(
      0,
      Math.min(cursorState.row - startIndex, Math.max(0, trimmedLines.length - 1))
    );
    const replayText = trimTerminalReplayTextToMaxBytes(
      this.outputReplayText,
      TERMINAL_BUFFER_SNAPSHOT_MAX_BYTES
    );
    const snapshot = saveTerminalBufferSnapshot({
      sessionKey: this.sessionKey,
      lines: trimmedLines,
      styleTable,
      styledLines,
      replayText,
      bufferCols: this.terminalCols,
      bufferRows: this.terminalRows,
      cursorRow,
      cursorCol: cursorState.col
    });
    return snapshot;
  },

  restorePersistedTerminalBuffer() {
    const snapshot = getTerminalBufferSnapshot(this.sessionKey);
    if (!snapshot) {
      return;
    }
    /**
     * 真实日志已证明：页面恢复时若直接拿“已裁剪的 replayText”按默认 80x24 先重建，
     * 会把本来正确的快照行内容重建成空白和半截 footer。
     * 因此恢复第一页时优先使用精确的 line snapshot；后续若真实测量发现列数变化，
     * 仍可继续依赖 replayText 做几何重建。
     */
    this.outputReplayText = String(snapshot.replayText || "");
    this.outputReplayBytes = utf8ByteLength(this.outputReplayText);
    this.terminalCols = Math.max(1, Math.round(Number(snapshot.bufferCols) || this.terminalCols || 80));
    this.terminalRows = Math.max(1, Math.round(Number(snapshot.bufferRows) || this.terminalRows || 24));
    const rows =
      Array.isArray(snapshot.styledLines) && snapshot.styledLines.length > 0
        ? deserializeTerminalSnapshotRows(snapshot.styledLines, snapshot.styleTable)
        : null;
    const restoredRows =
      Array.isArray(rows) && rows.length > 0
        ? rows
        : Array.isArray(snapshot.lines) && snapshot.lines.length > 0
          ? snapshot.lines.map((line) => buildTerminalCellsFromText(line))
          : [[]];
    const cursorRow = Math.max(
      0,
      Math.min(Math.round(Number(snapshot.cursorRow) || 0), restoredRows.length - 1)
    );
    const cursorCol = Math.max(0, Math.round(Number(snapshot.cursorCol) || 0));
    this.applyTerminalBufferState({
      cells: restoredRows.length > 0 ? restoredRows : [[]],
      ansiState: cloneAnsiState(ANSI_RESET_STATE),
      cursorRow,
      cursorCol
    });
  },

  clearAutoReconnectTimer() {
    if (!this.autoReconnectTimer) {
      return;
    }
    clearTimeout(this.autoReconnectTimer);
    this.autoReconnectTimer = null;
  },

  /**
   * 本地主动结束当前连接时，必须先抑制自动重连：
   * 1. 手动断开；
   * 2. 页面 hide/unload 触发的 suspend；
   * 3. 其他本地明确终止场景。
   * 否则底层稍后补上的 `ws_closed` 会被误判成异常断线。
   */
  suppressAutoReconnect() {
    this.autoReconnectSuppressed = true;
    this.clearAutoReconnectTimer();
  },

  resetAutoReconnectState() {
    this.clearAutoReconnectTimer();
    this.autoReconnectAttempts = 0;
    this.autoReconnectSuppressed = false;
  },

  shouldAutoReconnect(reason) {
    const normalizedReason = String(reason || "").trim();
    const settings = getSettings();
    const reconnectLimit = Math.max(0, Number(settings.reconnectLimit) || 0);
    return (
      settings.autoReconnect === true &&
      reconnectLimit > 0 &&
      !this.autoReconnectSuppressed &&
      !this.sessionSuspended &&
      !AUTO_RECONNECT_IGNORED_REASONS.has(normalizedReason) &&
      !!this.server &&
      Number(this.autoReconnectAttempts || 0) < reconnectLimit
    );
  },

  /**
   * 小程序端自动重连策略：
   * 1. 仅对 SSH 非主动断开生效；
   * 2. 延迟采用轻量递增退避，避免瞬时抖动时立刻打爆网关；
   * 3. 用户下次主动点击“连接/重连”时会重置计数。
   */
  scheduleAutoReconnect(reason) {
    if (!this.shouldAutoReconnect(reason)) {
      return false;
    }
    this.autoReconnectAttempts = Number(this.autoReconnectAttempts || 0) + 1;
    const delayMs = Math.min(5000, this.autoReconnectAttempts * 1200);
    this.clearAutoReconnectTimer();
    this.setStatus("reconnecting");
    wx.showToast({
      title: `连接中断，${Math.max(1, Math.round(delayMs / 1000))} 秒后重连`,
      icon: "none"
    });
    this.autoReconnectTimer = setTimeout(() => {
      this.autoReconnectTimer = null;
      if (!this.shouldAutoReconnect(reason)) {
        return;
      }
      void this.connectGateway(true);
    }, delayMs);
    return true;
  },

  /**
   * 页面离开时挂起终端：
   * 1. 不向服务端发送 disconnect 控制帧，避免把 SSH 直接关掉；
   * 2. 先写入“可续接”快照，再关闭本地 WebSocket；
   * 3. 返回终端页时用同一个 sessionKey 恢复。
   */
  suspendTerminalSession(reason) {
    if (!this.client) {
      return;
    }
    if (this.sessionSuspended) {
      return;
    }
    this.sessionSuspended = true;
    this.suppressAutoReconnect();
    this.persistTerminalBufferSnapshot();
    markTerminalSessionResumable({
      serverId: this.data.serverId,
      serverLabel: this.data.serverLabel,
      sessionId: this.data.sessionId,
      sessionKey: this.sessionKey,
      activeAiProvider: this.normalizeActiveAiProvider(this.activeAiProvider),
      codexSandboxMode:
        this.normalizeActiveAiProvider(this.activeAiProvider) === "codex"
          ? normalizeCodexSandboxMode(this.activeCodexSandboxMode)
          : "",
      resumeGraceMs: this.resumeGraceMs
    });
    this.client.suspend(reason || "page_hide");
    this.aiSessionShellReady = false;
    this.client = null;
  },

  syncConnectionAction(status) {
    const reconnect = RECONNECT_STATES.has(status);
    const copy = this.data.copy || buildPageCopy(this.getCurrentLanguage(), "terminal");
    this.setData({
      connectionActionReconnect: reconnect,
      connectionActionText: reconnect
        ? copy?.connectionAction?.reconnect || "重连"
        : copy?.connectionAction?.disconnect || "断开",
      connectionActionDisabled:
        status === "connecting" || status === "auth_pending" || status === "reconnecting"
    });
  },

  setStatus(status) {
    const previous = this.data.statusText;
    const nextStatusClass = this.normalizeStatusClass(status);
    const nextDisconnectedHintVisible = resolveDisconnectedHintVisible(status);
    if (
      status === "connected" ||
      status === "disconnected" ||
      status === "error" ||
      status === "config_required"
    ) {
      this.clearWaitForConnectedTimer();
    }
    this.setData(
      {
        ...this.buildConnectionDiagnosticPayload({
          statusText: status,
          statusLabel: getStatusLabel(this.getCurrentLanguage(), status),
          statusClass: nextStatusClass,
          disconnectedHintVisible: nextDisconnectedHintVisible
        }),
        ...this.buildSessionInfoPayload({ statusText: status })
      },
      () => {
        const syncAfterStatusChange = () => {
          if (previous !== status) {
            this.syncTerminalOverlay();
          }
        };
        if (status === "connected") {
          syncAfterStatusChange();
          return;
        }
        if (!this.data.shellInputFocus && !this.data.shellInputValue && !this.keyboardSessionActive) {
          syncAfterStatusChange();
          return;
        }
        this.setData(
          {
            shellInputFocus: false,
            shellInputValue: "",
            shellInputCursor: 0
          },
          () => this.restoreOutputScrollAfterKeyboard(syncAfterStatusChange)
        );
      }
    );
    this.syncConnectionAction(status);
    if (status !== "connected") {
      this.resetTtsRoundState({
        keepAudioUrl: true,
        stopPlayback: true
      });
    }
    if (status === "connecting" || status === "auth_pending" || status === "connected") {
      this.persistTerminalSessionStatus(status);
    }

    if (previous !== status && status === "connected") {
      markServerConnected(this.data.serverId);
      emitSessionEvent("connected", { serverId: this.data.serverId, sessionId: this.data.sessionId });
    }
    if (previous !== status && status === "disconnected") {
      emitSessionEvent("disconnected", { serverId: this.data.serverId, sessionId: this.data.sessionId });
    }
    if (previous !== status) {
      this.logTerminalPerf("status.change", { from: previous, to: status });
    }
  },

  /**
   * 终端性能埋点只记录“阶段切换”和“慢步骤”，避免把 console 刷爆。
   */
  initTerminalPerfState() {
    const now = Date.now();
    this.terminalPerf = {
      pageLoadAt: now,
      connectStartedAt: 0,
      gatewaySocketOpenAt: 0,
      authPendingAt: 0,
      firstConnectedAt: 0,
      firstStdoutAt: 0,
      firstVisibleStdoutAt: 0,
      stdoutFrameCount: 0,
      visibleStdoutFrameCount: 0,
      stdoutBytes: 0,
      visibleStdoutBytes: 0,
      frameSeq: 0,
      layoutSeq: 0,
      overlaySeq: 0,
      codexLaunchAt: 0,
      codexCommandSentAt: 0,
      codexReadyAt: 0
    };
    this.terminalPerfRecentRecords = [];
    this.terminalPerfLastSnapshotAt = 0;
    this.terminalPerfLagTimer = null;
    this.terminalPerfLagExpectedAt = 0;
    this.activeTerminalStdoutTask = null;
    this.terminalPerfLogBuffer = ENABLE_TERMINAL_PERF_LOGS
      ? createTerminalPerfLogBuffer({
          windowMs: TERMINAL_PERF_LOG_WINDOW_MS,
          write: (summary) => {
            try {
              console.info(`${TERMINAL_PERF_LOG_PREFIX} ${JSON.stringify(summary)}`);
            } catch {
              console.info(TERMINAL_PERF_LOG_PREFIX, "perf.summary", summary);
            }
          }
        })
      : null;
  },

  /**
   * stdout 输出会非常碎，尤其是 Codex 启动阶段。
   * 这里单独维护一个“渲染调度器”，只负责：
   * 1. 把多个 stdout chunk 合并为一轮 layout + overlay；
   * 2. 当上一轮仍在飞行时，仅保留一轮待补跑请求，避免把 scroll-view 刷新堆积成风暴。
   */
  initTerminalRenderScheduler() {
    this.terminalRenderScheduler = createTerminalRenderScheduler({
      batchWindowMs: TERMINAL_OUTPUT_RENDER_BATCH_MS,
      runRender: (request, done) => this.performTerminalRenderRequest(request, done),
      onError: (error) => {
        if (!error) return;
        console.warn("[terminal.render.scheduler]", error);
      }
    });
  },

  clearPendingTerminalRender() {
    if (!this.terminalRenderScheduler || typeof this.terminalRenderScheduler.clearPending !== "function") {
      return;
    }
    this.terminalRenderScheduler.clearPending();
  },

  /**
   * stdout 时间片处理需要感知“用户刚操作过”：
   * 1. 当前 slice 到预算后应尽快让出主线程；
   * 2. 下一轮渲染不用追求吞吐优先，而应优先把按钮/输入反馈放出去。
   */
  markTerminalUserInput() {
    this.terminalStdoutUserInputPending = true;
  },

  consumeTerminalUserInputHint() {
    const value = !!this.terminalStdoutUserInputPending;
    this.terminalStdoutUserInputPending = false;
    return value;
  },

  clearTerminalStdoutCarry() {
    this.stdoutReplayCarryText = "";
    this.terminalSyncUpdateState = createTerminalSyncUpdateState();
  },

  requestTerminalRender(options, callback) {
    if (!this.terminalRenderScheduler) {
      this.initTerminalRenderScheduler();
    }
    this.terminalRenderScheduler.requestImmediate(options, callback);
  },

  queueTerminalOutputRender(sample) {
    if (!this.terminalRenderScheduler) {
      this.initTerminalRenderScheduler();
    }
    this.terminalRenderScheduler.requestStdout(sample);
    const schedulerSnapshot = this.getTerminalRenderSchedulerSnapshot();
    const pending = schedulerSnapshot && schedulerSnapshot.pending ? schedulerSnapshot.pending : null;
    if (
      pending &&
      (Number(pending.waitMs) >= TERMINAL_PERF_STDOUT_BACKLOG_WARN_MS ||
        Number(pending.stdoutRawBytes) >= TERMINAL_PERF_STDOUT_BACKLOG_WARN_BYTES)
    ) {
      const payload = {
        queueWaitMs: Number(pending.waitMs) || 0,
        pendingStdoutSamples: Number(pending.stdoutSampleCount) || 0,
        pendingStdoutBytes: Number(pending.stdoutRawBytes) || 0,
        visibleBytes: Number(pending.stdoutVisibleBytes) || 0
      };
      payload.suspectedBottleneck = pickTerminalPerfSuspectedBottleneck(payload);
      this.logTerminalPerf("stdout.scheduler.backlog", payload);
    }
  },

  /**
   * 为当前调度请求创建 stdout 任务：
   * 1. 把上一轮残留的不完整控制序列前缀拼回本轮文本；
   * 2. 记录整批指标，供最终 `stdout.append` 汇总；
   * 3. 真正的处理在后续 slice 中逐步推进，不再一次性把整批文本同步做完。
   */
  createQueuedTerminalOutputTask(request) {
    const samples = Array.isArray(request && request.stdoutSamples) ? request.stdoutSamples : [];
    const bufferOptions = this.buildTerminalBufferOptions();
    const earliestAppendStartedAt = samples.reduce((min, item) => {
      const value = Number(item && item.appendStartedAt) || 0;
      if (!value) return min;
      if (!min) return value;
      return Math.min(min, value);
    }, 0);
    const combinedText = `${this.stdoutReplayCarryText || ""}${samples.map((item) => String(item && item.text ? item.text : "")).join("")}`;
    this.stdoutReplayCarryText = "";
    const cloneStartedAt = Date.now();
    const activeRows = this.getOutputBufferRows();
    const task = {
      createdAt: cloneStartedAt,
      chunkCount: samples.length,
      totalRawBytes: utf8ByteLength(combinedText),
      totalVisibleBytes: samples.reduce((sum, item) => sum + (Number(item && item.visibleBytes) || 0), 0),
      visibleFrameCount: samples.reduce(
        (max, item) => Math.max(max, Number(item && item.visibleFrameCount) || 0),
        0
      ),
      appendStartedAt: earliestAppendStartedAt || 0,
      processingStartedAt: 0,
      processingDoneAt: 0,
      cloneCostMs: 0,
      applyCostMs: 0,
      trimCostMs: 0,
      stateApplyCostMs: 0,
      responseCount: 0,
      sliceCount: 0,
      renderPassCount: 0,
      layoutPassCount: 0,
      overlayPassCount: 0,
      deferredRenderPassCount: 0,
      layoutCostMs: 0,
      overlayCostMs: 0,
      totalRenderBuildCostMs: 0,
      totalSetDataCostMs: 0,
      totalPostLayoutCostMs: 0,
      maxLayoutCostMs: 0,
      maxRenderBuildCostMs: 0,
      maxSetDataCostMs: 0,
      maxPostLayoutCostMs: 0,
      maxOverlayCostMs: 0,
      lastRenderCompletedAt: 0,
      lastOverlayCompletedAt: 0,
      skippedOverlayPassCount: 0,
      carriedBytes: 0,
      processedTextBytes: 0,
      maxEntriesTrimmedRows: 0,
      maxBytesTrimmedRows: 0,
      maxBytesTrimmedColumns: 0,
      bufferOptions,
      layoutRect: null,
      remainingText: combinedText,
      state: samples.length > 0 ? this.captureTerminalBufferState({ cloneRows: false }) : null,
      activeRowCount: countTerminalRows(activeRows),
      diagnosticSummary: null,
      pendingReplayText: "",
      pendingReplayBytes: 0,
      pendingResponses: [],
      lastSliceMetrics: null,
      slicesSinceLastRender: 0,
      lastRenderDecisionReason: "",
      lastRenderDecisionPolicy: ""
    };
    task.cloneCostMs = Date.now() - cloneStartedAt;
    this.activeTerminalStdoutTask = task;
    if (samples.length > 0 && !task.appendStartedAt) {
      task.appendStartedAt = cloneStartedAt;
    }
    return task;
  },

  /**
   * 将当前 stdout 任务在一个很短的时间片内推进一段：
   * 1. 单次只处理若干个“安全切片”；
   * 2. 控制序列和 CRLF 不会被从中间截断；
   * 3. 当用户刚有输入时，本轮会更积极让出主线程。
   */
  applyQueuedTerminalOutputBatch(request) {
    if (!request || !Array.isArray(request.stdoutSamples) || request.stdoutSamples.length === 0) {
      return null;
    }
    const task =
      request.stdoutTask && typeof request.stdoutTask === "object"
        ? request.stdoutTask
        : this.createQueuedTerminalOutputTask(request);
    request.stdoutTask = task;
    this.activeTerminalStdoutTask = task;
    if (!task.state) {
      this.activeTerminalStdoutTask = null;
      return {
        task,
        done: true,
        shouldRender: false,
        sliceMetrics: null
      };
    }
    const sliceStartedAt = Date.now();
    const yieldToUserInput = this.consumeTerminalUserInputHint();
    const sliceBudgetMs = yieldToUserInput
      ? Math.max(1, Math.floor(TERMINAL_OUTPUT_WRITE_SLICE_MS / 2))
      : TERMINAL_OUTPUT_WRITE_SLICE_MS;
    let processedTextBytes = 0;
    let processedUnitCount = 0;
    let applyCostMs = 0;
    let trimCostMs = 0;
    let carryBytes = 0;
    if (!task.processingStartedAt) {
      task.processingStartedAt = sliceStartedAt;
    }

    while (task.remainingText) {
      const nextSlice = takeTerminalReplaySlice(task.remainingText, TERMINAL_OUTPUT_WRITE_SLICE_CHARS);
      if (!nextSlice || !nextSlice.slice) {
        carryBytes = utf8ByteLength(task.remainingText);
        task.carriedBytes += carryBytes;
        this.stdoutReplayCarryText = task.remainingText;
        task.remainingText = "";
        break;
      }
      const applyStartedAt = Date.now();
      const result = applyTerminalOutput(task.state, nextSlice.slice, task.bufferOptions, {
        ...this.buildTerminalBufferRuntimeOptions(),
        reuseState: true,
        reuseRows: true
      });
      const currentApplyCostMs = Date.now() - applyStartedAt;
      task.applyCostMs += currentApplyCostMs;
      applyCostMs += currentApplyCostMs;
      task.state = result.state;
      task.diagnosticSummary = null;
      task.pendingReplayText = `${task.pendingReplayText || ""}${String(result.cleanText || "")}`;
      task.pendingReplayBytes += utf8ByteLength(String(result.cleanText || ""));
      if (Array.isArray(result.responses) && result.responses.length > 0) {
        task.pendingResponses.push(...result.responses.filter(Boolean));
        task.responseCount += result.responses.length;
      }
      task.remainingText = nextSlice.rest;
      processedTextBytes += utf8ByteLength(nextSlice.slice);
      task.processedTextBytes += utf8ByteLength(nextSlice.slice);
      processedUnitCount += 1;
      task.sliceCount += 1;
      if (result.metrics) {
        const currentTrimCostMs = Number(result.metrics.trimCostMs) || 0;
        task.trimCostMs += currentTrimCostMs;
        trimCostMs += currentTrimCostMs;
        task.maxEntriesTrimmedRows += Number(result.metrics.maxEntriesTrimmedRows) || 0;
        task.maxBytesTrimmedRows += Number(result.metrics.maxBytesTrimmedRows) || 0;
        task.maxBytesTrimmedColumns += Number(result.metrics.maxBytesTrimmedColumns) || 0;
      }
      if (yieldToUserInput || Date.now() - sliceStartedAt >= sliceBudgetMs) {
        break;
      }
    }

    let stateApplyCostMs = 0;
    const hasPendingVisualCommit =
      processedUnitCount > 0 || !!task.pendingReplayText || task.pendingResponses.length > 0;
    const remainingBytes = utf8ByteLength(task.remainingText || "");
    const taskDone = remainingBytes <= 0;
    const nextSlicesSinceLastRender = task.slicesSinceLastRender + processedUnitCount;
    const schedulerSnapshot = this.getTerminalRenderSchedulerSnapshot();
    const pendingScheduler =
      schedulerSnapshot && schedulerSnapshot.pending ? schedulerSnapshot.pending : null;
    const timeSinceLastRenderMs = task.lastRenderCompletedAt
      ? Math.max(0, Date.now() - Number(task.lastRenderCompletedAt))
      : Number.MAX_SAFE_INTEGER;
    const activeStdoutAgeMs = task.processingStartedAt
      ? Math.max(0, Date.now() - Number(task.processingStartedAt))
      : 0;
    const renderDecision = hasPendingVisualCommit
      ? resolveTerminalStdoutRenderDecision({
          yieldedToUserInput: yieldToUserInput,
          pendingResponseCount: task.pendingResponses.length,
          remainingBytes,
          pendingReplayBytes: task.pendingReplayBytes,
          nextSlicesSinceLastRender,
          timeSinceLastRenderMs,
          taskDone,
          totalRawBytes: task.totalRawBytes,
          pendingStdoutBytes: Number(pendingScheduler && pendingScheduler.stdoutRawBytes) || 0,
          pendingStdoutSamples: Number(pendingScheduler && pendingScheduler.stdoutSampleCount) || 0,
          schedulerWaitMs: Number(pendingScheduler && pendingScheduler.waitMs) || 0,
          activeStdoutAgeMs
        })
      : { defer: false, reason: "", policy: "" };
    const deferVisualCommit = hasPendingVisualCommit && renderDecision.defer;
    const shouldRender = hasPendingVisualCommit && !deferVisualCommit;
    if (hasPendingVisualCommit) {
      const stateApplyStartedAt = Date.now();
      /**
       * stdout 冷却期里的 defer slice 不需要立刻把 replay 文本和可视 rows 全量投影回页面：
       * 1. 模式位、cursor 等逻辑态仍需更新，保证键盘编码/焦点协议正确；
       * 2. 真正要 render 时，再一次性提交累积的 replay 文本和可视 rows。
       */
      if (shouldRender && task.pendingReplayText) {
        this.syncTerminalReplayBuffer(task.pendingReplayText);
      }
      if (shouldRender) {
        this.applyTerminalBufferState(task.state, { useReferences: true });
      } else {
        this.applyTerminalBufferRuntimeState(task.state, { useReferences: true });
      }
      if (this.client && task.pendingResponses.length > 0) {
        try {
          task.pendingResponses.forEach((payload) => {
            if (payload) {
              this.client.sendStdin(payload);
            }
          });
        } catch (error) {
          this.handleError(error);
        }
      }
      if (shouldRender) {
        task.pendingReplayText = "";
      }
      task.pendingResponses = [];
      stateApplyCostMs = Date.now() - stateApplyStartedAt;
      task.stateApplyCostMs += stateApplyCostMs;
    }
    if (shouldRender) {
      task.pendingReplayBytes = 0;
      task.slicesSinceLastRender = 0;
      task.lastRenderDecisionReason = String(renderDecision.reason || "");
      task.lastRenderDecisionPolicy = String(renderDecision.policy || "");
    } else if (hasPendingVisualCommit) {
      task.slicesSinceLastRender = nextSlicesSinceLastRender;
      task.deferredRenderPassCount += 1;
      task.lastRenderDecisionReason = String(renderDecision.reason || "");
      task.lastRenderDecisionPolicy = String(renderDecision.policy || "");
    }

    task.processingDoneAt = Date.now();
    const overBudgetMs = Math.max(0, task.processingDoneAt - sliceStartedAt - sliceBudgetMs);
    task.lastSliceMetrics = {
      sliceStartedAt,
      sliceDoneAt: task.processingDoneAt,
      processedTextBytes,
      processedUnitCount,
      applyCostMs,
      trimCostMs,
      stateApplyCostMs,
      carryBytes,
      yieldedToUserInput: yieldToUserInput,
      remainingBytes,
      deferredVisualCommit: deferVisualCommit,
      overBudgetMs,
      renderDecisionReason: String(renderDecision.reason || ""),
      renderDecisionPolicy: String(renderDecision.policy || "")
    };
    return {
      task,
      done: !task.remainingText,
      shouldRender,
      sliceMetrics: task.lastSliceMetrics
    };
  },

  logTerminalStdoutSlicePerf(request, task, sliceMetrics, layoutDoneAt, renderDoneAt) {
    if (!task || !sliceMetrics || sliceMetrics.processedUnitCount <= 0) {
      return;
    }
    const totalCostMs = Math.max(0, renderDoneAt - sliceMetrics.sliceStartedAt);
    const layoutCostMs = Math.max(0, layoutDoneAt - sliceMetrics.sliceDoneAt);
    const overlayCostMs = Math.max(0, renderDoneAt - layoutDoneAt);
    task.layoutCostMs += layoutCostMs;
    task.overlayCostMs += overlayCostMs;
    const shouldLog =
      task.sliceCount <= TERMINAL_OUTPUT_WRITE_SLICE_INITIAL_LOG_LIMIT ||
      sliceMetrics.yieldedToUserInput ||
      totalCostMs >= TERMINAL_PERF_SLOW_STEP_MS;
    if (!shouldLog) {
      return;
    }
    this.logTerminalPerf(totalCostMs >= TERMINAL_PERF_LONG_TASK_MS ? "stdout.slice.long" : "stdout.slice", {
      totalCostMs,
      queueWaitMs: Math.max(
        0,
        Number(task.processingStartedAt || sliceMetrics.sliceStartedAt) -
          Number(task.appendStartedAt || task.createdAt || sliceMetrics.sliceStartedAt)
      ),
      applyCostMs: sliceMetrics.applyCostMs,
      trimCostMs: sliceMetrics.trimCostMs,
      stateApplyCostMs: sliceMetrics.stateApplyCostMs,
      layoutCostMs,
      overlayCostMs,
      processedTextBytes: sliceMetrics.processedTextBytes,
      processedUnitCount: sliceMetrics.processedUnitCount,
      remainingBytes: sliceMetrics.remainingBytes,
      carryBytes: sliceMetrics.carryBytes,
      sliceCount: task.sliceCount,
      yieldedToUserInput: sliceMetrics.yieldedToUserInput,
      activeRowCount: Number(task.activeRowCount) || 0,
      activeCellCount: Number((this.ensureStdoutTaskDiagnosticSummary(task) || {}).activeCellCount) || 0,
      overBudgetMs: Number(sliceMetrics.overBudgetMs) || 0,
      renderDecisionReason: String(sliceMetrics.renderDecisionReason || ""),
      renderDecisionPolicy: String(sliceMetrics.renderDecisionPolicy || ""),
      renderReason: String((request && request.reason) || "")
    });
  },

  flushScheduledStdoutRenderPerf(request, outputMetrics, renderDoneAt) {
    const metrics = outputMetrics && typeof outputMetrics === "object" ? outputMetrics : null;
    if (!metrics || !metrics.chunkCount) {
      return;
    }
    const appendStartedAt =
      Number(metrics.appendStartedAt) || Number(metrics.processingStartedAt) || renderDoneAt;
    const totalCostMs = Math.max(0, renderDoneAt - appendStartedAt);
    if (!this.shouldLogTerminalPerfFrame(metrics.visibleFrameCount, totalCostMs)) {
      return;
    }
    const schedulerSnapshot = this.getTerminalRenderSchedulerSnapshot();
    const pendingScheduler =
      schedulerSnapshot && schedulerSnapshot.pending ? schedulerSnapshot.pending : null;
    const activeTaskSummary = this.ensureStdoutTaskDiagnosticSummary(metrics) || {};
    const event = totalCostMs >= TERMINAL_PERF_LONG_TASK_MS ? "stdout.append.long" : "stdout.append";
    const payload = {
      totalCostMs,
      queueWaitMs: Math.max(0, (Number(metrics.processingStartedAt) || appendStartedAt) - appendStartedAt),
      schedulerWaitMs: Number(pendingScheduler && pendingScheduler.waitMs) || 0,
      batchWaitMs: Math.max(0, (Number(metrics.processingStartedAt) || appendStartedAt) - appendStartedAt),
      cloneCostMs: Number(metrics.cloneCostMs) || 0,
      applyCostMs: Number(metrics.applyCostMs) || 0,
      trimCostMs: Number(metrics.trimCostMs) || 0,
      stateApplyCostMs: Number(metrics.stateApplyCostMs) || 0,
      layoutCostMs: Number(metrics.layoutCostMs) || 0,
      overlayCostMs: Number(metrics.overlayCostMs) || 0,
      visibleBytes: Number(metrics.totalVisibleBytes) || 0,
      activeStdoutBytes: Number(metrics.totalRawBytes) || 0,
      responseCount: Number(metrics.responseCount) || 0,
      renderRowCount: this.data.outputRenderLines.length,
      replayBytes: this.outputReplayBytes,
      chunkCount: Number(metrics.chunkCount) || 0,
      sliceCount: Number(metrics.sliceCount) || 0,
      renderPassCount: Number(metrics.renderPassCount) || 0,
      layoutPassCount: Number(metrics.layoutPassCount) || 0,
      overlayPassCount: Number(metrics.overlayPassCount) || 0,
      deferredRenderPassCount: Number(metrics.deferredRenderPassCount) || 0,
      skippedOverlayPassCount: Number(metrics.skippedOverlayPassCount) || 0,
      carryBytes: Number(metrics.carriedBytes) || 0,
      totalRenderBuildCostMs: Number(metrics.totalRenderBuildCostMs) || 0,
      totalSetDataCostMs: Number(metrics.totalSetDataCostMs) || 0,
      totalPostLayoutCostMs: Number(metrics.totalPostLayoutCostMs) || 0,
      maxLayoutCostMs: Number(metrics.maxLayoutCostMs) || 0,
      maxRenderBuildCostMs: Number(metrics.maxRenderBuildCostMs) || 0,
      maxSetDataCostMs: Number(metrics.maxSetDataCostMs) || 0,
      maxPostLayoutCostMs: Number(metrics.maxPostLayoutCostMs) || 0,
      maxOverlayCostMs: Number(metrics.maxOverlayCostMs) || 0,
      activeRowCount: Number(activeTaskSummary.activeRowCount) || 0,
      activeCellCount: Number(activeTaskSummary.activeCellCount) || 0,
      pendingStdoutSamples: Number(pendingScheduler && pendingScheduler.stdoutSampleCount) || 0,
      pendingStdoutBytes: Number(pendingScheduler && pendingScheduler.stdoutRawBytes) || 0,
      lastRenderDecisionReason: String(metrics.lastRenderDecisionReason || ""),
      lastRenderDecisionPolicy: String(metrics.lastRenderDecisionPolicy || ""),
      renderReason: String((request && request.reason) || "")
    };
    payload.suspectedBottleneck = pickTerminalPerfSuspectedBottleneck(payload);
    this.logTerminalPerf(event, payload);
    if (event === "stdout.append.long") {
      this.emitTerminalPerfDiagnosticSnapshot("stdout_append_long", {
        suspectedBottleneck: payload.suspectedBottleneck,
        stdoutTask: this.getActiveStdoutTaskSnapshot(),
        scheduler: schedulerSnapshot
      });
    }
  },

  /**
   * 页面层真正的“重渲染”仍保持原有顺序：
   * 1. stdout 若仍有剩余，会按“处理一个 slice -> 渲染一次 -> setTimeout 续跑”的顺序推进；
   * 2. 这样可以让按钮/输入事件在 slice 之间获得调度机会；
   * 3. 非 stdout 的立即渲染仍保持原有顺序：先刷新输出布局，再同步 overlay。
   */
  performTerminalRenderRequest(request, callback) {
    const done = typeof callback === "function" ? callback : null;
    const options = request && typeof request === "object" ? request.options : {};
    const stdoutResult = this.applyQueuedTerminalOutputBatch(request);
    const outputMetrics = stdoutResult && stdoutResult.task ? stdoutResult.task : null;
    const shouldRender = !stdoutResult || stdoutResult.shouldRender;
    const continueStdout = !!(stdoutResult && !stdoutResult.done);
    const layoutOptions =
      outputMetrics && outputMetrics.layoutRect && continueStdout && !options.sendResize
        ? {
            ...options,
            rect: outputMetrics.layoutRect,
            reuseRect: true,
            skipPostLayoutRectQuery: true
          }
        : options;
    if (!shouldRender) {
      if (continueStdout) {
        setTimeout(() => {
          this.performTerminalRenderRequest(request, callback);
        }, 0);
        return;
      }
      this.activeTerminalStdoutTask = null;
      if (done) {
        done(null);
      }
      return;
    }
    if (outputMetrics) {
      outputMetrics.renderPassCount += 1;
    }
    this.refreshOutputLayout(layoutOptions, (viewState) => {
      const layoutDoneAt = Date.now();
      if (outputMetrics) {
        outputMetrics.layoutRect = cloneOutputRectSnapshot(viewState && viewState.rect);
        if (viewState && viewState.perf) {
          outputMetrics.layoutPassCount += 1;
          outputMetrics.totalRenderBuildCostMs += Number(viewState.perf.renderBuildCostMs) || 0;
          outputMetrics.totalSetDataCostMs += Number(viewState.perf.setDataCostMs) || 0;
          outputMetrics.totalPostLayoutCostMs += Number(viewState.perf.postLayoutCostMs) || 0;
          outputMetrics.maxLayoutCostMs = Math.max(
            Number(outputMetrics.maxLayoutCostMs) || 0,
            Number(viewState.perf.totalCostMs) || 0
          );
          outputMetrics.maxRenderBuildCostMs = Math.max(
            Number(outputMetrics.maxRenderBuildCostMs) || 0,
            Number(viewState.perf.renderBuildCostMs) || 0
          );
          outputMetrics.maxSetDataCostMs = Math.max(
            Number(outputMetrics.maxSetDataCostMs) || 0,
            Number(viewState.perf.setDataCostMs) || 0
          );
          outputMetrics.maxPostLayoutCostMs = Math.max(
            Number(outputMetrics.maxPostLayoutCostMs) || 0,
            Number(viewState.perf.postLayoutCostMs) || 0
          );
        }
      }
      const overlayContext =
        viewState && viewState.rect
          ? {
              rect: viewState.rect,
              stabilizeCaretDuringStdout: true,
              forceCaretCommit: !!(
                !continueStdout ||
                (stdoutResult &&
                  stdoutResult.sliceMetrics &&
                  stdoutResult.sliceMetrics.yieldedToUserInput)
              ),
              cursorMetrics: {
                lineHeight: viewState.lineHeight,
                charWidth: viewState.charWidth,
                paddingLeft: viewState.paddingLeft,
                paddingRight: viewState.paddingRight,
                cursorRow: viewState.cursorRow,
                cursorCol: viewState.cursorCol,
                rows: viewState.rows
              }
            }
          : null;
      const overlayDecision = resolveTerminalStdoutOverlayDecision({
        isFinalRender: !continueStdout,
        yieldedToUserInput: !!(
          stdoutResult &&
          stdoutResult.sliceMetrics &&
          stdoutResult.sliceMetrics.yieldedToUserInput
        ),
        overlayPassCount: Number(outputMetrics && outputMetrics.overlayPassCount) || 0,
        timeSinceLastOverlayMs:
          outputMetrics && outputMetrics.lastOverlayCompletedAt
            ? Math.max(0, layoutDoneAt - Number(outputMetrics.lastOverlayCompletedAt))
            : Number.MAX_SAFE_INTEGER
      });
      const finalizeAfterRender = (overlayPerf) => {
        const renderDoneAt = Date.now();
        if (outputMetrics && overlayPerf) {
          outputMetrics.overlayPassCount += 1;
          outputMetrics.lastOverlayCompletedAt = renderDoneAt;
          outputMetrics.maxOverlayCostMs = Math.max(
            Number(outputMetrics.maxOverlayCostMs) || 0,
            Number(overlayPerf.costMs) || 0
          );
        } else if (outputMetrics) {
          outputMetrics.skippedOverlayPassCount += 1;
        }
        if (outputMetrics) {
          outputMetrics.lastRenderCompletedAt = renderDoneAt;
        }
        if (stdoutResult && stdoutResult.sliceMetrics) {
          this.logTerminalStdoutSlicePerf(
            request,
            outputMetrics,
            stdoutResult.sliceMetrics,
            layoutDoneAt,
            renderDoneAt
          );
        }
        if (continueStdout) {
          setTimeout(() => {
            this.performTerminalRenderRequest(request, callback);
          }, 0);
          return;
        }
        this.flushScheduledStdoutRenderPerf(request, outputMetrics, renderDoneAt);
        if (request && request.stdoutTask) {
          request.stdoutTask = null;
        }
        this.activeTerminalStdoutTask = null;
        if (done) {
          done(viewState);
        }
      };
      if (!overlayDecision.sync) {
        finalizeAfterRender(null);
        return;
      }
      this.syncTerminalOverlay(overlayContext || undefined, (overlayPerf) => {
        finalizeAfterRender(overlayPerf || null);
      });
    });
  },

  logTerminalPerf(event, payload) {
    if (!ENABLE_TERMINAL_PERF_LOGS) {
      return;
    }
    const perf = this.terminalPerf || {};
    const now = Date.now();
    const record = {
      event,
      at: now,
      sinceLoadMs: Math.max(0, now - (Number(perf.pageLoadAt) || now)),
      status: String(this.data.statusText || ""),
      ...(payload && typeof payload === "object" ? payload : {})
    };
    if (!record.suspectedBottleneck) {
      record.suspectedBottleneck = pickTerminalPerfSuspectedBottleneck(record);
    }
    this.rememberTerminalPerfRecord(record);
    if (!this.terminalPerfLogBuffer) {
      return;
    }
    this.terminalPerfLogBuffer.push(record);
  },

  rememberTerminalPerfRecord(record) {
    if (!ENABLE_TERMINAL_PERF_LOGS) {
      return;
    }
    if (!Array.isArray(this.terminalPerfRecentRecords)) {
      this.terminalPerfRecentRecords = [];
    }
    this.terminalPerfRecentRecords.push(buildCompactTerminalPerfRecord(record));
    if (this.terminalPerfRecentRecords.length > TERMINAL_PERF_RECENT_RECORD_LIMIT) {
      this.terminalPerfRecentRecords.splice(
        0,
        this.terminalPerfRecentRecords.length - TERMINAL_PERF_RECENT_RECORD_LIMIT
      );
    }
  },

  flushTerminalPerfLogs(reason) {
    if (!this.terminalPerfLogBuffer) {
      return null;
    }
    return this.terminalPerfLogBuffer.flush(reason || "manual");
  },

  clearTerminalPerfLogs() {
    if (!this.terminalPerfLogBuffer) {
      return;
    }
    this.terminalPerfLogBuffer.clear();
    this.terminalPerfRecentRecords = [];
  },

  getTerminalRenderSchedulerSnapshot() {
    if (!this.terminalRenderScheduler || typeof this.terminalRenderScheduler.getSnapshot !== "function") {
      return null;
    }
    return this.terminalRenderScheduler.getSnapshot();
  },

  ensureStdoutTaskDiagnosticSummary(task) {
    const source = task && typeof task === "object" ? task : null;
    if (!source) {
      return null;
    }
    if (source.diagnosticSummary) {
      return source.diagnosticSummary;
    }
    const state = source.state && typeof source.state === "object" ? source.state : null;
    const activeBuffer =
      state && state.buffers
        ? state.activeBuffer === "alt"
          ? state.buffers.alt
          : state.buffers.normal
        : null;
    const activeRows = Array.isArray(activeBuffer && activeBuffer.cells) ? activeBuffer.cells : [];
    source.diagnosticSummary = {
      activeBufferName: activeBuffer && activeBuffer.isAlt ? "alt" : "normal",
      activeRowCount: countTerminalRows(activeRows),
      activeCellCount: countTerminalCells(activeRows)
    };
    return source.diagnosticSummary;
  },

  getActiveStdoutTaskSnapshot() {
    const task =
      this.activeTerminalStdoutTask && typeof this.activeTerminalStdoutTask === "object"
        ? this.activeTerminalStdoutTask
        : null;
    if (!task) {
      return null;
    }
    const summary = this.ensureStdoutTaskDiagnosticSummary(task) || {};
    return {
      chunkCount: Number(task.chunkCount) || 0,
      totalRawBytes: Number(task.totalRawBytes) || 0,
      remainingBytes: utf8ByteLength(task.remainingText || ""),
      pendingReplayBytes: Number(task.pendingReplayBytes) || 0,
      responseCount: Number(task.responseCount) || 0,
      sliceCount: Number(task.sliceCount) || 0,
      renderPassCount: Number(task.renderPassCount) || 0,
      layoutPassCount: Number(task.layoutPassCount) || 0,
      overlayPassCount: Number(task.overlayPassCount) || 0,
      deferredRenderPassCount: Number(task.deferredRenderPassCount) || 0,
      skippedOverlayPassCount: Number(task.skippedOverlayPassCount) || 0,
      queueWaitMs: task.processingStartedAt
        ? Math.max(0, Number(task.processingStartedAt) - Number(task.appendStartedAt || task.createdAt || 0))
        : Math.max(0, Date.now() - Number(task.appendStartedAt || task.createdAt || Date.now())),
      activeStdoutAgeMs: Math.max(
        0,
        Date.now() - Number(task.processingStartedAt || task.createdAt || Date.now())
      ),
      cloneCostMs: Number(task.cloneCostMs) || 0,
      applyCostMs: Number(task.applyCostMs) || 0,
      trimCostMs: Number(task.trimCostMs) || 0,
      stateApplyCostMs: Number(task.stateApplyCostMs) || 0,
      layoutCostMs: Number(task.layoutCostMs) || 0,
      overlayCostMs: Number(task.overlayCostMs) || 0,
      totalRenderBuildCostMs: Number(task.totalRenderBuildCostMs) || 0,
      totalSetDataCostMs: Number(task.totalSetDataCostMs) || 0,
      totalPostLayoutCostMs: Number(task.totalPostLayoutCostMs) || 0,
      maxLayoutCostMs: Number(task.maxLayoutCostMs) || 0,
      maxRenderBuildCostMs: Number(task.maxRenderBuildCostMs) || 0,
      maxSetDataCostMs: Number(task.maxSetDataCostMs) || 0,
      maxPostLayoutCostMs: Number(task.maxPostLayoutCostMs) || 0,
      maxOverlayCostMs: Number(task.maxOverlayCostMs) || 0,
      activeRowCount: Number(summary.activeRowCount) || 0,
      activeCellCount: Number(summary.activeCellCount) || 0,
      activeBufferName: summary.activeBufferName || "normal",
      lastRenderDecisionReason: String(task.lastRenderDecisionReason || ""),
      lastRenderDecisionPolicy: String(task.lastRenderDecisionPolicy || "")
    };
  },

  emitTerminalPerfDiagnosticSnapshot(reason, extra) {
    if (!ENABLE_TERMINAL_PERF_LOGS) {
      return null;
    }
    const now = Date.now();
    if (now - Number(this.terminalPerfLastSnapshotAt || 0) < TERMINAL_PERF_DIAG_SNAPSHOT_COOLDOWN_MS) {
      return null;
    }
    this.terminalPerfLastSnapshotAt = now;
    const snapshot = {
      event: "perf.snapshot",
      reason: String(reason || "manual"),
      at: now,
      status: String(this.data.statusText || ""),
      extra: extra && typeof extra === "object" ? extra : {},
      recent: Array.isArray(this.terminalPerfRecentRecords)
        ? this.terminalPerfRecentRecords.slice(-TERMINAL_PERF_DIAG_SNAPSHOT_LIMIT)
        : []
    };
    try {
      console.info(`${TERMINAL_PERF_LOG_PREFIX} ${JSON.stringify(snapshot)}`);
    } catch {
      console.info(TERMINAL_PERF_LOG_PREFIX, "perf.snapshot", snapshot);
    }
    return snapshot;
  },

  shouldLogTerminalPerfFrame(index, costMs) {
    return index <= TERMINAL_PERF_INITIAL_FRAME_LOG_LIMIT || costMs >= TERMINAL_PERF_SLOW_STEP_MS;
  },

  startTerminalPerfLagProbe() {
    if (!ENABLE_TERMINAL_PERF_LOGS) {
      return;
    }
    if (this.terminalPerfLagTimer) {
      return;
    }
    this.terminalPerfLagExpectedAt = Date.now() + TERMINAL_PERF_LAG_SAMPLE_MS;
    this.terminalPerfLagTimer = setInterval(() => {
      const now = Date.now();
      const driftMs = now - this.terminalPerfLagExpectedAt;
      this.terminalPerfLagExpectedAt = now + TERMINAL_PERF_LAG_SAMPLE_MS;
      if (driftMs < TERMINAL_PERF_LAG_WARN_MS) {
        return;
      }
      const perf = this.terminalPerf || {};
      const schedulerSnapshot = this.getTerminalRenderSchedulerSnapshot();
      const activeTaskSnapshot = this.getActiveStdoutTaskSnapshot();
      const pendingScheduler =
        schedulerSnapshot && schedulerSnapshot.pending ? schedulerSnapshot.pending : null;
      const activeScheduler = schedulerSnapshot && schedulerSnapshot.active ? schedulerSnapshot.active : null;
      const payload = {
        driftMs,
        stdoutFrames: perf.stdoutFrameCount || 0,
        visibleStdoutFrames: perf.visibleStdoutFrameCount || 0,
        stdoutBytes: perf.stdoutBytes || 0,
        visibleStdoutBytes: perf.visibleStdoutBytes || 0,
        pendingStdoutSamples: Number(pendingScheduler && pendingScheduler.stdoutSampleCount) || 0,
        pendingStdoutBytes: Number(pendingScheduler && pendingScheduler.stdoutRawBytes) || 0,
        schedulerWaitMs: Number(pendingScheduler && pendingScheduler.waitMs) || 0,
        activeStdoutAgeMs: Number(activeTaskSnapshot && activeTaskSnapshot.activeStdoutAgeMs) || 0,
        activeStdoutBytes: Number(activeTaskSnapshot && activeTaskSnapshot.totalRawBytes) || 0,
        queueWaitMs: Number(activeTaskSnapshot && activeTaskSnapshot.queueWaitMs) || 0,
        cloneCostMs: Number(activeTaskSnapshot && activeTaskSnapshot.cloneCostMs) || 0,
        applyCostMs: Number(activeTaskSnapshot && activeTaskSnapshot.applyCostMs) || 0,
        trimCostMs: Number(activeTaskSnapshot && activeTaskSnapshot.trimCostMs) || 0,
        stateApplyCostMs: Number(activeTaskSnapshot && activeTaskSnapshot.stateApplyCostMs) || 0,
        layoutCostMs: Number(activeTaskSnapshot && activeTaskSnapshot.layoutCostMs) || 0,
        overlayCostMs: Number(activeTaskSnapshot && activeTaskSnapshot.overlayCostMs) || 0,
        renderPassCount: Number(activeTaskSnapshot && activeTaskSnapshot.renderPassCount) || 0,
        layoutPassCount: Number(activeTaskSnapshot && activeTaskSnapshot.layoutPassCount) || 0,
        overlayPassCount: Number(activeTaskSnapshot && activeTaskSnapshot.overlayPassCount) || 0,
        deferredRenderPassCount:
          Number(activeTaskSnapshot && activeTaskSnapshot.deferredRenderPassCount) || 0,
        skippedOverlayPassCount:
          Number(activeTaskSnapshot && activeTaskSnapshot.skippedOverlayPassCount) || 0,
        activeRowCount: Number(activeTaskSnapshot && activeTaskSnapshot.activeRowCount) || 0,
        activeCellCount: Number(activeTaskSnapshot && activeTaskSnapshot.activeCellCount) || 0,
        inFlightStdoutSamples: Number(activeScheduler && activeScheduler.stdoutSampleCount) || 0,
        inFlightStdoutBytes: Number(activeScheduler && activeScheduler.stdoutRawBytes) || 0
      };
      payload.suspectedBottleneck = pickTerminalPerfSuspectedBottleneck(payload);
      this.logTerminalPerf("main_thread_lag", payload);
      this.emitTerminalPerfDiagnosticSnapshot("main_thread_lag", {
        suspectedBottleneck: payload.suspectedBottleneck,
        driftMs,
        scheduler: schedulerSnapshot,
        stdoutTask: activeTaskSnapshot
      });
    }, TERMINAL_PERF_LAG_SAMPLE_MS);
  },

  stopTerminalPerfLagProbe() {
    if (!this.terminalPerfLagTimer) {
      return;
    }
    clearInterval(this.terminalPerfLagTimer);
    this.terminalPerfLagTimer = null;
    this.terminalPerfLagExpectedAt = 0;
  },

  /**
   * 状态芯片仅保留稳定的视觉分组，避免把所有内部状态直接映射为样式类。
   */
  normalizeStatusClass(status) {
    if (status === "connected") return "connected";
    if (status === "error") return "error";
    if (status === "disconnected") return "disconnected";
    return "idle";
  },

  async connectGateway(isReconnectAttempt) {
    const profileError = validateServerForConnect(this.server || {});
    if (profileError) {
      clearTerminalSessionSnapshot();
      this.showLocalizedToast(profileError, "none");
      this.setStatus("config_required");
      return;
    }
    if (!isOpsConfigReady(this.opsConfig)) {
      clearTerminalSessionSnapshot();
      this.showLocalizedToast("运维配置缺失，请联系管理员", "none");
      this.setStatus("config_required");
      return;
    }
    this.clearAutoReconnectTimer();
    if (isReconnectAttempt !== true) {
      this.resetAutoReconnectState();
    }
    if (!this.client) {
      this.client = this.createTerminalGatewayClient();
    }
    const currentServerId = String((this.server && this.server.id) || this.data.serverId || "").trim();
    const cachedSamples = this.restoreConnectionDiagnosticSamples(currentServerId);
    const currentSamples = {
      connectionDiagnosticResponseSamples: this.data.connectionDiagnosticResponseSamples,
      connectionDiagnosticNetworkSamples: this.data.connectionDiagnosticNetworkSamples
    };
    const preserveSamples =
      this.connectionDiagnosticKeepSamplesOnNextConnect === true ||
      this.hasConnectionDiagnosticSamples(currentSamples) ||
      this.hasConnectionDiagnosticSamples(cachedSamples);
    this.connectionDiagnosticKeepSamplesOnNextConnect = false;
    if (preserveSamples) {
      this.applyConnectionDiagnosticSamples(
        this.hasConnectionDiagnosticSamples(currentSamples) ? currentSamples : cachedSamples,
        currentServerId
      );
    } else {
      this.resetConnectionDiagnosticSamples();
    }
    this.clearTerminalStdoutCarry();
    this.sessionSuspended = false;
    /**
     * 新一轮建链时先清掉旧 shell-ready 标记：
     * 1. 避免上一轮 SSH 的 ready 状态泄漏到当前连接；
     * 2. AI 启动必须等待当前会话再次收到网关 `control.connected`。
     */
    this.aiSessionShellReady = false;
    this.persistTerminalSessionStatus("connecting");
    if (this.terminalPerf) {
      this.terminalPerf.connectStartedAt = Date.now();
      this.terminalPerf.gatewaySocketOpenAt = 0;
      this.terminalPerf.authPendingAt = 0;
      this.terminalPerf.firstConnectedAt = 0;
      this.terminalPerf.firstStdoutAt = 0;
      this.terminalPerf.firstVisibleStdoutAt = 0;
      this.terminalPerf.stdoutFrameCount = 0;
      this.terminalPerf.visibleStdoutFrameCount = 0;
      this.terminalPerf.stdoutBytes = 0;
      this.terminalPerf.visibleStdoutBytes = 0;
      this.terminalPerf.frameSeq = 0;
    }
    this.logTerminalPerf("gateway.connect.start", {
      host:
        this.server.jumpHost && this.server.jumpHost.enabled ? this.server.jumpHost.host : this.server.host,
      port:
        this.server.jumpHost && this.server.jumpHost.enabled
          ? Number(this.server.jumpHost.port) || 22
          : this.server.port,
      cols: Math.max(1, Math.round(Number(this.terminalCols) || 80)),
      rows: Math.max(1, Math.round(Number(this.terminalRows) || 24)),
      hasJumpHost: !!(this.server.jumpHost && this.server.jumpHost.enabled)
    });

    try {
      await this.client.connect({
        host:
          this.server.jumpHost && this.server.jumpHost.enabled ? this.server.jumpHost.host : this.server.host,
        port:
          this.server.jumpHost && this.server.jumpHost.enabled
            ? Number(this.server.jumpHost.port) || 22
            : this.server.port,
        username:
          this.server.jumpHost && this.server.jumpHost.enabled
            ? this.server.jumpHost.username
            : this.server.username,
        clientSessionKey: this.sessionKey,
        resumeGraceMs: this.resumeGraceMs,
        credential:
          this.server.jumpHost && this.server.jumpHost.enabled
            ? resolveCredential(this.server, "jump")
            : resolveCredential(this.server),
        ...(this.server.jumpHost && this.server.jumpHost.enabled
          ? {
              jumpHost: {
                host: this.server.host,
                port: this.server.port,
                username: this.server.username,
                credential: resolveCredential(this.server)
              }
            }
          : {}),
        cols: Math.max(1, Math.round(Number(this.terminalCols) || 80)),
        rows: Math.max(1, Math.round(Number(this.terminalRows) || 24))
      });
      if (this.terminalPerf) {
        this.terminalPerf.authPendingAt = Date.now();
      }
      this.setStatus("auth_pending");
      this.startWaitForConnectedTimer();
      this.logTerminalPerf("gateway.connect.open", {
        waitMs: Math.max(
          0,
          Date.now() - ((this.terminalPerf && this.terminalPerf.connectStartedAt) || Date.now())
        )
      });
      appendLog({
        serverId: this.data.serverId,
        status: "connecting",
        summary: "小程序端发起网关连接"
      });
    } catch (error) {
      this.handleError(error);
    }
  },

  handleFrame(frame) {
    if (this.terminalPerf) {
      this.terminalPerf.frameSeq += 1;
    }
    if (frame.type === "stdout") {
      const rawText = frame.payload?.data || "";
      const rawBytes = utf8ByteLength(rawText);
      if (this.terminalPerf) {
        this.terminalPerf.stdoutFrameCount += 1;
        this.terminalPerf.stdoutBytes += rawBytes;
        if (!this.terminalPerf.firstStdoutAt && rawBytes > 0) {
          this.terminalPerf.firstStdoutAt = Date.now();
          this.logTerminalPerf("stdout.first_frame", {
            waitMs: Math.max(
              0,
              this.terminalPerf.firstStdoutAt -
                (this.terminalPerf.connectStartedAt || this.terminalPerf.pageLoadAt || Date.now())
            ),
            bytes: rawBytes
          });
        }
      }
      const bootstrapStartedAt = Date.now();
      const text = this.consumeAiRuntimeOutput(this.consumeCodexBootstrapOutput(rawText));
      const bootstrapCostMs = Date.now() - bootstrapStartedAt;
      if (rawText) {
        this.setStatus("connected");
      }
      if (bootstrapCostMs >= TERMINAL_PERF_SLOW_STEP_MS) {
        this.logTerminalPerf("stdout.bootstrap_filter.slow", {
          costMs: bootstrapCostMs,
          rawBytes,
          visibleBytes: utf8ByteLength(text)
        });
      }
      if (
        rawBytes > 0 &&
        !text &&
        this.shouldLogTerminalPerfFrame(
          (this.terminalPerf && this.terminalPerf.stdoutFrameCount) || 0,
          bootstrapCostMs
        )
      ) {
        this.logTerminalPerf("stdout.hidden_by_bootstrap", {
          bytes: rawBytes,
          frameSeq: (this.terminalPerf && this.terminalPerf.frameSeq) || 0
        });
      }
      if (text) {
        if (this.terminalPerf) {
          this.terminalPerf.visibleStdoutFrameCount += 1;
          this.terminalPerf.visibleStdoutBytes += utf8ByteLength(text);
          if (!this.terminalPerf.firstVisibleStdoutAt) {
            this.terminalPerf.firstVisibleStdoutAt = Date.now();
            this.logTerminalPerf("stdout.first_visible_frame", {
              waitMs: Math.max(
                0,
                this.terminalPerf.firstVisibleStdoutAt -
                  (this.terminalPerf.codexCommandSentAt ||
                    this.terminalPerf.connectStartedAt ||
                    this.terminalPerf.pageLoadAt ||
                    Date.now())
              ),
              bytes: utf8ByteLength(text)
            });
          }
        }
        this.appendOutput(text);
        this.appendTtsRoundOutput(text);
        emitSessionEvent("stdout", text);
      }
      return;
    }
    if (frame.type === "stderr") {
      const text = this.consumeAiRuntimeOutput(frame.payload?.data || "");
      this.appendOutput(`[stderr] ${text}`);
      emitSessionEvent("stderr", text);
      return;
    }
    if (frame.type === "control" && frame.payload?.action === "connected") {
      /**
       * 只有“无指纹负载”的 connected 才表示 shell ready：
       * 1. 指纹上报复用了同一个 action，但那一拍仍在建链流程中；
       * 2. AI 启动必须等真正 shell ready 后再放行。
       */
      if (!frame.payload?.fingerprint) {
        this.aiSessionShellReady = true;
      }
      if (this.terminalPerf && !this.terminalPerf.firstConnectedAt) {
        this.terminalPerf.firstConnectedAt = Date.now();
      }
      this.setStatus("connected");
      // shell ready 后按当前面板状态同步采样节奏，展开态提到 3 秒，收起态恢复默认。
      this.syncConnectionDiagnosticSampling(true);
      this.logTerminalPerf("gateway.control.connected", {
        waitMs: Math.max(
          0,
          Date.now() - ((this.terminalPerf && this.terminalPerf.connectStartedAt) || Date.now())
        ),
        resumed: frame.payload?.resumed === true
      });
      appendLog({
        serverId: this.data.serverId,
        status: "connected",
        summary: frame.payload?.resumed ? "会话已恢复" : "会话已连接"
      });
      this.clearAutoReconnectTimer();
      this.autoReconnectAttempts = 0;
      this.autoReconnectSuppressed = false;
      if (frame.payload?.resumed) {
        this.pendingCodexResumeAfterReconnect = false;
        this.runAfterTerminalLayout(() => {
          this.measureShellMetrics(() => {
            this.requestTerminalRender({ sendResize: true });
          });
        });
      } else if (this.pendingCodexResumeAfterReconnect) {
        this.pendingCodexResumeAfterReconnect = false;
        void this.executeAiLaunch(() => this.resumeCodexAfterReconnect(), "Codex 恢复失败", "codex");
      }
      return;
    }
    if (frame.type === "error") {
      this.handleError(new Error(frame.payload?.message || "网关错误"));
    }
  },

  handleDisconnect(reason) {
    this.logTerminalPerf("gateway.disconnect", { reason });
    this.stopConnectionDiagnosticNetworkProbe();
    this.persistConnectionDiagnosticSamples();
    this.connectionDiagnosticKeepSamplesOnNextConnect = true;
    const suspendedClose = this.sessionSuspended === true;
    const activeAiProvider = this.normalizeActiveAiProvider(this.activeAiProvider);
    this.aiSessionShellReady = false;
    this.client = null;
    this.clearTerminalStdoutCarry();
    this.sessionSuspended = false;
    this.clearCodexBootstrapGuard();
    this.persistTerminalBufferSnapshot();
    const resumable =
      reason === "ws_closed" &&
      !!markTerminalSessionResumable({
        serverId: this.data.serverId,
        serverLabel: this.data.serverLabel,
        sessionId: this.data.sessionId,
        sessionKey: this.sessionKey,
        activeAiProvider,
        codexSandboxMode:
          activeAiProvider === "codex" ? normalizeCodexSandboxMode(this.activeCodexSandboxMode) : "",
        resumeGraceMs: this.resumeGraceMs
      });
    this.pendingCodexResumeAfterReconnect = resumable && activeAiProvider === "codex";
    if (!resumable) {
      this.syncActiveAiProvider("", { persist: false });
      clearTerminalSessionSnapshot();
    }
    this.setStatus("disconnected");
    this.stopVoiceRound(true);
    this.teardownAsrClient("session_disconnected");
    appendLog({
      serverId: this.data.serverId,
      status: "disconnected",
      summary: resumable
        ? `会话已挂起，可在 ${Math.round(this.resumeGraceMs / 60000)} 分钟内恢复`
        : `会话断开: ${reason}`,
      endAt: new Date().toISOString()
    });
    if (!suspendedClose) {
      this.scheduleAutoReconnect(reason);
    }
  },

  handleError(error) {
    this.logTerminalPerf("gateway.error", {
      message: (error && error.message) || "连接异常"
    });
    this.clearAutoReconnectTimer();
    this.stopConnectionDiagnosticNetworkProbe();
    this.aiSessionShellReady = false;
    this.client = null;
    this.clearTerminalStdoutCarry();
    this.sessionSuspended = false;
    this.pendingCodexResumeAfterReconnect = false;
    this.clearCodexBootstrapGuard();
    this.syncActiveAiProvider("", { persist: false });
    clearTerminalSessionSnapshot();
    this.setStatus("error");
    const rawMessage = (error && error.message) || "连接异常";
    const message = this.localizeTerminalMessage(rawMessage);
    this.appendOutput(`[error] ${message}`);
    wx.showToast({ title: message, icon: "none" });
    if (/url not in domain list/i.test(rawMessage)) {
      const domainHint = resolveSocketDomainHint(this.opsConfig && this.opsConfig.gatewayUrl);
      wx.showModal({
        title: this.data.copy?.modal?.socketDomainTitle || "Socket 域名未配置",
        content: domainHint
          ? formatTemplate(this.data.copy?.modal?.socketDomainContent, { domainHint })
          : this.data.copy?.modal?.socketDomainContentNoHint || "当前网关地址不在小程序 socket 合法域名列表",
        showCancel: false
      });
    }
    appendLog({
      serverId: this.data.serverId,
      status: "error",
      summary: message,
      endAt: new Date().toISOString()
    });
  },

  appendOutput(text) {
    const appendStartedAt = Date.now();
    const syncResult = consumeTerminalSyncUpdateFrames(text, this.terminalSyncUpdateState);
    this.terminalSyncUpdateState = syncResult.state;
    const visibleText = String(syncResult.text || "");
    if (!visibleText) {
      return;
    }
    const visibleBytes = utf8ByteLength(visibleText);
    this.queueTerminalOutputRender({
      text: visibleText,
      appendStartedAt,
      visibleBytes,
      visibleFrameCount: (this.terminalPerf && this.terminalPerf.visibleStdoutFrameCount) || 0
    });
  },

  /**
   * 仅在终端显式打开 `1004` sendFocus 模式时，回写 FocusIn / FocusOut。
   * 这对 Codex 这类全屏 TUI 很重要，但不能默认污染普通 shell 输入流。
   */
  sendFocusModeReport(focused) {
    if (!this.client || this.data.statusText !== "connected") {
      return;
    }
    if (!this.getTerminalModes().sendFocus) {
      return;
    }
    try {
      this.client.sendStdin(focused ? "\u001b[I" : "\u001b[O");
    } catch (error) {
      this.handleError(error);
    }
  },

  clearWaitForConnectedTimer() {
    if (!this.waitForConnectedTimer) return;
    clearTimeout(this.waitForConnectedTimer);
    this.waitForConnectedTimer = null;
  },

  startWaitForConnectedTimer() {
    this.clearWaitForConnectedTimer();
    const timeoutMs = normalizePositiveInt(this.opsConfig.waitForConnectedTimeoutMs, 15000, 1000);
    this.waitForConnectedTimer = setTimeout(() => {
      const current = this.data.statusText;
      if (current !== "auth_pending" && current !== "connecting") {
        return;
      }
      this.handleError(new Error("会话就绪超时"));
      if (this.client) {
        this.client.disconnect("wait_for_connected_timeout");
      }
    }, timeoutMs);
  },

  /**
   * 进入终端页后的 AI 启动请求消费逻辑：
   * 1. 历史上仍沿用 query 参数 `openCodex=1`；
   * 2. 复用已有终端页返回时，继续使用全局 pending intent 通知；
   * 3. 当前行为已改为“直接启动默认 AI”，不再弹出选择面板。
   */
  consumePendingAiLaunchRequest() {
    let shouldLaunch = false;
    if (this.pendingOpenCodex) {
      shouldLaunch = true;
      this.pendingOpenCodex = false;
    }

    const pendingIntent = getPendingTerminalIntent();
    if (
      pendingIntent &&
      pendingIntent.action === "open_ai" &&
      pendingIntent.serverId === this.data.serverId
    ) {
      shouldLaunch = true;
      clearPendingTerminalIntent();
    }

    if (!shouldLaunch) {
      return false;
    }

    void this.launchConfiguredAi();
    return true;
  },

  clearAiConnectionWaitTimer() {
    if (!this.aiConnectionWaitTimer) return;
    clearTimeout(this.aiConnectionWaitTimer);
    this.aiConnectionWaitTimer = null;
  },

  waitForAiConnected() {
    this.clearAiConnectionWaitTimer();
    const timeoutMs = normalizePositiveInt(this.opsConfig.waitForConnectedTimeoutMs, 15000, 1000) + 1000;
    const startedAt = Date.now();
    this.logTerminalPerf("ai.wait_connected.start", { timeoutMs });

    return new Promise((resolve, reject) => {
      const poll = () => {
        const status = String(this.data.statusText || "");
        if (isAiSessionReady(status, this.client, this.aiSessionShellReady)) {
          this.clearAiConnectionWaitTimer();
          this.logTerminalPerf("ai.wait_connected.done", { waitMs: Date.now() - startedAt });
          resolve(true);
          return;
        }

        if (status === "config_required") {
          this.clearAiConnectionWaitTimer();
          this.logTerminalPerf("ai.wait_connected.abort", {
            waitMs: Date.now() - startedAt,
            reason: "config_required"
          });
          reject(new Error("服务器配置不完整"));
          return;
        }

        if (status === "error") {
          this.clearAiConnectionWaitTimer();
          this.logTerminalPerf("ai.wait_connected.abort", {
            waitMs: Date.now() - startedAt,
            reason: "error"
          });
          reject(new Error("连接失败"));
          return;
        }

        if (status === "disconnected" && Date.now() - startedAt > 600) {
          this.clearAiConnectionWaitTimer();
          this.logTerminalPerf("ai.wait_connected.abort", {
            waitMs: Date.now() - startedAt,
            reason: "disconnected"
          });
          reject(new Error("会话已断开"));
          return;
        }

        if (Date.now() - startedAt >= timeoutMs) {
          this.clearAiConnectionWaitTimer();
          this.logTerminalPerf("ai.wait_connected.timeout", { waitMs: Date.now() - startedAt });
          reject(new Error("等待会话连接超时"));
          return;
        }

        this.aiConnectionWaitTimer = setTimeout(poll, 120);
      };

      poll();
    });
  },

  async ensureConnectedForAi() {
    if (!this.server) {
      throw new Error("服务器不存在");
    }

    const status = String(this.data.statusText || "");
    if (isAiSessionReady(status, this.client, this.aiSessionShellReady)) {
      return this.server;
    }

    if (status === "connecting" || status === "auth_pending") {
      await this.waitForAiConnected();
      return this.server;
    }

    await this.connectGateway();
    await this.waitForAiConnected();
    return this.server;
  },

  sendTerminalCommand(command) {
    if (!this.client || this.data.statusText !== "connected") {
      throw new Error("会话未连接");
    }
    this.client.sendStdin(`${String(command || "")}\r`);
  },

  clearCodexBootstrapGuard(target) {
    const guard = target || this.codexBootstrapGuard;
    if (!guard) {
      return;
    }
    if (guard.timeoutTimer) {
      clearTimeout(guard.timeoutTimer);
      guard.timeoutTimer = null;
    }
    if (guard.releaseTimer) {
      clearTimeout(guard.releaseTimer);
      guard.releaseTimer = null;
    }
    if (this.codexBootstrapGuard === guard) {
      this.codexBootstrapGuard = null;
    }
  },

  settleCodexBootstrapGuardAsResult(result, target, keepActive) {
    const guard = target || this.codexBootstrapGuard;
    if (!guard || guard.settled) {
      return;
    }
    guard.settled = true;
    if (guard.timeoutTimer) {
      clearTimeout(guard.timeoutTimer);
      guard.timeoutTimer = null;
    }
    if (!keepActive) {
      this.clearCodexBootstrapGuard(guard);
    }
    guard.resolve(!!result);
  },

  settleCodexBootstrapGuardAsError(error, target) {
    const guard = target || this.codexBootstrapGuard;
    if (!guard || guard.settled) {
      return;
    }
    this.logTerminalPerf("codex.bootstrap.error", {
      waitMs: Math.max(0, Date.now() - (Number(guard.startedAt) || Date.now())),
      message: resolveRuntimeMessage(error, "Codex 启动失败")
    });
    guard.settled = true;
    this.clearCodexBootstrapGuard(guard);
    guard.reject(error instanceof Error ? error : new Error(resolveRuntimeMessage(error, "Codex 启动失败")));
  },

  scheduleCodexBootstrapGuardRelease(target) {
    const guard = target || this.codexBootstrapGuard;
    if (!guard || guard.releaseTimer) {
      return;
    }
    guard.releaseTimer = setTimeout(() => {
      this.clearCodexBootstrapGuard(guard);
    }, CODEX_BOOTSTRAP_RELEASE_DELAY_MS);
  },

  /**
   * 预检阶段吞掉命令回显和 token，仅把真正的 Codex 输出放回终端。
   */
  consumeCodexBootstrapOutput(data) {
    const guard = this.codexBootstrapGuard;
    if (!guard || !guard.active) {
      return data;
    }

    if (!guard.firstChunkAt && data) {
      guard.firstChunkAt = Date.now();
      this.logTerminalPerf("codex.bootstrap.first_chunk", {
        waitMs: Math.max(0, guard.firstChunkAt - guard.startedAt),
        chunkBytes: utf8ByteLength(data)
      });
    }

    guard.buffer = `${guard.buffer}${String(data || "")}`;
    if (guard.buffer.length > CODEX_BOOTSTRAP_BUFFER_MAX_CHARS) {
      guard.buffer = guard.buffer.slice(-CODEX_BOOTSTRAP_BUFFER_MAX_CHARS);
    }

    let working = guard.buffer;
    const hasDirMissing = hasCodexBootstrapTokenLine(working, CODEX_BOOTSTRAP_TOKEN_DIR_MISSING);
    const hasCodexMissing = hasCodexBootstrapTokenLine(working, CODEX_BOOTSTRAP_TOKEN_CODEX_MISSING);

    if (hasDirMissing && !guard.notifiedDirMissing) {
      guard.notifiedDirMissing = true;
      this.showLocalizedToast(`codex工作目录${guard.projectPath}不存在`, "none", {
        projectPath: guard.projectPath
      });
    }

    if (hasCodexMissing && !guard.notifiedCodexMissing) {
      guard.notifiedCodexMissing = true;
      this.showLocalizedToast("服务器未装codex", "none");
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
      if (this.ttsRuntime) {
        this.ttsRuntime.codexReady = true;
      }
      if (this.terminalPerf) {
        this.terminalPerf.codexReadyAt = Date.now();
      }
      this.logTerminalPerf("codex.bootstrap.ready", {
        waitMs: Math.max(0, Date.now() - guard.startedAt),
        bufferedChars: guard.buffer.length,
        visibleBytes: utf8ByteLength(afterReady)
      });
      this.settleCodexBootstrapGuardAsResult(true, guard, false);
      return afterReady;
    }

    if (guard.notifiedDirMissing || guard.notifiedCodexMissing) {
      guard.buffer = "";
      this.logTerminalPerf("codex.bootstrap.failed", {
        waitMs: Math.max(0, Date.now() - guard.startedAt),
        dirMissing: !!guard.notifiedDirMissing,
        codexMissing: !!guard.notifiedCodexMissing
      });
      this.settleCodexBootstrapGuardAsResult(false, guard, true);
      this.scheduleCodexBootstrapGuardRelease(guard);
      return "";
    }

    guard.buffer = working;
    return "";
  },

  startCodexBootstrapGuard(projectPath) {
    if (this.codexBootstrapGuard && this.codexBootstrapGuard.active) {
      throw new Error("Codex 正在启动中");
    }
    if (this.ttsRuntime) {
      this.ttsRuntime.codexReady = false;
    }

    return new Promise((resolve, reject) => {
      const guard = {
        active: true,
        projectPath,
        startedAt: Date.now(),
        firstChunkAt: 0,
        buffer: "",
        notifiedDirMissing: false,
        notifiedCodexMissing: false,
        timeoutTimer: null,
        releaseTimer: null,
        settled: false,
        resolve,
        reject
      };
      guard.timeoutTimer = setTimeout(() => {
        this.logTerminalPerf("codex.bootstrap.timeout", {
          waitMs: Math.max(0, Date.now() - guard.startedAt),
          bufferedChars: guard.buffer.length
        });
        this.settleCodexBootstrapGuardAsError(new Error("等待 Codex 启动结果超时"), guard);
      }, CODEX_BOOTSTRAP_WAIT_TIMEOUT_MS);
      this.codexBootstrapGuard = guard;
    });
  },

  async runCodex(sandbox) {
    const server = await this.ensureConnectedForAi();
    const plan = buildCodexBootstrapCommand(server.projectPath, sandbox);
    const normalizedSandbox = normalizeCodexSandboxMode(sandbox);
    if (this.terminalPerf) {
      this.terminalPerf.codexLaunchAt = Date.now();
      this.terminalPerf.codexReadyAt = 0;
    }
    this.logTerminalPerf("codex.launch.requested", {
      sandbox,
      projectPath: plan.projectPath
    });
    const bootstrapResultPromise = this.startCodexBootstrapGuard(plan.projectPath);

    try {
      this.sendTerminalCommand(plan.command);
      if (this.terminalPerf) {
        this.terminalPerf.codexCommandSentAt = Date.now();
      }
      this.logTerminalPerf("codex.command.sent", {
        commandBytes: utf8ByteLength(plan.command)
      });
      const launched = await bootstrapResultPromise;
      this.activeCodexSandboxMode = launched ? normalizedSandbox : "";
      return launched;
    } catch (error) {
      this.settleCodexBootstrapGuardAsError(error, this.codexBootstrapGuard);
      this.activeCodexSandboxMode = "";
      throw error;
    }
  },

  /**
   * 旧 SSH 会话未续上时，尝试恢复最近一次 Codex CLI 会话。
   * 这里不再做 bootstrap token 预检，而是直接把恢复命令打进新 shell，
   * 让 Codex CLI 自己决定是否能从最近会话继续。
   */
  async resumeCodexAfterReconnect() {
    if (this.normalizeActiveAiProvider(this.activeAiProvider) !== "codex") {
      this.pendingCodexResumeAfterReconnect = false;
      return false;
    }
    const server = await this.ensureConnectedForAi();
    const plan = buildCodexResumeCommand(
      server.projectPath,
      this.activeCodexSandboxMode || "workspace-write"
    );
    this.sendTerminalCommand(plan.command);
    return true;
  },

  async runCopilot(command) {
    const server = await this.ensureConnectedForAi();
    const plan = buildCopilotLaunchCommand(server.projectPath, command);
    this.sendTerminalCommand(plan.command);
    return true;
  },

  async executeAiLaunch(task, fallbackMessage, provider) {
    if (this.data.aiLaunchBusy) {
      return false;
    }
    const startedAt = Date.now();
    this.logTerminalPerf("ai.launch.start", { fallbackMessage });

    this.setData({ aiLaunchBusy: true });

    try {
      const result = await task();
      if (result) {
        if (provider === "codex") {
          this.pendingCodexResumeAfterReconnect = false;
        }
        this.syncActiveAiProvider(provider);
      }
      this.logTerminalPerf("ai.launch.done", {
        costMs: Date.now() - startedAt,
        success: !!result
      });
      return result;
    } catch (error) {
      this.logTerminalPerf("ai.launch.error", {
        costMs: Date.now() - startedAt,
        message: resolveRuntimeMessage(error, fallbackMessage)
      });
      this.showLocalizedToast(resolveRuntimeMessage(error, fallbackMessage), "none");
      return false;
    } finally {
      this.setData({ aiLaunchBusy: false });
    }
  },

  initVoiceFloatMetrics() {
    try {
      const windowInfo = getWindowMetrics(wx);
      this.windowWidth = Number(windowInfo.windowWidth) || this.windowWidth;
      this.windowHeight = Number(windowInfo.windowHeight) || this.windowHeight;
    } catch (error) {
      console.warn("[terminal.voice.system_info]", error);
    }
    const buttonSizePx = (this.windowWidth * VOICE_BUTTON_SIZE_RPX) / 750;
    const panelWidthPx = Math.max(VOICE_PANEL_MIN_WIDTH_PX, this.windowWidth - VOICE_FLOAT_GAP_PX * 2);
    const defaultVoiceButtonPosition = this.resolveCollapsedVoiceButtonPositionFromExpandedOrigin(
      VOICE_FLOAT_GAP_PX,
      VOICE_FLOAT_GAP_PX
    );
    this.setData({
      voiceButtonSizePx: Math.round(buttonSizePx),
      voicePanelWidthPx: Math.round(panelWidthPx),
      voiceFloatLeft: defaultVoiceButtonPosition.left,
      voiceFloatBottom: defaultVoiceButtonPosition.bottom
    });
  },

  /**
   * 等待当前这轮 WXML 布局提交完成，再读取 scroll-view 的真实尺寸和滚动位置。
   * 这里只服务于 overlay 同步时机，不参与任何 cursor cell 计算。
   */
  runAfterTerminalLayout(callback) {
    const done = typeof callback === "function" ? callback : null;
    if (!done) return;
    if (typeof wx.nextTick === "function") {
      wx.nextTick(done);
      return;
    }
    setTimeout(done, 0);
  },

  /**
   * 绑定软键盘高度监听：
   * 1. 输入框原生事件作为主路径；
   * 2. 全局监听只做兜底，覆盖部分机型丢事件的情况。
   */
  bindShellKeyboardHeightChange() {
    if (typeof wx.onKeyboardHeightChange !== "function" || this.keyboardHeightChangeHandler) return;
    this.keyboardHeightChangeHandler = (event) => {
      const height = this.resolveKeyboardHeight(event);
      this.handleShellKeyboardHeightChange(height);
    };
    wx.onKeyboardHeightChange(this.keyboardHeightChangeHandler);
  },

  unbindShellKeyboardHeightChange() {
    if (!this.keyboardHeightChangeHandler) return;
    if (typeof wx.offKeyboardHeightChange === "function") {
      wx.offKeyboardHeightChange(this.keyboardHeightChangeHandler);
    }
    this.keyboardHeightChangeHandler = null;
  },

  syncShellInputMetrics(settings) {
    const source = settings || {};
    const shellFontSize = normalizePositiveInt(source.shellFontSize, 15, 12);
    const shellLineHeight = Number(source.shellLineHeight);
    const lineHeightRatio =
      Number.isFinite(shellLineHeight) && shellLineHeight >= 1 && shellLineHeight <= 2
        ? shellLineHeight
        : 1.4;
    this.shellFontSizePx = shellFontSize;
    this.shellLineHeightRatio = lineHeightRatio;
    this.shellLineHeightPx = Math.max(16, Math.round(shellFontSize * lineHeightRatio));
    this.shellCharWidthPx = Math.max(6, Math.round(shellFontSize * SHELL_CHAR_WIDTH_FACTOR));
    this.shellAsciiCharWidthPx = this.shellCharWidthPx;
    this.shellWideGlyphWidthPx = this.shellCharWidthPx * 2;
    this.outputHorizontalPaddingPx = Math.max(
      4,
      Math.round((this.windowWidth * OUTPUT_HORIZONTAL_PADDING_RPX) / 750)
    );
    this.outputRightPaddingPx = OUTPUT_RIGHT_SAFE_PADDING_PX;
  },

  /**
   * 通过隐藏探针读取真实单列宽度与宽字符字宽：
   * 1. `W` probe 对齐 xterm 的单列测量思路；
   * 2. 宽字符 probe 只用于兜底，确保 2 列槽位至少装得下当前字体里的 CJK glyph。
   */
  measureShellMetrics(callback) {
    const done = typeof callback === "function" ? callback : null;
    const startedAt = Date.now();
    const asciiProbeText = String(this.data.shellMetricsAsciiProbeText || SHELL_METRICS_ASCII_PROBE_TEXT);
    const wideProbeText = String(this.data.shellMetricsWideProbeText || SHELL_METRICS_WIDE_PROBE_TEXT);
    const asciiProbeLength = Math.max(1, asciiProbeText.length);
    const wideProbeLength = Math.max(1, wideProbeText.length);
    const query = wx.createSelectorQuery().in(this);
    query.select(".shell-metrics-probe-line-ascii").boundingClientRect();
    query.select(".shell-metrics-probe-line-wide").boundingClientRect();
    query.exec((results) => {
      const asciiRect = results && results[0];
      const wideRect = results && results[1];
      const asciiWidth = Number(asciiRect && asciiRect.width) || 0;
      const asciiHeight = Number(asciiRect && asciiRect.height) || 0;
      const wideWidth = Number(wideRect && wideRect.width) || 0;
      const wideHeight = Number(wideRect && wideRect.height) || 0;
      const asciiCharWidth =
        asciiWidth > 0 ? Math.max(1, asciiWidth / asciiProbeLength) : Math.max(1, this.shellCharWidthPx || 1);
      const wideGlyphWidth =
        wideWidth > 0
          ? Math.max(1, wideWidth / wideProbeLength)
          : Math.max(1, (this.shellCharWidthPx || 1) * 2);
      const wideCellWidth = wideGlyphWidth / 2;
      this.shellAsciiCharWidthPx = asciiCharWidth;
      this.shellWideGlyphWidthPx = wideGlyphWidth;
      this.shellCharWidthPx = Math.max(1, asciiCharWidth, wideCellWidth);
      const measuredLineHeight = Math.max(asciiHeight, wideHeight, 0);
      if (measuredLineHeight > 0) {
        this.shellLineHeightPx = Math.max(16, measuredLineHeight);
      }
      const costMs = Date.now() - startedAt;
      if (costMs >= TERMINAL_PERF_SLOW_STEP_MS) {
        this.logTerminalPerf("shell.measure_metrics", {
          costMs,
          asciiCharWidth: Number(this.shellAsciiCharWidthPx || 0).toFixed(2),
          charWidth: Number(this.shellCharWidthPx || 0).toFixed(2),
          lineHeight: this.shellLineHeightPx
        });
      }
      if (done) done();
    });
  },

  syncTerminalBufferLimits(settings) {
    const source = settings || {};
    const opsEntries = normalizePositiveInt(
      this.opsConfig.terminalBufferMaxEntries,
      DEFAULT_BUFFER_MAX_ENTRIES,
      100
    );
    const opsBytes = normalizePositiveInt(
      this.opsConfig.terminalBufferMaxBytes,
      DEFAULT_BUFFER_MAX_BYTES,
      1024
    );
    this.terminalBufferMaxEntries = normalizePositiveInt(source.shellBufferMaxEntries, opsEntries, 100);
    this.terminalBufferMaxBytes = normalizePositiveInt(source.shellBufferMaxBytes, opsBytes, 1024);
    this.terminalBufferSnapshotMaxLines = Math.min(
      MAX_TERMINAL_BUFFER_SNAPSHOT_MAX_LINES,
      normalizePositiveInt(
        source.shellBufferSnapshotMaxLines,
        DEFAULT_TERMINAL_BUFFER_SNAPSHOT_MAX_LINES,
        MIN_TERMINAL_BUFFER_SNAPSHOT_MAX_LINES
      )
    );
  },

  buildOutputRenderLines(bufferRows, renderMetrics, startRow) {
    const rows = Array.isArray(bufferRows) ? bufferRows : [];
    const baseRow = Math.max(0, Math.round(Number(startRow) || 0));
    return rows.map((lineCells, index) => ({
      bufferRow: baseRow + index,
      ...buildRenderSegmentsFromLineCells(Array.isArray(lineCells) ? lineCells : [], renderMetrics)
    }));
  },

  getOutputBufferRows() {
    return Array.isArray(this.outputCells) && this.outputCells.length > 0 ? this.outputCells : [[]];
  },

  getActiveBufferName() {
    return normalizeActiveBufferName(this.outputTerminalState && this.outputTerminalState.activeBufferName);
  },

  resolveTerminalViewportState(visibleRows, lineHeight, options) {
    const source = options && typeof options === "object" ? options : {};
    return buildTerminalViewportState({
      bufferRows: this.getOutputBufferRows(),
      cursorRow: this.getOutputCursorState().row,
      activeBufferName: this.getActiveBufferName(),
      visibleRows,
      lineHeight,
      scrollTop: source.scrollTop,
      followTail: source.followTail === true,
      scrollDirection: source.scrollDirection
    });
  },

  getOutputCursorState() {
    const rows = this.getOutputBufferRows();
    const maxCols = Math.max(1, Math.round(Number(this.terminalCols) || 80));
    const row = Number.isFinite(Number(this.outputCursorRow))
      ? Math.max(0, Math.min(Math.round(Number(this.outputCursorRow)), rows.length - 1))
      : Math.max(0, rows.length - 1);
    const col = Number.isFinite(Number(this.outputCursorCol))
      ? Math.max(0, Math.min(Math.round(Number(this.outputCursorCol)), maxCols))
      : 0;
    return { row, col };
  },

  getOutputScrollTop() {
    const runtime = Number(this.currentOutputScrollTop);
    if (Number.isFinite(runtime) && runtime >= 0) return runtime;
    const fallback = Number(this.data.outputScrollTop);
    if (Number.isFinite(fallback) && fallback >= 0) return fallback;
    return 0;
  },

  resolveTerminalGeometry(rect) {
    const rectWidth = Number(rect && rect.width);
    const rectHeight = Number(rect && rect.height);
    const width = Math.max(
      1,
      Number.isFinite(rectWidth) ? rectWidth : this.outputRectWidth || this.windowWidth || 1
    );
    const lineHeight = this.shellLineHeightPx || 21;
    const charWidth = Math.max(1, this.shellCharWidthPx || 9);
    const paddingLeft = Math.max(0, this.outputHorizontalPaddingPx || 8);
    const paddingRight = Math.max(0, this.outputRightPaddingPx || OUTPUT_RIGHT_SAFE_PADDING_PX);
    const usableWidth = Math.max(SHELL_INPUT_MIN_WIDTH_PX, Math.round(width - paddingLeft - paddingRight));
    const heightFallback = Math.max(lineHeight, this.outputRectHeight || lineHeight * 24);
    const viewportHeight = Math.max(lineHeight, Number.isFinite(rectHeight) ? rectHeight : heightFallback);
    const cols = Math.max(1, Math.floor(usableWidth / charWidth));
    const rows = Math.max(1, Math.floor(viewportHeight / lineHeight));
    return { lineHeight, charWidth, paddingLeft, paddingRight, usableWidth, viewportHeight, cols, rows };
  },

  syncTerminalGeometryFromRect(rect, options) {
    const nextRect = rect || null;
    const geometry = this.resolveTerminalGeometry(nextRect);
    const nextWidth = Math.max(
      1,
      Math.round(Number(nextRect && nextRect.width) || this.outputRectWidth || geometry.usableWidth)
    );
    const nextHeight = Math.max(
      geometry.lineHeight,
      Math.round(Number(nextRect && nextRect.height) || this.outputRectHeight || geometry.viewportHeight)
    );
    const nextCols = Math.max(1, Math.round(Number(geometry.cols) || 80));
    const nextRows = Math.max(1, Math.round(Number(geometry.rows) || 24));
    const widthChanged = nextWidth !== this.outputRectWidth;
    const heightChanged = nextHeight !== this.outputRectHeight;
    const colsChanged = nextCols !== this.terminalCols;
    const rowsChanged = nextRows !== this.terminalRows;

    this.outputRectWidth = nextWidth;
    this.outputRectHeight = nextHeight;
    this.terminalCols = nextCols;
    this.terminalRows = nextRows;

    if (colsChanged) {
      this.rebuildTerminalBufferFromReplay();
    }

    const shouldSendResize = !!(options && options.sendResize);
    if (shouldSendResize && this.client && (colsChanged || rowsChanged)) {
      try {
        this.client.resize(nextCols, nextRows);
      } catch (error) {
        console.warn("[terminal.resize]", error);
      }
    }

    return {
      ...geometry,
      rect: nextRect,
      changed: widthChanged || heightChanged || colsChanged || rowsChanged
    };
  },

  queryOutputRect(callback) {
    const query = wx.createSelectorQuery().in(this);
    query.select(".terminal-output").boundingClientRect();
    query.select(".terminal-output").scrollOffset();
    query.exec((results) => {
      const rect = (results && results[0]) || null;
      const offset = results && results[1];
      const scrollTop = Number(offset && offset.scrollTop);
      if (Number.isFinite(scrollTop) && scrollTop >= 0) {
        this.currentOutputScrollTop = scrollTop;
      }
      this.outputRectSnapshot = cloneOutputRectSnapshot(rect);
      callback(rect || null);
    });
  },

  resolveKeyboardHeight(event) {
    const detailHeight = Number(event && event.detail && event.detail.height);
    if (Number.isFinite(detailHeight) && detailHeight >= 0) return detailHeight;
    const directHeight = Number(event && event.height);
    if (Number.isFinite(directHeight) && directHeight >= 0) return directHeight;
    return 0;
  },

  /**
   * 计算输出区被键盘遮挡的像素高度，只服务于可见区滚动调整。
   */
  resolveKeyboardViewportOverlap(rect) {
    const keyboardHeight = Math.max(0, Number(this.keyboardVisibleHeightPx) || 0);
    if (!rect || keyboardHeight <= 0) return 0;
    const rectTop = Number(rect.top) || 0;
    const rectHeight = Math.max(0, Number(rect.height) || 0);
    const rectBottom = Number(rect.bottom) || rectTop + rectHeight;
    const keyboardTop = Math.max(0, this.windowHeight - keyboardHeight);
    if (keyboardTop >= rectBottom) return 0;
    if (keyboardTop <= rectTop) return rectHeight;
    return Math.max(0, rectBottom - keyboardTop);
  },

  /**
   * 输出区底部会在键盘弹起时补一段 spacer，高度等于被遮挡的区域。
   * overlay 计算可见行数时要扣掉这段空间，否则 caret 会继续按“未被遮挡”处理。
   */
  resolveEffectiveOutputVisibleHeight(rect, lineHeight) {
    const baseHeight = Math.max(lineHeight, Number(rect && rect.height) || 0);
    const insetHeight = Math.max(0, Number(this.data.outputKeyboardInsetPx) || 0);
    return Math.max(lineHeight, Math.round(baseHeight - insetHeight));
  },

  /**
   * 统一计算键盘打开时的输出区补白与目标 scrollTop。
   * 这样可以让“终端内容刷新”和“键盘可见区修正”共用同一套结果，
   * 避免一次按键先后触发两轮 scrollTop 更新。
   */
  resolveKeyboardLayoutAdjustment(rect, cursorMetrics, lineHeight, baseScrollTop) {
    const resolvedLineHeight = Math.max(1, Number(lineHeight) || this.shellLineHeightPx || 21);
    const overlapHeight = this.resolveKeyboardViewportOverlap(rect);
    const insetHeight = Math.max(0, Math.round(overlapHeight));
    const effectiveVisibleHeight = Math.max(
      resolvedLineHeight,
      Math.round((Number(rect && rect.height) || 0) - insetHeight)
    );
    const cursorRow =
      cursorMetrics && Number.isFinite(Number(cursorMetrics.cursorRow))
        ? Math.max(0, Math.round(Number(cursorMetrics.cursorRow)))
        : 0;
    const cursorBottom = (cursorRow + 1) * resolvedLineHeight;
    const currentScrollTop = Math.max(0, Number(baseScrollTop) || 0);
    const minScrollTop = Math.max(0, Math.ceil(cursorBottom - effectiveVisibleHeight));
    return {
      insetHeight,
      effectiveVisibleHeight,
      cursorRow,
      nextScrollTop: Math.max(currentScrollTop, minScrollTop)
    };
  },

  /**
   * 键盘打开期间，只把 scroll-view 向下推到“当前 caret 刚好可见”的位置。
   * 这里不更改 caret 本身的坐标公式，因此不会影响已有光标计算。
   */
  adjustOutputScrollForKeyboard(callback) {
    const done = typeof callback === "function" ? callback : null;
    if (!this.keyboardSessionActive || this.keyboardVisibleHeightPx <= 0) {
      if (done) done();
      return;
    }
    this.queryOutputRect((rect) => {
      if (!rect) {
        if (done) done();
        return;
      }
      this.syncTerminalGeometryFromRect(rect, { sendResize: false });
      const cursorMetrics = this.getTerminalCursorMetrics(rect, { sendResize: false });
      const lineHeight = Math.max(
        1,
        Number(this.data.outputLineHeightPx) ||
          Number(cursorMetrics && cursorMetrics.lineHeight) ||
          this.shellLineHeightPx ||
          21
      );
      const adjustment = this.resolveKeyboardLayoutAdjustment(
        rect,
        cursorMetrics,
        lineHeight,
        this.getOutputScrollTop()
      );
      const nextInsetHeight = adjustment.insetHeight;
      const applyScroll = () => {
        const currentScrollTop = this.getOutputScrollTop();
        const nextScrollTop = adjustment.nextScrollTop;
        if (nextScrollTop === currentScrollTop) {
          this.syncTerminalOverlay(() => {
            if (done) done();
          });
          return;
        }

        this.currentOutputScrollTop = nextScrollTop;
        this.setData({ outputScrollTop: nextScrollTop }, () => {
          this.runAfterTerminalLayout(() => {
            this.queryOutputRect(() => {
              this.syncTerminalOverlay(() => {
                if (done) done();
              });
            });
          });
        });
      };

      if (Number(this.data.outputKeyboardInsetPx) !== nextInsetHeight) {
        this.setData({ outputKeyboardInsetPx: nextInsetHeight }, () => {
          this.runAfterTerminalLayout(() => {
            this.queryOutputRect(() => {
              applyScroll();
            });
          });
        });
        return;
      }
      applyScroll();
    });
  },

  /**
   * 收起键盘后恢复到弹起前的 scrollTop，避免打断用户原来的浏览位置。
   */
  restoreOutputScrollAfterKeyboard(callback) {
    const done = typeof callback === "function" ? callback : null;
    const hasSession = this.keyboardSessionActive || this.keyboardRestoreScrollTop !== null;
    const restoreTop = Number(this.keyboardRestoreScrollTop);

    this.keyboardVisibleHeightPx = 0;
    this.keyboardRestoreScrollTop = null;
    this.keyboardSessionActive = false;

    if (!hasSession) {
      if (done) done();
      return;
    }

    const nextScrollTop = Number.isFinite(restoreTop) && restoreTop >= 0 ? restoreTop : 0;
    this.currentOutputScrollTop = nextScrollTop;
    this.setData({ outputKeyboardInsetPx: 0, outputScrollTop: nextScrollTop }, () => {
      this.runAfterTerminalLayout(() => {
        this.queryOutputRect(() => {
          this.syncTerminalOverlay(() => {
            if (done) done();
          });
        });
      });
    });
  },

  /**
   * 统一接收键盘高度变化：
   * - 第一次弹起时冻结恢复点；
   * - 键盘展开时确保 caret 可见；
   * - 键盘收起时恢复原滚动位置。
   */
  handleShellKeyboardHeightChange(height) {
    const nextHeight = Math.max(0, Math.round(Number(height) || 0));
    if (nextHeight <= 0) {
      this.clearTouchShiftState();
      if (this.shellInputPassiveBlurPending) {
        this.finalizeShellInputBlur({ markUserInput: false });
        return;
      }
      this.restoreOutputScrollAfterKeyboard();
      return;
    }

    this.clearShellInputPassiveBlurState();
    this.keyboardVisibleHeightPx = nextHeight;
    if (!this.keyboardSessionActive) {
      this.keyboardSessionActive = true;
      this.keyboardRestoreScrollTop = this.getOutputScrollTop();
    }
    this.adjustOutputScrollForKeyboard();
  },

  /**
   * 软键盘收起后清空 shift 状态，避免隐藏状态下遗留大写锁定。
   */
  clearTouchShiftState() {
    this.touchShiftLastTapAt = 0;
    if (this.data.touchShiftMode === TOUCH_SHIFT_MODE_OFF) {
      return;
    }
    this.setData({ touchShiftMode: TOUCH_SHIFT_MODE_OFF });
  },

  clearShellInputPassiveBlurState() {
    this.shellInputPassiveBlurPending = false;
  },

  /**
   * 输入法内部切语音输入时，个别机型会先抛一次临时 blur，但软键盘仍保持可见。
   * 只有在键盘真的收起，或状态已不允许继续输入时，才把这次 blur 真正兑现为失焦。
   */
  finalizeShellInputBlur(options) {
    if (!this.data.shellInputFocus && !this.data.shellInputValue) return;
    const source = options && typeof options === "object" ? options : {};
    if (source.markUserInput !== false) {
      this.markTerminalUserInput();
    }
    this.clearShellInputPassiveBlurState();
    this.clearTouchShiftState();
    this.sendFocusModeReport(false);
    this.setData(
      {
        shellInputFocus: false,
        shellInputCursor: String(this.data.shellInputValue || "").length
      },
      () => this.restoreOutputScrollAfterKeyboard(() => this.syncTerminalOverlay())
    );
  },

  buildTerminalLayoutState(rect, options) {
    const geometry = this.syncTerminalGeometryFromRect(rect, options);
    const cursor = this.getOutputCursorState();
    const normalizedOptions = options && typeof options === "object" ? options : {};
    const preserveScrollTop = normalizedOptions.preserveScrollTop === true;
    let viewportState = this.resolveTerminalViewportState(geometry.rows, geometry.lineHeight, {
      scrollTop: preserveScrollTop ? this.getOutputScrollTop() : undefined,
      followTail: !preserveScrollTop,
      scrollDirection: preserveScrollTop ? this.terminalScrollDirection : 1,
      scrollViewport: normalizedOptions.scrollViewport === true
    });
    let nextScrollTop = preserveScrollTop ? viewportState.clampedScrollTop : viewportState.maxScrollTop;
    let keyboardInsetHeight = Math.max(0, Number(this.data.outputKeyboardInsetPx) || 0);
    if (this.keyboardSessionActive && this.keyboardVisibleHeightPx > 0 && rect) {
      const adjustment = this.resolveKeyboardLayoutAdjustment(
        rect,
        {
          lineHeight: geometry.lineHeight,
          cursorRow: cursor.row,
          cursorCol: Math.min(cursor.col, Math.max(0, geometry.cols))
        },
        geometry.lineHeight,
        nextScrollTop
      );
      keyboardInsetHeight = adjustment.insetHeight;
      nextScrollTop = adjustment.nextScrollTop;
    }
    if (viewportState.clampedScrollTop !== nextScrollTop) {
      viewportState = this.resolveTerminalViewportState(geometry.rows, geometry.lineHeight, {
        scrollTop: nextScrollTop,
        followTail: false,
        scrollDirection: preserveScrollTop ? this.terminalScrollDirection : 1,
        scrollViewport: normalizedOptions.scrollViewport === true
      });
    }
    const renderBuildStartedAt = Date.now();
    const renderLines = this.buildOutputRenderLines(
      viewportState.renderRows,
      geometry,
      viewportState.renderStartRow
    );
    const renderBuildCostMs = Date.now() - renderBuildStartedAt;
    return {
      lineHeight: geometry.lineHeight,
      charWidth: geometry.charWidth,
      paddingLeft: geometry.paddingLeft,
      paddingRight: geometry.paddingRight,
      renderLines,
      renderBuildCostMs,
      visibleStartRow: viewportState.visibleStartRow,
      visibleEndRow: viewportState.visibleEndRow,
      renderStartRow: viewportState.renderStartRow,
      renderEndRow: viewportState.renderEndRow,
      contentRowCount: viewportState.contentRowCount,
      topSpacerHeight: viewportState.topSpacerHeight,
      bottomSpacerHeight: viewportState.bottomSpacerHeight,
      backwardBufferRows: viewportState.backwardBufferRows,
      forwardBufferRows: viewportState.forwardBufferRows,
      keyboardInsetHeight,
      maxScrollTop: viewportState.maxScrollTop,
      nextScrollTop,
      cursorRow: cursor.row,
      cursorCol: Math.min(cursor.col, Math.max(0, geometry.cols)),
      cols: geometry.cols,
      rows: geometry.rows,
      rect
    };
  },

  refreshOutputLayout(options, callback) {
    const normalizedOptions =
      options && typeof options === "object" && typeof options !== "function" ? options : {};
    const done = typeof options === "function" ? options : typeof callback === "function" ? callback : null;
    const layoutSeq = this.terminalPerf ? (this.terminalPerf.layoutSeq += 1) : 0;
    const startedAt = Date.now();
    const executeWithRect = (rect, queryCostMs) => {
      const baseRect = cloneOutputRectSnapshot(rect);
      const viewState = this.buildTerminalLayoutState(rect, normalizedOptions);
      const builtAt = Date.now();
      this.outputRectSnapshot = cloneOutputRectSnapshot(viewState.rect) || baseRect;
      this.outputViewportWindow = {
        visibleStartRow: viewState.visibleStartRow,
        visibleEndRow: viewState.visibleEndRow,
        renderStartRow: viewState.renderStartRow,
        renderEndRow: viewState.renderEndRow,
        contentRowCount: viewState.contentRowCount,
        lineHeight: viewState.lineHeight,
        visibleRows: viewState.rows,
        backwardBufferRows: viewState.backwardBufferRows,
        forwardBufferRows: viewState.forwardBufferRows
      };
      this.setData(
        (() => {
          const shouldPreserveScrollTop = normalizedOptions.preserveScrollTop === true;
          const nextData = {
            outputRenderLines: viewState.renderLines,
            outputLineHeightPx: viewState.lineHeight,
            outputTopSpacerPx: viewState.topSpacerHeight,
            outputBottomSpacerPx: viewState.bottomSpacerHeight,
            outputKeyboardInsetPx: viewState.keyboardInsetHeight
          };
          const nextScrollTop = viewState.nextScrollTop;
          if (!shouldPreserveScrollTop) {
            nextData.outputScrollTop = nextScrollTop;
          }
          this.currentOutputScrollTop = nextScrollTop;
          return nextData;
        })(),
        () => {
          const setDataDoneAt = Date.now();
          this.runAfterTerminalLayout(() => {
            const afterLayoutAt = Date.now();
            const finalize = (latestRect) => {
              const totalCostMs = Date.now() - startedAt;
              const layoutPerf = {
                layoutSeq,
                totalCostMs,
                queryCostMs,
                buildCostMs: Math.max(0, builtAt - startedAt - queryCostMs),
                renderBuildCostMs: Number(viewState.renderBuildCostMs) || 0,
                setDataCostMs: setDataDoneAt - builtAt,
                postLayoutCostMs: afterLayoutAt - setDataDoneAt,
                renderRows: viewState.renderLines.length,
                renderStartRow: viewState.renderStartRow,
                renderEndRow: viewState.renderEndRow,
                contentRowCount: viewState.contentRowCount
              };
              if (this.shouldLogTerminalPerfFrame(layoutSeq, totalCostMs)) {
                this.logTerminalPerf(
                  totalCostMs >= TERMINAL_PERF_LONG_TASK_MS ? "layout.refresh.long" : "layout.refresh",
                  {
                    ...layoutPerf,
                    cursorRow: viewState.cursorRow,
                    cursorCol: viewState.cursorCol,
                    cols: viewState.cols,
                    rows: viewState.rows,
                    scrollTop: this.currentOutputScrollTop
                  }
                );
                /**
                 * 这里单独补一条 viewport 提交日志，目的是把“正文最终用了哪套 cursor/scrollTop”
                 * 和后面的 overlay caret 日志一一对齐，方便判断：
                 * 1. 是 buffer cursor 本身在跳；
                 * 2. 还是正文已稳定，但 overlay 取了另一套 scrollTop。
                 */
                this.logTerminalPerf("layout.viewport_commit", {
                  layoutSeq,
                  activeBufferName: this.getActiveBufferName(),
                  renderRowCount: viewState.renderLines.length,
                  renderStartRow: viewState.renderStartRow,
                  renderEndRow: viewState.renderEndRow,
                  contentRowCount: viewState.contentRowCount,
                  cursorRow: viewState.cursorRow,
                  cursorCol: viewState.cursorCol,
                  viewportMaxScrollTop: viewState.maxScrollTop,
                  committedScrollTop: this.currentOutputScrollTop,
                  outputScrollTopData: Number(this.data.outputScrollTop) || 0,
                  lineHeight: viewState.lineHeight,
                  charWidth: viewState.charWidth,
                  cols: viewState.cols,
                  rows: viewState.rows
                });
              }
              if (done) {
                this.outputRectSnapshot =
                  cloneOutputRectSnapshot(latestRect) || cloneOutputRectSnapshot(viewState.rect) || baseRect;
                done({
                  ...viewState,
                  rect: cloneOutputRectSnapshot(latestRect) || cloneOutputRectSnapshot(viewState.rect),
                  perf: layoutPerf
                });
              }
            };
            if (normalizedOptions.reuseRect && normalizedOptions.skipPostLayoutRectQuery) {
              finalize(baseRect || viewState.rect);
              return;
            }
            this.queryOutputRect((latestRect) => {
              finalize(latestRect);
            });
          });
        }
      );
    };

    if (normalizedOptions.reuseRect && normalizedOptions.rect) {
      executeWithRect(normalizedOptions.rect, 0);
      return;
    }

    this.queryOutputRect((rect) => {
      executeWithRect(rect, Date.now() - startedAt);
    });
  },

  getCursorBufferRow() {
    return this.getOutputCursorState().row;
  },

  getTerminalCursorMetrics(rect, options) {
    const geometry = this.syncTerminalGeometryFromRect(rect, options);
    const cursor = this.getOutputCursorState();
    return {
      lineHeight: geometry.lineHeight,
      charWidth: geometry.charWidth,
      paddingLeft: geometry.paddingLeft,
      paddingRight: geometry.paddingRight,
      cursorRow: cursor.row,
      cursorCol: Math.min(cursor.col, Math.max(0, geometry.cols)),
      rows: geometry.rows
    };
  },

  resolveOutputScrollTopForRect(rect, cursorMetrics) {
    const lineHeight = (cursorMetrics && cursorMetrics.lineHeight) || this.shellLineHeightPx || 21;
    const raw = this.getOutputScrollTop();
    const visibleHeight = this.resolveEffectiveOutputVisibleHeight(rect, lineHeight);
    const visibleRows = Math.max(1, Math.floor(visibleHeight / lineHeight));
    const viewportState = this.resolveTerminalViewportState(visibleRows, lineHeight);
    const maxScrollable = viewportState.maxScrollTop;
    return Math.min(maxScrollable, Math.max(0, raw));
  },

  /**
   * 窗口化后，scroll-view 只保留“可视区附近 + overscan”的正文。
   * 用户滚动到窗口边缘时，需要补一轮 preserveScrollTop 刷新，把新区域换进来。
   */
  getCachedOutputRectSnapshot() {
    return cloneOutputRectSnapshot(this.outputRectSnapshot);
  },

  clearTerminalScrollSyncTimers() {
    if (this.terminalScrollOverlayTimer) {
      clearTimeout(this.terminalScrollOverlayTimer);
      this.terminalScrollOverlayTimer = null;
    }
    if (this.terminalScrollIdleTimer) {
      clearTimeout(this.terminalScrollIdleTimer);
      this.terminalScrollIdleTimer = null;
    }
    if (this.terminalScrollViewportPrefetchTimer) {
      clearTimeout(this.terminalScrollViewportPrefetchTimer);
      this.terminalScrollViewportPrefetchTimer = null;
    }
    this.terminalScrollLastOverlayAt = 0;
    this.terminalScrollLastViewportRefreshAt = 0;
    this.terminalScrollDirection = 0;
  },

  buildTerminalOverlayContext(rect) {
    const snapshot = cloneOutputRectSnapshot(rect);
    if (!snapshot) {
      return null;
    }
    return {
      rect: snapshot,
      cursorMetrics: this.getTerminalCursorMetrics(snapshot, { sendResize: false })
    };
  },

  updateTerminalScrollDirection(nextScrollTop) {
    const currentScrollTop = Math.max(0, Number(this.currentOutputScrollTop) || 0);
    const normalizedNextScrollTop = Math.max(0, Number(nextScrollTop) || 0);
    const delta = normalizedNextScrollTop - currentScrollTop;
    if (delta > 1) {
      this.terminalScrollDirection = 1;
    } else if (delta < -1) {
      this.terminalScrollDirection = -1;
    }
  },

  shouldRefreshOutputViewportWindow(scrollTop) {
    const windowState =
      this.outputViewportWindow && typeof this.outputViewportWindow === "object"
        ? this.outputViewportWindow
        : null;
    if (!windowState) {
      return false;
    }
    const lineHeight = Math.max(1, Number(windowState.lineHeight) || this.shellLineHeightPx || 21);
    const visibleRows = Math.max(1, Math.round(Number(windowState.visibleRows) || this.terminalRows || 24));
    const renderStartRow = Math.max(0, Math.round(Number(windowState.renderStartRow) || 0));
    const renderEndRow = Math.max(
      renderStartRow,
      Math.round(Number(windowState.renderEndRow) || renderStartRow)
    );
    const contentRowCount = Math.max(1, Math.round(Number(windowState.contentRowCount) || renderEndRow || 1));
    if (renderEndRow - renderStartRow >= contentRowCount) {
      return false;
    }
    const clampedScrollTop = Math.max(0, Number(scrollTop) || 0);
    const maxVisibleStart = Math.max(0, contentRowCount - visibleRows);
    const visibleStartRow = Math.min(maxVisibleStart, Math.max(0, Math.floor(clampedScrollTop / lineHeight)));
    const visibleEndRow = Math.min(contentRowCount, visibleStartRow + visibleRows);
    const backwardBufferRows = Math.max(0, visibleStartRow - renderStartRow);
    const forwardBufferRows = Math.max(0, renderEndRow - visibleEndRow);
    const direction = Number(this.terminalScrollDirection) || 0;
    const prefetchRows = Math.max(2, TERMINAL_VIEWPORT_SCROLL_REFRESH_MARGIN_ROWS);
    if (direction > 0) {
      return (
        forwardBufferRows <= prefetchRows || backwardBufferRows <= Math.max(4, Math.floor(prefetchRows / 2))
      );
    }
    if (direction < 0) {
      return (
        backwardBufferRows <= prefetchRows || forwardBufferRows <= Math.max(4, Math.floor(prefetchRows / 2))
      );
    }
    return backwardBufferRows <= prefetchRows || forwardBufferRows <= prefetchRows;
  },

  /**
   * 如果当前可视区已经压进 top/bottom spacer，用户会先看到一块空白，
   * 这时不能再等预取节流，必须立刻把正文窗口换进来。
   */
  shouldRefreshOutputViewportWindowImmediately(scrollTop) {
    const windowState =
      this.outputViewportWindow && typeof this.outputViewportWindow === "object"
        ? this.outputViewportWindow
        : null;
    if (!windowState) {
      return false;
    }
    const lineHeight = Math.max(1, Number(windowState.lineHeight) || this.shellLineHeightPx || 21);
    const visibleRows = Math.max(1, Math.round(Number(windowState.visibleRows) || this.terminalRows || 24));
    const renderStartRow = Math.max(0, Math.round(Number(windowState.renderStartRow) || 0));
    const renderEndRow = Math.max(
      renderStartRow,
      Math.round(Number(windowState.renderEndRow) || renderStartRow)
    );
    const clampedScrollTop = Math.max(0, Number(scrollTop) || 0);
    const visibleBottom = clampedScrollTop + visibleRows * lineHeight;
    const renderTop = renderStartRow * lineHeight;
    const renderBottom = renderEndRow * lineHeight;
    return clampedScrollTop < renderTop || visibleBottom > renderBottom;
  },

  runTerminalScrollOverlaySync() {
    this.terminalScrollLastOverlayAt = Date.now();
    const overlayContext = this.buildTerminalOverlayContext(this.getCachedOutputRectSnapshot());
    this.syncTerminalOverlay(overlayContext || undefined);
  },

  scheduleTerminalScrollOverlaySync() {
    if (this.terminalScrollOverlayTimer) {
      return;
    }
    const lastOverlayAt = Number(this.terminalScrollLastOverlayAt) || 0;
    const elapsedMs = lastOverlayAt > 0 ? Math.max(0, Date.now() - lastOverlayAt) : 0;
    const waitMs =
      lastOverlayAt > 0
        ? Math.max(0, TERMINAL_SCROLL_OVERLAY_THROTTLE_MS - elapsedMs)
        : TERMINAL_SCROLL_OVERLAY_THROTTLE_MS;
    this.terminalScrollOverlayTimer = setTimeout(() => {
      this.terminalScrollOverlayTimer = null;
      this.runTerminalScrollOverlaySync();
    }, waitMs);
  },

  scheduleTerminalScrollViewportPrefetch() {
    if (this.terminalScrollViewportPrefetchTimer || this.outputViewportScrollRefreshPending) {
      return;
    }
    const currentScrollTop = this.getOutputScrollTop();
    if (!this.shouldRefreshOutputViewportWindow(currentScrollTop)) {
      return;
    }
    if (this.shouldRefreshOutputViewportWindowImmediately(currentScrollTop)) {
      this.refreshOutputViewportWindowForScroll();
      return;
    }
    const lastRefreshAt = Number(this.terminalScrollLastViewportRefreshAt) || 0;
    const elapsedMs = lastRefreshAt > 0 ? Math.max(0, Date.now() - lastRefreshAt) : Number.POSITIVE_INFINITY;
    const waitMs =
      lastRefreshAt > 0
        ? Math.max(
            TERMINAL_SCROLL_VIEWPORT_PREFETCH_DELAY_MS,
            TERMINAL_SCROLL_VIEWPORT_PREFETCH_THROTTLE_MS - elapsedMs
          )
        : TERMINAL_SCROLL_VIEWPORT_PREFETCH_DELAY_MS;
    this.terminalScrollViewportPrefetchTimer = setTimeout(() => {
      this.terminalScrollViewportPrefetchTimer = null;
      this.refreshOutputViewportWindowForScroll();
    }, waitMs);
  },

  finishTerminalScrollSync() {
    if (this.terminalScrollOverlayTimer) {
      clearTimeout(this.terminalScrollOverlayTimer);
      this.terminalScrollOverlayTimer = null;
    }
    if (this.refreshOutputViewportWindowForScroll()) {
      return;
    }
    this.runTerminalScrollOverlaySync();
  },

  scheduleTerminalScrollSettle() {
    if (this.terminalScrollIdleTimer) {
      clearTimeout(this.terminalScrollIdleTimer);
    }
    this.terminalScrollIdleTimer = setTimeout(() => {
      this.terminalScrollIdleTimer = null;
      this.finishTerminalScrollSync();
    }, TERMINAL_SCROLL_IDLE_SETTLE_MS);
  },

  refreshOutputViewportWindowForScroll() {
    if (this.outputViewportScrollRefreshPending) {
      return true;
    }
    if (!this.shouldRefreshOutputViewportWindow(this.getOutputScrollTop())) {
      return false;
    }
    this.outputViewportScrollRefreshPending = true;
    this.terminalScrollLastViewportRefreshAt = Date.now();
    const cachedRect = this.getCachedOutputRectSnapshot();
    const layoutOptions = cachedRect
      ? {
          preserveScrollTop: true,
          scrollViewport: true,
          rect: cachedRect,
          reuseRect: true,
          skipPostLayoutRectQuery: true
        }
      : { preserveScrollTop: true, scrollViewport: true };
    this.refreshOutputLayout(layoutOptions, (viewState) => {
      this.outputViewportScrollRefreshPending = false;
      const overlayContext =
        viewState && viewState.rect
          ? {
              rect: viewState.rect,
              cursorMetrics: {
                lineHeight: viewState.lineHeight,
                charWidth: viewState.charWidth,
                paddingLeft: viewState.paddingLeft,
                paddingRight: viewState.paddingRight,
                cursorRow: viewState.cursorRow,
                cursorCol: viewState.cursorCol,
                rows: viewState.rows
              }
            }
          : null;
      this.syncTerminalOverlay(overlayContext || undefined);
    });
    return true;
  },

  resolveActivationBandInRect(rect, cursorMetrics) {
    const lineHeight = (cursorMetrics && cursorMetrics.lineHeight) || this.shellLineHeightPx || 21;
    const cursorRow =
      cursorMetrics && Number.isFinite(Number(cursorMetrics.cursorRow))
        ? Math.max(0, Math.round(Number(cursorMetrics.cursorRow)))
        : 0;
    const scrollTop = this.resolveOutputScrollTopForRect(rect, cursorMetrics);
    const centerY = cursorRow * lineHeight - scrollTop + lineHeight / 2;
    const radius = lineHeight * (SHELL_ACTIVATION_RADIUS_LINES + 0.5);
    const rectHeight = Math.max(0, Math.round(Number(rect && rect.height) || 0));
    const top = Math.max(0, Math.round(centerY - radius));
    const bottom = Math.min(rectHeight, Math.round(centerY + radius));
    return {
      top,
      height: Math.max(2, bottom - top)
    };
  },

  /**
   * 激活带必须和最终提交到页面的 caret 使用同一份稳定快照：
   * 1. 否则 stdout 高频刷新时，caret 已被冻结，激活带仍会按实时 cursor 抢先跳动；
   * 2. 这里直接复用 caret 的 `top/lineHeight`，确保两者总是同帧移动；
   * 3. 仅在缺少 caret 快照时，才回退到实时 cursor 计算。
   */
  resolveActivationBandFromCaretSnapshot(rect, caret, cursorMetrics) {
    const snapshot = caret && typeof caret === "object" ? caret : null;
    if (!snapshot) {
      return this.resolveActivationBandInRect(rect, cursorMetrics);
    }
    const lineHeight = Math.max(1, Number(snapshot.lineHeight) || this.shellLineHeightPx || 21);
    const centerY = Math.round(Number(snapshot.top) || 0) + lineHeight / 2;
    const radius = lineHeight * (SHELL_ACTIVATION_RADIUS_LINES + 0.5);
    const rectHeight = Math.max(0, Math.round(Number(rect && rect.height) || 0));
    const top = Math.max(0, Math.round(centerY - radius));
    const bottom = Math.min(rectHeight, Math.round(centerY + radius));
    return {
      top,
      height: Math.max(2, bottom - top)
    };
  },

  /**
   * 可见 caret 完全由终端 buffer 的视觉光标推导，不再借用原生 input 的内部排版结果。
   */
  resolveTerminalCaretRect(rect, cursorMetrics) {
    const lineHeight = (cursorMetrics && cursorMetrics.lineHeight) || this.shellLineHeightPx || 21;
    const charWidth = Math.max(1, (cursorMetrics && cursorMetrics.charWidth) || this.shellCharWidthPx || 9);
    const paddingLeft = Math.max(0, (cursorMetrics && cursorMetrics.paddingLeft) || 0);
    const paddingRight = Math.max(
      0,
      (cursorMetrics && cursorMetrics.paddingRight) || OUTPUT_RIGHT_SAFE_PADDING_PX
    );
    const cursorRow =
      cursorMetrics && Number.isFinite(Number(cursorMetrics.cursorRow))
        ? Math.max(0, Math.round(Number(cursorMetrics.cursorRow)))
        : 0;
    const cursorCol =
      cursorMetrics && Number.isFinite(Number(cursorMetrics.cursorCol))
        ? Math.max(0, Math.round(Number(cursorMetrics.cursorCol)))
        : 0;
    const scrollTop = this.resolveOutputScrollTopForRect(rect, cursorMetrics);
    const rectWidth = Math.max(0, Number(rect && rect.width) || 0);
    const rectHeight = Math.max(0, Number(rect && rect.height) || 0);
    const caretHeight = Math.max(16, Math.round(lineHeight));
    const caretWidth = 2;
    const rawTop = cursorRow * lineHeight - scrollTop;
    const rawLeft = paddingLeft + cursorCol * charWidth;
    const maxLeft = Math.max(paddingLeft, Math.round(rectWidth - paddingRight - caretWidth));
    const left = Math.min(maxLeft, Math.max(paddingLeft, Math.round(rawLeft)));
    const top = Math.round(rawTop);
    const visible =
      this.data.statusClass === "connected" &&
      !this.getTerminalModes().cursorHidden &&
      rectWidth > 0 &&
      rectHeight > 0 &&
      top + caretHeight > 0 &&
      top < rectHeight;
    return {
      left,
      top,
      height: caretHeight,
      visible,
      cursorRow,
      cursorCol,
      scrollTop,
      rawTop,
      rawLeft,
      rectWidth,
      rectHeight,
      lineHeight,
      charWidth
    };
  },

  resetTerminalCaretStabilityState() {
    this.terminalStableCaretSnapshot = null;
    this.terminalPendingCaretSnapshot = null;
    this.terminalPendingCaretSince = 0;
  },

  hasActiveTerminalStdoutWork() {
    const task =
      this.activeTerminalStdoutTask && typeof this.activeTerminalStdoutTask === "object"
        ? this.activeTerminalStdoutTask
        : null;
    if (!task) {
      return false;
    }
    return !!(
      task.remainingText ||
      task.pendingReplayText ||
      Number(task.pendingReplayBytes) > 0 ||
      Number(task.responseCount) > 0
    );
  },

  /**
   * caret 稳定化只作用于 stdout 驱动的 overlay：
   * 1. 同一位置持续一个短窗口后再提交，吞掉底部状态区的瞬时跳动；
   * 2. 非 stdout 场景仍走即时更新，避免滚动/聚焦体感变钝；
   * 3. 最终帧或用户输入相关帧可强制提交最新 caret。
   */
  resolveStableTerminalCaret(caret, options) {
    const snapshot = cloneTerminalCaretSnapshot(caret);
    if (!snapshot) {
      this.resetTerminalCaretStabilityState();
      return null;
    }
    const source = options && typeof options === "object" ? options : {};
    const forceCommit = source.forceCommit === true;
    const stabilizeDuringStdout = source.stabilizeDuringStdout === true;
    const shouldStabilize = stabilizeDuringStdout && !forceCommit && this.hasActiveTerminalStdoutWork();
    const now = Date.now();

    if (!shouldStabilize || !snapshot.visible) {
      this.terminalPendingCaretSnapshot = cloneTerminalCaretSnapshot(snapshot);
      this.terminalPendingCaretSince = now;
      this.terminalStableCaretSnapshot = cloneTerminalCaretSnapshot(snapshot);
      return snapshot;
    }

    const pending = this.terminalPendingCaretSnapshot;
    const stable = this.terminalStableCaretSnapshot;
    if (!pending || !isSameTerminalCaretSnapshot(pending, snapshot)) {
      this.terminalPendingCaretSnapshot = cloneTerminalCaretSnapshot(snapshot);
      this.terminalPendingCaretSince = now;
      if (!stable || !stable.visible) {
        this.terminalStableCaretSnapshot = cloneTerminalCaretSnapshot(snapshot);
        return snapshot;
      }
      return cloneTerminalCaretSnapshot(stable);
    }

    if (now - Number(this.terminalPendingCaretSince || 0) >= TERMINAL_CARET_STABILITY_MS) {
      this.terminalStableCaretSnapshot = cloneTerminalCaretSnapshot(snapshot);
      return snapshot;
    }

    return stable && stable.visible ? cloneTerminalCaretSnapshot(stable) : snapshot;
  },

  withOutputRect(callback) {
    this.queryOutputRect((rect) => {
      this.syncTerminalGeometryFromRect(rect, { sendResize: true });
      callback(rect);
    });
  },

  /**
   * 统一同步终端 overlay：
   * 1. 自绘 caret
   * 2. 调试用激活带
   * 所有位置都只读取同一份终端缓冲区 cursor 结果。
   */
  syncTerminalOverlay(options, callback) {
    const normalizedOptions =
      options && typeof options === "object" && typeof options !== "function" ? options : {};
    const done = typeof options === "function" ? options : typeof callback === "function" ? callback : null;
    const overlaySeq = this.terminalPerf ? (this.terminalPerf.overlaySeq += 1) : 0;
    const startedAt = Date.now();
    const applyOverlay = (rect, presetCursorMetrics) => {
      const next = {};
      let changed = false;
      let caret = null;
      const activationDebugEnabled = !!this.data.activationDebugEnabled;

      if (!rect) {
        this.resetTerminalCaretStabilityState();
        if (this.data.terminalCaretVisible) {
          next.terminalCaretVisible = false;
          changed = true;
        }
        if (this.data.activationDebugVisible) {
          next.activationDebugVisible = false;
          changed = true;
        }
      } else {
        const cursorMetrics =
          presetCursorMetrics && typeof presetCursorMetrics === "object"
            ? presetCursorMetrics
            : this.getTerminalCursorMetrics(rect, { sendResize: false });
        caret = this.resolveStableTerminalCaret(this.resolveTerminalCaretRect(rect, cursorMetrics), {
          stabilizeDuringStdout: normalizedOptions.stabilizeCaretDuringStdout === true,
          forceCommit: normalizedOptions.forceCaretCommit === true
        });
        if (this.data.terminalCaretVisible !== caret.visible) {
          next.terminalCaretVisible = caret.visible;
          changed = true;
        }
        if (this.data.terminalCaretLeftPx !== caret.left) {
          next.terminalCaretLeftPx = caret.left;
          changed = true;
        }
        if (this.data.terminalCaretTopPx !== caret.top) {
          next.terminalCaretTopPx = caret.top;
          changed = true;
        }
        if (this.data.terminalCaretHeightPx !== caret.height) {
          next.terminalCaretHeightPx = caret.height;
          changed = true;
        }

        if (activationDebugEnabled) {
          const band = this.resolveActivationBandFromCaretSnapshot(rect, caret, cursorMetrics);
          if (this.data.activationDebugVisible !== true) {
            next.activationDebugVisible = true;
            changed = true;
          }
          if (this.data.activationDebugTopPx !== band.top) {
            next.activationDebugTopPx = band.top;
            changed = true;
          }
          if (this.data.activationDebugHeightPx !== band.height) {
            next.activationDebugHeightPx = band.height;
            changed = true;
          }
        } else if (this.data.activationDebugVisible) {
          next.activationDebugVisible = false;
          changed = true;
        }
      }

      if (!changed) {
        const costMs = Date.now() - startedAt;
        const overlayPerf = {
          overlaySeq,
          costMs,
          changed: false
        };
        if (this.shouldLogTerminalPerfFrame(overlaySeq, costMs) && costMs >= TERMINAL_PERF_SLOW_STEP_MS) {
          this.logTerminalPerf("overlay.sync", {
            overlaySeq,
            costMs,
            changed: false,
            caretVisible: !!(rect && !this.getTerminalModes().cursorHidden),
            caretLeft: rect ? this.data.terminalCaretLeftPx : -1,
            caretTop: rect ? this.data.terminalCaretTopPx : -1
          });
        }
        if (done) done(overlayPerf);
        return;
      }
      this.setData(next, () => {
        const costMs = Date.now() - startedAt;
        const overlayPerf = {
          overlaySeq,
          costMs,
          changed: true
        };
        if (this.shouldLogTerminalPerfFrame(overlaySeq, costMs)) {
          /**
           * caret overlay 是这次问题的核心观察对象。
           * 这里把 buffer cursor、scrollTop 与最终像素 top/left 一起打出来，
           * 复现时即可直接判断“哪一层先跳了”。
           */
          this.logTerminalPerf(costMs >= TERMINAL_PERF_LONG_TASK_MS ? "overlay.sync.long" : "overlay.sync", {
            overlaySeq,
            costMs,
            changed: true,
            caretVisible: !!next.terminalCaretVisible,
            cursorRow: caret.cursorRow,
            cursorCol: caret.cursorCol,
            scrollTop: caret.scrollTop,
            rawTop: caret.rawTop,
            rawLeft: caret.rawLeft,
            caretTop: caret.top,
            caretLeft: caret.left,
            caretHeight: caret.height,
            rectWidth: caret.rectWidth,
            rectHeight: caret.rectHeight,
            lineHeight: caret.lineHeight,
            charWidth: caret.charWidth
          });
        }
        if (done) done(overlayPerf);
      });
    };

    if (normalizedOptions.rect) {
      applyOverlay(normalizedOptions.rect, normalizedOptions.cursorMetrics || null);
      return;
    }
    this.withOutputRect((rect) => {
      applyOverlay(rect, null);
    });
  },

  isPointInCursorActivationBand(point, rect) {
    if (!point || !rect) return false;
    const cursorMetrics = this.getTerminalCursorMetrics(rect, { sendResize: false });
    const band = this.resolveActivationBandInRect(rect, cursorMetrics);
    const bandTop = Number(rect.top) + band.top;
    const bandBottom = bandTop + band.height;
    return point.y >= bandTop && point.y <= bandBottom;
  },

  focusShellInput() {
    if (this.data.statusClass !== "connected") return;
    const value = String(this.data.shellInputValue || "");
    this.setData(
      {
        shellInputFocus: true,
        shellInputCursor: value.length
      },
      () => {
        if (this.keyboardSessionActive && this.keyboardVisibleHeightPx > 0) {
          this.adjustOutputScrollForKeyboard();
          return;
        }
        this.syncTerminalOverlay();
      }
    );
  },

  blurShellInput() {
    if (!this.data.shellInputFocus && !this.data.shellInputValue) return;
    /**
     * 软键盘临时收起时必须保留当前输入草稿：
     * 1. 远端 shell 里这行内容还存在；
     * 2. 如果这里清空本地 value，二次聚焦后原生 input 会变成空串；
     * 3. 此时用户再按 backspace，不会产生任何删除事件。
     */
    this.setData(
      {
        shellInputFocus: false,
        shellInputCursor: String(this.data.shellInputValue || "").length
      },
      () => this.restoreOutputScrollAfterKeyboard(() => this.syncTerminalOverlay())
    );
  },

  clearVoiceHoldTimer() {
    if (!this.voiceHoldTimer) return;
    clearTimeout(this.voiceHoldTimer);
    this.voiceHoldTimer = null;
  },

  getVoiceWidgetSize() {
    const width = this.data.voicePanelVisible ? this.data.voicePanelWidthPx : this.data.voiceButtonSizePx;
    const height = this.data.voicePanelVisible ? this.voicePanelHeightPx : this.data.voiceButtonSizePx;
    return {
      width: Math.max(1, Number(width) || 1),
      height: Math.max(1, Number(height) || 1)
    };
  },

  /**
   * 浮层拖拽边界统一按“展开后的面板占位”计算：
   * 1. 收起态按钮只能停留在展开面板可完全容纳的区域内；
   * 2. 这样长按展开时，主语音按钮才能稳定落在按压位置附近，不会被二次夹回。
   */
  getVoiceExpandedWidgetSize() {
    const width = Math.max(
      1,
      Number(this.data.voicePanelWidthPx) ||
        Math.max(VOICE_PANEL_MIN_WIDTH_PX, this.windowWidth - VOICE_FLOAT_GAP_PX * 2)
    );
    const height = Math.max(1, Number(this.voicePanelHeightPx) || VOICE_PANEL_FALLBACK_HEIGHT_PX);
    return { width, height };
  },

  clampVoiceExpandedOrigin(left, bottom) {
    const widget = this.getVoiceExpandedWidgetSize();
    const maxLeft = Math.max(VOICE_FLOAT_GAP_PX, this.windowWidth - widget.width - VOICE_FLOAT_GAP_PX);
    const maxBottom = Math.max(VOICE_FLOAT_GAP_PX, this.windowHeight - widget.height - VOICE_FLOAT_GAP_PX);
    return {
      left: Math.min(maxLeft, Math.max(VOICE_FLOAT_GAP_PX, Number(left) || VOICE_FLOAT_GAP_PX)),
      bottom: Math.min(maxBottom, Math.max(VOICE_FLOAT_GAP_PX, Number(bottom) || VOICE_FLOAT_GAP_PX))
    };
  },

  /**
   * 估算展开态主 voice 按钮相对于面板左下角的锚点偏移。
   * 这里直接复用当前 CSS 常量，避免再走一次额外节点测量。
   */
  resolveVoiceMainButtonAnchorInset() {
    const rpxUnit = this.windowWidth / 750;
    const frameBottomPaddingPx = VOICE_FRAME_BOTTOM_PADDING_RPX * rpxUnit;
    const actionsMinHeightPx = VOICE_ACTIONS_MIN_HEIGHT_RPX * rpxUnit;
    const categoryPillHeightPx = VOICE_CATEGORY_PILL_MIN_HEIGHT_RPX * rpxUnit;
    const rowCenteringInsetPx = Math.max(0, actionsMinHeightPx - VOICE_MAIN_BUTTON_SIZE_PX) / 2;
    return {
      left: VOICE_ACTIONS_SIDE_PADDING_PX,
      bottom:
        frameBottomPaddingPx +
        VOICE_CATEGORY_BOTTOM_PADDING_PX +
        categoryPillHeightPx +
        VOICE_ACTIONS_VERTICAL_PADDING_PX +
        rowCenteringInsetPx
    };
  },

  /**
   * 收起态按钮的左右活动范围来自展开态底部动作区：
   * - 左端 = 面板左边距 + 主按钮自身左边距；
   * - 右端 = 左侧动作组在 track 内的最大平移终点。
   */
  resolveVoiceActionsMaxOffsetPx() {
    const measured = Number(this.voiceActionsMaxOffsetPx);
    if (Number.isFinite(measured) && measured > 0) {
      return measured;
    }
    const rpxUnit = this.windowWidth / 750;
    const sideActionButtonPx = VOICE_SIDE_ACTION_BUTTON_RPX * rpxUnit;
    const leftGroupWidth =
      VOICE_MAIN_BUTTON_SIZE_PX +
      VOICE_ACTION_BUTTON_GAP_PX +
      VOICE_SECONDARY_BUTTON_SIZE_PX +
      VOICE_ACTION_BUTTON_GAP_PX +
      VOICE_SECONDARY_BUTTON_SIZE_PX;
    const rightGroupWidth = sideActionButtonPx + VOICE_ACTION_BUTTON_GAP_PX + sideActionButtonPx;
    const panelWidth = this.getVoiceExpandedWidgetSize().width;
    const rowInnerWidth = Math.max(0, panelWidth - VOICE_ACTIONS_SIDE_PADDING_PX * 2);
    const trackWidth = Math.max(0, rowInnerWidth - (rightGroupWidth + VOICE_ACTION_BUTTON_GAP_PX));
    return Math.max(0, Math.round(trackWidth - leftGroupWidth));
  },

  getCollapsedVoiceButtonBounds() {
    const anchorInset = this.resolveVoiceMainButtonAnchorInset();
    const minExpandedOrigin = this.clampVoiceExpandedOrigin(VOICE_FLOAT_GAP_PX, VOICE_FLOAT_GAP_PX);
    const maxExpandedOrigin = this.clampVoiceExpandedOrigin(VOICE_FLOAT_GAP_PX, this.windowHeight);
    const actionsMaxOffsetPx = this.resolveVoiceActionsMaxOffsetPx();
    return {
      minLeft: Math.round(minExpandedOrigin.left + anchorInset.left),
      maxLeft: Math.round(minExpandedOrigin.left + anchorInset.left + actionsMaxOffsetPx),
      minBottom: Math.round(minExpandedOrigin.bottom + anchorInset.bottom),
      maxBottom: Math.round(maxExpandedOrigin.bottom + anchorInset.bottom)
    };
  },

  clampCollapsedVoiceButtonPosition(left, bottom) {
    const bounds = this.getCollapsedVoiceButtonBounds();
    return {
      left: Math.min(bounds.maxLeft, Math.max(bounds.minLeft, Number(left) || bounds.minLeft)),
      bottom: Math.min(bounds.maxBottom, Math.max(bounds.minBottom, Number(bottom) || bounds.minBottom))
    };
  },

  resolveVoiceActionsOffsetFromCollapsedLeft(left) {
    const bounds = this.getCollapsedVoiceButtonBounds();
    return Math.max(
      0,
      Math.min(this.resolveVoiceActionsMaxOffsetPx(), Math.round((Number(left) || 0) - bounds.minLeft))
    );
  },

  resolveCollapsedVoiceButtonPositionFromExpandedOrigin(left, bottom, offsetX) {
    const anchorInset = this.resolveVoiceMainButtonAnchorInset();
    const normalizedOffset = Math.max(
      0,
      Math.min(
        this.resolveVoiceActionsMaxOffsetPx(),
        Math.round(offsetX === undefined ? Number(this.data.voiceActionsOffsetX) || 0 : Number(offsetX) || 0)
      )
    );
    return {
      left: Math.round((Number(left) || 0) + anchorInset.left + normalizedOffset),
      bottom: Math.round((Number(bottom) || 0) + anchorInset.bottom)
    };
  },

  resolveExpandedVoiceOriginFromCollapsedButton(left, bottom, offsetX) {
    const anchorInset = this.resolveVoiceMainButtonAnchorInset();
    const normalizedOffset =
      offsetX === undefined ? this.resolveVoiceActionsOffsetFromCollapsedLeft(left) : Number(offsetX) || 0;
    return this.clampVoiceExpandedOrigin(
      (Number(left) || 0) - anchorInset.left - normalizedOffset,
      (Number(bottom) || 0) - anchorInset.bottom
    );
  },

  clampVoiceFloatPosition(left, bottom) {
    if (this.data.voicePanelVisible) {
      return this.clampVoiceExpandedOrigin(left, bottom);
    }
    return this.clampCollapsedVoiceButtonPosition(left, bottom);
  },

  syncVoiceFloatWithinBounds() {
    const next = this.clampVoiceFloatPosition(this.data.voiceFloatLeft, this.data.voiceFloatBottom);
    const nextActionsOffsetX = this.data.voicePanelVisible
      ? this.data.voiceActionsOffsetX
      : this.resolveVoiceActionsOffsetFromCollapsedLeft(next.left);
    if (
      next.left === this.data.voiceFloatLeft &&
      next.bottom === this.data.voiceFloatBottom &&
      nextActionsOffsetX === this.data.voiceActionsOffsetX
    ) {
      return;
    }
    this.setData({
      voiceFloatLeft: next.left,
      voiceFloatBottom: next.bottom,
      voiceActionsOffsetX: nextActionsOffsetX
    });
  },

  measureVoicePanelHeight() {
    const query = wx.createSelectorQuery().in(this);
    query.select(".frame2256").boundingClientRect((rect) => {
      if (!rect) return;
      const nextHeight = Number(rect.height) || 0;
      if (nextHeight <= 0) return;
      this.voicePanelHeightPx = nextHeight;
      this.syncVoiceFloatWithinBounds();
      this.measureVoiceActionsBounds();
    });
    query.exec();
  },

  measureVoiceActionsBounds() {
    if (!this.data.voicePanelVisible) return;
    const query = wx.createSelectorQuery().in(this);
    query.select(".voice-actions-left-track").boundingClientRect();
    query.select(".voice-actions-left").boundingClientRect();
    query.exec((rects) => {
      const trackRect = rects && rects[0];
      const leftGroupRect = rects && rects[1];
      if (!trackRect || !leftGroupRect) return;
      const trackWidth = Number(trackRect.width) || 0;
      const leftGroupWidth = Number(leftGroupRect.width) || 0;
      const maxOffset = Math.max(0, Math.round(trackWidth - leftGroupWidth));
      this.voiceActionsMaxOffsetPx = maxOffset;
      const current = Number(this.data.voiceActionsOffsetX) || 0;
      const next = Math.min(maxOffset, Math.max(0, Math.round(current)));
      if (next !== current) {
        this.setData({ voiceActionsOffsetX: next });
      }
    });
  },

  stopRecorderIfRunning(reason) {
    if (this.isRecorderStarting && !this.isRecorderRunning) {
      this.stopRecorderAfterStart = true;
      return;
    }
    if (!this.isRecorderRunning) return;
    try {
      recorderManager.stop();
    } catch (error) {
      console.warn("[terminal.recorder.stop.safe]", reason || "", error);
    }
    this.isRecorderRunning = false;
    this.isRecorderStarting = false;
  },

  forceResetVoiceRoundForRestart(reason) {
    if (this.voiceRound.closeTimer) {
      clearTimeout(this.voiceRound.closeTimer);
      this.voiceRound.closeTimer = null;
    }
    this.voiceRound.stopRequestedBeforeReady = false;
    this.voiceRound.discardResults = true;
    this.voiceRound.phase = "idle";
    this.teardownAsrClient(reason || "force_restart");
    // 仅在录音器处于启动/运行态时请求停止，避免触发 recorder not start 噪声错误。
    this.stopRecorderIfRunning("force_restart");
    this.isRecorderRunning = false;
    this.isRecorderStarting = false;
    this.stopRecorderAfterStart = false;
  },

  /**
   * 先触发微信隐私授权同步，再继续申请麦克风权限。
   * 这样在后台隐私声明已补齐的前提下，录音链路能走到官方隐私弹窗或自带授权流程。
   */
  ensureVoicePrivacyAuthorization() {
    return new Promise((resolve, reject) => {
      if (typeof wx.requirePrivacyAuthorize !== "function") {
        resolve();
        return;
      }
      try {
        wx.requirePrivacyAuthorize({
          success: () => resolve(),
          fail: (error) => {
            const rawMessage = resolveRuntimeMessage(error, "隐私授权失败");
            reject(new Error(resolveVoicePrivacyErrorMessage(rawMessage, rawMessage)));
          }
        });
      } catch (error) {
        const rawMessage = resolveRuntimeMessage(error, "隐私授权失败");
        reject(new Error(resolveVoicePrivacyErrorMessage(rawMessage, rawMessage)));
      }
    });
  },

  async ensureRecordPermission() {
    await this.ensureVoicePrivacyAuthorization();
    return new Promise((resolve, reject) => {
      wx.getSetting({
        success: (res) => {
          const authSetting = (res && res.authSetting) || {};
          if (authSetting["scope.record"] === true) {
            resolve();
            return;
          }
          wx.authorize({
            scope: "scope.record",
            success: () => resolve(),
            fail: (error) => {
              reject(new Error(resolveRuntimeMessage(error, "麦克风权限未开启，请在设置中允许录音")));
            }
          });
        },
        fail: (error) => {
          reject(new Error(resolveRuntimeMessage(error, "读取麦克风权限失败")));
        }
      });
    });
  },

  onInputText(event) {
    const value = String((event && event.detail && event.detail.value) || "");
    if (/[\r\n]/.test(value)) {
      const next = value.replace(/[\r\n]+/g, "");
      this.setData({ inputText: next, draftText: next }, () => this.onSendDraft());
      return;
    }
    this.setData({ inputText: value, draftText: value });
  },

  onInputConfirm() {
    this.onSendDraft();
  },

  /**
   * 读取当前全局配置中的分类，并在分类变化后保持当前选中项尽量稳定。
   */
  resolveSelectedRecordCategory(settings) {
    const categories = resolveVoiceRecordCategories(settings);
    const current = String(this.data.selectedRecordCategory || "").trim();
    if (current && categories.includes(current)) return current;
    return normalizeVoiceRecordDefaultCategory(settings && settings.voiceRecordDefaultCategory, categories);
  },

  /**
   * 语音面板中的分类切换，只影响本次“记录到闪念”的默认归属。
   */
  onSelectRecordCategory(event) {
    const category = String(event.currentTarget.dataset.category || "").trim();
    const categories = resolveVoiceRecordCategories(getSettings());
    if (!category || !categories.includes(category)) return;
    this.setData({
      voiceRecordCategories: categories,
      selectedRecordCategory: category
    });
  },

  /**
   * 统一计算写入闪念时的上下文快照，格式固定为“服务器名称-项目名”。
   */
  resolveRecordContext() {
    const server = this.server || {};
    const serverName =
      String(server.name || `${server.username || "-"}@${server.host || "-"}`).trim() ||
      this.data.copy?.fallback?.unnamedServer ||
      "未命名服务器";
    const projectName =
      resolveProjectDirectoryName(server.projectPath) || this.data.copy?.fallback?.noProject || "未设置项目";
    return {
      serverId: this.data.serverId,
      contextLabel: `${serverName}-${projectName}`
    };
  },

  forwardShellInputDelta(previousValue, nextValue) {
    if (!this.client) return;
    const previous = String(previousValue || "");
    const next = String(nextValue || "");
    if (previous === next) return;

    let payload = "";
    if (next.startsWith(previous)) {
      payload = next.slice(previous.length);
    } else if (previous.startsWith(next)) {
      payload = "\u007f".repeat(previous.length - next.length);
    } else {
      payload = `${"\u007f".repeat(previous.length)}${next}`;
    }
    if (!payload) return;
    this.client.sendStdin(payload);
  },

  onShellInputChange(event) {
    const rawNextValue = String((event && event.detail && event.detail.value) || "");
    const previousValue = String(this.data.shellInputValue || "");
    const shiftResult = applyTouchShiftToValue(previousValue, rawNextValue, this.data.touchShiftMode);
    const nextShiftMode =
      shiftResult.consumedOnce && this.data.touchShiftMode === TOUCH_SHIFT_MODE_ONCE
        ? TOUCH_SHIFT_MODE_OFF
        : this.data.touchShiftMode;
    try {
      this.markTerminalUserInput();
      this.forwardShellInputDelta(previousValue, shiftResult.value);
      const nextData = {
        shellInputValue: shiftResult.value,
        shellInputCursor: shiftResult.value.length,
        touchShiftMode: nextShiftMode
      };
      if (shiftResult.consumedOnce) {
        this.touchShiftLastTapAt = 0;
      }
      this.setData(nextData);
    } catch (error) {
      this.handleError(error);
    }
  },

  /**
   * 点击激活区后，优先使用 focus 事件携带的键盘高度启动可见区调整。
   * 这样即使后续 keyboardheightchange 在某些机型上不稳定，也不会错过第一次弹键盘。
   */
  onShellInputFocus(event) {
    if (this.data.statusClass !== "connected") {
      this.setData(
        {
          shellInputFocus: false,
          shellInputValue: "",
          shellInputCursor: 0
        },
        () => this.restoreOutputScrollAfterKeyboard(() => this.syncTerminalOverlay())
      );
      return;
    }
    this.clearShellInputPassiveBlurState();
    this.markTerminalUserInput();
    const keyboardHeight = this.resolveKeyboardHeight(event);
    if (!this.keyboardSessionActive) {
      this.keyboardSessionActive = true;
      this.keyboardRestoreScrollTop = this.getOutputScrollTop();
    }
    if (keyboardHeight > 0) {
      this.keyboardVisibleHeightPx = keyboardHeight;
      this.sendFocusModeReport(true);
      this.adjustOutputScrollForKeyboard();
      return;
    }
    this.sendFocusModeReport(true);
    this.syncTerminalOverlay();
  },

  onShellInputConfirm(event) {
    const confirmedValue = String((event && event.detail && event.detail.value) || "");
    const previousValue = String(this.data.shellInputValue || "");
    try {
      this.markTerminalUserInput();
      this.forwardShellInputDelta(previousValue, confirmedValue);
      if (!this.client) {
        this.showLocalizedToast("会话未连接", "none");
        return;
      }
      this.client.sendStdin("\r");
      this.maybeStartTtsRound("shell_confirm");
      this.setData(
        {
          shellInputValue: "",
          shellInputCursor: 0
        },
        () => {
          if (this.keyboardSessionActive && this.keyboardVisibleHeightPx > 0) {
            this.adjustOutputScrollForKeyboard();
            return;
          }
          this.syncTerminalOverlay();
        }
      );
    } catch (error) {
      this.handleError(error);
    }
  },

  onShellInputKeyboardHeightChange(event) {
    const height = this.resolveKeyboardHeight(event);
    this.handleShellKeyboardHeightChange(height);
  },

  onShellInputBlur() {
    if (!this.data.shellInputFocus && !this.data.shellInputValue) return;
    if (this.data.statusClass === "connected" && this.keyboardVisibleHeightPx > 0) {
      this.shellInputPassiveBlurPending = true;
      return;
    }
    this.finalizeShellInputBlur();
  },

  onClearInput() {
    this.setData({ inputText: "" });
  },

  onSendInput() {
    const text = String(this.data.inputText || "");
    if (!text.trim()) return false;
    if (!this.client) {
      this.showLocalizedToast("会话未连接", "none");
      return false;
    }
    try {
      this.markTerminalUserInput();
      this.client.sendStdin(`${text}\r`);
      this.maybeStartTtsRound("draft_send");
      this.setData({ inputText: "", draftText: "" });
      return true;
    } catch (error) {
      this.handleError(error);
      return false;
    }
  },

  onOpenCodex() {
    return this.launchConfiguredAi();
  },

  launchConfiguredAi() {
    if (!this.ensureAiLaunchAllowed()) {
      return false;
    }
    const settings = getSettings();
    const provider = normalizeAiProvider(settings.aiDefaultProvider);
    if (provider === "copilot") {
      return this.onRunCopilot();
    }
    return this.onRunCodex();
  },

  onRunCodex() {
    if (!this.ensureAiLaunchAllowed()) {
      return false;
    }
    const settings = getSettings();
    const sandbox = normalizeCodexSandboxMode(settings.aiCodexSandboxMode);
    this.markTerminalUserInput();
    return this.executeAiLaunch(() => this.runCodex(sandbox), "Codex 启动失败", "codex");
  },

  onRunCopilot() {
    if (!this.ensureAiLaunchAllowed()) {
      return false;
    }
    const settings = getSettings();
    const command = normalizeCopilotPermissionMode(settings.aiCopilotPermissionMode);
    this.markTerminalUserInput();
    return this.executeAiLaunch(() => this.runCopilot(command), "Copilot 启动失败", "copilot");
  },

  onClearScreen() {
    /**
     * Codex 占据前台时不允许清屏：
     * 1. 本地清空显示不会改变远端 Codex 状态；
     * 2. 为避免用户误以为“退出/重置了 Codex”，这里直接忽略。
     */
    if (
      String(this.data.statusText || "") === "connected" &&
      this.normalizeActiveAiProvider(this.activeAiProvider) === "codex"
    ) {
      return false;
    }
    const cellsLines = this.getOutputBufferRows();
    const cursorState = this.getOutputCursorState();
    const tailCells = (cellsLines[cursorState.row] || []).map((cell) => cloneTerminalCell(cell));
    const nextState = this.captureTerminalBufferState();
    const active = getActiveTerminalBuffer(nextState);
    if (active && active.isAlt) {
      active.cells = Array.isArray(active.cells) ? active.cells.map(() => []) : [[]];
      active.cells[0] = tailCells.length > 0 ? tailCells : [];
    } else {
      active.cells = tailCells.length > 0 ? [tailCells] : [[]];
    }
    active.cursorRow = 0;
    active.cursorCol = Math.max(0, cursorState.col);
    active.ansiState = cloneAnsiState(this.outputAnsiState || ANSI_RESET_STATE);
    this.outputReplayText = lineCellsToText(tailCells);
    this.outputReplayBytes = utf8ByteLength(this.outputReplayText);
    this.applyTerminalBufferState(nextState);
    this.currentOutputScrollTop = 0;
    this.requestTerminalRender();
  },

  onConnectionAction() {
    this.markTerminalUserInput();
    if (this.data.connectionActionDisabled) {
      return;
    }
    if (this.data.connectionActionReconnect) {
      this.connectGateway();
      return;
    }
    this.suppressAutoReconnect();
    if (this.client) {
      this.client.disconnect("manual");
    }
    this.handleDisconnect("manual");
  },

  createTerminalGatewayClient() {
    return createGatewayClient({
      gatewayUrl: this.opsConfig.gatewayUrl,
      gatewayToken: this.opsConfig.gatewayToken,
      connectTimeoutMs: this.opsConfig.gatewayConnectTimeoutMs,
      debugLog: ENABLE_TERMINAL_PERF_LOGS ? (event, payload) => this.logTerminalPerf(event, payload) : null,
      onLatency: (value) => {
        const nextSamples = appendDiagnosticSample(
          this.data.connectionDiagnosticResponseSamples,
          value,
          CONNECTION_DIAGNOSTIC_SAMPLE_LIMIT
        );
        const nextPayload = this.buildConnectionDiagnosticPayload({
          latencyMs: value,
          connectionDiagnosticResponseSamples: nextSamples
        });
        this.setData(nextPayload);
        this.persistConnectionDiagnosticSamples(nextPayload);
        emitSessionEvent("latency", value);
      },
      onFrame: (frame) => this.handleFrame(frame),
      onClose: () => this.handleDisconnect("ws_closed"),
      onError: (error) => this.handleError(error)
    });
  },

  /**
   * 点击终端主体空白区域时，收起键盘工具浮层，减少遮挡。
   */
  onPanelTap() {
    const next = {};
    let changed = false;
    if (this.data.touchToolsExpanded) {
      next.touchToolsExpanded = false;
      changed = true;
    }
    if (this.data.shellInputFocus) {
      next.shellInputFocus = false;
      next.shellInputCursor = String(this.data.shellInputValue || "").length;
      changed = true;
    }
    if (!changed) return;
    this.setData(next, () => this.restoreOutputScrollAfterKeyboard(() => this.syncTerminalOverlay()));
  },

  onOutputScroll(event) {
    const scrollTop = Number(event && event.detail && event.detail.scrollTop);
    const nextScrollTop = Number.isFinite(scrollTop) && scrollTop >= 0 ? scrollTop : 0;
    this.updateTerminalScrollDirection(nextScrollTop);
    this.currentOutputScrollTop = nextScrollTop;
    this.scheduleTerminalScrollOverlaySync();
    this.scheduleTerminalScrollViewportPrefetch();
    this.scheduleTerminalScrollSettle();
  },

  onOutputLongPress() {
    this.lastOutputLongPressAt = Date.now();
  },

  shouldSuppressTapAfterLongPress() {
    const last = Number(this.lastOutputLongPressAt);
    if (!Number.isFinite(last) || last <= 0) return false;
    return Date.now() - last <= OUTPUT_LONG_PRESS_SUPPRESS_MS;
  },

  onOutputLineTap(event) {
    if (this.shouldSuppressTapAfterLongPress()) return;
    const tappedLine = Number(event && event.currentTarget && event.currentTarget.dataset.lineIndex);
    if (!Number.isFinite(tappedLine)) return;
    const cursorRow = this.getCursorBufferRow();
    if (Math.abs(cursorRow - tappedLine) > SHELL_ACTIVATION_RADIUS_LINES) {
      const next = {};
      let changed = false;
      if (this.data.touchToolsExpanded) {
        next.touchToolsExpanded = false;
        changed = true;
      }
      if (this.data.shellInputFocus || this.data.shellInputValue) {
        next.shellInputFocus = false;
        next.shellInputCursor = String(this.data.shellInputValue || "").length;
        changed = true;
      }
      if (changed) {
        this.setData(next, () => this.restoreOutputScrollAfterKeyboard(() => this.syncTerminalOverlay()));
      }
      return;
    }
    this.focusShellInput();
  },

  onOutputTap(event) {
    if (this.shouldSuppressTapAfterLongPress()) return;
    const point = resolveTapClientPoint(event);
    if (!point) return;
    this.withOutputRect((rect) => {
      if (!rect) return;
      if (this.isPointInCursorActivationBand(point, rect)) {
        this.focusShellInput();
        return;
      }
      const next = {};
      let changed = false;
      if (this.data.touchToolsExpanded) {
        next.touchToolsExpanded = false;
        changed = true;
      }
      if (this.data.shellInputFocus || this.data.shellInputValue) {
        next.shellInputFocus = false;
        next.shellInputCursor = String(this.data.shellInputValue || "").length;
        changed = true;
      }
      if (changed) {
        this.setData(next, () => this.restoreOutputScrollAfterKeyboard(() => this.syncTerminalOverlay()));
      }
    });
  },

  /**
   * 浮层内部事件阻断（占位函数）。
   */
  noop() {},

  /**
   * 键盘工具区展开/折叠切换：
   * - 折叠态仅展示 keyboard 图标；
   * - 展开态按 Figma frame 2250 分成方向区和 SH 常用操作区。
   */
  onToggleTouchTools() {
    const nextExpanded = !this.data.touchToolsExpanded;
    this.setData({ touchToolsExpanded: nextExpanded });
  },

  /**
   * 把工具按钮映射为终端控制序列发送到会话。
   * shift 采用三态语义：
   * 1. 单击进入“下一次英文输入大写”；
   * 2. 双击进入持续大写；
   * 3. 锁定态下再次点击退出。
   * 其它控制键始终保持原始终端行为，不消费 shift 状态；
   * `home` 是唯一例外，它会下发“切回当前服务器工作目录”的 shell 命令。
   */
  onTouchKeyTap(event) {
    const key = String(event.currentTarget.dataset.key || "");
    if (!key) return;
    if (key === "home") {
      this.onTouchHomeTap();
      return;
    }
    this.markTerminalUserInput();
    if (key === "shift") {
      const now = Date.now();
      const nextMode = resolveTouchShiftModeOnTap(
        this.data.touchShiftMode,
        this.touchShiftLastTapAt,
        now,
        TOUCH_SHIFT_DOUBLE_TAP_MS
      );
      this.touchShiftLastTapAt = nextMode === TOUCH_SHIFT_MODE_ONCE ? now : 0;
      this.setData({ touchShiftMode: nextMode });
      return;
    }
    const seq = this.resolveControlSequence(key);
    if (!seq) {
      return;
    }
    const sent = this.sendControlSequence(seq);
    if (sent && key === "enter") {
      this.maybeStartTtsRound("touch_enter");
    }
  },

  /**
   * Home 快捷键并不发送 VT Home，而是显式把 shell 拉回服务器工作目录：
   * 1. 复用 AI 启动同一套 `cd` 构造逻辑，避免 `~`、空格路径、单引号路径再次分叉；
   * 2. AI 前台态下静默忽略，避免把 `cd` 命令误发给 Codex / Copilot 前台会话；
   * 3. 末尾补一个回车，语义与用户手输 `cd 工作目录` 后回车一致。
   */
  onTouchHomeTap() {
    if (this.normalizeActiveAiProvider(this.activeAiProvider)) {
      return false;
    }
    return this.sendControlSequence(this.buildTouchHomeCommand());
  },

  /**
   * 工作目录优先使用当前服务器配置里的 `projectPath`。
   * 如果该字段为空，则退回 `~`，保证 Home 按钮始终有稳定目标。
   */
  buildTouchHomeCommand() {
    const server = this.server && typeof this.server === "object" ? this.server : {};
    const projectPath = String(server.projectPath || "").trim() || "~";
    return `${buildCdCommand(projectPath)}\r`;
  },

  /**
   * 控制键序列映射：
   * - 方向键使用 ANSI ESC 序列；
   * - enter/tab/ctrlc 直接使用控制字符；
   * - shift 大写逻辑只在输入框文本变更时生效，这里不做额外修饰；
   * - `home` 已在上层单独走 shell 命令，不进入这里的 VT 编码分支。
   */
  resolveControlSequence(key) {
    return encodeTerminalKey(key, this.getTerminalModes());
  },

  /**
   * 统一发送控制序列，避免各按钮重复 try/catch 逻辑。
   */
  maybeReleaseAiLockOnInterrupt(sequence) {
    /**
     * `Ctrl+C` 是用户对当前前台程序发出的显式中断信号：
     * 1. Codex / Copilot 正常退出时，远端 wrapper 会打印 OSC 标记，本地会自然解锁；
     * 2. 但若用户直接用 `Ctrl+C` 打断，wrapper 可能来不及执行收尾 `printf`，导致本地一直误以为 AI 仍在前台；
     * 3. 这里仅在“控制字符已成功发出”后，补一层本地解锁，避免再次点击 AI 按钮被旧锁拦住。
     */
    if (String(sequence || "") !== "\u0003") {
      return;
    }
    if (!this.normalizeActiveAiProvider(this.activeAiProvider)) {
      return;
    }
    this.syncActiveAiProvider("");
  },

  sendControlSequence(sequence) {
    if (!this.client) {
      this.showLocalizedToast("会话未连接", "none");
      return false;
    }
    try {
      this.markTerminalUserInput();
      this.client.sendStdin(sequence);
      this.maybeReleaseAiLockOnInterrupt(sequence);
      return true;
    } catch (error) {
      this.handleError(error);
      return false;
    }
  },

  /**
   * 从剪贴板读取文本并发送到会话，便于移动端快速粘贴命令。
   */
  onPasteFromClipboard() {
    if (!this.client) {
      this.showLocalizedToast("会话未连接", "none");
      return;
    }
    wx.getClipboardData({
      success: (res) => {
        const text = String((res && res.data) || "");
        if (!text) {
          this.showLocalizedToast("剪贴板为空", "none");
          return;
        }
        try {
          this.markTerminalUserInput();
          const payload = encodeTerminalPaste(text, this.getTerminalModes());
          if (!payload) {
            this.showLocalizedToast("剪贴板为空", "none");
            return;
          }
          this.client.sendStdin(payload);
        } catch (error) {
          this.handleError(error);
        }
      },
      fail: () => {
        this.showLocalizedToast("读取剪贴板失败", "none");
      }
    });
  },

  onVoiceActionsTouchStart(event) {
    if (!this.data.voicePanelVisible) return;
    const point = resolveTouchClientPoint(event);
    if (!point) return;
    this.measureVoiceActionsBounds();
    this.voiceActionsDrag.active = true;
    this.voiceActionsDrag.moved = false;
    this.voiceActionsDrag.startX = point.x;
    this.voiceActionsDrag.startOffset = Number(this.data.voiceActionsOffsetX) || 0;
  },

  onVoiceActionsTouchMove(event) {
    const runtime = this.voiceActionsDrag;
    if (!runtime || !runtime.active) return;
    const point = resolveTouchClientPoint(event);
    if (!point) return;
    const deltaX = point.x - runtime.startX;
    if (!runtime.moved && Math.abs(deltaX) < 2) {
      return;
    }
    runtime.moved = true;
    const maxOffset = Math.max(0, Number(this.voiceActionsMaxOffsetPx) || 0);
    const next = Math.min(maxOffset, Math.max(0, Math.round(runtime.startOffset + deltaX)));
    if (next === this.data.voiceActionsOffsetX) return;
    this.setData({ voiceActionsOffsetX: next });
  },

  onVoiceActionsTouchEnd() {
    if (!this.voiceActionsDrag) return;
    this.voiceActionsDrag.active = false;
    this.voiceActionsDrag.moved = false;
  },

  onVoiceLayerTouchStart(event) {
    const point = resolveTouchClientPoint(event);
    if (!point) return;
    const dragHandle = String(
      (event.target && event.target.dataset && event.target.dataset.dragHandle) || ""
    );
    const runtime = this.voiceGesture;
    runtime.dragCandidate = dragHandle === "1";
    runtime.dragActive = false;
    runtime.dragMoved = false;
    runtime.dragStartX = point.x;
    runtime.dragStartY = point.y;
    runtime.originLeft = this.data.voiceFloatLeft;
    runtime.originBottom = this.data.voiceFloatBottom;
  },

  onVoiceLayerTouchMove(event) {
    const runtime = this.voiceGesture;
    if (!runtime || !runtime.dragCandidate) return;
    const point = resolveTouchClientPoint(event);
    if (!point) return;
    const deltaX = point.x - runtime.dragStartX;
    const deltaY = point.y - runtime.dragStartY;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    if (!runtime.dragActive && distance < VOICE_DRAG_THRESHOLD_PX) {
      return;
    }
    runtime.dragActive = true;
    runtime.dragMoved = true;
    this.clearVoiceHoldTimer();
    runtime.holdArmed = false;

    const next = this.clampVoiceFloatPosition(runtime.originLeft + deltaX, runtime.originBottom - deltaY);
    if (this.data.voicePanelVisible) {
      this.setData({
        voiceFloatLeft: next.left,
        voiceFloatBottom: next.bottom
      });
      return;
    }
    const nextActionsOffsetX = this.resolveVoiceActionsOffsetFromCollapsedLeft(next.left);
    this.setData({
      voiceFloatLeft: next.left,
      voiceFloatBottom: next.bottom,
      voiceActionsOffsetX: nextActionsOffsetX
    });
  },

  onVoiceLayerTouchEnd() {
    const runtime = this.voiceGesture;
    if (!runtime) return;
    if (runtime.holdArmed && !runtime.holdStarted) {
      this.clearVoiceHoldTimer();
      runtime.holdArmed = false;
    }
    runtime.dragCandidate = false;
    runtime.dragActive = false;
    if (runtime.dragMoved) {
      runtime.dragJustFinishedAt = Date.now();
    }
    runtime.dragMoved = false;
  },

  onVoiceTap() {
    // 设计调整：轻触不展开语音面板，仅长按 voice 按钮触发展开与录音。
  },

  onVoicePressStart(event) {
    this.setSvgButtonPressStateFromEvent(event, true);
    if (
      this.voiceRound.phase === "stopping" ||
      (this.voiceRound.phase === "connecting" && this.voiceRound.stopRequestedBeforeReady)
    ) {
      this.forceResetVoiceRoundForRestart("restart_from_press");
    }
    if (this.voiceRound.phase !== "idle" || this.isRecorderRunning || this.isRecorderStarting) return;
    const runtime = this.voiceGesture;
    runtime.holdArmed = true;
    runtime.holdStarted = false;
    this.setData({ voiceHolding: true, frameOpacity: VOICE_ACTIVE_OPACITY });
    this.clearVoiceHoldTimer();
    this.voiceHoldTimer = setTimeout(() => {
      if (!runtime.holdArmed || runtime.dragActive || runtime.dragMoved) {
        this.setData({ voiceHolding: false, frameOpacity: VOICE_IDLE_OPACITY });
        return;
      }
      if (this.voiceRound.phase !== "idle" || this.isRecorderRunning || this.isRecorderStarting) return;
      runtime.holdStarted = true;
      const begin = () => {
        try {
          wx.vibrateShort({ type: "light" });
        } catch (error) {
          console.warn("[terminal.voice.vibrate]", error);
        }
        this.startVoiceRound();
      };
      if (!this.data.voicePanelVisible) {
        const expandedActionsOffsetX = this.resolveVoiceActionsOffsetFromCollapsedLeft(
          this.data.voiceFloatLeft
        );
        const expandedOrigin = this.resolveExpandedVoiceOriginFromCollapsedButton(
          this.data.voiceFloatLeft,
          this.data.voiceFloatBottom,
          expandedActionsOffsetX
        );
        this.setData(
          {
            voicePanelVisible: true,
            voiceFloatLeft: expandedOrigin.left,
            voiceFloatBottom: expandedOrigin.bottom,
            voiceActionsOffsetX: expandedActionsOffsetX
          },
          () => {
            this.measureVoicePanelHeight();
            this.measureVoiceActionsBounds();
            begin();
          }
        );
        return;
      }
      begin();
    }, VOICE_HOLD_DELAY_MS);

    if (event) {
      const point = resolveTouchClientPoint(event);
      if (point) {
        runtime.dragCandidate = true;
        runtime.dragActive = false;
        runtime.dragMoved = false;
        runtime.dragStartX = point.x;
        runtime.dragStartY = point.y;
        runtime.originLeft = this.data.voiceFloatLeft;
        runtime.originBottom = this.data.voiceFloatBottom;
      }
    }
  },

  onVoicePressEnd(event) {
    this.setSvgButtonPressStateFromEvent(event, false);
    const runtime = this.voiceGesture;
    this.clearVoiceHoldTimer();
    const shouldStopRound = !!(runtime && runtime.holdStarted);
    if (runtime) {
      if (runtime.dragMoved) {
        runtime.dragJustFinishedAt = Date.now();
      }
      runtime.holdArmed = false;
      runtime.holdStarted = false;
      runtime.dragCandidate = false;
      runtime.dragActive = false;
      runtime.dragMoved = false;
    }
    this.setData({ voiceHolding: false, frameOpacity: VOICE_IDLE_OPACITY });
    if (!shouldStopRound) return;
    this.stopVoiceRound(false);
  },

  async startVoiceRound() {
    if (this.voiceRound.phase !== "idle" || this.isRecorderRunning) {
      return;
    }
    if (!isOpsConfigReady(this.opsConfig)) {
      this.showLocalizedToast("运维配置缺失，请联系管理员", "none");
      return;
    }
    // 语音识别不依赖终端会话；未连接时允许先转文字，再决定是否记录到闪念。
    // 先上锁，避免权限检查/建链阶段被重复触发导致并发 start。
    this.voiceRound.phase = "connecting";
    this.voiceRound.discardResults = false;
    this.voiceRound.stopRequestedBeforeReady = false;

    try {
      await this.ensureRecordPermission();
    } catch (error) {
      this.handleAsrError(error);
      this.voiceRound.phase = "idle";
      return;
    }
    this.voiceRound.baseText = String(this.data.inputText || "");
    this.teardownAsrClient("restart_round");

    let client = null;
    client = createAsrGatewayClient({
      gatewayUrl: this.opsConfig.gatewayUrl,
      gatewayToken: this.opsConfig.gatewayToken,
      onResult: (payload) => this.handleAsrResult(payload, client),
      onRoundEnd: () => this.handleAsrRoundEnd(client),
      onError: (error) => this.handleAsrError(error, client),
      onClose: () => this.handleAsrClose(client)
    });
    this.voiceRound.client = client;

    try {
      await client.connect();
      if (this.voiceRound.phase !== "connecting" || this.voiceRound.client !== client) {
        client.close("round_abort_before_start");
        return;
      }
      client.startRound({
        audio: {
          format: "pcm",
          codec: "raw",
          rate: 16000,
          bits: 16,
          channel: 1
        },
        request: {
          model_name: "bigmodel",
          enable_itn: true,
          enable_punc: true,
          result_type: "full"
        }
      });
      try {
        recorderManager.start(RECORDER_OPTIONS);
      } catch (error) {
        if (isRecorderBusyError(error)) {
          this.handleAsrError(new Error("录音器忙，请稍后重试"));
        } else {
          this.handleAsrError(error);
        }
        this.teardownAsrClient("recorder_start_failed");
        this.voiceRound.phase = "idle";
        this.isRecorderRunning = false;
        this.isRecorderStarting = false;
        this.stopRecorderAfterStart = false;
        return;
      }
      this.isRecorderStarting = true;
      this.stopRecorderAfterStart = false;
      this.isRecorderRunning = false;
      this.voiceRound.phase = "recording";

      if (this.voiceRound.stopRequestedBeforeReady) {
        this.voiceRound.stopRequestedBeforeReady = false;
        this.stopVoiceRound(false);
      }
    } catch (error) {
      this.handleAsrError(error);
      this.teardownAsrClient("round_start_failed");
      this.voiceRound.phase = "idle";
      this.stopRecorderIfRunning("round_start_failed");
      this.isRecorderStarting = false;
      this.stopRecorderAfterStart = false;
    }
  },

  stopVoiceRound(sendCancel) {
    const cancel = !!sendCancel;
    const phase = this.voiceRound.phase;
    if (phase === "idle") {
      this.stopRecorderIfRunning("stop_when_idle");
      return;
    }
    if (phase === "connecting") {
      if (cancel) {
        this.voiceRound.stopRequestedBeforeReady = false;
        this.voiceRound.phase = "idle";
        this.teardownAsrClient("cancel_before_ready");
      } else {
        this.voiceRound.stopRequestedBeforeReady = true;
      }
      return;
    }

    const client = this.voiceRound.client;
    this.stopRecorderIfRunning("stop_voice_round");

    if (client) {
      if (cancel) {
        client.cancelRound();
      } else {
        client.stopRound();
      }
    }

    this.voiceRound.phase = "stopping";
    if (this.voiceRound.closeTimer) {
      clearTimeout(this.voiceRound.closeTimer);
      this.voiceRound.closeTimer = null;
    }
    this.voiceRound.closeTimer = setTimeout(() => {
      this.teardownAsrClient("round_timeout");
      this.voiceRound.phase = "idle";
    }, VOICE_CLOSE_TIMEOUT_MS);
  },

  teardownAsrClient(reason) {
    const client = this.voiceRound.client;
    this.voiceRound.client = null;
    if (client) {
      client.close(reason || "client_close");
    }
  },

  handleRecorderStart() {
    this.isRecorderStarting = false;
    this.isRecorderRunning = true;
    if (!this.stopRecorderAfterStart) return;
    this.stopRecorderAfterStart = false;
    this.stopRecorderIfRunning("stop_after_start");
  },

  handleRecorderFrame(event) {
    if (this.voiceRound.phase !== "recording") return;
    const frame = event && event.frameBuffer;
    if (!frame || !(frame instanceof ArrayBuffer) || frame.byteLength <= 0) {
      return;
    }
    const client = this.voiceRound.client;
    if (!client || !client.isReady()) return;
    client.sendAudio(frame);
  },

  handleRecorderStop() {
    this.isRecorderRunning = false;
    this.isRecorderStarting = false;
    this.stopRecorderAfterStart = false;
  },

  handleRecorderError(error) {
    const message = resolveRuntimeMessage(error, "录音采集失败");
    if (isRecorderNotStartError(error)) {
      this.isRecorderRunning = false;
      this.isRecorderStarting = false;
      this.stopRecorderAfterStart = false;
      return;
    }
    if (this.isRecorderRunning) {
      try {
        recorderManager.stop();
      } catch (stopError) {
        console.warn("[terminal.recorder.stop.on_error]", stopError);
      }
    }
    this.isRecorderRunning = false;
    this.isRecorderStarting = false;
    this.stopRecorderAfterStart = false;
    this.handleAsrError(new Error(message));
    this.teardownAsrClient("recorder_error");
    this.voiceRound.phase = "idle";
  },

  handleAsrResult(payload, sourceClient) {
    if (sourceClient && sourceClient !== this.voiceRound.client) {
      return;
    }
    if (this.voiceRound.discardResults) {
      return;
    }
    const text = String((payload && payload.text) || "");
    this.setData({
      inputText: `${this.voiceRound.baseText}${text}`,
      draftText: `${this.voiceRound.baseText}${text}`
    });
  },

  handleAsrRoundEnd(sourceClient) {
    if (sourceClient && sourceClient !== this.voiceRound.client) {
      return;
    }
    this.stopRecorderIfRunning("asr_round_end");
    if (this.voiceRound.closeTimer) {
      clearTimeout(this.voiceRound.closeTimer);
      this.voiceRound.closeTimer = null;
    }
    this.voiceRound.phase = "idle";
    this.teardownAsrClient("round_end");
  },

  handleAsrError(error, sourceClient) {
    if (sourceClient && sourceClient !== this.voiceRound.client) {
      return;
    }
    if (isBenignVoiceRuntimeError(error)) {
      this.setData({ voiceHolding: false, frameOpacity: VOICE_IDLE_OPACITY });
      return;
    }
    const raw = resolveRuntimeMessage(error, "语音识别失败");
    const state = resolveVoiceGatewayErrorState(raw, raw);
    const message = state.message || raw;
    this.appendOutput(`[voice-error] ${message}`);
    this.showLocalizedToast(message, "none");
    if (state.showSocketDomainModal) {
      const domainHint = resolveSocketDomainHint(this.opsConfig && this.opsConfig.gatewayUrl);
      wx.showModal({
        title: this.data.copy?.modal?.socketDomainTitle || "Socket 域名未配置",
        content: domainHint
          ? formatTemplate(this.data.copy?.modal?.socketDomainContent, { domainHint })
          : this.data.copy?.modal?.socketDomainContentNoHint || "当前网关地址不在小程序 socket 合法域名列表",
        showCancel: false
      });
    }
    this.setData({ voiceHolding: false, frameOpacity: VOICE_IDLE_OPACITY });
  },

  handleAsrClose(sourceClient) {
    if (sourceClient && sourceClient !== this.voiceRound.client) {
      return;
    }
    this.stopRecorderIfRunning("asr_close");
    if (this.voiceRound.closeTimer) {
      clearTimeout(this.voiceRound.closeTimer);
      this.voiceRound.closeTimer = null;
    }
    if (this.voiceRound.phase !== "idle") {
      this.voiceRound.phase = "idle";
    }
    this.voiceRound.client = null;
  },

  onRecordDraft() {
    const source = this.data.inputText || this.data.draftText;
    const settings = getSettings();
    const selectedCategory = this.resolveSelectedRecordCategory(settings);
    const recordContext = this.resolveRecordContext();
    const collapsedButtonPosition = this.resolveCollapsedVoiceButtonPositionFromExpandedOrigin(
      this.data.voiceFloatLeft,
      this.data.voiceFloatBottom,
      this.data.voiceActionsOffsetX
    );
    this.voiceRound.discardResults = true;
    this.stopVoiceRound(true);
    this.voiceRound.baseText = "";
    this.setData(
      {
        draftText: "",
        inputText: "",
        voiceFloatLeft: collapsedButtonPosition.left,
        voiceFloatBottom: collapsedButtonPosition.bottom,
        voicePanelVisible: false,
        frameOpacity: VOICE_IDLE_OPACITY,
        voiceHolding: false
      },
      () => this.syncVoiceFloatWithinBounds()
    );
    const created = addRecord(source, this.data.serverId, {
      category: selectedCategory,
      contextLabel: recordContext.contextLabel
    });
    if (!created) {
      this.showLocalizedToast("无可记录内容", "none");
      return;
    }
    this.showLocalizedToast("已记录到闪念列表", "success");
  },

  onSendDraft() {
    const collapsedButtonPosition = this.resolveCollapsedVoiceButtonPositionFromExpandedOrigin(
      this.data.voiceFloatLeft,
      this.data.voiceFloatBottom,
      this.data.voiceActionsOffsetX
    );
    this.voiceRound.discardResults = true;
    if (this.voiceRound.phase !== "idle") {
      this.stopVoiceRound(true);
    }
    this.voiceRound.baseText = "";
    const sent = this.onSendInput();
    if (sent) {
      this.setData(
        {
          draftText: "",
          inputText: "",
          voiceFloatLeft: collapsedButtonPosition.left,
          voiceFloatBottom: collapsedButtonPosition.bottom,
          voicePanelVisible: false,
          frameOpacity: VOICE_IDLE_OPACITY,
          voiceHolding: false
        },
        () => this.syncVoiceFloatWithinBounds()
      );
    }
  },

  onClearDraft() {
    this.setData({ draftText: "", inputText: "" });
  },

  onCancelDraft() {
    const collapsedButtonPosition = this.resolveCollapsedVoiceButtonPositionFromExpandedOrigin(
      this.data.voiceFloatLeft,
      this.data.voiceFloatBottom,
      this.data.voiceActionsOffsetX
    );
    this.voiceRound.discardResults = true;
    this.stopVoiceRound(true);
    this.voiceRound.baseText = "";
    this.setData(
      {
        draftText: "",
        inputText: "",
        voiceFloatLeft: collapsedButtonPosition.left,
        voiceFloatBottom: collapsedButtonPosition.bottom,
        voicePanelVisible: false,
        frameOpacity: VOICE_IDLE_OPACITY,
        voiceHolding: false
      },
      () => this.syncVoiceFloatWithinBounds()
    );
  },

  ...createSvgButtonPressMethods()
});
