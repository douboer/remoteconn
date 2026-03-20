import { describe, expect, it, vi } from "vitest";
import { createAssistTxnDeduper } from "./assistTxnDeduper";

describe("assistTxnDeduper", () => {
  it("仅对 assist + txnId 生效，其它输入不去重", () => {
    const dedupe = createAssistTxnDeduper({ ttlMs: 1000, cacheLimit: 4 });

    expect(dedupe("keyboard", "a")).toBe(false);
    expect(dedupe("assist", undefined)).toBe(false);
    expect(dedupe(undefined, "a")).toBe(false);
  });

  it("相同 txnId 在 ttl 内应判定为重复", () => {
    const dedupe = createAssistTxnDeduper({ ttlMs: 1000, cacheLimit: 4 });

    expect(dedupe("assist", "txn-1")).toBe(false);
    expect(dedupe("assist", "txn-1")).toBe(true);
  });

  it("超过 ttl 后同一 txnId 可重新通过", () => {
    vi.useFakeTimers();
    try {
      const dedupe = createAssistTxnDeduper({ ttlMs: 1000, cacheLimit: 4 });
      expect(dedupe("assist", "txn-1")).toBe(false);

      vi.advanceTimersByTime(1001);
      expect(dedupe("assist", "txn-1")).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("超过 cacheLimit 时应淘汰最旧记录", () => {
    const dedupe = createAssistTxnDeduper({ ttlMs: 60_000, cacheLimit: 2 });

    expect(dedupe("assist", "txn-1")).toBe(false);
    expect(dedupe("assist", "txn-2")).toBe(false);
    expect(dedupe("assist", "txn-3")).toBe(false);

    expect(dedupe("assist", "txn-2")).toBe(true);
    expect(dedupe("assist", "txn-3")).toBe(true);
    expect(dedupe("assist", "txn-1")).toBe(false);
  });
});
