import { describe, expect, it } from "vitest";
import {
  clearDynamicImportRetryMark,
  isDynamicImportFailure,
  shouldRetryDynamicImportReload
} from "./dynamicImportGuard";

interface MemoryStorage {
  map: Map<string, string>;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function createMemoryStorage(): MemoryStorage {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    }
  };
}

describe("dynamicImportGuard", () => {
  it("可识别 Safari 的模块脚本导入失败文案", () => {
    expect(isDynamicImportFailure(new TypeError("Importing a module script failed."))).toBe(true);
  });

  it("可识别 Chromium 的动态模块加载失败文案", () => {
    expect(isDynamicImportFailure(new Error("Failed to fetch dynamically imported module"))).toBe(true);
  });

  it("非动态导入错误不应误判", () => {
    expect(isDynamicImportFailure(new Error("network timeout"))).toBe(false);
    expect(isDynamicImportFailure("")).toBe(false);
  });

  it("重试窗口内仅允许一次自动刷新", () => {
    const storage = createMemoryStorage();
    const now = 1_000_000;

    expect(shouldRetryDynamicImportReload(storage, now, 15_000)).toBe(true);
    expect(shouldRetryDynamicImportReload(storage, now + 5_000, 15_000)).toBe(false);
    expect(shouldRetryDynamicImportReload(storage, now + 16_000, 15_000)).toBe(true);
  });

  it("清理重试标记后可重新允许刷新", () => {
    const storage = createMemoryStorage();
    const now = 2_000_000;

    expect(shouldRetryDynamicImportReload(storage, now, 15_000)).toBe(true);
    clearDynamicImportRetryMark(storage);
    expect(shouldRetryDynamicImportReload(storage, now + 1_000, 15_000)).toBe(true);
  });
});
