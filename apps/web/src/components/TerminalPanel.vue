<template>
  <div ref="wrapperRef" class="terminal-wrapper" :style="{ background: settingsStore.settings.shellBgColor }">
    <p v-if="showDisconnectedHint" class="terminal-disconnected-hint">
      请点击右上角“重连”开关或左上角AI按钮，重新连接。
    </p>
    <div
      ref="containerRef"
      :class="['terminal-container', { 'native-touch-selection': nativeTouchSelectionEnabled }]"
    />
    <div
      v-if="nativeTouchSelectionEnabled"
      ref="touchToolsRef"
      :class="['terminal-touch-tools', { 'is-expanded': touchToolsExpanded }]"
    >
      <div v-show="touchToolsExpanded" class="terminal-touch-tools-body">
        <div class="terminal-touch-arrows">
          <span class="icon-mask" style="--icon: url('/icons/keyboard-arrows.svg'); width: 100%; height: 100%" aria-hidden="true"></span>
          <button
            class="terminal-touch-arrow terminal-touch-arrow-up"
            type="button"
            aria-label="发送方向键上"
            title="发送方向键上"
            @click="sendArrowKey('up')"
          ></button>
          <button
            class="terminal-touch-arrow terminal-touch-arrow-right"
            type="button"
            aria-label="发送方向键右"
            title="发送方向键右"
            @click="sendArrowKey('right')"
          ></button>
          <button
            class="terminal-touch-arrow terminal-touch-arrow-left"
            type="button"
            aria-label="发送方向键左"
            title="发送方向键左"
            @click="sendArrowKey('left')"
          ></button>
          <button
            class="terminal-touch-arrow terminal-touch-arrow-down"
            type="button"
            aria-label="发送方向键下"
            title="发送方向键下"
            @click="sendArrowKey('down')"
          ></button>
        </div>
        <button
          class="terminal-touch-enter-btn"
          type="button"
          aria-label="发送回车"
          title="发送回车"
          @click="sendTouchKey('\r')"
        >
          <span
            class="icon-mask terminal-touch-icon"
            style="--icon: url('/icons/enter.svg'); width: 21px; height: 17px"
            aria-hidden="true"
          ></span>
        </button>
        <button
          class="terminal-touch-paste-btn"
          type="button"
          aria-label="粘贴"
          title="粘贴"
          @click="sendTouchPaste()"
        >
          <span
            class="icon-mask terminal-touch-icon"
            style="--icon: url('/icons/paste.svg'); width: 19px; height: 20px"
            aria-hidden="true"
          ></span>
        </button>
        <button
          class="terminal-touch-shortcut-btn"
          type="button"
          aria-label="发送 Ctrl+C"
          title="发送 Ctrl+C"
          @click="sendTouchKey('\u0003')"
        >
          <span class="terminal-touch-shortcut-line">ctrl</span>
          <span class="terminal-touch-shortcut-line">C</span>
        </button>
        <button
          class="terminal-touch-shortcut-btn terminal-touch-tab-btn"
          type="button"
          aria-label="发送 Tab"
          title="发送 Tab"
          @click="sendTouchKey('\t')"
        >
          <span class="terminal-touch-shortcut-line">TAB</span>
        </button>
      </div>
      <button
        class="terminal-touch-toggle-btn"
        :class="{ 'is-expanded': touchToolsExpanded }"
        type="button"
        :aria-label="touchToolsExpanded ? '收起常用键' : '展开常用键'"
        :title="touchToolsExpanded ? '收起常用键' : '展开常用键'"
        @click="touchToolsExpanded = !touchToolsExpanded"
      >
        <span class="terminal-touch-toggle-icon" aria-hidden="true"></span>
      </button>
    </div>
    <TerminalVoiceInput :wrapper-el="wrapperRef" />
  </div>
</template>

<script setup lang="ts">
import { FitAddon } from "xterm-addon-fit";
import type { WebglAddon } from "xterm-addon-webgl";
import { Terminal } from "xterm";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { StdinMeta } from "@remoteconn/shared";
import { useSessionStore } from "@/stores/sessionStore";
import { useSettingsStore } from "@/stores/settingsStore";
import TerminalVoiceInput from "./TerminalVoiceInput.vue";

const sessionStore = useSessionStore();
const settingsStore = useSettingsStore();

/**
 * “未连接”提示仅在可重连状态显示，避免连接建立中的短暂状态造成误导。
 */
const reconnectReadyStates = new Set(["idle", "disconnected", "error"]);

const showDisconnectedHint = computed(() => {
  return reconnectReadyStates.has(sessionStore.state);
});
const touchToolsExpanded = ref(false);
const touchToolsRef = ref<HTMLDivElement | null>(null);
const wrapperRef = ref<HTMLDivElement | null>(null);

const containerRef = ref<HTMLDivElement | null>(null);
let terminal: Terminal | null = null;
let fitAddon: FitAddon | null = null;
let lastIndex = 0;
let resizeObserver: ResizeObserver | null = null;
let fitRetryTimer: number | null = null;
let focusRetryTimer: number | null = null;
let helperTextarea: HTMLTextAreaElement | null = null;
let webglAddon: WebglAddon | null = null;
let onCompositionStart: ((event: CompositionEvent) => void) | null = null;
let onCompositionEnd: ((event: CompositionEvent) => void) | null = null;
let onTextareaBlur: (() => void) | null = null;
let onBeforeInput: ((event: InputEvent) => void) | null = null;
let onInput: ((event: Event) => void) | null = null;
let onTextareaPaste: ((event: ClipboardEvent) => void) | null = null;
let onPointerFocus: ((event: PointerEvent) => void) | null = null;
let onTouchKeyboardPointerDown: ((event: PointerEvent) => void) | null = null;
let onTouchKeyboardPointerMove: ((event: PointerEvent) => void) | null = null;
let onTouchKeyboardPointerUp: ((event: PointerEvent) => void) | null = null;
let onTouchKeyboardPointerCancel: ((event: PointerEvent) => void) | null = null;
let onTouchKeyboardClick: ((event: MouseEvent) => void) | null = null;
let onTouchKeyboardMouseDown: ((event: MouseEvent) => void) | null = null;
let onTouchKeyboardTouchStart: ((event: TouchEvent) => void) | null = null;
let onTouchKeyboardTouchMove: ((event: TouchEvent) => void) | null = null;
let onTouchKeyboardTouchEnd: ((event: TouchEvent) => void) | null = null;
let onTouchToolsOutsidePointerDown: ((event: PointerEvent) => void) | null = null;
let touchScrollRaf: number | null = null;
let touchScrollVelocity = 0; // px per frame (~16ms), 正值 = 向下滚动
let touchScrollLastY = 0;
let touchScrollLastTime = 0;
let lastTouchAction: "BLUR_ONLY" | "FOCUS_KEYBOARD" | "PASS_NATIVE" | "PASS_SCROLL" | null = null;
let focusKeyboardTimerId: number | null = null;
let focusKeyboardRecoverTimerId: number | null = null;
let focusKeyboardRecoverCount = 0;
// FOCUS_KEYBOARD 激活期间设为 true，阻止 onTextareaBlur 重置 readOnly=true。
// 原因：iOS 上 blur() 调用与 blur 事件触发之间存在异步间隔；若不加标志，
// onTextareaBlur 会在 readOnly=false+focus() 之后才执行，将刚弹出的键盘再次收起。
let focusKeyboardInProgress = false;
let onWindowFocus: (() => void) | null = null;
let onVisibilityChange: (() => void) | null = null;
let viewportScroller: HTMLElement | null = null;
let onViewportWheel: ((event: WheelEvent) => void) | null = null;
let wheelInertiaRaf: number | null = null;
let wheelInertiaVelocity = 0;
let wheelLastTickAt = 0;
let isComposing = false;
let lastAssistCommittedText = "";
let lastAssistCommittedAt = 0;
let assistFlushTimer: number | null = null;
let assistPendingText = "";
let assistTxnSeq = 0;
let asciiFallbackTimer: number | null = null;
let asciiFallbackText = "";
let compositionGuardTimer: number | null = null;
let compositionStartedAt = 0;
let lastKeyboardCommittedText = "";
let lastKeyboardCommittedAt = 0;
let keyboardAssistBridgeText = "";
let keyboardAssistBridgeAt = 0;
let assistRewriteSessionText = "";
let assistRewriteSessionActive = false;
let assistRewriteProtectTimer: number | null = null;
let touchGatePointerId: number | null = null;
let touchGateStartX = 0;
let touchGateStartY = 0;
let touchGateMoved = false;
let touchGateStartInBand = false;
let touchGateHadSelectionAtStart = false;
let touchGateScrollLike = false;
let unicode11AddonLoaded = false;
let webglLoadToken = 0;

const DEBUG_TOUCH_FOCUS = false;

const ASSIST_COMMIT_DELAY_MS = 450;
const ASSIST_DICTATION_COMMIT_DELAY_MS = 900;
const ASSIST_REWRITE_PROTECT_MS = 6000;
const ASCII_FALLBACK_DELAY_MS = 90;
const COMPOSITION_GUARD_MS = 1800;
const COMPOSITION_NOISE_BLOCK_MS = 900;
const KEYBOARD_NON_ASCII_DEDUP_MS = 200;
const KEYBOARD_ASSIST_BRIDGE_MS = 3500;
const KEYBOARD_ASSIST_BRIDGE_MAX_CHARS = 24;
const TERMINAL_SMOOTH_SCROLL_DURATION_MS = 140;
const WHEEL_LINE_HEIGHT_PX = 16;
const WHEEL_INERTIA_BOOST = 0.2;
const WHEEL_INERTIA_DAMPING = 0.88;
const WHEEL_INERTIA_STOP_THRESHOLD = 0.35;
const WHEEL_INERTIA_MAX_SPEED = 64;
const WHEEL_INERTIA_EVENT_GAP_MS = 90;
// 触摸动量滚动常量
const TOUCH_SCROLL_DAMPING = 0.95;
const TOUCH_SCROLL_STOP_THRESHOLD = 0.2;
const TOUCH_SCROLL_MAX_SPEED = 120;
const TOUCH_SCROLL_BOOST = 1.35;
const TOUCH_KEYBOARD_ACTIVATION_ROW_RADIUS = 2;
const TOUCH_KEYBOARD_TAP_MAX_MOVE_PX = 10;
const TOUCH_KEYBOARD_FOCUS_GUARD_MS = 900;
const TOUCH_KEYBOARD_BLUR_RECOVER_DELAY_MS = 16;
const TOUCH_KEYBOARD_BLUR_RECOVER_MAX = 2;

