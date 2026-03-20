<template>
  <div class="terminal-voice-layer">
    <div
      v-if="panelVisible"
      class="terminal-voice-hitbox"
      :style="voiceHitboxStyle"
      @pointerdown.stop.prevent
      @pointermove.stop.prevent
      @pointerup.stop.prevent
      @pointercancel.stop.prevent
      @touchstart.stop.prevent
      @touchmove.stop.prevent
      @touchend.stop.prevent
      @touchcancel.stop.prevent
      @contextmenu.stop.prevent
    ></div>

    <button
      ref="voiceButtonRef"
      class="terminal-voice-button"
      :class="{ 'is-recording': isRecording, 'panel-visible': panelVisible }"
      :style="voiceButtonStyle"
      type="button"
      aria-label="按住说话"
      title="按住说话"
      @pointerdown="onVoicePointerDown"
      @pointermove="onVoicePointerMove"
      @pointerup="onVoicePointerUp"
      @pointercancel="onVoicePointerCancel"
      @lostpointercapture="onVoiceLostPointerCapture"
      @touchstart="swallowTouchEvent"
      @touchmove="swallowTouchEvent"
      @touchend="swallowTouchEvent"
      @touchcancel="swallowTouchEvent"
      @contextmenu.prevent.stop
    >
      <span class="terminal-voice-button-icon" aria-hidden="true"></span>
    </button>

    <div v-if="panelVisible" class="terminal-voice-panel" :class="{ 'is-recording': isVoiceRoundActive }" :style="voicePanelStyle">
      <div class="terminal-voice-frame2256-bg" :style="voiceFrame2256Style" aria-hidden="true"></div>
      <div class="terminal-voice-input-wrap">
        <textarea
          ref="draftTextareaRef"
          v-model="draftText"
          class="terminal-voice-input"
          :readonly="isRecording"
          placeholder="按住下方语音按钮开始输入"
        ></textarea>
      </div>
      <div class="terminal-voice-actions">
        <div class="terminal-voice-actions-left" :style="voiceActionMainStyle">
          <button
            class="terminal-voice-action-btn"
            type="button"
            aria-label="记录到闪念"
            title="记录"
            @click="onRecord"
          >
            <span class="terminal-voice-action-icon terminal-voice-action-icon-record" aria-hidden="true"></span>
          </button>
          <button
            class="terminal-voice-action-btn"
            type="button"
            :disabled="!canSend"
            aria-label="发送语音输入"
            title="发送"
            @click="onSend"
          >
            <span class="terminal-voice-action-icon terminal-voice-action-icon-send" aria-hidden="true"></span>
          </button>
        </div>
        <div class="terminal-voice-actions-right">
          <button
            class="terminal-voice-action-btn"
            type="button"
            aria-label="清空语音输入"
            title="清空"
            @click="onClear"
          >
            <span class="terminal-voice-action-icon terminal-voice-action-icon-clear" aria-hidden="true"></span>
          </button>
          <button
            class="terminal-voice-action-btn"
            type="button"
            aria-label="取消语音输入"
            title="取消"
            @click="onCancel"
          >
            <span class="terminal-voice-action-icon terminal-voice-action-icon-cancel" aria-hidden="true"></span>
          </button>
        </div>
      </div>
      <div class="terminal-voice-categories" :style="voiceCategoryStyle">
        <div class="terminal-voice-category-scroll">
          <div class="terminal-voice-category-row">
            <button
              v-for="category in voiceRecordCategories"
              :key="`voice-record-category-${category}`"
              class="terminal-voice-category-pill"
              :class="{ active: selectedRecordCategory === category }"
              type="button"
              @click="selectedRecordCategory = category"
            >
              {{ category }}
            </button>
          </div>
        </div>
      </div>
      <div class="terminal-voice-arrow" aria-hidden="true"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type CSSProperties } from "vue";
import { useAppStore } from "@/stores/appStore";
import { useVoiceRecordStore } from "@/stores/voiceRecordStore";
import { useSessionStore } from "@/stores/sessionStore";
import { useServerStore } from "@/stores/serverStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { DEFAULT_VOICE_RECORD_CATEGORIES, DEFAULT_VOICE_RECORD_CATEGORY_FALLBACK } from "@/utils/defaults";
import { formatActionError } from "@/utils/feedback";

interface AsrGatewayFrame {
  type: string;
  payload?: Record<string, unknown>;
}

interface VoiceRoundSession {
  audioContext: AudioContext;
  sourceNode: MediaStreamAudioSourceNode;
  processorNode: ScriptProcessorNode;
  gainNode: GainNode;
}

const props = defineProps<{
  wrapperEl: HTMLDivElement | null;
}>();

const appStore = useAppStore();
const voiceRecordStore = useVoiceRecordStore();
const sessionStore = useSessionStore();
const serverStore = useServerStore();
const settingsStore = useSettingsStore();

const BUTTON_WIDTH = 28;
const BUTTON_HEIGHT = 36;
const BUTTON_EDGE_GAP = 32;
const LEFT_CENTER_EDGE_GAP = 64;
const SEND_RIGHT_TO_CLEAR_LEFT_GAP = 16;
const PANEL_BASE_WIDTH = 408;
const PANEL_BASE_HEIGHT = 264;
const PANEL_INPUT_MIN_HEIGHT = 90;
const PANEL_ACTION_ROW_HEIGHT = 24;
const PANEL_ACTION_GAP = 8;
const PANEL_CATEGORY_ROW_HEIGHT = 32;
const PANEL_CATEGORY_GAP = 10;
const PANEL_CLEAR_ACTION_GROUP_WIDTH = 62;
const PANEL_MIN_WIDTH = 220;
const PANEL_MIN_HEIGHT = 198;
const PANEL_ARROW_SIZE = 20;
const PANEL_ARROW_VOICE_TOP_GAP = 8;
const FRAME2256_HEIGHT = 70;
const FRAME2256_RECORD_TOP_OFFSET = 23.251;
const VOICE_CENTER_TO_RECORD_LEFT_OFFSET = 29.142;
const VOICE_CENTER_TO_SEND_RIGHT_OFFSET = 92;
const HOLD_DELAY_MS = 150;
const DRAG_THRESHOLD_PX = 10;
const AUDIO_PROCESSOR_BUFFER_SIZE = 4096;
const ROUND_SOCKET_CLOSE_TIMEOUT_MS = 2600;
const READY_TIMEOUT_MS = 7000;

type VoiceGestureState = "idle" | "pending" | "dragging" | "recording";

