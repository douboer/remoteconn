import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type ConnectPageOptions = {
  data: Record<string, unknown>;
  onServerTouchStart?: (event: Record<string, unknown>) => void;
  onServerTouchMove?: (event: Record<string, unknown>) => void;
  onServerTouchEnd?: (event: Record<string, unknown>) => void;
  closeOtherServerRows?: (exceptId: string) => void;
  findFilteredServerIndexById?: (id: string) => number;
  updateServerSwipeOffset?: (id: string, offset: number) => void;
  clampServerSwipeOffset?: (offset: number) => number;
  resolveTouchPoint?: (event: Record<string, unknown>) => { x: number; y: number } | null;
};

type ConnectTestHelpers = {
  pageOptions: ConnectPageOptions;
  resolveServerSwipeRevealPx: (windowWidth: number) => number;
  clampServerSwipeOffset: (offset: number, revealPx: number) => number;
  shouldOpenServerSwipe: (offset: number, revealPx: number) => boolean;
};

type MiniprogramGlobals = typeof globalThis & {
  Page?: (options: ConnectPageOptions) => void;
  wx?: {
    getWindowInfo?: () => { windowWidth: number; windowHeight: number };
  };
};

function createTouchEvent(id: string, x: number, y: number) {
  return {
    currentTarget: {
      dataset: { id }
    },
    touches: [{ clientX: x, clientY: y }],
    changedTouches: [{ clientX: x, clientY: y }]
  };
}

/**
 * 测试里只需要覆盖当前页面真正会写入的 `setData` 路径：
 * 1. 直接字段，如 `dragActive`；
 * 2. `filteredServers[0].swipeOffsetX` 这类列表项字段。
 */
function applySetData(target: Record<string, unknown>, updates: Record<string, unknown>) {
  Object.entries(updates).forEach(([path, value]) => {
    const itemMatch = path.match(/^filteredServers\[(\d+)\]\.([a-zA-Z0-9_]+)$/);
    if (itemMatch) {
      const index = Number(itemMatch[1]);
      const key = itemMatch[2];
      const rows = target.filteredServers as Array<Record<string, unknown>>;
      rows[index][key] = value;
      return;
    }
    target[path] = value;
  });
}

function createFakePage(options: ConnectPageOptions) {
  const page = {
    ...options,
    data: {
      ...options.data,
      dragActive: false,
      filteredServers: [
        {
          id: "srv-1",
          swipeOffsetX: 0
        }
      ]
    },
    swipeOffsets: { "srv-1": 0 },
    swipeRuntime: null as Record<string, unknown> | null,
    serverSwipeRevealPx: 120,
    setData(updates: Record<string, unknown>) {
      applySetData(this.data as Record<string, unknown>, updates);
    },
    getServerSwipeRevealPx() {
      return 120;
    }
  };
  return page;
}

describe("connect page swipe", () => {
  const globalState = globalThis as MiniprogramGlobals;
  const originalPage = globalState.Page;
  const originalWx = globalState.wx;
  let testHelpers: ConnectTestHelpers | null = null;

  beforeEach(() => {
    testHelpers = null;
    vi.resetModules();
    globalState.Page = vi.fn((options: ConnectPageOptions) => {
      return options;
    });
    globalState.wx = {
      getWindowInfo: vi.fn(() => ({ windowWidth: 375, windowHeight: 812 }))
    };
    testHelpers = require("./index.js").__test__;
  });

  afterEach(() => {
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

  it("应按窗口宽度把删除动作区从 rpx 换算成 px", () => {
    expect(testHelpers).toBeTruthy();
    expect(testHelpers?.resolveServerSwipeRevealPx(375)).toBe(120);
    expect(testHelpers?.resolveServerSwipeRevealPx(0)).toBeGreaterThan(0);
  });

  it("横向左滑超过阈值后应展开删除按钮", () => {
    expect(testHelpers?.pageOptions).toBeTruthy();
    const page = createFakePage(testHelpers?.pageOptions as ConnectPageOptions);

    testHelpers?.pageOptions.onServerTouchStart?.call(page, createTouchEvent("srv-1", 220, 100));
    testHelpers?.pageOptions.onServerTouchMove?.call(page, createTouchEvent("srv-1", 160, 103));
    expect((page.data.filteredServers as Array<Record<string, unknown>>)[0].swipeOffsetX).toBe(-60);

    testHelpers?.pageOptions.onServerTouchEnd?.call(page, createTouchEvent("srv-1", 160, 103));
    expect((page.data.filteredServers as Array<Record<string, unknown>>)[0].swipeOffsetX).toBe(-120);
  });

  it("纵向滚动手势不应误展开删除按钮", () => {
    expect(testHelpers?.pageOptions).toBeTruthy();
    const page = createFakePage(testHelpers?.pageOptions as ConnectPageOptions);

    testHelpers?.pageOptions.onServerTouchStart?.call(page, createTouchEvent("srv-1", 220, 100));
    testHelpers?.pageOptions.onServerTouchMove?.call(page, createTouchEvent("srv-1", 214, 136));
    testHelpers?.pageOptions.onServerTouchEnd?.call(page, createTouchEvent("srv-1", 214, 136));

    expect((page.data.filteredServers as Array<Record<string, unknown>>)[0].swipeOffsetX).toBe(0);
  });

  it("开合阈值应与当前动作区宽度一致", () => {
    expect(testHelpers?.clampServerSwipeOffset(-160, 120)).toBe(-120);
    expect(testHelpers?.clampServerSwipeOffset(12, 120)).toBe(0);
    expect(testHelpers?.shouldOpenServerSwipe(-60, 120)).toBe(true);
    expect(testHelpers?.shouldOpenServerSwipe(-40, 120)).toBe(false);
  });
});