/**
 * 触屏端启用“原生文本选择”模式：
 * - 放开浏览器长按选择（出现 iOS 工具条与拖拽手柄）；
 * - 仍保留桌面端的鼠标聚焦与快捷键行为。
 */
const nativeTouchSelectionEnabled = (() => {
  if (typeof window === "undefined") {
    return false;
  }
  const coarse = typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
  return coarse || "ontouchstart" in window;
})();

/**
 * 过滤终端输入中的 IME 噪声字符：
 * - 仅在前端去掉 U+FFFD（替换字符），其余字节序列保持原样交由网关判定。
 * 原因：xterm 在某些输入路径下会把 UTF-8 作为“字节串样式字符串”回传，
 * 其中可能包含 `0x80-0x9F` 范围字节（例如“文”的 UTF-8 字节里包含 0x96、0x87）。
 * 若前端直接过滤 C1，会误删合法中文输入。
 */
function sanitizeTerminalInput(data: string): string {
  return (
    data
      .replace(/\uFFFD/g, "")
      // 移动端键盘/语音可能产出 NBSP/窄不换行空格/全角空格，统一折叠为普通空格。
      .replace(/[\u00A0\u2007\u202F\u3000]/g, " ")
  );
}

function hasNonAscii(data: string): boolean {
  return /[^\p{ASCII}]/u.test(data);
}

/**
 * 规范化 assist（语音/输入法提交）快照文本：
 * - assist 快照语义应是“当前完整可见文本”，不应包含控制字符；
 * - 某些输入法会把 DEL/控制码混入事件数据，若直接入快照会导致差分基线污染，
 *   进而出现“长段落反复改写、内容叠加”。
 */
function sanitizeAssistSnapshot(data: string): string {
  const input = sanitizeTerminalInput(data);
  let out = "";
  for (const ch of input) {
    const code = ch.charCodeAt(0);
    if ((code >= 0 && code <= 0x1f) || code === 0x7f) {
      continue;
    }
    out += ch;
  }
  return out;
}

/**
 * 识别输入法“首字重复前缀”伪增量：
 * 例：full="测测试", base="测试"（或 full="输输入", base="输入"）。
 * 这类形态通常来自某些输入法在提交瞬间把“上一次单字增量 + 最终词”拼在一起。
 */
function hasSingleCharDupPrefix(full: string, base: string): boolean {
  if (!full || !base) return false;
  if (!full.endsWith(base)) return false;
  if (full.length !== base.length + 1) return false;
  return full[0] === base[0];
}

/**
 * 输入法事件中 `event.data` 常为“增量片段”，而 helper textarea 可能是“当前完整串”。
 * 为避免只截到首字/首字母，优先返回更完整的一侧。
 */
function resolveImePayload(directData: string, textareaData: string): string {
  const direct = sanitizeTerminalInput(directData);
  const text = sanitizeTerminalInput(textareaData);
  if (!direct) return text;
  if (!text) return direct;
  // 先处理输入法常见“首字重复前缀”伪增量，避免出现“测测试/输输入”。
  if (hasSingleCharDupPrefix(text, direct)) {
    return direct;
  }
  if (hasSingleCharDupPrefix(direct, text)) {
    return text;
  }
  if (!hasNonAscii(direct) && !hasNonAscii(text)) {
    /**
     * ASCII 场景优先保留更完整的前缀累计串：
     * - 语音数字/英文有时 directData 只给首字，textarea 已是完整串（如 "1" vs "12"）；
     * - 常规键盘输入通常 directData 与 textarea 等长，不受影响。
     */
    if (text.length > direct.length && text.startsWith(direct)) {
      return text;
    }
    if (direct.length > text.length && direct.startsWith(text)) {
      return direct;
    }
    return direct;
  }
  return text.length >= direct.length ? text : direct;
}

/**
 * Codex/TUI 场景大量使用整行背景色，行高过大（如 1.4）会造成“补丁块”视觉断裂。
 * 这里仅在终端渲染层做上限收敛，不修改用户设置的持久化值。
 */
function resolveTerminalLineHeight(raw: number): number {
  void raw;
  return 1;
}

function resolveTerminalFontFamily(raw: string): string {
  const value = String(raw ?? "").trim();
  const fallback = '"SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", monospace';
  if (!value) {
    return fallback;
  }
  return `${value}, ${fallback}`;
}

function focusShell(): void {
  terminal?.focus();
}

function focusHelperTextarea(): void {
  if (!helperTextarea) {
    return;
  }
  try {
    helperTextarea.focus({ preventScroll: true });
  } catch {
    helperTextarea.focus();
  }
}

/**
 * 用户主动输入时，立即把终端视口拉回到底部：
 * - 用户向上翻历史后，回车 / Ctrl+C / 普通命令输入应立刻看到当前光标；
 * - 先停掉滚轮/触摸惯性，避免“刚回到底部又被惯性拉走”。
 */
function revealCursorAtBottom(): void {
  clearWheelInertia();
  clearTouchScrollMomentum();

  const applyScroll = (): void => {
    terminal?.scrollToBottom();
    const scroller = viewportScroller ?? containerRef.value?.querySelector(".xterm-viewport");
    if (scroller) {
      scroller.scrollTop = scroller.scrollHeight;
    }
  };

  applyScroll();
  window.requestAnimationFrame(() => {
    applyScroll();
  });
}

function sendTerminalInput(input: string, meta?: StdinMeta): Promise<void> {
  revealCursorAtBottom();
  return sessionStore.sendInput(input, meta);
}

function clearFocusKeyboardBlurRecover(): void {
  if (focusKeyboardRecoverTimerId !== null) {
    window.clearTimeout(focusKeyboardRecoverTimerId);
    focusKeyboardRecoverTimerId = null;
  }
  focusKeyboardRecoverCount = 0;
}

/**
 * iOS 键盘动画阶段可能出现“瞬时 blur”：
 * - 触发时机在 FOCUS_KEYBOARD 保护窗口内；
 * - 若直接放任失焦，键盘会出现“弹起后立刻收回”。
 * 这里仅在保护窗口内做有限次数补焦，避免进入无限焦点竞争。
 */
function scheduleFocusKeyboardBlurRecover(): void {
  if (!nativeTouchSelectionEnabled || !helperTextarea || !focusKeyboardInProgress) {
    return;
  }
  if (focusKeyboardRecoverCount >= TOUCH_KEYBOARD_BLUR_RECOVER_MAX) {
    return;
  }
  focusKeyboardRecoverCount += 1;
  if (focusKeyboardRecoverTimerId !== null) {
    window.clearTimeout(focusKeyboardRecoverTimerId);
  }
  const target = helperTextarea;
  focusKeyboardRecoverTimerId = window.setTimeout(() => {
    focusKeyboardRecoverTimerId = null;
    if (!focusKeyboardInProgress) {
      return;
    }
    // helper 引用切换、触屏选择态(readOnly=true)都不应强制抢焦点。
    if (target !== helperTextarea || target.readOnly) {
      return;
    }
    if (document.activeElement !== target) {
      focusHelperTextarea();
    }
  }, TOUCH_KEYBOARD_BLUR_RECOVER_DELAY_MS);
}

/**
 * 读取当前终端“单行像素高度”：
 * - 优先取 xterm 实际渲染行高；
 * - DOM 不可用时回退 fontSize * lineHeight。
 */
function resolveTerminalRowHeightPx(): number {
  const row = containerRef.value?.querySelector(".xterm-rows > div");
  const rendered = row ? (row as HTMLElement).getBoundingClientRect().height : 0;
  if (rendered > 0) {
    return rendered;
  }
  const fontSize = Number(terminal?.options.fontSize ?? settingsStore.settings.shellFontSize ?? 15);
  const lineHeight = Number(terminal?.options.lineHeight ?? 1);
  const fallback = fontSize * lineHeight;
  return Number.isFinite(fallback) && fallback > 0 ? fallback : 16;
}

/**
 * 触屏键盘激活区域：
 * - 仅允许点击“光标行上下 2 行”（共 5 行）时弹出键盘；
 * - 其余位置点击不聚焦输入框，避免误弹键盘。
 */
function isTouchInCursorActivationBand(clientY: number): boolean {
  if (!terminal || !containerRef.value) {
    return false;
  }
  const screenEl = containerRef.value.querySelector(".xterm-screen");
  if (!screenEl) {
    return false;
  }
  const screenRect = (screenEl as HTMLElement).getBoundingClientRect();
  if (clientY < screenRect.top || clientY > screenRect.bottom) {
    return false;
  }
  const rowHeight = resolveTerminalRowHeightPx();
  const clickRow = Math.floor((clientY - screenRect.top) / rowHeight);
  const cursorRow = Math.max(0, Math.min(terminal.rows - 1, terminal.buffer.active.cursorY));
  return Math.abs(clickRow - cursorRow) <= TOUCH_KEYBOARD_ACTIVATION_ROW_RADIUS;
}

function resetTouchKeyboardGateTracking(): void {
  touchGatePointerId = null;
  touchGateStartX = 0;
  touchGateStartY = 0;
  touchGateMoved = false;
  touchGateStartInBand = false;
  touchGateHadSelectionAtStart = false;
  touchGateScrollLike = false;
}

/**
 * 判断当前是否存在“终端区域内”的原生文本选区：
 * - 用于触屏长按后的复制/全选/拖拽手柄场景；
 * - 一旦存在选区，后续触摸应完全交给浏览器原生处理，避免被键盘门控逻辑打断。
 */
function hasActiveNativeSelectionInTerminal(): boolean {
  if (typeof window === "undefined" || !containerRef.value) {
    return false;
  }
  const selection = window.getSelection();
  if (!selection || selection.rangeCount <= 0 || selection.isCollapsed) {
    return false;
  }
  const range = selection.getRangeAt(0);
  const anchorNode = range.commonAncestorContainer;
  const anchorElement = anchorNode.nodeType === Node.TEXT_NODE ? anchorNode.parentElement : (anchorNode as HTMLElement);
  if (!anchorElement) {
    return false;
  }
  return containerRef.value.contains(anchorElement);
}

/**
 * 清理终端区域内的原生文本选区：
 * - 仅在选区确实位于终端内时执行；
 * - 用于“点过其他区域后，想回到光标附近继续输入”的恢复场景。
 */