const gestureState = ref<VoiceGestureState>("idle");
const panelVisible = ref(false);
const isRecording = ref(false);
const draftText = ref("");
const draftTextareaRef = ref<HTMLTextAreaElement | null>(null);
const voiceButtonRef = ref<HTMLButtonElement | null>(null);
const autoInputHeight = ref(PANEL_INPUT_MIN_HEIGHT);
const buttonPosition = ref({ x: BUTTON_EDGE_GAP, y: BUTTON_EDGE_GAP });
const selectedRecordCategory = ref(DEFAULT_VOICE_RECORD_CATEGORY_FALLBACK);
const canSend = computed(() => {
  return !isRecording.value && draftText.value.trim().length > 0 && sessionStore.state === "connected";
});
const isVoiceRoundActive = computed(() => gestureState.value === "recording" || isRecording.value);
const voiceRecordCategories = computed(() => {
  const source = settingsStore.settings.voiceRecordCategories;
  if (Array.isArray(source) && source.length > 0) {
    const normalized = source
      .map((item) => String(item ?? "").trim())
      .filter((item, index, array) => item && array.indexOf(item) === index);
    if (normalized.length > 0) {
      return normalized.includes(DEFAULT_VOICE_RECORD_CATEGORY_FALLBACK)
        ? normalized
        : [DEFAULT_VOICE_RECORD_CATEGORY_FALLBACK, ...normalized];
    }
  }
  return [...DEFAULT_VOICE_RECORD_CATEGORIES];
});

const voiceButtonStyle = computed<CSSProperties>(() => ({
  left: `${buttonPosition.value.x}px`,
  top: `${buttonPosition.value.y}px`
}));

const voiceHitboxStyle = computed<CSSProperties>(() => {
  const layout = resolvePanelLayout();
  return {
    width: `${layout.panelWidth}px`,
    height: `${layout.panelHeight}px`,
    left: `${layout.left}px`,
    top: `${layout.top}px`
  };
});

const voicePanelStyle = computed<CSSProperties>(() => {
  const layout = resolvePanelLayout();
  const actionsTop = layout.inputHeight + PANEL_ACTION_GAP;

  return {
    width: `${layout.panelWidth}px`,
    height: `${layout.panelHeight}px`,
    left: `${layout.left}px`,
    top: `${layout.top}px`,
    "--voice-input-height": `${layout.inputHeight}px`,
    "--voice-actions-top": `${actionsTop}px`,
    "--voice-categories-top": `${actionsTop + PANEL_ACTION_ROW_HEIGHT + PANEL_CATEGORY_GAP}px`,
    "--voice-arrow-left": `${layout.arrowLeft}px`,
    "--voice-arrow-top": `${layout.arrowTop}px`
  };
});

/**
 * 展开态下将 record/send 作为 voice 的同组动作：
 * - 横向位置随 voice 中心线移动；
 * - 几何偏移量按 Figma Frame 2256 标注值对齐。
 */
const voiceActionMainStyle = computed<CSSProperties>(() => {
  const layout = resolvePanelLayout();
  const voiceCenterInPanel = layout.arrowLeft + PANEL_ARROW_SIZE / 2;
  return {
    left: `${voiceCenterInPanel + VOICE_CENTER_TO_RECORD_LEFT_OFFSET}px`
  };
});

const voiceCategoryStyle = computed<CSSProperties>(() => {
  const layout = resolvePanelLayout();
  const voiceCenterInPanel = layout.arrowLeft + PANEL_ARROW_SIZE / 2;
  return {
    left: `${voiceCenterInPanel + VOICE_CENTER_TO_RECORD_LEFT_OFFSET - 10}px`
  };
});

/**
 * Frame 2256 整体背景层：
 * - 作为 voice + record + send 的统一底板；
 * - 顶部与输入框重叠的区域需处于输入框下方，因此单独放在 input wrap 之前并使用更低层级。
 */
const voiceFrame2256Style = computed<CSSProperties>(() => {
  const layout = resolvePanelLayout();
  const actionsTop = layout.inputHeight + PANEL_ACTION_GAP;
  return {
    left: "0px",
    top: `${actionsTop - FRAME2256_RECORD_TOP_OFFSET}px`,
    width: `${layout.panelWidth}px`,
    height: `${FRAME2256_HEIGHT}px`
  };
});

let pointerId: number | null = null;
let pointerStartX = 0;
let pointerStartY = 0;
let dragOriginX = 0;
let dragOriginY = 0;
let holdTimer: number | null = null;
let roundSocketCloseTimer: number | null = null;
let voiceTxnSeq = 0;
let currentRoundToken = 0;
let roundBaseText = "";
let activeSocket: WebSocket | null = null;
let currentRoundSession: VoiceRoundSession | null = null;
let wrapperResizeObserver: ResizeObserver | null = null;
let roundStartAttemptSeq = 0;
let stopRequestedBeforeReady = false;
let initialDefaultApplied = false;
let hasUserMovedVoiceInSession = false;
let lastUserPlacedButtonPosition: { x: number; y: number } | null = null;
let pointerCaptureOwner: HTMLElement | null = null;
let cachedMicStream: MediaStream | null = null;
let onGlobalPointerUp: ((event: PointerEvent) => void) | null = null;
let onGlobalPointerCancel: ((event: PointerEvent) => void) | null = null;
let onGlobalTouchEnd: ((event: TouchEvent) => void) | null = null;
let onGlobalTouchCancel: ((event: TouchEvent) => void) | null = null;
let onGlobalBlur: (() => void) | null = null;
let onGlobalVisibilityChange: (() => void) | null = null;

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function swallowTouchEvent(event: TouchEvent): void {
  event.preventDefault();
  event.stopPropagation();
}

function resolveWrapperSize(): { width: number; height: number } {
  const wrapper = props.wrapperEl;
  if (wrapper) {
    return {
      width: Math.max(wrapper.clientWidth, BUTTON_WIDTH + BUTTON_EDGE_GAP * 2),
      height: Math.max(wrapper.clientHeight, BUTTON_HEIGHT + BUTTON_EDGE_GAP * 2)
    };
  }
  return {
    width: Math.max(window.innerWidth, BUTTON_WIDTH + BUTTON_EDGE_GAP * 2),
    height: Math.max(window.innerHeight, BUTTON_HEIGHT + BUTTON_EDGE_GAP * 2)
  };
}

