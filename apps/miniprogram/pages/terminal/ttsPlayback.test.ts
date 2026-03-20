import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type TerminalPageOptions = {
  data?: Record<string, unknown>;
  [key: string]: unknown;
};
type TtsQueueItem = {
  ready?: boolean;
  playbackUrl?: string;
  remoteAudioUrl?: string;
  useRemotePlayback?: boolean;
  [key: string]: unknown;
};
type TerminalPageRuntime = {
  playQueue: TtsQueueItem[];
  playingSegmentIndex: number;
  playbackPhase: string;
  [key: string]: unknown;
};
type TerminalPageInstance = TerminalPageOptions & {
  data: Record<string, unknown>;
  ttsRuntime: TerminalPageRuntime;
  setData: (patch: Record<string, unknown>) => void;
  initTtsRuntime: () => void;
  createTtsPlaybackJob: (segments: string[]) => number;
  playTtsQueueSegment: (jobId: number, segmentIndex: number) => Promise<boolean>;
  prepareTtsQueueItem: ReturnType<typeof vi.fn>;
  localizeTerminalMessage: ReturnType<typeof vi.fn>;
  showLocalizedToast: ReturnType<typeof vi.fn>;
  applyTtsInnerAudioOptions: ReturnType<typeof vi.fn>;
  prefetchNextTtsQueueItem: ReturnType<typeof vi.fn>;
};
type MiniprogramGlobals = typeof globalThis & {
  Page?: (options: TerminalPageOptions) => void;
  wx?: Record<string, unknown>;
};

type AudioHandlerName = "canplay" | "play" | "ended" | "stop" | "error";

function createAudioContextMock() {
  const handlers: Partial<Record<AudioHandlerName, (payload?: unknown) => void>> = {};
  const audioContext = {
    src: "",
    autoplay: false,
    obeyMuteSwitch: false,
    onCanplay(callback: (payload?: unknown) => void) {
      handlers.canplay = callback;
    },
    onPlay(callback: (payload?: unknown) => void) {
      handlers.play = callback;
    },
    onEnded(callback: (payload?: unknown) => void) {
      handlers.ended = callback;
    },
    onStop(callback: (payload?: unknown) => void) {
      handlers.stop = callback;
    },
    onError(callback: (payload?: unknown) => void) {
      handlers.error = callback;
    },
    play: vi.fn(),
    stop: vi.fn(() => {
      handlers.stop?.();
    }),
    destroy: vi.fn(),
    emit(name: AudioHandlerName, payload?: unknown) {
      handlers[name]?.(payload);
    }
  };
  return audioContext;
}

function flushMicrotasks(): Promise<void> {
  return Promise.resolve().then(() => undefined);
}

function createTerminalPageHarness() {
  const globalState = globalThis as MiniprogramGlobals;
  let capturedPageOptions: TerminalPageOptions | null = null;
  const audioContexts: ReturnType<typeof createAudioContextMock>[] = [];
  const noop = () => {};

  vi.resetModules();
  delete require.cache[require.resolve("./index.js")];
  globalState.Page = vi.fn((options: TerminalPageOptions) => {
    capturedPageOptions = options;
  });
  globalState.wx = {
    env: {
      USER_DATA_PATH: "/tmp"
    },
    getRecorderManager: vi.fn(() => ({
      onStart: noop,
      onStop: noop,
      onError: noop,
      onFrameRecorded: noop,
      start: noop,
      stop: noop
    })),
    createInnerAudioContext: vi.fn(() => {
      const audioContext = createAudioContextMock();
      audioContexts.push(audioContext);
      return audioContext;
    }),
    setInnerAudioOption: vi.fn(),
    createSelectorQuery: vi.fn(() => ({
      in: vi.fn(() => ({
        select: vi.fn(() => ({
          boundingClientRect: vi.fn(() => ({
            exec: noop
          }))
        }))
      }))
    })),
    nextTick: vi.fn((callback?: () => void) => {
      callback?.();
    }),
    getSystemInfoSync: vi.fn(() => ({})),
    canIUse: vi.fn(() => false)
  };

  require("./index.js");

  if (!capturedPageOptions) {
    throw new Error("terminal page not captured");
  }

  const captured = capturedPageOptions as TerminalPageOptions;
  const page = {
    ...captured,
    data: JSON.parse(JSON.stringify(captured.data || {})) as Record<string, unknown>,
    setData(patch: Record<string, unknown>) {
      Object.assign(this.data, patch);
    }
  } as TerminalPageInstance;

  page.localizeTerminalMessage = vi.fn((message: string) => String(message || ""));
  page.showLocalizedToast = vi.fn();
  page.applyTtsInnerAudioOptions = vi.fn();
  page.prefetchNextTtsQueueItem = vi.fn();
  page.initTtsRuntime();
  page.setData({
    ttsEnabled: true,
    ttsState: "idle",
    ttsErrorMessage: ""
  });

  return {
    page,
    audioContexts
  };
}