function clearNativeSelectionInTerminal(): void {
  if (typeof window === "undefined") {
    return;
  }
  const selection = window.getSelection();
  if (!selection || selection.rangeCount <= 0 || selection.isCollapsed) {
    return;
  }
  const range = selection.getRangeAt(0);
  const anchorNode = range.commonAncestorContainer;
  const anchorElement = anchorNode.nodeType === Node.TEXT_NODE ? anchorNode.parentElement : (anchorNode as HTMLElement);
  if (!anchorElement || !containerRef.value?.contains(anchorElement)) {
    return;
  }
  try {
    selection.removeAllRanges();
  } catch {
    // iOS 某些版本在选区切换瞬间可能抛错，忽略即可。
  }
}

type ArrowDirection = "up" | "right" | "down" | "left";

/**
 * 手机/Pad 常用键发送：
 * - 仅复用 keyboard 通道，不引入新的输入源语义；
 * - 失败时静默，由连接状态提示与顶部状态承担反馈。
 */
function sendTouchKey(input: string): void {
  if (sessionStore.state !== "connected") {
    return;
  }
  sendTerminalInput(input, { source: "keyboard" }).catch(() => {
    // 连接未就绪等异常不打断交互。
  });
}

function sendArrowKey(direction: ArrowDirection): void {
  const arrows: Record<ArrowDirection, string> = {
    up: "\u001b[A",
    right: "\u001b[C",
    down: "\u001b[B",
    left: "\u001b[D"
  };
  sendTouchKey(arrows[direction]);
}

/**
 * 触屏工具栏“粘贴”按钮：
 * - 优先读取系统剪贴板并直写远端 shell；
 * - 权限拒绝或能力缺失时静默降级，不打断终端交互。
 */
async function sendTouchPaste(): Promise<void> {
  if (sessionStore.state !== "connected") {
    return;
  }
  if (!navigator.clipboard?.readText) {
    return;
  }
  try {
    const text = await navigator.clipboard.readText();
    await sendPastedText(text);
  } catch {
    // 剪贴板读取失败（权限/系统限制）时不弹窗。
  }
}

/**
 * 将滚轮位移统一折算为像素：
 * - 浏览器可能以“行/页”为单位上报滚轮量，直接使用会导致不同设备滚动手感割裂；
 * - 统一像素后，才能稳定叠加惯性速度。
 */
function normalizeWheelDeltaY(event: WheelEvent): number {
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
    return event.deltaY * WHEEL_LINE_HEIGHT_PX;
  }
  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
    const pageHeight = viewportScroller?.clientHeight ?? window.innerHeight;
    return event.deltaY * pageHeight;
  }
  return event.deltaY;
}

function clearWheelInertia(): void {
  if (wheelInertiaRaf !== null) {
    window.cancelAnimationFrame(wheelInertiaRaf);
    wheelInertiaRaf = null;
  }
  wheelInertiaVelocity = 0;
}

function clearTouchScrollMomentum(): void {
  if (touchScrollRaf !== null) {
    window.cancelAnimationFrame(touchScrollRaf);
    touchScrollRaf = null;
  }
  touchScrollVelocity = 0;
}

/**
 * 触摸动量滚动：xterm 在 touchmove 中手动 scrollTop+=deltaY，手指抬起即停止，无惯性。
 * 本函数在 touchend 后接管，以指数衰减继续推进 scrollTop，模拟 iOS 惯性效果。
 */
function runTouchScrollMomentum(): void {
  if (!viewportScroller) {
    clearTouchScrollMomentum();
    return;
  }
  if (touchScrollRaf !== null) {
    return;
  }
  const step = (): void => {
    if (!viewportScroller) {
      clearTouchScrollMomentum();
      return;
    }
    touchScrollVelocity *= TOUCH_SCROLL_DAMPING;
    if (Math.abs(touchScrollVelocity) < TOUCH_SCROLL_STOP_THRESHOLD) {
      clearTouchScrollMomentum();
      return;
    }
    const before = viewportScroller.scrollTop;
    viewportScroller.scrollTop += touchScrollVelocity;
    if (before === viewportScroller.scrollTop) {
      clearTouchScrollMomentum();
      return;
    }
    touchScrollRaf = window.requestAnimationFrame(step);
  };
  touchScrollRaf = window.requestAnimationFrame(step);
}

/**
 * 启动滚轮惯性动画：
 * - 采用指数衰减，逐帧减少速度；
 * - 到达顶部/底部后立刻停止，避免“空转”占用帧预算。
 */
function runWheelInertia(): void {
  if (!viewportScroller) {
    clearWheelInertia();
    return;
  }
  if (wheelInertiaRaf !== null) {
    return;
  }

  const step = (): void => {
    if (!viewportScroller) {
      clearWheelInertia();
      return;
    }
    wheelInertiaVelocity *= WHEEL_INERTIA_DAMPING;
    if (Math.abs(wheelInertiaVelocity) < WHEEL_INERTIA_STOP_THRESHOLD) {
      clearWheelInertia();
      return;
    }
    const before = viewportScroller.scrollTop;
    viewportScroller.scrollTop += wheelInertiaVelocity;
    if (before === viewportScroller.scrollTop) {
      clearWheelInertia();
      return;
    }
    wheelInertiaRaf = window.requestAnimationFrame(step);
  };

  wheelInertiaRaf = window.requestAnimationFrame(step);
}

/**
 * 绑定 viewport 滚轮增强：
 * - 小步长触控板（pixel 模式）保留浏览器原生滚动与原生惯性；
 * - 传统鼠标滚轮则接管为“平滑 + 惯性”。
 */
function bindTerminalWheelInertia(): void {
  if (!containerRef.value) {
    return;
  }
  viewportScroller = containerRef.value.querySelector(".xterm-viewport");
  if (!viewportScroller) {
    return;
  }
  onViewportWheel = (event: WheelEvent) => {
    if (!viewportScroller) {
      return;
    }
    if (event.ctrlKey || event.metaKey) {
      // 保留系统缩放手势，不拦截。
      return;
    }
    const deltaY = normalizeWheelDeltaY(event);
    if (!Number.isFinite(deltaY) || deltaY === 0) {
      return;
    }
    if (event.deltaMode === WheelEvent.DOM_DELTA_PIXEL && Math.abs(deltaY) < 6) {
      return;
    }

    event.preventDefault();
    viewportScroller.scrollTop += deltaY;

    const now = performance.now();
    const directionChanged =
      wheelInertiaVelocity !== 0 && Math.sign(wheelInertiaVelocity) !== Math.sign(deltaY);
    if (directionChanged || now - wheelLastTickAt > WHEEL_INERTIA_EVENT_GAP_MS) {
      wheelInertiaVelocity = deltaY * WHEEL_INERTIA_BOOST;
    } else {
      wheelInertiaVelocity += deltaY * WHEEL_INERTIA_BOOST;
    }
    wheelInertiaVelocity = Math.max(
      -WHEEL_INERTIA_MAX_SPEED,
      Math.min(WHEEL_INERTIA_MAX_SPEED, wheelInertiaVelocity)
    );
    wheelLastTickAt = now;
    runWheelInertia();
  };
  viewportScroller.addEventListener("wheel", onViewportWheel, { passive: false });
}

function clearAsciiFallback(): void {
  if (asciiFallbackTimer !== null) {
    window.clearTimeout(asciiFallbackTimer);
    asciiFallbackTimer = null;
  }
  asciiFallbackText = "";
}

/**
 * 写入系统剪贴板：
 * - 浏览器权限策略可能拒绝写入（例如非安全上下文），失败时静默回退；
 * - 复制失败不应影响终端主流程。
 */
async function writeClipboardText(text: string): Promise<void> {
  const payload = String(text ?? "");
  if (!payload) {
    return;
  }
  if (!navigator.clipboard?.writeText) {
    return;
  }
  try {
    await navigator.clipboard.writeText(payload);
  } catch {
    // 剪贴板失败不阻塞输入主流程。
  }
}

/**
 * 将粘贴文本直接写入远端 shell：
 * - 统一走 keyboard source，绕开输入法/语音分支，避免误触发增量修正逻辑；
 * - 保留 sanitize（NBSP/全角空格等）与 sessionStore 的换行标准化链路。
 */
async function sendPastedText(rawText: string): Promise<void> {
  const payload = sanitizeTerminalInput(String(rawText ?? ""));
  if (!payload) {
    return;
  }
  clearAsciiFallback();
  clearAssistPendingCommit();
  resetAssistRewriteSession();
  try {
    await sendTerminalInput(payload, { source: "keyboard" });
  } catch {
    // 输入失败由上层 toast 反馈。
  }
  if (helperTextarea) {
    helperTextarea.value = "";
  }
}

function isCopyShortcut(event: KeyboardEvent): boolean {
  const key = String(event.key ?? "").toLowerCase();
  const mod = event.metaKey || event.ctrlKey;
  return mod && !event.altKey && !event.shiftKey && key === "c";
}