function clampButtonPosition(next: { x: number; y: number }): { x: number; y: number } {
  const { width, height } = resolveWrapperSize();
  const panelSize = resolvePanelSize();
  const { minCenterX, maxCenterX } = resolveHorizontalCenterBounds(width, panelSize.width);
  const minButtonX = minCenterX - BUTTON_WIDTH / 2;
  const maxButtonX = maxCenterX - BUTTON_WIDTH / 2;
  let minButtonY = BUTTON_EDGE_GAP;
  let maxButtonY = Math.max(BUTTON_EDGE_GAP, height - BUTTON_HEIGHT - BUTTON_EDGE_GAP);

  // 仅在语音面板可见时，才把 voice/arrow 当作一个整体约束垂直几何关系。
  if (panelVisible.value) {
    const inputHeight = resolvePanelInputHeight(panelSize.height);
    const { minVoiceTop, maxVoiceTop } = resolveVerticalVoiceBounds(height, panelSize.height, inputHeight);
    minButtonY = minVoiceTop;
    maxButtonY = Math.max(minVoiceTop, maxVoiceTop);
  }

  return {
    x: clampNumber(next.x, minButtonX, Math.max(minButtonX, maxButtonX)),
    y: clampNumber(next.y, minButtonY, maxButtonY)
  };
}

function clampButtonXOnly(nextX: number): number {
  const { width } = resolveWrapperSize();
  const panelSize = resolvePanelSize();
  const { minCenterX, maxCenterX } = resolveHorizontalCenterBounds(width, panelSize.width);
  const minButtonX = minCenterX - BUTTON_WIDTH / 2;
  const maxButtonX = maxCenterX - BUTTON_WIDTH / 2;
  return clampNumber(nextX, minButtonX, Math.max(minButtonX, maxButtonX));
}

/**
 * 读取根布局上的键盘态标记：
 * - App.vue 在 `.app-shell` 上写入 `keyboard-open` class；
 * - 这里复用该标记，避免把“软键盘开合导致的临时缩高”误当成普通布局变化。
 */
function isKeyboardOpenLayout(): boolean {
  const appShell = document.querySelector(".app-shell");
  return appShell instanceof HTMLElement && appShell.classList.contains("keyboard-open");
}

function resolveHorizontalCenterBounds(wrapperWidth: number, panelWidth: number): {
  minCenterX: number;
  maxCenterX: number;
} {
  const minCenterX = LEFT_CENTER_EDGE_GAP;
  const actionsWidth = Math.min(PANEL_CLEAR_ACTION_GROUP_WIDTH, panelWidth);
  const panelMaxLeft = Math.max(BUTTON_EDGE_GAP, wrapperWidth - panelWidth - BUTTON_EDGE_GAP);
  const clearLeft = panelMaxLeft + (panelWidth - actionsWidth);
  const maxCenterX = clearLeft - SEND_RIGHT_TO_CLEAR_LEFT_GAP - VOICE_CENTER_TO_SEND_RIGHT_OFFSET;
  return {
    minCenterX,
    maxCenterX: Math.max(minCenterX, maxCenterX)
  };
}

function resolvePanelSize(): { width: number; height: number } {
  const { width, height } = resolveWrapperSize();
  const panelMaxWidth = Math.max(PANEL_MIN_WIDTH, width - BUTTON_EDGE_GAP * 2);
  const panelWidth = Math.max(PANEL_MIN_WIDTH, Math.min(PANEL_BASE_WIDTH, panelMaxWidth));

  const panelMaxHeight = Math.max(PANEL_MIN_HEIGHT, height - BUTTON_EDGE_GAP * 2);
  const panelHeight = Math.max(PANEL_MIN_HEIGHT, Math.min(PANEL_BASE_HEIGHT, panelMaxHeight));

  return {
    width: panelWidth,
    height: panelHeight
  };
}

function resolvePanelInputHeight(panelHeight: number): number {
  const reservedHeight =
    PANEL_ACTION_ROW_HEIGHT + PANEL_ACTION_GAP + PANEL_CATEGORY_ROW_HEIGHT + PANEL_CATEGORY_GAP;
  const maxHeight = Math.max(PANEL_INPUT_MIN_HEIGHT, panelHeight - reservedHeight);
  return clampNumber(autoInputHeight.value, PANEL_INPUT_MIN_HEIGHT, maxHeight);
}

function resolveArrowTop(panelHeight: number, inputHeight: number): number {
  // 约束：arrow 中心对齐输入框底边。
  const arrowTopPreferred = inputHeight - PANEL_ARROW_SIZE / 2;
  return clampNumber(arrowTopPreferred, 0, Math.max(0, panelHeight - PANEL_ARROW_SIZE));
}

function resolveVoiceOffsetFromPanelTop(panelHeight: number, inputHeight: number): number {
  const arrowTop = resolveArrowTop(panelHeight, inputHeight);
  // 约束：voice 顶边 = arrow 下尖角 + 8px。
  return arrowTop + PANEL_ARROW_SIZE + PANEL_ARROW_VOICE_TOP_GAP;
}

function resolveVerticalVoiceBounds(
  wrapperHeight: number,
  panelHeight: number,
  inputHeight: number
): {
  minVoiceTop: number;
  maxVoiceTop: number;
} {
  const panelMinTop = BUTTON_EDGE_GAP;
  const panelMaxTop = Math.max(BUTTON_EDGE_GAP, wrapperHeight - panelHeight - BUTTON_EDGE_GAP);
  const offset = resolveVoiceOffsetFromPanelTop(panelHeight, inputHeight);
  return {
    minVoiceTop: panelMinTop + offset,
    maxVoiceTop: panelMaxTop + offset
  };
}