describe("terminal ttsPlayback", () => {
  const globalState = globalThis as MiniprogramGlobals;
  const originalPage = globalState.Page;
  const originalWx = globalState.wx;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.resetModules();
    if (originalPage) {
      globalState.Page = originalPage;
    } else {
      delete globalState.Page;
    }
    if (originalWx) {
      globalState.wx = originalWx;
    } else {
      delete globalState.wx;
    }
  });

  it("本地缓存播放失败时应自动回退到远端音频地址", async () => {
    const { page, audioContexts } = createTerminalPageHarness();
    const jobId = page.createTtsPlaybackJob(["第一段"]);
    const item = page.ttsRuntime.playQueue[0];
    item.ready = true;
    item.playbackUrl = "/tmp/tts-cache-cache-1.mp3";
    item.remoteAudioUrl = "https://gateway.example.com/api/miniprogram/tts/audio/cache-1?ticket=demo";
    page.prepareTtsQueueItem = vi.fn().mockResolvedValue(item);

    await page.playTtsQueueSegment(jobId, 0);
    const localAudioContext = audioContexts[0];

    expect(localAudioContext.src).toBe("/tmp/tts-cache-cache-1.mp3");
    expect(page.data.ttsState).toBe("preparing");

    localAudioContext.emit("error", { errCode: 10001 });
    const remoteAudioContext = audioContexts[1];

    expect(item.useRemotePlayback).toBe(true);
    expect(localAudioContext.stop).toHaveBeenCalledTimes(1);
    expect(localAudioContext.destroy).toHaveBeenCalledTimes(1);
    expect(remoteAudioContext.src).toBe(
      "https://gateway.example.com/api/miniprogram/tts/audio/cache-1?ticket=demo"
    );
    expect(page.data.ttsState).toBe("preparing");
    expect(page.showLocalizedToast).not.toHaveBeenCalled();

    /**
     * 旧播放器实例的迟到错误事件不应把已经切到远端地址的新实例拉回失败态。
     */
    localAudioContext.emit("error", { errCode: 10001 });
    expect(page.data.ttsState).toBe("preparing");
    expect(page.showLocalizedToast).not.toHaveBeenCalled();

    remoteAudioContext.emit("play");

    expect(page.data.ttsState).toBe("playing");
    expect(page.data.ttsErrorMessage).toBe("");
  });

  it("旧播放器实例的迟到 stop/ended 事件不应打断下一段播放", async () => {
    const { page, audioContexts } = createTerminalPageHarness();
    const jobId = page.createTtsPlaybackJob(["第一段", "第二段", "第三段"]);
    page.ttsRuntime.playQueue.forEach((item: TtsQueueItem, index: number) => {
      item.ready = true;
      item.playbackUrl = `/tmp/seg-${index + 1}.mp3`;
      item.remoteAudioUrl = `https://gateway.example.com/seg-${index + 1}.mp3`;
    });
    page.prepareTtsQueueItem = vi.fn(
      async (_jobId: number, segmentIndex: number) => page.ttsRuntime.playQueue[segmentIndex]
    );

    await page.playTtsQueueSegment(jobId, 0);
    const firstAudioContext = audioContexts[0];
    firstAudioContext.emit("play");

    expect(page.ttsRuntime.playingSegmentIndex).toBe(0);
    expect(page.data.ttsState).toBe("playing");

    firstAudioContext.emit("ended");
    await flushMicrotasks();
    const secondAudioContext = audioContexts[1];

    expect(page.ttsRuntime.playingSegmentIndex).toBe(1);
    expect(page.ttsRuntime.playbackPhase).toBe("loading");
    expect(secondAudioContext.src).toBe("/tmp/seg-2.mp3");

    firstAudioContext.emit("stop");
    firstAudioContext.emit("ended");
    await flushMicrotasks();

    expect(page.data.ttsState).toBe("preparing");
    expect(page.ttsRuntime.playbackPhase).toBe("loading");
    expect(page.ttsRuntime.playingSegmentIndex).toBe(1);
    expect(secondAudioContext.src).toBe("/tmp/seg-2.mp3");
    expect(page.prepareTtsQueueItem).toHaveBeenCalledTimes(2);

    secondAudioContext.emit("play");
    expect(page.data.ttsState).toBe("playing");
  });
});
