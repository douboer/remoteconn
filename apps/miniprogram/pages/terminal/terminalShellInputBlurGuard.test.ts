import { afterEach, describe, expect, it, vi } from "vitest";

type TerminalPageOptions = {
  data?: Record<string, unknown>;
  [key: string]: unknown;
};

type TerminalPageInstance = TerminalPageOptions & {
  data: Record<string, unknown>;
  keyboardVisibleHeightPx: number;
  keyboardSessionActive: boolean;
  keyboardRestoreScrollTop: number | null;
  shellInputPassiveBlurPending: boolean;
  setData: (patch: Record<string, unknown>, callback?: () => void) => void;
  onShellInputBlur: () => void;
  onShellInputFocus: (event?: Record<string, unknown>) => void;
  handleShellKeyboardHeightChange: (height: number) => void;
  finalizeShellInputBlur: (options?: Record<string, unknown>) => void;
  restoreOutputScrollAfterKeyboard: ReturnType<typeof vi.fn>;
  adjustOutputScrollForKeyboard: ReturnType<typeof vi.fn>;
  sendFocusModeReport: ReturnType<typeof vi.fn>;
  clearTouchShiftState: ReturnType<typeof vi.fn>;
  syncTerminalOverlay: ReturnType<typeof vi.fn>;
  markTerminalUserInput: ReturnType<typeof vi.fn>;
  getOutputScrollTop: () => number;
};

type MiniprogramGlobals = typeof globalThis & {
  Page?: (options: TerminalPageOptions) => void;
  wx?: Record<string, unknown>;
};

function createTerminalPageHarness() {
  const globalState = globalThis as MiniprogramGlobals;
  let capturedPageOptions: TerminalPageOptions | null = null;
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
    getStorageSync: vi.fn(() => undefined),
    setStorageSync: vi.fn(),
    removeStorageSync: vi.fn(),
    getRecorderManager: vi.fn(() => ({
      onStart: noop,
      onStop: noop,
      onError: noop,
      onFrameRecorded: noop,
      start: noop,
      stop: noop
    })),
    createInnerAudioContext: vi.fn(() => ({
      onCanplay: noop,
      onPlay: noop,
      onEnded: noop,
      onStop: noop,
      onError: noop,
      stop: noop,
      destroy: noop
    })),
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
    keyboardVisibleHeightPx: 0,
    keyboardSessionActive: false,
    keyboardRestoreScrollTop: null,
    shellInputPassiveBlurPending: false,
    setData(patch: Record<string, unknown>, callback?: () => void) {
      Object.assign(this.data, patch);
      callback?.();
    }
  } as TerminalPageInstance;

  page.restoreOutputScrollAfterKeyboard = vi.fn((callback?: () => void) => {
    callback?.();
  });
  page.adjustOutputScrollForKeyboard = vi.fn();
  page.sendFocusModeReport = vi.fn();
  page.clearTouchShiftState = vi.fn();
  page.syncTerminalOverlay = vi.fn();
  page.markTerminalUserInput = vi.fn();
  page.getOutputScrollTop = () => 0;

  return { page };
}

describe("terminal shell input blur guard", () => {
  const globalState = globalThis as MiniprogramGlobals;
  const originalPage = globalState.Page;
  const originalWx = globalState.wx;

  afterEach(() => {
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

  it("键盘仍可见时的被动 blur 不应立刻把 shell 输入框设为失焦", () => {
    const { page } = createTerminalPageHarness();
    page.data.statusClass = "connected";
    page.data.shellInputFocus = true;
    page.keyboardVisibleHeightPx = 240;

    page.onShellInputBlur();

    expect(page.shellInputPassiveBlurPending).toBe(true);
    expect(page.data.shellInputFocus).toBe(true);
    expect(page.restoreOutputScrollAfterKeyboard).not.toHaveBeenCalled();
  });

  it("被动 blur 后若键盘真正收起，才兑现为真实失焦", () => {
    const { page } = createTerminalPageHarness();
    page.data.statusClass = "connected";
    page.data.shellInputFocus = true;
    page.keyboardVisibleHeightPx = 240;

    page.onShellInputBlur();
    page.handleShellKeyboardHeightChange(0);

    expect(page.shellInputPassiveBlurPending).toBe(false);
    expect(page.data.shellInputFocus).toBe(false);
    expect(page.restoreOutputScrollAfterKeyboard).toHaveBeenCalledTimes(1);
  });

  it("被动 blur 后若键盘继续保持可见，应清掉待定 blur 并继续保焦", () => {
    const { page } = createTerminalPageHarness();
    page.data.statusClass = "connected";
    page.data.shellInputFocus = true;
    page.keyboardVisibleHeightPx = 240;

    page.onShellInputBlur();
    page.handleShellKeyboardHeightChange(260);

    expect(page.shellInputPassiveBlurPending).toBe(false);
    expect(page.data.shellInputFocus).toBe(true);
    expect(page.adjustOutputScrollForKeyboard).toHaveBeenCalledTimes(1);
  });
});