function resolvePanelLayout(): {
  left: number;
  top: number;
  panelWidth: number;
  panelHeight: number;
  inputHeight: number;
  arrowLeft: number;
  arrowTop: number;
} {
  const panelSize = resolvePanelSize();
  const { width: wrapperWidth } = resolveWrapperSize();
  const inputHeight = resolvePanelInputHeight(panelSize.height);

  const voiceCenterX = buttonPosition.value.x + BUTTON_WIDTH / 2;
  const voiceTopY = buttonPosition.value.y;
  const arrowTop = resolveArrowTop(panelSize.height, inputHeight);

  // 由约束直接反推 panel top，避免二次 clamp 破坏 arrow/voice 垂直间距。
  const top = voiceTopY - resolveVoiceOffsetFromPanelTop(panelSize.height, inputHeight);

  // 保持面板左偏移近似 Frame 2253 初始布局。
  let left = buttonPosition.value.x - 26;
  left = clampNumber(left, BUTTON_EDGE_GAP, Math.max(BUTTON_EDGE_GAP, wrapperWidth - panelSize.width - BUTTON_EDGE_GAP));

  // voice 与 arrow 的中心线保持对齐，并以设备边界为基准约束中心点位置。
  const { minCenterX, maxCenterX } = resolveHorizontalCenterBounds(wrapperWidth, panelSize.width);
  const constrainedCenterX = clampNumber(voiceCenterX, minCenterX, maxCenterX);
  const arrowLeftBase = constrainedCenterX - left - PANEL_ARROW_SIZE / 2;
  const arrowLeft = clampNumber(arrowLeftBase, 0, Math.max(0, panelSize.width - PANEL_ARROW_SIZE));

  return {
    left,
    top,
    panelWidth: panelSize.width,
    panelHeight: panelSize.height,
    inputHeight,
    arrowLeft,
    arrowTop
  };
}

function hasLiveAudioTrack(stream: MediaStream | null): boolean {
  if (!stream) {
    return false;
  }
  return stream.getAudioTracks().some((track) => track.readyState === "live");
}

function releaseCachedMicStream(): void {
  if (!cachedMicStream) {
    return;
  }
  for (const track of cachedMicStream.getTracks()) {
    track.stop();
  }
  cachedMicStream = null;
}

async function acquireMicStream(): Promise<MediaStream> {
  if (hasLiveAudioTrack(cachedMicStream)) {
    return cachedMicStream as MediaStream;
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      noiseSuppression: true,
      echoCancellation: true,
      autoGainControl: true
    }
  });
  cachedMicStream = stream;
  return stream;
}

function syncAutoInputHeight(): void {
  const textarea = draftTextareaRef.value;
  if (!textarea) {
    autoInputHeight.value = PANEL_INPUT_MIN_HEIGHT;
    buttonPosition.value = clampButtonPosition(buttonPosition.value);
    return;
  }
  const measured = Math.max(PANEL_INPUT_MIN_HEIGHT, Math.ceil(textarea.scrollHeight));
  autoInputHeight.value = measured;
  // 输入框高度变化会改变 arrow/voice 垂直几何关系，需要同步约束按钮 y。
  buttonPosition.value = clampButtonPosition(buttonPosition.value);
}

function computeDefaultButtonPosition(): { x: number; y: number } {
  const { height } = resolveWrapperSize();
  return clampButtonPosition({
    x: LEFT_CENTER_EDGE_GAP - BUTTON_WIDTH / 2,
    y: height - BUTTON_HEIGHT - BUTTON_EDGE_GAP
  });
}

function initButtonPosition(): void {
  buttonPosition.value = computeDefaultButtonPosition();
  initialDefaultApplied = false;
  hasUserMovedVoiceInSession = false;
  lastUserPlacedButtonPosition = null;
}

function clearHoldTimer(): void {
  if (holdTimer !== null) {
    window.clearTimeout(holdTimer);
    holdTimer = null;
  }
}

function clearRoundSocketCloseTimer(): void {
  if (roundSocketCloseTimer !== null) {
    window.clearTimeout(roundSocketCloseTimer);
    roundSocketCloseTimer = null;
  }
}

function clearPointerCapture(pointer: number | null): void {
  const owner = pointerCaptureOwner ?? voiceButtonRef.value;
  if (owner && pointer !== null) {
    try {
      if (owner.hasPointerCapture(pointer)) {
        owner.releasePointerCapture(pointer);
      }
    } catch {
      // 某些浏览器在捕获态切换边界会抛错；这里做容错回收。
    }
  }
  pointerCaptureOwner = null;
}

function buildAsrEndpoints(gatewayUrl: string, token: string): string[] {
  const pageIsHttps = window.location.protocol === "https:";
  const pageProtocol = pageIsHttps ? "wss:" : "ws:";
  const pageHost = window.location.hostname;
  const pageHostWithPort = window.location.host;
  const input = gatewayUrl.trim() || `${pageProtocol}//${pageHostWithPort}`;
  const candidates: string[] = [];

  let endpoint: URL;
  try {
    const maybeUrl = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(input) ? input : `${pageProtocol}//${input}`;
    endpoint = new URL(maybeUrl);
  } catch {
    endpoint = new URL(`${pageProtocol}//${pageHostWithPort}`);
  }

  if (endpoint.protocol === "http:") endpoint.protocol = "ws:";
  if (endpoint.protocol === "https:") endpoint.protocol = "wss:";
  if (pageIsHttps && endpoint.protocol === "ws:") {
    endpoint.protocol = "wss:";
  }

  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  const pageIsLocal = localHosts.has(pageHost);
  const targetIsLocal = localHosts.has(endpoint.hostname);
  if (!pageIsLocal && targetIsLocal) {
    endpoint.hostname = pageHost;
  }

  const finalizeEndpoint = (source: URL): string => {
    const next = new URL(source.toString());
    const pathname = next.pathname.replace(/\/+$/, "");
    const normalizedBasePath = (() => {
      if (pathname.endsWith("/ws/terminal")) {
        return pathname.slice(0, -"/ws/terminal".length);
      }
      if (pathname.endsWith("/ws/asr")) {
        return pathname.slice(0, -"/ws/asr".length);
      }
      return pathname;
    })();
    next.pathname = `${normalizedBasePath}/ws/asr`.replace(/\/{2,}/g, "/");
    next.search = `token=${encodeURIComponent(token)}`;
    return next.toString();
  };

  const pushCandidate = (next: URL): void => {
    if (pageIsHttps && next.protocol === "ws:") {
      return;
    }
    candidates.push(finalizeEndpoint(next));
  };

  pushCandidate(endpoint);

  if (!pageIsHttps && endpoint.protocol === "ws:") {
    const tlsUrl = new URL(endpoint.toString());
    tlsUrl.protocol = "wss:";
    pushCandidate(tlsUrl);
  } else if (endpoint.protocol === "wss:") {
    const plainUrl = new URL(endpoint.toString());
    if (!pageIsHttps) {
      plainUrl.protocol = "ws:";
      pushCandidate(plainUrl);
    }
  }

  if (!targetIsLocal) {
    const noPort = new URL(endpoint.toString());
    noPort.port = "";
    pushCandidate(noPort);

    if (!pageIsHttps && noPort.protocol === "ws:") {
      const noPortTls = new URL(noPort.toString());
      noPortTls.protocol = "wss:";
      pushCandidate(noPortTls);
    } else if (noPort.protocol === "wss:") {
      if (!pageIsHttps) {
        const noPortPlain = new URL(noPort.toString());
        noPortPlain.protocol = "ws:";
        pushCandidate(noPortPlain);
      }
    }
  }

  return [...new Set(candidates)];
}