function isPasteShortcut(event: KeyboardEvent): boolean {
  const key = String(event.key ?? "").toLowerCase();
  const modPaste = (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && key === "v";
  const shiftInsertPaste = !event.metaKey && !event.ctrlKey && event.shiftKey && key === "insert";
  return modPaste || shiftInsertPaste;
}

function clearAssistPendingCommit(): void {
  if (assistFlushTimer !== null) {
    window.clearTimeout(assistFlushTimer);
    assistFlushTimer = null;
  }
  assistPendingText = "";
}

function clearKeyboardAssistBridge(): void {
  keyboardAssistBridgeText = "";
  keyboardAssistBridgeAt = 0;
}

function clearAssistRewriteProtectTimer(): void {
  if (assistRewriteProtectTimer !== null) {
    window.clearTimeout(assistRewriteProtectTimer);
    assistRewriteProtectTimer = null;
  }
}

/**
 * 重置语音“整段改写会话”：
 * - 会话内以输入法最新修正稿为准；
 * - 会话外不再回改，避免影响后续独立输入。
 */
function resetAssistRewriteSession(): void {
  clearAssistRewriteProtectTimer();
  assistRewriteSessionText = "";
  assistRewriteSessionActive = false;
}

/**
 * 仅结束“活跃态”，保留最后快照：
 * - 用于保护时间到期后的温和降级；
 * - 下一条 assist 文本仍可基于旧快照做差分，避免整段重复追加。
 */
function deactivateAssistRewriteSession(): void {
  clearAssistRewriteProtectTimer();
  assistRewriteSessionActive = false;
}

function touchAssistRewriteSession(): void {
  assistRewriteSessionActive = true;
  clearAssistRewriteProtectTimer();
  assistRewriteProtectTimer = window.setTimeout(() => {
    deactivateAssistRewriteSession();
  }, ASSIST_REWRITE_PROTECT_MS);
}

/**
 * 同步 keyboard 回显对语音会话快照的影响：
 * - 中文与 DEL 会真实改变当前命令行，应同步到快照；
 * - 回车与 ASCII/控制序列视为用户接管，直接结束会话。
 */
function syncAssistSessionOnKeyboardEcho(input: string): void {
  if (!assistRewriteSessionActive) {
    return;
  }

  if (input === "\u007f") {
    if (assistRewriteSessionText) {
      assistRewriteSessionText = Array.from(assistRewriteSessionText).slice(0, -1).join("");
    }
    touchAssistRewriteSession();
    return;
  }

  if (hasNonAscii(input)) {
    assistRewriteSessionText += input;
    touchAssistRewriteSession();
    return;
  }

  /**
   * 可见 ASCII（含空格）在会话内按“正文补齐”处理：
   * - 可兼容语音英文/混输场景；
   * - 避免把正常词内空格误判为“用户接管”而重置会话。
   */
  if (/^[\u0020-\u007e]+$/.test(input)) {
    assistRewriteSessionText += input;
    touchAssistRewriteSession();
    return;
  }

  if (input === "\r" || input === "\n") {
    resetAssistRewriteSession();
    return;
  }

  /**
   * 其它控制序列（例如方向键 ESC 序列）不参与快照同步，也不强制重置：
   * - 这些序列常出现在移动端输入法/软键盘内部流程；
   * - 若在此重置，会导致长段落改写中断，下一包退化为整段追加。
   */
}

/**
 * 记录“刚刚由 keyboard 直写到 shell 的中文前缀”，用于后续 assist 累计串去重。
 * 典型场景：
 * - keyboard 先上报“把”“文”；
 * - assist 随后上报“把文本复制到”；
 * 若不桥接，会变成“把文把文本复制到”。
 */
function updateKeyboardAssistBridge(input: string, now: number): void {
  if (input === "\u007f") {
    if (keyboardAssistBridgeText) {
      keyboardAssistBridgeText = keyboardAssistBridgeText.slice(0, -1);
    }
    keyboardAssistBridgeAt = now;
    return;
  }
  if (hasNonAscii(input)) {
    if (keyboardAssistBridgeAt <= 0 || now - keyboardAssistBridgeAt > KEYBOARD_ASSIST_BRIDGE_MS) {
      keyboardAssistBridgeText = "";
    }
    keyboardAssistBridgeText += input;
    if (keyboardAssistBridgeText.length > KEYBOARD_ASSIST_BRIDGE_MAX_CHARS) {
      keyboardAssistBridgeText = keyboardAssistBridgeText.slice(-KEYBOARD_ASSIST_BRIDGE_MAX_CHARS);
    }
    keyboardAssistBridgeAt = now;
    return;
  }
  // 一旦进入 ASCII/控制键流，清掉中文桥接上下文，避免误扣前缀。
  clearKeyboardAssistBridge();
}

/**
 * 将 assist 提交与最近 keyboard 前缀对齐，扣除重复前缀。
 */
function applyKeyboardAssistBridge(committed: string, now: number): string {
  if (!keyboardAssistBridgeText) {
    return committed;
  }
  if (keyboardAssistBridgeAt <= 0 || now - keyboardAssistBridgeAt > KEYBOARD_ASSIST_BRIDGE_MS) {
    clearKeyboardAssistBridge();
    return committed;
  }
  const prefix = keyboardAssistBridgeText;
  if (committed.startsWith(prefix)) {
    const delta = committed.slice(prefix.length);
    clearKeyboardAssistBridge();
    return delta;
  }
  if (prefix.startsWith(committed)) {
    // assist 还在更短中间态，暂不发送，等待后续稳定文本。
    keyboardAssistBridgeAt = now;
    return "";
  }
  /**
   * 混合输入补偿：
   * - 某些输入法会先以 keyboard 路径落单字（如“文”/“贴”），
   *   随后 assist 再给词组（如“把文本”/“剪贴板”）；
   * - 此时无法靠“前缀裁剪”去重，因为重复字符在词组中间。
   * 处理：先发 DEL 撤销最近 keyboard 单字，再发送 assist 词组。
   */
  if (prefix.length <= 2 && committed.includes(prefix)) {
    clearKeyboardAssistBridge();
    return `${"\u007f".repeat(prefix.length)}${committed}`;
  }
  return committed;
}

function clearCompositionGuard(): void {
  if (compositionGuardTimer !== null) {
    window.clearTimeout(compositionGuardTimer);
    compositionGuardTimer = null;
  }
}

/**
 * 强制结束组合态：
 * - 某些移动端输入法在“切换输入法/切后台/候选栏中断”时不会发 compositionend；
 * - 若不主动恢复，`isComposing` 会一直为 true，后续中文输入会被长期抑制。
 */
function endComposition(): void {
  isComposing = false;
  compositionStartedAt = 0;
  clearCompositionGuard();
}

/**
 * 进入组合态时启动看门狗，超时自动恢复，避免状态卡死。
 */
function beginComposition(): void {
  isComposing = true;
  compositionStartedAt = performance.now();
  clearCompositionGuard();
  compositionGuardTimer = window.setTimeout(() => {
    endComposition();
  }, COMPOSITION_GUARD_MS);
}

function recoverCompositionIfStale(): void {
  if (!isComposing) {
    return;
  }
  if (compositionStartedAt <= 0) {
    endComposition();
    return;
  }
  if (performance.now() - compositionStartedAt > COMPOSITION_GUARD_MS) {
    endComposition();
  }
}

/**
 * ASCII 输入兜底提交：
 * - 手机输入法在某些路径下不会触发 xterm.onData，导致英文/空格“无日志无输入”；
 * - 这里延迟一小段时间，若期间 onData 已回传，则自动取消，不会重复发送。
 */
function scheduleAsciiFallback(rawText: string): void {
  const committed = sanitizeTerminalInput(String(rawText ?? ""));
  if (!committed || hasNonAscii(committed)) {
    return;
  }
  asciiFallbackText = committed;
  if (asciiFallbackTimer !== null) {
    window.clearTimeout(asciiFallbackTimer);
  }
  asciiFallbackTimer = window.setTimeout(() => {
    const payload = asciiFallbackText;
    asciiFallbackTimer = null;
    asciiFallbackText = "";
    if (!payload) {
      return;
    }
    sendTerminalInput(payload, { source: "keyboard" }).catch(() => {
      // 输入失败由上层 toast 反馈。
    });
    if (helperTextarea) {
      helperTextarea.value = "";
    }
  }, ASCII_FALLBACK_DELAY_MS);
}

function createAssistTxnId(): string {
  assistTxnSeq += 1;
  return `assist-${Date.now()}-${assistTxnSeq}`;
}

/**
 * 折叠 assist 包里常见的“起始词重复”：
 * 例：`终端终端将自动...` -> `终端将自动...`
 * 仅处理 2~8 字符的开头重复，避免影响单字叠词（如“人人”）。
 */
function collapseLeadingAssistDup(text: string): string {
  const input = String(text ?? "");
  const max = Math.min(8, Math.floor(input.length / 2));
  for (let size = 2; size <= max; size += 1) {
    const unit = input.slice(0, size);
    if (!unit || !hasNonAscii(unit)) {
      continue;
    }
    if (input.startsWith(unit + unit)) {
      const tail = input.slice(size * 2);
      if (!tail) {
        return input;
      }
      return unit + tail;
    }
  }
  return input;
}

function buildAssistDiffPayload(previousSnapshot: string, nextSnapshot: string): string {
  const prevChars = Array.from(previousSnapshot);
  const nextChars = Array.from(nextSnapshot);
  const n = Math.min(prevChars.length, nextChars.length);
  let prefix = 0;
  while (prefix < n && prevChars[prefix] === nextChars[prefix]) {
    prefix += 1;
  }
  const deleteCount = prevChars.length - prefix;
  const append = nextChars.slice(prefix).join("");
  return `${"\u007f".repeat(deleteCount)}${append}`;
}

function emitAssistPayload(payload: string, now = performance.now()): void {
  if (!payload) {
    return;
  }
  if (payload === lastAssistCommittedText && now - lastAssistCommittedAt < 800) {
    return;
  }
  lastAssistCommittedText = payload;
  lastAssistCommittedAt = now;
  const txnId = createAssistTxnId();
  sendTerminalInput(payload, { source: "assist", txnId }).catch(() => {
    // 输入失败由上层 toast 反馈。
  });
}

/**
 * 语音输入单状态机：
 * - `idle`：尚未建立会话；
 * - `active`：已有会话快照，后续输入按“旧快照 -> 新快照”差分回写。
 */
function applyAssistSnapshot(rawText: string): void {
  const now = performance.now();
  const normalizedSnapshot = collapseLeadingAssistDup(sanitizeAssistSnapshot(String(rawText ?? "")));
  if (!normalizedSnapshot) {
    return;
  }

  if (!assistRewriteSessionActive) {
    if (assistRewriteSessionText) {
      const payload = buildAssistDiffPayload(assistRewriteSessionText, normalizedSnapshot);
      assistRewriteSessionText = normalizedSnapshot;
      touchAssistRewriteSession();
      emitAssistPayload(payload, now);
      return;
    }
    const bridged = applyKeyboardAssistBridge(normalizedSnapshot, now);
    assistRewriteSessionText = normalizedSnapshot;
    touchAssistRewriteSession();
    emitAssistPayload(bridged, now);
    return;
  }

  const payload = buildAssistDiffPayload(assistRewriteSessionText, normalizedSnapshot);
  assistRewriteSessionText = normalizedSnapshot;
  touchAssistRewriteSession();
  emitAssistPayload(payload, now);
}

function commitAssistInput(rawText: string): void {
  const committed = sanitizeAssistSnapshot(String(rawText ?? ""));
  if (!committed) {
    return;
  }
  /**
   * assist 通道统一走“快照差分”：
   * - 无论中英文，均按“最新快照覆盖”策略处理输入法修订；
   * - 可避免 ASCII/英文语音在后续修订时退化为整段重复追加。
   */
  applyAssistSnapshot(committed);
}

/**
 * 安排 assist 提交：
 * - 用最新内容覆盖（典型于语音“最终结果”）。
 */
function scheduleAssistCommit(rawText: string, fromDictation = false): void {
  const committed = sanitizeTerminalInput(String(rawText ?? ""));
  if (!committed) {
    return;
  }
  // 最新快照始终覆盖旧 pending，避免长文本时反复叠加。
  assistPendingText = committed;
  if (assistFlushTimer !== null) {
    window.clearTimeout(assistFlushTimer);
  }
  assistFlushTimer = window.setTimeout(
    () => {
      if (!assistPendingText) {
        assistFlushTimer = null;
        return;
      }
      commitAssistInput(assistPendingText);
      assistPendingText = "";
      assistFlushTimer = null;
    },
    fromDictation ? ASSIST_DICTATION_COMMIT_DELAY_MS : ASSIST_COMMIT_DELAY_MS
  );
}

/**
 * 兼容部分 TUI（如 Codex CLI）发出的“同步更新模式”控制序列：
 * - `CSI ? 2026 h/l`
 * - `DCS = 1 s` / `DCS = 2 s`（以 ST 或 BEL 结束）
 *
 * 部分浏览器终端栈对此支持不完整，可能出现“输入/输出不可见”或局部不刷新。
 */
function sanitizeTerminalOutput(data: string): string {
  const ESC = String.fromCharCode(27);
  const BEL = String.fromCharCode(7);
  const csiSyncMode = new RegExp(`${ESC}\\[\\?2026[hl]`, "g");
  const dcsSyncUpdate = new RegExp(`${ESC}P=[12]s(?:${ESC}\\\\|${BEL})`, "g");
  /**
   * 屏蔽部分终端颜色查询与响应（OSC 10/11/12）：
   * - 某些环境下会触发高频查询并伴随回包闪烁；
   * - 与缓冲区重放叠加时，回包文本可能以 `rgb:xxxx/...` 形式泄漏到可见区域。
   */
  const oscColorQuery = new RegExp(`${ESC}\\](?:10|11|12);\\?(?:${ESC}\\\\|${BEL})`, "g");
  const oscColorResponse = new RegExp(
    `${ESC}\\](?:10|11|12);rgb:[0-9a-fA-F]{2,4}\\/[0-9a-fA-F]{2,4}\\/[0-9a-fA-F]{2,4}(?:${ESC}\\\\|${BEL})`,
    "g"
  );
  return data
    .replace(csiSyncMode, "")
    .replace(dcsSyncUpdate, "")
    .replace(oscColorQuery, "")
    .replace(oscColorResponse, "");
}

async function ensureUnicode11AddonLoaded(): Promise<void> {
  if (unicode11AddonLoaded || !terminal) {
    return;
  }
  try {
    const { Unicode11Addon } = await import("xterm-addon-unicode11");
    if (!terminal || unicode11AddonLoaded) {
      return;
    }
    const unicodeAddon = new Unicode11Addon();
    terminal.loadAddon(unicodeAddon);
    unicode11AddonLoaded = true;
  } catch {
    // 加载失败时保留 xterm 默认 unicode 版本。
  }
}

async function applyUnicodeVersionBySettings(): Promise<void> {
  if (!terminal) {
    return;
  }
  if (settingsStore.settings.unicode11 !== false) {
    await ensureUnicode11AddonLoaded();
    if (!terminal) {
      return;
    }
    terminal.unicode.activeVersion = "11";
    return;
  }
  terminal.unicode.activeVersion = "6";
}

async function loadWebglAddonOnDesktop(): Promise<void> {
  if (nativeTouchSelectionEnabled || !terminal || webglAddon) {
    return;
  }
  const currentToken = ++webglLoadToken;
  try {
    const { WebglAddon } = await import("xterm-addon-webgl");
    if (!terminal || nativeTouchSelectionEnabled || webglAddon || currentToken !== webglLoadToken) {
      return;
    }
    const addon = new WebglAddon();
    terminal.loadAddon(addon);
    webglAddon = addon;
    addon.onContextLoss(() => {
      if (webglAddon === addon) {
        webglAddon.dispose();
        webglAddon = null;
      }
    });
  } catch {
    if (currentToken === webglLoadToken) {
      webglAddon = null;
    }
  }
}

/**
 * xterm 初始化：包含 fit 与按需加载的 webgl / unicode11。
 */
function initTerminal(): void {
  if (!containerRef.value) return;

  terminal = new Terminal({
    // Unicode11Addon 依赖 xterm proposed API，需显式开启。
    allowProposedApi: true,
    fontFamily: resolveTerminalFontFamily(settingsStore.settings.shellFontFamily),
    fontSize: settingsStore.settings.shellFontSize,
    lineHeight: resolveTerminalLineHeight(settingsStore.settings.shellLineHeight),
    letterSpacing: 0,
    /**
     * SSH 场景下保留服务端原始 CR/LF 语义，避免本地渲染层二次改写造成提示符错位。
     */
    convertEol: false,
    /**
     * 触屏端禁用 xterm 内建平滑滚动：iOS 原生手势直接驱动 .xterm-viewport.scrollTop，
     * xterm 的 JS RAF 动画若同时写 scrollTop 会与原生动量冲突，导致抖动/卡顿。
     * 触屏端依赖 iOS 自身动量；桌面端保留平滑滚动。
     */
    smoothScrollDuration: nativeTouchSelectionEnabled ? 0 : TERMINAL_SMOOTH_SCROLL_DURATION_MS,
    cursorBlink: false,
    theme: {
      background: settingsStore.settings.shellBgColor,
      foreground: settingsStore.settings.shellTextColor,
      cursor: settingsStore.settings.shellAccentColor
    }
  });

  fitAddon = new FitAddon();

  terminal.loadAddon(fitAddon);
  void applyUnicodeVersionBySettings();

  /**
   * 桌面端优先尝试 WebGL 渲染：
   * - Codex 这类高频彩色 TUI 在 DOM 渲染下容易出现“补丁块”背景；
   * - 触屏端为保留原生长按文本选择，禁用 WebGL（保持 DOM 文本层可选）。
   */
  if (!nativeTouchSelectionEnabled) {
    void loadWebglAddonOnDesktop();
  } else {
    webglAddon = null;
  }

  terminal.open(containerRef.value);

  terminal.attachCustomKeyEventHandler((event) => {
    if (isCopyShortcut(event) && terminal?.hasSelection()) {
      const selected = terminal.getSelection();
      if (selected) {
        void writeClipboardText(selected);
      }
      event.preventDefault();
      return false;
    }
    if (isPasteShortcut(event)) {
      event.preventDefault();
      if (navigator.clipboard?.readText) {
        void navigator.clipboard
          .readText()
          .then((text) => sendPastedText(text))
          .catch(() => {
            // 权限拒绝时等待后续 paste 事件兜底。
          });
      }
      return false;
    }
    return true;
  });
  // 触屏端禁用自动抢焦点，避免页面初始化时误弹键盘。
  if (!nativeTouchSelectionEnabled) {
    focusShell();
    const retryFocus = (attempt: number): void => {
      focusShell();
      if (attempt >= 6) {
        focusRetryTimer = null;
        return;
      }
      focusRetryTimer = window.setTimeout(() => {
        retryFocus(attempt + 1);
      }, 100);
    };
    retryFocus(0);
  }
  scheduleFit(0);
  replayBufferedLines();
  bindTerminalWheelInertia();

  window.addEventListener("resize", handleResize);
  resizeObserver = new ResizeObserver(() => {
    handleResize();
  });
  resizeObserver.observe(containerRef.value);

  helperTextarea = terminal.textarea ?? containerRef.value.querySelector(".xterm-helper-textarea");
  if (helperTextarea) {
    onCompositionStart = () => {
      beginComposition();
    };
    onCompositionEnd = (event: CompositionEvent) => {
      endComposition();
      const committed = resolveImePayload(String(event.data ?? ""), helperTextarea?.value ?? "");
      if (!committed) {
        return;
      }

      // ASCII 走“延迟兜底”，若 onData 正常回传会自动取消，避免 `lsls`。
      if (!hasNonAscii(committed)) {
        scheduleAsciiFallback(committed);
        return;
      }
      // 非 ASCII 在 compositionend 提交兜底，覆盖不触发 insertFromComposition 的输入法。
      scheduleAssistCommit(committed);
    };
    onTextareaBlur = () => {
      // 输入法切换常伴随 textarea blur；主动恢复组合态，避免后续输入被锁死。
      endComposition();
      if (nativeTouchSelectionEnabled && helperTextarea) {
        // FOCUS_KEYBOARD 激活期间跳过：iOS 上 blur 事件会在 readOnly=false+focus()
        // 之后异步到达，若此时仍执行 readOnly=true，键盘会立刻再次消失。
        if (focusKeyboardInProgress) {
          scheduleFocusKeyboardBlurRecover();
          return;
        }
        helperTextarea.readOnly = true;
      }
    };
    onBeforeInput = (event: InputEvent) => {
      recoverCompositionIfStale();
      const inputType = String(event.inputType ?? "");
      if (!event.isComposing && inputType !== "insertCompositionText" && isComposing) {
        endComposition();
      }
      if (event.isComposing) {
        return;
      }
      const byDictation = inputType === "insertFromDictation" || inputType === "insertReplacementText";
      const directData = sanitizeTerminalInput(String(event.data ?? ""));
      const textareaData = sanitizeTerminalInput(helperTextarea?.value ?? "");
      const payload = resolveImePayload(directData, textareaData);
      if (!payload) {
        return;
      }
      if (!byDictation && !hasNonAscii(payload)) {
        // xterm onData 未回传时，允许通过 beforeinput 兜底发送英文/空格。
        scheduleAsciiFallback(payload);
        return;
      }
      if (event.isComposing) {
        return;
      }
      // 语音与输入法“提交事件”走兜底；常规拼音按键不在这里发送。
      if (byDictation || inputType === "insertFromComposition") {
        scheduleAssistCommit(payload, byDictation);
        return;
      }
      // 其它非 ASCII（例如粘贴）也保留兜底发送能力。
      if (hasNonAscii(payload)) {
        scheduleAssistCommit(payload);
      }
    };
    onInput = (event: Event) => {
      const inputEvent = event as InputEvent;
      recoverCompositionIfStale();
      const inputType = String(inputEvent.inputType ?? "");
      if (!inputEvent.isComposing && inputType !== "insertCompositionText" && isComposing) {
        endComposition();
      }
      if (inputEvent.isComposing) {
        return;
      }
      const byDictation = inputType === "insertFromDictation" || inputType === "insertReplacementText";
      const directData = sanitizeTerminalInput(String(inputEvent.data ?? ""));
      const textareaData = sanitizeTerminalInput(helperTextarea?.value ?? "");
      const payload = resolveImePayload(directData, textareaData);
      if (!payload) {
        return;
      }
      if (!byDictation && !hasNonAscii(payload)) {
        scheduleAsciiFallback(payload);
        return;
      }
      if (inputEvent.isComposing) {
        return;
      }
      if (byDictation || inputType === "insertFromComposition" || hasNonAscii(payload)) {
        scheduleAssistCommit(payload, byDictation);
      }
    };
    onTextareaPaste = (event: ClipboardEvent) => {
      const text = event.clipboardData?.getData("text/plain") ?? "";
      if (!text) {
        return;
      }
      event.preventDefault();
      void sendPastedText(text);
    };
    helperTextarea.setAttribute("autocomplete", "off");
    helperTextarea.setAttribute("autocapitalize", "none");
    helperTextarea.setAttribute("spellcheck", "false");
    if (nativeTouchSelectionEnabled) {
      helperTextarea.readOnly = true;
    }
    helperTextarea.addEventListener("compositionstart", onCompositionStart);
    helperTextarea.addEventListener("compositionend", onCompositionEnd);
    helperTextarea.addEventListener("blur", onTextareaBlur);
    helperTextarea.addEventListener("beforeinput", onBeforeInput);
    helperTextarea.addEventListener("input", onInput);
    helperTextarea.addEventListener("paste", onTextareaPaste);
  }

  // 仅对鼠标回收焦点，触摸场景要保留长按手势，不做抢焦点。
  onPointerFocus = (event: PointerEvent) => {
    if (event.pointerType === "touch" || event.pointerType === "pen") {
      return;
    }
    focusShell();
  };
  containerRef.value.addEventListener("pointerdown", onPointerFocus);
  containerRef.value.addEventListener("pointerenter", onPointerFocus);
  if (nativeTouchSelectionEnabled) {
    type TouchAction = "BLUR_ONLY" | "FOCUS_KEYBOARD" | "PASS_NATIVE" | "PASS_SCROLL";

    const resolveTouchAction = (context: {
      inBand: boolean;
      moved: boolean;
      scrollLike: boolean;
      hasSelectionStart: boolean;
      hasSelectionEnd: boolean;
    }): TouchAction => {
      if (context.hasSelectionStart || context.hasSelectionEnd) {
        return "PASS_NATIVE";
      }
      if (context.scrollLike) {
        return "PASS_SCROLL";
      }
      if (context.moved) {
        return "PASS_NATIVE";
      }
      if (!context.inBand) {
        return "BLUR_ONLY";
      }
      return "FOCUS_KEYBOARD";
    };

    onTouchKeyboardPointerDown = (event: PointerEvent) => {
      if (event.pointerType !== "touch") {
        return;
      }
      if (!helperTextarea) {
        return;
      }
      touchGatePointerId = event.pointerId;
      touchGateStartX = event.clientX;
      touchGateStartY = event.clientY;
      touchGateMoved = false;
      touchGateScrollLike = false;
      touchGateStartInBand = isTouchInCursorActivationBand(event.clientY);
      touchGateHadSelectionAtStart = hasActiveNativeSelectionInTerminal();

      if (DEBUG_TOUCH_FOCUS) {
        console.log("[TouchFocus] pointerdown", {
          inBand: touchGateStartInBand,
          selectionStart: touchGateHadSelectionAtStart,
        });
      }

      // 始终阻止 xterm 的 pointerdown 监听器运行（仅 stopImmediatePropagation，不 preventDefault）。
      // 理由：xterm 在 pointerdown 会 focus 内部 textarea 或初始化选区追踪，任何一种都会
      // 与系统原生长按选区 / 我们的状态机决策冲突。
      // 浏览器原生行为（长按选区、滚动、放大镜）由系统 touch 层独立驱动，
      // 与 JS pointer 事件无关，不受 stopImmediatePropagation 影响。
      event.stopImmediatePropagation();

      // readOnly=true 与 touchstart 中同样的目的：阻断 iOS"光标拖拽模式"决策。
      // 不调用 blur()，原因同 touchstart：避免打断正在进行的手势或触发键盘收起。
      helperTextarea.readOnly = true;

      if (sessionStore.state !== "connected") {
        // 非连接态直接标记 BLUR_ONLY 候选，但不在这里做最终决策
        return;
      }
    };
    onTouchKeyboardPointerMove = (event: PointerEvent) => {
      if (event.pointerType !== "touch" || touchGatePointerId !== event.pointerId) {
        return;
      }
      const dx = event.clientX - touchGateStartX;
      const dy = event.clientY - touchGateStartY;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      if (absDx > TOUCH_KEYBOARD_TAP_MAX_MOVE_PX || absDy > TOUCH_KEYBOARD_TAP_MAX_MOVE_PX) {
        touchGateMoved = true;
      }
      if (absDy > absDx && absDy > TOUCH_KEYBOARD_TAP_MAX_MOVE_PX) {
        touchGateScrollLike = true;
      }

      // 始终阻止 xterm 的 pointermove 监听器运行。
      // xterm 在 pointermove 会更新内部选区模型并调用 removeAllRanges()，
      // 清除 iOS 正在通过放大镜 / 手柄扩展的原生选区。
      event.stopImmediatePropagation();

      if (DEBUG_TOUCH_FOCUS) {
        console.log("[TouchFocus] pointermove", {
          moved: touchGateMoved,
          scrollLike: touchGateScrollLike,
          dx,
          dy,
        });
      }
    };
    onTouchKeyboardPointerUp = (event: PointerEvent) => {
      if (event.pointerType !== "touch" || touchGatePointerId !== event.pointerId) {
        return;
      }
      const context = {
        inBand: touchGateStartInBand,
        moved: touchGateMoved,
        scrollLike: touchGateScrollLike,
        hasSelectionStart: touchGateHadSelectionAtStart,
        hasSelectionEnd: hasActiveNativeSelectionInTerminal(),
      };
      let action = resolveTouchAction(context);

      if (DEBUG_TOUCH_FOCUS) {
        console.log("[TouchFocus] pointerup", { ...context, action });
      }

      // 保存本次动作供 click capture 阶段使用（click 在 pointerup 后触发）。
      lastTouchAction = action;

      resetTouchKeyboardGateTracking();

      if (!helperTextarea) {
        return;
      }

      if (sessionStore.state !== "connected") {
        action = "BLUR_ONLY";
      }

      if (action === "BLUR_ONLY") {
        // 取消 FOCUS_KEYBOARD 可能遗留的 60ms 重试，确保不会在 BLUR_ONLY 后又重新聚焦。
        if (focusKeyboardTimerId !== null) {
          window.clearTimeout(focusKeyboardTimerId);
          focusKeyboardTimerId = null;
        }
        clearFocusKeyboardBlurRecover();
        focusKeyboardInProgress = false;
        helperTextarea.readOnly = true;
        event.preventDefault();
        event.stopImmediatePropagation();
        // 同步 blur：让 xterm 的 textarea blur 事件立即触发 xterm 内部 isFocused=false，
        // 重绘空心光标。
        const ae = document.activeElement as HTMLElement | null;
        if (ae instanceof HTMLElement && containerRef.value?.contains(ae)) {
          ae.blur();
        }
        helperTextarea.blur();
        // setTimeout(0) 兜底：应对 iOS 在当前帧末尾可能的自动重聚焦。
        const targetTextarea = helperTextarea;
        const targetContainer = containerRef.value;
        window.setTimeout(() => {
          const ae2 = document.activeElement as HTMLElement | null;
          if (ae2 instanceof HTMLElement && targetContainer?.contains(ae2)) {
            ae2.blur();
          }
          targetTextarea.blur();
        }, 0);
      } else if (action === "FOCUS_KEYBOARD") {
        if (context.hasSelectionStart || context.hasSelectionEnd) {
          clearNativeSelectionInTerminal();
        }
        event.preventDefault();
        event.stopImmediatePropagation();
        clearFocusKeyboardBlurRecover();
        // 标记"FOCUS_KEYBOARD 激活中"，必须在 ae.blur() 之前设置。
        // 原因：blur 事件在大多数浏览器中是同步触发的——ae.blur() 调用返回之前，
        // onTextareaBlur 就已执行。若 focusKeyboardInProgress 在 blur() 之后设置，
        // onTextareaBlur 执行时仍是 false，会将 readOnly 重置为 true 破坏弹键盘流程。
        focusKeyboardInProgress = true;
        // 始终先 blur 容器内当前活动元素，再 focus helperTextarea。
        // iOS 键盘弹出要求看到明确的 blur→focus 序列；
        // 即使当前活动元素已是 helperTextarea，也必须先 blur 再重新 focus，
        // 否则 iOS 认为"焦点未变化"，不会弹出键盘。
        const ae = document.activeElement as HTMLElement | null;
        if (ae instanceof HTMLElement && containerRef.value?.contains(ae)) {
          ae.blur();
        }

        const activateTouchKeyboard = (): void => {
          if (!helperTextarea) {
            return;
          }
          helperTextarea.readOnly = false;
          focusHelperTextarea();
        };

        activateTouchKeyboard();
        // 保存定时器 ID，供下次 touchstart 时 cancel，防止其在手势中途覆盖 readOnly=true。
        if (focusKeyboardTimerId !== null) {
          window.clearTimeout(focusKeyboardTimerId);
        }
        // 保护窗口：键盘弹出期间暂不允许 blur 分支把 readOnly 改回 true。
        // 到时仅解除保护，不再二次 focus，避免焦点竞争导致“键盘闪现”。
        focusKeyboardTimerId = window.setTimeout(() => {
          focusKeyboardTimerId = null;
          clearFocusKeyboardBlurRecover();
          focusKeyboardInProgress = false;
        }, TOUCH_KEYBOARD_FOCUS_GUARD_MS);
      } else if (action === "PASS_NATIVE") {
        // 不 preventDefault，不强制 blur/focus
        // 但仍需阻断 xterm 的 pointerup handler，防止其调用 removeAllRanges()
        // 清除 iOS 正在扩展的原生选区。
        event.stopImmediatePropagation();
      } else if (action === "PASS_SCROLL") {
        // 不 preventDefault，不强制 blur/focus
        // 阻断 xterm handler，与 PASS_NATIVE 同理。
        event.stopImmediatePropagation();
      }
    };
    onTouchKeyboardPointerCancel = (event: PointerEvent) => {
      if (event.pointerType !== "touch" || touchGatePointerId !== event.pointerId) {
        return;
      }
      if (hasActiveNativeSelectionInTerminal()) {
        lastTouchAction = "PASS_NATIVE";
      }
      if (DEBUG_TOUCH_FOCUS) {
        console.log("[TouchFocus] pointercancel", {
          selectionEnd: hasActiveNativeSelectionInTerminal(),
          action: lastTouchAction,
        });
      }
      resetTouchKeyboardGateTracking();
    };
    containerRef.value.addEventListener("pointerdown", onTouchKeyboardPointerDown, true);
    // passive: true — 从不 preventDefault，告知合成器无需等待 JS，消除滚动延迟。
    containerRef.value.addEventListener("pointermove", onTouchKeyboardPointerMove, { capture: true, passive: true });
    containerRef.value.addEventListener("pointerup", onTouchKeyboardPointerUp, true);
    containerRef.value.addEventListener("pointercancel", onTouchKeyboardPointerCancel, true);

    // touchstart 在 pointerdown 之前触发，是 iOS 系统手势引擎"选区模式 vs 光标模式"
    // 决策的最早时机。iOS 在 touchstart 阶段查询 DOM：若有 focused 且可编辑元素 → 进入
    // "光标拖拽模式"（放大镜光标定位，无选区）；否则 → "文本选区模式"（长按可建立选区）。
    // 在此尽早将 helperTextarea 设为 readOnly + blur，确保 iOS 做出正确决策。
    // 注意：不调用 preventDefault / stopImmediatePropagation，不影响后续 pointer 事件链。
    onTouchKeyboardTouchStart = (event: TouchEvent) => {
      // 新手势开始：取消上次动量动画，重置速度追踪。
      clearTouchScrollMomentum();
      if (event.touches.length === 1) {
        const touch = event.touches.item(0);
        if (touch) {
          touchScrollLastY = touch.pageY;
          touchScrollLastTime = performance.now();
          touchScrollVelocity = 0;
        }
      }
      if (!helperTextarea) return;
      // 取消 FOCUS_KEYBOARD 的 60ms 重试，防止其在手势中途覆盖 readOnly=true。
      if (focusKeyboardTimerId !== null) {
        window.clearTimeout(focusKeyboardTimerId);
        focusKeyboardTimerId = null;
        // 定时器被取消意味着弹键盘流程中断，解除保护标志，
        // 使 onTextareaBlur 恢复正常的 readOnly=true 行为。
        clearFocusKeyboardBlurRecover();
        focusKeyboardInProgress = false;
      }
      // 只设 readOnly=true，不调用 blur()。
      // readOnly=true 本身让 iOS 判定该元素"不可编辑"，走文本选区拖拽路径。
      // 若此时键盘正在显示，调用 blur() 会触发键盘收起动画并打断 iOS 手势识别；
      // 不 blur 可保留键盘状态，FOCUS_KEYBOARD 路径仍可正常弹键盘。
      helperTextarea.readOnly = true;
      if (DEBUG_TOUCH_FOCUS) {
        console.log("[TouchFocus] touchstart → readOnly=true (no blur, timer cancelled)");
      }
    };
    onTouchKeyboardTouchMove = (event: TouchEvent) => {
      // 追踪触摸速度以便 touchend 后实现动量滚动。
      // xterm 在此事件中 scrollTop += deltaY（手动滚动），我们仅追踪速度，不阻断。
      if (event.touches.length === 1) {
        const touch = event.touches.item(0);
        if (!touch) {
          return;
        }
        const now = performance.now();
        const dt = now - touchScrollLastTime;
        if (dt >= 2 && dt <= 260) {
          const deltaY = touchScrollLastY - touch.pageY;
          const instantVelocity = (deltaY / dt) * (1000 / 60);
          touchScrollVelocity = touchScrollVelocity * 0.2 + instantVelocity * 0.8;
        }
        touchScrollLastY = touch.pageY;
        touchScrollLastTime = now;
      }
      // iOS 长按进入系统选区后，常会先触发 pointercancel，后续继续以 touchmove 驱动放大镜/手柄。
      // 若放行到 xterm，xterm 会在 move 链路清理 window.getSelection()，导致“手指一动选区即消失”。
      // 这里仅阻断 xterm 监听，不阻断浏览器默认行为（不 preventDefault）。
      const hasSelection = hasActiveNativeSelectionInTerminal();
      if (hasSelection) {
        lastTouchAction = "PASS_NATIVE";
        event.stopImmediatePropagation();
      }
      if (DEBUG_TOUCH_FOCUS && hasSelection) {
        console.log("[TouchFocus] touchmove intercepted (PASS_NATIVE)");
      }
    };
    onTouchKeyboardTouchEnd = () => {
      if (hasActiveNativeSelectionInTerminal()) {
        clearTouchScrollMomentum();
        return;
      }
      const boostedVelocity = touchScrollVelocity * TOUCH_SCROLL_BOOST;
      const clampedVelocity = Math.max(
        -TOUCH_SCROLL_MAX_SPEED,
        Math.min(TOUCH_SCROLL_MAX_SPEED, boostedVelocity)
      );
      if (Math.abs(clampedVelocity) > TOUCH_SCROLL_STOP_THRESHOLD && viewportScroller) {
        touchScrollVelocity = clampedVelocity;
        runTouchScrollMomentum();
      } else {
        clearTouchScrollMomentum();
      }
    };
    // passive: true — 以上均不调用 preventDefault()。非 passive 的 touch 监听器
    // 会阻塞 iOS 滚动合成器等待 JS 主线程，即使实际未 preventDefault 也会引入卡顿。
    containerRef.value.addEventListener("touchstart", onTouchKeyboardTouchStart, { capture: true, passive: true });
    containerRef.value.addEventListener("touchmove", onTouchKeyboardTouchMove, { capture: true, passive: true });
    containerRef.value.addEventListener("touchend", onTouchKeyboardTouchEnd, { capture: true, passive: true });
    containerRef.value.addEventListener("touchcancel", onTouchKeyboardTouchEnd, { capture: true, passive: true });

    onTouchToolsOutsidePointerDown = (event: PointerEvent) => {
      if (!touchToolsExpanded.value) {
        return;
      }
      const tools = touchToolsRef.value;
      const target = event.target;
      if (!tools || !(target instanceof Node)) {
        return;
      }
      if (tools.contains(target)) {
        return;
      }
      touchToolsExpanded.value = false;
    };
    document.addEventListener("pointerdown", onTouchToolsOutsidePointerDown, true);

    // click 事件在 pointerup 之后由浏览器生成；xterm 在 click 时也会 focus 内部 textarea。
    // BLUR_ONLY / FOCUS_KEYBOARD：阻断 xterm 重聚焦或与我们的 focus 逻辑竞争。
    // PASS_NATIVE：长按后手指移动建立选区，iOS 通过 touch 事件完成选区，
    //   但 mousedown/click 合成事件到达 xterm 后，xterm 会调用自身选区模型清除
    //   window.getSelection()，导致原生选区消失。同样必须拦截。
    //   注意：PASS_NATIVE 只 stopImmediatePropagation，不 preventDefault，
    //   以免影响浏览器自身可能依赖 click 的原生行为。
    onTouchKeyboardClick = (event: MouseEvent) => {
      const action = lastTouchAction;
      lastTouchAction = null;
      if (action === "BLUR_ONLY" || action === "FOCUS_KEYBOARD") {
        event.stopImmediatePropagation();
        event.preventDefault();
        if (DEBUG_TOUCH_FOCUS) {
          console.log("[TouchFocus] click intercepted", { action });
        }
      } else if (action === "PASS_NATIVE") {
        event.stopImmediatePropagation();
        if (DEBUG_TOUCH_FOCUS) {
          console.log("[TouchFocus] click intercepted (PASS_NATIVE)", { action });
        }
      }
    };
    containerRef.value.addEventListener("click", onTouchKeyboardClick, true);

    // mousedown 由 iOS 在 pointerup 之后、click 之前合成触发。
    // xterm 在 mousedown 阶段也会聚焦其内部 textarea，导致 BLUR_ONLY 被覆盖。
    // PASS_NATIVE 同理：xterm 的 mousedown handler 会清除 window.getSelection()，
    //   破坏 iOS 长按建立的原生选区；必须在 capture 阶段阻断 xterm 的处理。
    // 此时 lastTouchAction 已由 pointerup 设置，直接复用（不重置，让 click 继续使用）。
    onTouchKeyboardMouseDown = (event: MouseEvent) => {
      if (event.button !== 0) {
        return;
      }
      const action = lastTouchAction;
      if (action === "BLUR_ONLY" || action === "FOCUS_KEYBOARD") {
        event.stopImmediatePropagation();
        event.preventDefault();
        if (DEBUG_TOUCH_FOCUS) {
          console.log("[TouchFocus] mousedown intercepted", { action });
        }
      } else if (action === "PASS_NATIVE") {
        event.stopImmediatePropagation();
        if (DEBUG_TOUCH_FOCUS) {
          console.log("[TouchFocus] mousedown intercepted (PASS_NATIVE)", { action });
        }
      }
    };
    containerRef.value.addEventListener("mousedown", onTouchKeyboardMouseDown, true);
  }
  onWindowFocus = () => {
    if (!nativeTouchSelectionEnabled) {
      focusShell();
    }
  };
  onVisibilityChange = () => {
    if (document.visibilityState !== "visible") {
      endComposition();
      return;
    }
    if (document.visibilityState === "visible" && !nativeTouchSelectionEnabled) {
      focusShell();
    }
  };
  window.addEventListener("focus", onWindowFocus);
  document.addEventListener("visibilitychange", onVisibilityChange);

  // 不再使用 visualViewport resize 反推键盘收起，避免 iOS 地址栏/键盘动画抖动导致误判闪现。

  terminal.onData((data) => {
    recoverCompositionIfStale();
    const cleanInput = sanitizeTerminalInput(data);
    if (!cleanInput) {
      return;
    }
    // 一旦拿到 xterm 原始回传，说明主路径可用，取消 ASCII 兜底发送。
    if (!hasNonAscii(cleanInput) && asciiFallbackText) {
      clearAsciiFallback();
    }
    if (hasNonAscii(cleanInput) && assistPendingText) {
      // onData 已拿到原始中文输入，取消 fallback 提交，避免双发。
      clearAssistPendingCommit();
    }
    if (
      isComposing &&
      hasNonAscii(cleanInput) &&
      performance.now() - compositionStartedAt < COMPOSITION_NOISE_BLOCK_MS
    ) {
      /**
       * 组合态下仅抑制非 ASCII 中间噪声；
       * ASCII（含空格、英文、控制键）允许直通，兼容部分手机输入法“组合态内英文/空格输入”。
       */
      return;
    }
    if (hasNonAscii(cleanInput)) {
      if (cleanInput === lastAssistCommittedText && performance.now() - lastAssistCommittedAt < 1000) {
        // fallback 已发送过同一文本时，跳过 onData 重复包。
        return;
      }
      const now = performance.now();
      if (
        cleanInput === lastKeyboardCommittedText &&
        now - lastKeyboardCommittedAt < KEYBOARD_NON_ASCII_DEDUP_MS
      ) {
        // 输入法在部分终端环境会短时间重复上报同一提交文本，这里做键盘路径去重。
        return;
      }
      lastKeyboardCommittedText = cleanInput;
      lastKeyboardCommittedAt = now;
      updateKeyboardAssistBridge(cleanInput, now);
      syncAssistSessionOnKeyboardEcho(cleanInput);
      sendTerminalInput(cleanInput, { source: "keyboard" }).catch(() => {
        // 输入失败由上层 toast 反馈。
      });
      return;
    }

    updateKeyboardAssistBridge(cleanInput, performance.now());
    syncAssistSessionOnKeyboardEcho(cleanInput);
    sendTerminalInput(cleanInput, { source: "keyboard" }).catch(() => {
      // 输入失败由上层 toast 反馈。
    });
  });
}

function replayBufferedLines(): void {
  if (!terminal) return;
  if (sessionStore.lines.length === 0) {
    lastIndex = 0;
    return;
  }

  for (const line of sessionStore.lines) {
    terminal.write(sanitizeTerminalOutput(line));
  }
  lastIndex = sessionStore.lines.length;
}

function handleResize(): void {
  fitAddon?.fit();
  const dims = fitAddon?.proposeDimensions();
  if (dims) {
    sessionStore.resize(dims.cols, dims.rows).catch(() => {
      // resize 失败不阻塞。
    });
  }
}

/**
 * 路由切换后容器尺寸可能延迟稳定，分帧重试 fit，确保 rows/cols 最终可用。
 */
function scheduleFit(attempt: number): void {
  if (!terminal || !fitAddon) return;
  fitAddon.fit();
  if (terminal.rows > 0 && terminal.cols > 0) {
    fitRetryTimer = null;
    return;
  }

  if (attempt >= 10) {
    fitRetryTimer = null;
    return;
  }

  fitRetryTimer = window.setTimeout(() => {
    scheduleFit(attempt + 1);
  }, 80);
}

onMounted(async () => {
  await nextTick();
  initTerminal();
  /**
   * 设置页返回终端页时，Pinia 中的 SSH 会话可能仍保持 connected，
   * 但 TerminalPanel 会重新创建一个带“新字号/新字体”的 xterm 实例。
   * 若此时不主动补一次 resize，远端 PTY 仍停留在旧 cols/rows，
   * 就会出现“输入时字被吃掉、右侧溢出/留白，断开重连后恢复”的现象。
   *
   * 这里直接复用现有 handleResize：
   * - 尺寸没变时 sessionStore.resize 会去重，不会重复发包；
   * - 尺寸变了时，能把 remount 后的新终端几何尺寸同步回远端。
   */
  if (sessionStore.state === "connected") {
    window.setTimeout(() => {
      handleResize();
      if (!nativeTouchSelectionEnabled) {
        focusShell();
      }
    }, 0);
  }
});

watch(
  () => sessionStore.outputRevision,
  () => {
    if (!terminal) return;
    if (sessionStore.lines.length < lastIndex) {
      terminal.clear();
      replayBufferedLines();
      return;
    }

    // 缓冲区达到上限后会发生“头部裁剪”，长度可能不变但内容已滚动。
    // 这里不能 clear+重放：高频输出下会造成明显闪屏，且可能把被裁剪的控制序列残片渲染为可见文本。
    // appendTerminal 每次只追加一个 chunk，因此该分支增量写入当前尾部即可保持连续语义。
    if (sessionStore.lines.length === lastIndex && sessionStore.lines.length > 0) {
      const tail = sessionStore.lines[sessionStore.lines.length - 1];
      if (tail) {
        terminal.write(sanitizeTerminalOutput(tail));
      }
      return;
    }

    const nextLines = sessionStore.lines.slice(lastIndex);
    for (const line of nextLines) {
      terminal.write(sanitizeTerminalOutput(line));
    }
    lastIndex = sessionStore.lines.length;
  }
);

watch(
  () => settingsStore.settings,
  () => {
    if (!terminal) return;
    terminal.options.fontFamily = resolveTerminalFontFamily(settingsStore.settings.shellFontFamily);
    terminal.options.fontSize = settingsStore.settings.shellFontSize;
    terminal.options.lineHeight = resolveTerminalLineHeight(settingsStore.settings.shellLineHeight);
    terminal.options.letterSpacing = 0;
    terminal.options.theme = {
      background: settingsStore.settings.shellBgColor,
      foreground: settingsStore.settings.shellTextColor,
      cursor: settingsStore.settings.shellAccentColor
    };
    void applyUnicodeVersionBySettings();
    fitAddon?.fit();
  },
  { deep: true }
);

watch(
  () => sessionStore.state,
  (state) => {
    if (!terminal) return;
    if (state === "connected") {
      window.setTimeout(() => {
        // 续接已有 PTY 时不发 resize，避免 SIGWINCH → zsh 重绘 → CPR 序列泄漏。
        if (!sessionStore.lastConnectWasResume) {
          handleResize();
        } else {
          // 续接时只做 xterm 本地 fit，不向 PTY 发 resize 消息。
          fitAddon?.fit();
        }
        if (!nativeTouchSelectionEnabled) {
          focusShell();
        }
      }, 0);
      return;
    }
    if (nativeTouchSelectionEnabled && helperTextarea) {
      helperTextarea.readOnly = true;
      if (document.activeElement === helperTextarea) {
        helperTextarea.blur();
      }
    }
  }
);

onBeforeUnmount(() => {
  window.removeEventListener("resize", handleResize);
  resizeObserver?.disconnect();
  resizeObserver = null;
  if (helperTextarea) {
    if (onCompositionStart) {
      helperTextarea.removeEventListener("compositionstart", onCompositionStart);
    }
    if (onCompositionEnd) {
      helperTextarea.removeEventListener("compositionend", onCompositionEnd);
    }
    if (onTextareaBlur) {
      helperTextarea.removeEventListener("blur", onTextareaBlur);
    }
    if (onBeforeInput) {
      helperTextarea.removeEventListener("beforeinput", onBeforeInput);
    }
    if (onInput) {
      helperTextarea.removeEventListener("input", onInput);
    }
    if (onTextareaPaste) {
      helperTextarea.removeEventListener("paste", onTextareaPaste);
    }
  }
  helperTextarea = null;
  onCompositionStart = null;
  onCompositionEnd = null;
  onTextareaBlur = null;
  onBeforeInput = null;
  onInput = null;
  onTextareaPaste = null;
  endComposition();
  lastAssistCommittedText = "";
  lastAssistCommittedAt = 0;
  lastKeyboardCommittedText = "";
  lastKeyboardCommittedAt = 0;
  clearKeyboardAssistBridge();
  resetAssistRewriteSession();
  assistPendingText = "";
  assistTxnSeq = 0;
  if (fitRetryTimer !== null) {
    window.clearTimeout(fitRetryTimer);
    fitRetryTimer = null;
  }
  if (focusRetryTimer !== null) {
    window.clearTimeout(focusRetryTimer);
    focusRetryTimer = null;
  }
  if (assistFlushTimer !== null) {
    window.clearTimeout(assistFlushTimer);
    assistFlushTimer = null;
  }
  clearAssistPendingCommit();
  clearAsciiFallback();
  clearCompositionGuard();
  if (containerRef.value && onPointerFocus) {
    containerRef.value.removeEventListener("pointerdown", onPointerFocus);
    containerRef.value.removeEventListener("pointerenter", onPointerFocus);
  }
  onPointerFocus = null;
  if (containerRef.value && onTouchKeyboardPointerDown) {
    containerRef.value.removeEventListener("pointerdown", onTouchKeyboardPointerDown, true);
  }
  if (containerRef.value && onTouchKeyboardPointerMove) {
    containerRef.value.removeEventListener("pointermove", onTouchKeyboardPointerMove, true);
  }
  if (containerRef.value && onTouchKeyboardPointerUp) {
    containerRef.value.removeEventListener("pointerup", onTouchKeyboardPointerUp, true);
  }
  if (containerRef.value && onTouchKeyboardPointerCancel) {
    containerRef.value.removeEventListener("pointercancel", onTouchKeyboardPointerCancel, true);
  }
  if (containerRef.value && onTouchKeyboardClick) {
    containerRef.value.removeEventListener("click", onTouchKeyboardClick, true);
  }
  if (containerRef.value && onTouchKeyboardMouseDown) {
    containerRef.value.removeEventListener("mousedown", onTouchKeyboardMouseDown, true);
  }
  if (containerRef.value && onTouchKeyboardTouchStart) {
    containerRef.value.removeEventListener("touchstart", onTouchKeyboardTouchStart, true);
  }
  if (containerRef.value && onTouchKeyboardTouchMove) {
    containerRef.value.removeEventListener("touchmove", onTouchKeyboardTouchMove, true);
  }
  if (containerRef.value && onTouchKeyboardTouchEnd) {
    containerRef.value.removeEventListener("touchend", onTouchKeyboardTouchEnd, true);
    containerRef.value.removeEventListener("touchcancel", onTouchKeyboardTouchEnd, true);
  }
  if (onTouchToolsOutsidePointerDown) {
    document.removeEventListener("pointerdown", onTouchToolsOutsidePointerDown, true);
  }
  clearTouchScrollMomentum();
  touchScrollLastY = 0;
  touchScrollLastTime = 0;
  onTouchKeyboardPointerDown = null;
  onTouchKeyboardPointerMove = null;
  onTouchKeyboardPointerUp = null;
  onTouchKeyboardPointerCancel = null;
  onTouchKeyboardClick = null;
  onTouchKeyboardMouseDown = null;
  onTouchKeyboardTouchStart = null;
  onTouchKeyboardTouchMove = null;
  onTouchKeyboardTouchEnd = null;
  onTouchToolsOutsidePointerDown = null;
  if (focusKeyboardTimerId !== null) {
    window.clearTimeout(focusKeyboardTimerId);
    focusKeyboardTimerId = null;
  }
  clearFocusKeyboardBlurRecover();
  focusKeyboardInProgress = false;
  lastTouchAction = null;
  resetTouchKeyboardGateTracking();
  if (viewportScroller && onViewportWheel) {
    viewportScroller.removeEventListener("wheel", onViewportWheel);
  }
  onViewportWheel = null;
  viewportScroller = null;
  clearWheelInertia();
  wheelLastTickAt = 0;
  if (onWindowFocus) {
    window.removeEventListener("focus", onWindowFocus);
  }
  if (onVisibilityChange) {
    document.removeEventListener("visibilitychange", onVisibilityChange);
  }
  onWindowFocus = null;
  onVisibilityChange = null;
  webglAddon?.dispose();
  webglAddon = null;
  webglLoadToken += 1;
  unicode11AddonLoaded = false;
  terminal?.dispose();
  terminal = null;
});
</script>