function downsampleTo16k(input: Float32Array, inputSampleRate: number): Float32Array {
  if (inputSampleRate <= 16000) {
    return input;
  }
  const ratio = inputSampleRate / 16000;
  const outputLength = Math.max(1, Math.round(input.length / ratio));
  const output = new Float32Array(outputLength);
  let outputIndex = 0;
  let inputIndex = 0;

  while (outputIndex < outputLength) {
    const nextInputIndex = Math.min(input.length, Math.round((outputIndex + 1) * ratio));
    let total = 0;
    let count = 0;
    for (let i = inputIndex; i < nextInputIndex; i += 1) {
      total += input[i] ?? 0;
      count += 1;
    }
    output[outputIndex] = count > 0 ? total / count : 0;
    outputIndex += 1;
    inputIndex = nextInputIndex;
  }

  return output;
}

function floatToPcm16Buffer(input: Float32Array, inputSampleRate: number): ArrayBuffer {
  const samples = downsampleTo16k(input, inputSampleRate);
  const buffer = new ArrayBuffer(samples.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < samples.length; i += 1) {
    const sample = clampNumber(samples[i] ?? 0, -1, 1);
    const value = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    view.setInt16(i * 2, Math.round(value), true);
  }
  return buffer;
}

function resetRecordingStateOnly(): void {
  isRecording.value = false;
  if (gestureState.value === "recording") {
    gestureState.value = "idle";
  }
}

async function disposeRoundSession(session: VoiceRoundSession | null): Promise<void> {
  if (!session) {
    return;
  }
  session.processorNode.onaudioprocess = null;
  try {
    session.sourceNode.disconnect();
  } catch {
    // 节点可能已断开。
  }
  try {
    session.processorNode.disconnect();
  } catch {
    // 节点可能已断开。
  }
  try {
    session.gainNode.disconnect();
  } catch {
    // 节点可能已断开。
  }
  try {
    await session.audioContext.close();
  } catch {
    // 已关闭时忽略。
  }
}

async function cleanupCurrentRoundSession(): Promise<void> {
  const session = currentRoundSession;
  currentRoundSession = null;
  await disposeRoundSession(session);
}

function closeActiveSocket(reason = "client_close"): void {
  clearRoundSocketCloseTimer();
  const socket = activeSocket;
  activeSocket = null;
  if (!socket) {
    return;
  }
  if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
    socket.close(1000, reason);
  }
}

function applyRoundResult(token: number, payload: Record<string, unknown> | undefined): void {
  if (!payload || token !== currentRoundToken) {
    return;
  }
  const text = payload.text;
  if (typeof text === "string") {
    draftText.value = `${roundBaseText}${text}`;
  }
}

async function openAsrSocket(roundToken: number): Promise<WebSocket> {
  const endpoints = buildAsrEndpoints(settingsStore.gatewayUrl, settingsStore.gatewayToken);
  let lastError: Error | null = null;

  for (let i = 0; i < endpoints.length; i += 1) {
    const endpoint = endpoints[i] ?? "";
    let shouldContinue = true;
    try {
      const socket = await new Promise<WebSocket>((resolve, reject) => {
        let settled = false;
        let ready = false;
        let gotGatewayMessage = false;

        const socket = new WebSocket(endpoint);
        socket.binaryType = "arraybuffer";

        const timeoutId = window.setTimeout(() => {
          if (settled) {
            return;
          }
          settled = true;
          socket.close();
          const error = new Error(`语音网关连接超时: ${endpoint}`);
          (error as Error & { asrFatal?: boolean }).asrFatal = false;
          reject(error);
        }, READY_TIMEOUT_MS);

        const settleReady = (): void => {
          if (settled) {
            return;
          }
          settled = true;
          ready = true;
          window.clearTimeout(timeoutId);
          resolve(socket);
        };

        const settleError = (error: unknown, fatal = false): void => {
          if (settled) {
            return;
          }
          settled = true;
          window.clearTimeout(timeoutId);
          const normalized = error instanceof Error ? error : new Error(String(error));
          const wrapped = new Error(normalized.message);
          (wrapped as Error & { asrFatal?: boolean }).asrFatal = fatal;
          reject(wrapped);
        };

        socket.onmessage = (event) => {
          if (typeof event.data !== "string") {
            return;
          }
          let frame: AsrGatewayFrame;
          try {
            frame = JSON.parse(event.data) as AsrGatewayFrame;
          } catch {
            return;
          }
          gotGatewayMessage = true;

          if (frame.type === "ready") {
            settleReady();
            return;
          }

          if (frame.type === "result") {
            applyRoundResult(roundToken, frame.payload);
            return;
          }

          if (frame.type === "error") {
            const message = String(frame.payload?.message ?? "语音服务异常");
            if (!ready) {
              settleError(new Error(message), true);
              return;
            }
            appStore.notify("error", message);
            return;
          }

          if (frame.type === "round_end") {
            if (activeSocket === socket) {
              clearRoundSocketCloseTimer();
            }
          }
        };

        socket.onerror = () => {
          if (!ready) {
            settleError(new Error(`语音连接失败: ${endpoint}`), false);
          }
        };

        socket.onclose = (event) => {
          if (activeSocket === socket) {
            activeSocket = null;
          }
          if (!ready) {
            const reasonText = event.reason?.trim() ? `, reason=${event.reason}` : "";
            settleError(new Error(`语音连接已关闭(code=${event.code}${reasonText}): ${endpoint}`), gotGatewayMessage);
          }
        };
      });
      return socket;
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error));
      lastError = normalized;
      shouldContinue = (normalized as Error & { asrFatal?: boolean }).asrFatal !== true;
    }
    if (!shouldContinue) {
      break;
    }
  }

  if (lastError) {
    throw lastError;
  }

  throw new Error("语音连接失败：未找到可用网关地址");
}

async function startRecordingRound(): Promise<void> {
  // 语音转文字本身不依赖终端会话；未连接时仍允许输入，后续可选择记录到闪念。
  panelVisible.value = true;
  roundBaseText = draftText.value;
  currentRoundToken += 1;
  const roundToken = currentRoundToken;
  const startAttemptId = ++roundStartAttemptSeq;
  stopRequestedBeforeReady = false;

  clearRoundSocketCloseTimer();
  closeActiveSocket("restart_round");
  await cleanupCurrentRoundSession();

  let acquiredStream: MediaStream | null = null;
  let openingSocket: WebSocket | null = null;
  try {
    acquiredStream = await acquireMicStream();

    const isAbortedBeforeSocket =
      startAttemptId !== roundStartAttemptSeq || gestureState.value !== "recording" || roundToken !== currentRoundToken;
    if (isAbortedBeforeSocket) {
      return;
    }

    openingSocket = await openAsrSocket(roundToken);
    const shouldAutoStopAfterReady = gestureState.value !== "recording";
    const isAbortedAfterSocket = startAttemptId !== roundStartAttemptSeq || roundToken !== currentRoundToken;
    if (isAbortedAfterSocket) {
      if (openingSocket.readyState === WebSocket.OPEN || openingSocket.readyState === WebSocket.CONNECTING) {
        openingSocket.close(1000, "round_start_aborted");
      }
      return;
    }

    const socket = openingSocket;
    openingSocket = null;
    activeSocket = socket;

    socket.send(
      JSON.stringify({
        type: "start",
        payload: {
          audio: {
            format: "pcm",
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
        }
      })
    );

    const audioContext = new AudioContext();
    await audioContext.resume();
    const sourceNode = audioContext.createMediaStreamSource(acquiredStream);
    const processorNode = audioContext.createScriptProcessor(AUDIO_PROCESSOR_BUFFER_SIZE, 1, 1);
    const gainNode = audioContext.createGain();
    gainNode.gain.value = 0;

    sourceNode.connect(processorNode);
    processorNode.connect(gainNode);
    gainNode.connect(audioContext.destination);

    processorNode.onaudioprocess = (event) => {
      if (!isRecording.value || activeSocket !== socket || socket.readyState !== WebSocket.OPEN) {
        return;
      }
      const input = event.inputBuffer.getChannelData(0);
      const chunk = new Float32Array(input.length);
      chunk.set(input);
      const pcmBuffer = floatToPcm16Buffer(chunk, event.inputBuffer.sampleRate);
      if (pcmBuffer.byteLength > 0) {
        socket.send(pcmBuffer);
      }
    };

    currentRoundSession = {
      audioContext,
      sourceNode,
      processorNode,
      gainNode
    };
    acquiredStream = null;
    isRecording.value = true;

    // 若用户在 socket ready 前已松手（或手势状态已离开 recording），
    // 这里补发 stop，避免整轮静默丢弃。
    if (shouldAutoStopAfterReady || stopRequestedBeforeReady) {
      stopRequestedBeforeReady = false;
      await stopRecordingRound(false);
    }
  } catch (error) {
    const isAborted = startAttemptId !== roundStartAttemptSeq || roundToken !== currentRoundToken;
    if (openingSocket && (openingSocket.readyState === WebSocket.OPEN || openingSocket.readyState === WebSocket.CONNECTING)) {
      openingSocket.close(1000, "round_start_failed");
    }
    resetRecordingStateOnly();
    await cleanupCurrentRoundSession();
    closeActiveSocket(isAborted ? "round_start_aborted" : "round_start_failed");
    if (!isAborted) {
      appStore.notify("error", formatActionError("启动语音输入失败", error));
    }
  }
}

async function stopRecordingRound(sendCancel = false): Promise<void> {
  const socket = activeSocket;
  resetRecordingStateOnly();
  if (!sendCancel && !socket) {
    // 处理“先松手后 ready”的竞态：待 ready 后由 startRecordingRound 补发 stop。
    stopRequestedBeforeReady = true;
  }

  if (socket && socket.readyState === WebSocket.OPEN) {
    try {
      socket.send(JSON.stringify({ type: sendCancel ? "cancel" : "stop" }));
    } catch {
      // 发送失败时由 close 流程兜底。
    }
  }

  await cleanupCurrentRoundSession();

  if (!socket || sendCancel) {
    if (sendCancel) {
      stopRequestedBeforeReady = false;
    }
    closeActiveSocket(sendCancel ? "cancel" : "stop_without_socket");
    return;
  }

  clearRoundSocketCloseTimer();
  roundSocketCloseTimer = window.setTimeout(() => {
    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
      socket.close(1000, "round_timeout");
    }
  }, ROUND_SOCKET_CLOSE_TIMEOUT_MS);
}

function createVoiceTxnId(): string {
  voiceTxnSeq += 1;
  return `voice-${Date.now()}-${voiceTxnSeq}`;
}

/**
 * 提取 projectPath 的最后一级目录名：
 * 1. 先裁掉首尾空白与尾部斜杠；
 * 2. 同时兼容 / 与 \ 两类路径分隔符；
 * 3. 解析失败时回退空字符串，由上层统一补默认文案。
 */
function resolveProjectDirectoryName(projectPath?: string): string {
  const normalized = String(projectPath || "")
    .trim()
    .replace(/[\\/]+$/g, "");
  if (!normalized) {
    return "";
  }
  const segments = normalized.split(/[\\/]+/).filter(Boolean);
  if (segments.length === 0) {
    return normalized === "~" ? "~" : "";
  }
  return segments[segments.length - 1] || "";
}

function resolveSelectedRecordCategory(): string {
  return voiceRecordCategories.value.includes(selectedRecordCategory.value)
    ? selectedRecordCategory.value
    : settingsStore.settings.voiceRecordDefaultCategory || voiceRecordCategories.value[0] || DEFAULT_VOICE_RECORD_CATEGORY_FALLBACK;
}

function resetSelectedRecordCategory(): void {
  const preferred = String(settingsStore.settings.voiceRecordDefaultCategory ?? "").trim();
  selectedRecordCategory.value = voiceRecordCategories.value.includes(preferred)
    ? preferred
    : voiceRecordCategories.value[0] || DEFAULT_VOICE_RECORD_CATEGORY_FALLBACK;
}

/**
 * 闪念上下文标签采用创建时快照：
 * - 优先取当前连接服务器；
 * - 未连接时回退到当前选中的服务器；
 * - 项目名取工作目录最后一级，缺失时统一写“未设置项目”。
 */
function resolveRecordContext(): { serverId: string; contextLabel: string } {
  const targetServerId = sessionStore.currentServerId || serverStore.selectedServerId || "";
  const server = serverStore.servers.find((item) => item.id === targetServerId);
  if (!server) {
    return {
      serverId: targetServerId,
      contextLabel: ""
    };
  }
  const projectName = resolveProjectDirectoryName(server.projectPath) || "未设置项目";
  return {
    serverId: server.id,
    contextLabel: `${server.name}-${projectName}`
  };
}

async function onSend(): Promise<void> {
  const text = draftText.value.trim();
  if (!text) {
    return;
  }
  if (sessionStore.state !== "connected") {
    appStore.notify("warn", "当前会话未连接，无法发送语音输入");
    return;
  }

  try {
    /**
     * 语音发送改为“两段式”：
     * 1) assist 通道只发送正文，避免把“提交动作”耦合在同一包里；
     * 2) 紧接着补发一次 keyboard 回车，行为与用户手动点击键盘区 Enter 一致。
     * 目的：规避部分 Codex 场景下“文本已回显但未真正提交”的偶发状态。
     */
    await sessionStore.sendInput(text, {
      source: "assist",
      txnId: createVoiceTxnId()
    });
    await sessionStore.sendInput("\r", { source: "keyboard" });
    draftText.value = "";
    panelVisible.value = false;
  } catch (error) {
    appStore.notify("error", formatActionError("发送语音输入失败", error));
  }
}

async function onRecord(): Promise<void> {
  const text = draftText.value.trim();
  if (!text) {
    appStore.notify("info", "无可记录内容");
    return;
  }

  try {
    if (gestureState.value === "recording" || isRecording.value) {
      await stopRecordingRound(false);
    }
    await Promise.all([voiceRecordStore.ensureBootstrapped(), serverStore.ensureBootstrapped()]);
    const context = resolveRecordContext();
    await voiceRecordStore.addRecord(text, context.serverId, {
      category: resolveSelectedRecordCategory(),
      contextLabel: context.contextLabel
    });
    appStore.notify("info", "已记录到闪念列表");
    draftText.value = "";
    panelVisible.value = false;
  } catch (error) {
    appStore.notify("error", formatActionError("记录闪念失败", error));
  }
}

function onClear(): void {
  draftText.value = "";
}

async function onCancel(): Promise<void> {
  await stopRecordingRound(true);
  draftText.value = "";
  panelVisible.value = false;
}

function onVoicePointerDown(event: PointerEvent): void {
  if (event.button !== 0 || pointerId !== null) {
    return;
  }
  pointerId = event.pointerId;
  pointerStartX = event.clientX;
  pointerStartY = event.clientY;
  dragOriginX = buttonPosition.value.x;
  dragOriginY = buttonPosition.value.y;
  gestureState.value = "pending";

  const target = event.currentTarget;
  if (target instanceof HTMLElement) {
    try {
      target.setPointerCapture(event.pointerId);
      pointerCaptureOwner = target;
    } catch {
      // Safari 某些版本对触摸捕获支持不稳定；失败时由全局兜底监听回收。
      pointerCaptureOwner = target;
    }
  }

  clearHoldTimer();
  holdTimer = window.setTimeout(() => {
    holdTimer = null;
    if (gestureState.value !== "pending") {
      return;
    }
    gestureState.value = "recording";
    void startRecordingRound();
  }, HOLD_DELAY_MS);

  event.preventDefault();
  event.stopPropagation();
}

function onVoicePointerMove(event: PointerEvent): void {
  if (pointerId !== event.pointerId) {
    return;
  }

  const dx = event.clientX - pointerStartX;
  const dy = event.clientY - pointerStartY;
  const moved = Math.hypot(dx, dy) > DRAG_THRESHOLD_PX;

  if (gestureState.value === "pending" && moved) {
    clearHoldTimer();
    gestureState.value = "dragging";
  }

  if (gestureState.value === "dragging") {
    buttonPosition.value = clampButtonPosition({
      x: dragOriginX + dx,
      y: dragOriginY + dy
    });
    lastUserPlacedButtonPosition = { ...buttonPosition.value };
  }

  if (gestureState.value === "pending" || gestureState.value === "dragging") {
    event.preventDefault();
    event.stopPropagation();
  }
}

function releasePointer(event: PointerEvent): void {
  if (pointerId !== event.pointerId) {
    return;
  }
  clearPointerCapture(event.pointerId);
  pointerId = null;
}

async function endPointerGesture(event: PointerEvent): Promise<void> {
  if (pointerId !== event.pointerId) {
    return;
  }
  const state = gestureState.value;
  clearHoldTimer();

  if (state === "recording") {
    await stopRecordingRound(false);
  }
  if (state === "dragging") {
    hasUserMovedVoiceInSession = true;
    lastUserPlacedButtonPosition = { ...buttonPosition.value };
  }

  gestureState.value = "idle";
  releasePointer(event);
  // 全局兜底监听也会走到这里，避免在 window 级别调用 preventDefault。
  if (event.currentTarget instanceof HTMLElement) {
    event.preventDefault();
    event.stopPropagation();
  }
}

function onVoicePointerUp(event: PointerEvent): void {
  void endPointerGesture(event);
}

function onVoicePointerCancel(event: PointerEvent): void {
  void endPointerGesture(event);
}

function onVoiceLostPointerCapture(event: PointerEvent): void {
  // 捕获链路丢失时，仍按“松手收尾”处理，避免 pointerId 残留导致下一轮不可交互。
  if (pointerId !== event.pointerId) {
    return;
  }
  void endPointerGesture(event);
}

async function forceEndGesture(reason: string): Promise<void> {
  clearHoldTimer();
  if (gestureState.value === "recording" || isRecording.value) {
    await stopRecordingRound(false);
  }
  if (gestureState.value === "dragging") {
    hasUserMovedVoiceInSession = true;
    lastUserPlacedButtonPosition = { ...buttonPosition.value };
  }
  gestureState.value = "idle";
  clearPointerCapture(pointerId);
  pointerId = null;
  if (reason === "visibility_hidden") {
    // 页面不可见时主动释放麦克风，避免后台占用系统输入设备。
    releaseCachedMicStream();
    stopRequestedBeforeReady = false;
  }
}

function bindWrapperResizeObserver(wrapper: HTMLDivElement | null): void {
  wrapperResizeObserver?.disconnect();
  wrapperResizeObserver = null;
  if (!wrapper) {
    buttonPosition.value = clampButtonPosition(buttonPosition.value);
    initialDefaultApplied = true;
    return;
  }
  wrapperResizeObserver = new ResizeObserver(() => {
    if (!initialDefaultApplied) {
      buttonPosition.value = computeDefaultButtonPosition();
      initialDefaultApplied = true;
      syncAutoInputHeight();
      return;
    }
    const keepBottomAnchor = !panelVisible.value && !hasUserMovedVoiceInSession && pointerId === null;
    const keepUserPlacedPositionDuringKeyboard =
      !panelVisible.value && hasUserMovedVoiceInSession && pointerId === null && isKeyboardOpenLayout();
    if (keepBottomAnchor) {
      // 键盘弹出导致容器变矮时，不把 voice 往上推；高度恢复时再自然回到底部。
      const desiredBottomY = Math.max(BUTTON_EDGE_GAP, resolveWrapperSize().height - BUTTON_HEIGHT - BUTTON_EDGE_GAP);
      const nextY = Math.max(buttonPosition.value.y, desiredBottomY);
      buttonPosition.value = {
        x: clampButtonXOnly(LEFT_CENTER_EDGE_GAP - BUTTON_WIDTH / 2),
        y: nextY
      };
    } else if (keepUserPlacedPositionDuringKeyboard) {
      /**
       * 用户已手动摆放 voice 按钮时，软键盘开合会让 wrapper 高度临时变小。
       * 这里禁止按“当前临时高度”夹紧 y，避免按钮被推到顶部并在收键盘后卡住。
       */
      const base = lastUserPlacedButtonPosition ?? buttonPosition.value;
      buttonPosition.value = {
        x: clampButtonXOnly(base.x),
        y: base.y
      };
    } else {
      const next = clampButtonPosition(lastUserPlacedButtonPosition ?? buttonPosition.value);
      buttonPosition.value = next;
      if (!panelVisible.value && hasUserMovedVoiceInSession && pointerId === null) {
        // 记录“当前稳定合法位置”，用于下一次键盘态保护与恢复。
        lastUserPlacedButtonPosition = { ...next };
      }
    }
    syncAutoInputHeight();
  });
  wrapperResizeObserver.observe(wrapper);
}

onMounted(() => {
  initButtonPosition();
  bindWrapperResizeObserver(props.wrapperEl ?? null);
  resetSelectedRecordCategory();
  void Promise.all([settingsStore.ensureBootstrapped(), serverStore.ensureBootstrapped()]);
  /**
   * 全局收尾兜底：
   * - 触摸链路在 iOS 上偶发丢失 button 级 pointerup/pointercancel；
   * - 一旦收尾事件缺失，会出现“松手后仍继续录音 + pointerId 卡死”；
   * - 这里在 window capture 层补一层统一回收，确保每轮按住/松手闭环。
   */
  onGlobalPointerUp = (event: PointerEvent) => {
    if (pointerId === event.pointerId) {
      void endPointerGesture(event);
    }
  };
  onGlobalPointerCancel = (event: PointerEvent) => {
    if (pointerId === event.pointerId) {
      void endPointerGesture(event);
    }
  };
  onGlobalTouchEnd = (_event: TouchEvent) => {
    if (pointerId !== null && gestureState.value !== "idle") {
      void forceEndGesture("touchend_fallback");
    }
  };
  onGlobalTouchCancel = (_event: TouchEvent) => {
    if (pointerId !== null && gestureState.value !== "idle") {
      void forceEndGesture("touchcancel_fallback");
    }
  };
  onGlobalBlur = () => {
    if (pointerId !== null || gestureState.value !== "idle" || isRecording.value) {
      void forceEndGesture("window_blur");
    }
  };
  onGlobalVisibilityChange = () => {
    if (document.visibilityState === "hidden" && (pointerId !== null || isRecording.value || gestureState.value !== "idle")) {
      void forceEndGesture("visibility_hidden");
    }
  };
  window.addEventListener("pointerup", onGlobalPointerUp, true);
  window.addEventListener("pointercancel", onGlobalPointerCancel, true);
  window.addEventListener("touchend", onGlobalTouchEnd, { capture: true, passive: true });
  window.addEventListener("touchcancel", onGlobalTouchCancel, { capture: true, passive: true });
  window.addEventListener("blur", onGlobalBlur);
  document.addEventListener("visibilitychange", onGlobalVisibilityChange);
  void nextTick(() => {
    syncAutoInputHeight();
  });
});

watch(
  () => props.wrapperEl,
  (nextWrapper) => {
    initialDefaultApplied = false;
    bindWrapperResizeObserver(nextWrapper ?? null);
    buttonPosition.value = clampButtonPosition(buttonPosition.value);
    void nextTick(() => {
      syncAutoInputHeight();
    });
  }
);

watch(
  () => panelVisible.value,
  (visible) => {
    if (!visible) {
      autoInputHeight.value = PANEL_INPUT_MIN_HEIGHT;
      // 面板关闭后释放麦克风，下次打开时若权限已持久授权不会再弹窗。
      releaseCachedMicStream();
      return;
    }
    resetSelectedRecordCategory();
    void nextTick(() => {
      syncAutoInputHeight();
    });
  }
);

watch(
  () => draftText.value,
  () => {
    void nextTick(() => {
      syncAutoInputHeight();
    });
  }
);

watch(
  () => voiceRecordCategories.value.join("|"),
  () => {
    selectedRecordCategory.value = resolveSelectedRecordCategory();
  }
);

onBeforeUnmount(() => {
  clearHoldTimer();
  clearRoundSocketCloseTimer();
  closeActiveSocket("unmount");
  void cleanupCurrentRoundSession();
  releaseCachedMicStream();
  clearPointerCapture(pointerId);
  pointerId = null;
  gestureState.value = "idle";
  wrapperResizeObserver?.disconnect();
  wrapperResizeObserver = null;
  if (onGlobalPointerUp) {
    window.removeEventListener("pointerup", onGlobalPointerUp, true);
  }
  if (onGlobalPointerCancel) {
    window.removeEventListener("pointercancel", onGlobalPointerCancel, true);
  }
  if (onGlobalTouchEnd) {
    window.removeEventListener("touchend", onGlobalTouchEnd, true);
  }
  if (onGlobalTouchCancel) {
    window.removeEventListener("touchcancel", onGlobalTouchCancel, true);
  }
  if (onGlobalBlur) {
    window.removeEventListener("blur", onGlobalBlur);
  }
  if (onGlobalVisibilityChange) {
    document.removeEventListener("visibilitychange", onGlobalVisibilityChange);
  }
  onGlobalPointerUp = null;
  onGlobalPointerCancel = null;
  onGlobalTouchEnd = null;
  onGlobalTouchCancel = null;
  onGlobalBlur = null;
  onGlobalVisibilityChange = null;
});
</script>
