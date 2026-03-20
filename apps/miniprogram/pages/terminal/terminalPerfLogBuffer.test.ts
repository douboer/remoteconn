import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createTerminalPerfLogBuffer, pickPerfScore } = require("./terminalPerfLogBuffer.js");

describe("terminalPerfLogBuffer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("会从常见耗时字段中选出最大的 score", () => {
    expect(
      pickPerfScore({
        totalCostMs: 120,
        setDataCostMs: 320,
        overlayCostMs: 180
      })
    ).toBe(320);
    expect(
      pickPerfScore({
        applyCostMs: 220,
        trimCostMs: 380,
        cloneCostMs: 260
      })
    ).toBe(380);
  });

  it("会把 5 秒窗口内的高频事件聚合成 1 条摘要", () => {
    const writes = [];
    const buffer = createTerminalPerfLogBuffer({
      windowMs: 5000,
      write(summary) {
        writes.push(summary);
      }
    });

    buffer.push({
      event: "stdout.slice",
      at: 1000,
      sinceLoadMs: 100,
      status: "connected",
      totalCostMs: 240
    });
    buffer.push({
      event: "layout.refresh.long",
      at: 1800,
      sinceLoadMs: 900,
      status: "connected",
      totalCostMs: 1400,
      setDataCostMs: 1200
    });
    buffer.push({
      event: "stdout.slice",
      at: 2200,
      sinceLoadMs: 1300,
      status: "connected",
      totalCostMs: 180
    });

    vi.advanceTimersByTime(5000);

    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({
      event: "perf.summary",
      count: 3,
      status: "connected"
    });
    expect(writes[0].topEvents[0]).toEqual({ event: "stdout.slice", count: 2 });
    expect(writes[0].slowest).toMatchObject({
      event: "layout.refresh.long",
      scoreMs: 1400
    });
    expect(writes[0].latest).toMatchObject({
      event: "stdout.slice"
    });
  });

  it("支持在页面收起前手动 flush，避免丢掉最后一个窗口", () => {
    const writes = [];
    const buffer = createTerminalPerfLogBuffer({
      windowMs: 5000,
      write(summary) {
        writes.push(summary);
      }
    });

    buffer.push({
      event: "overlay.sync.long",
      at: 3000,
      sinceLoadMs: 2000,
      status: "connected",
      costMs: 65000
    });

    const summary = buffer.flush("page_hide");

    expect(summary).toMatchObject({
      event: "perf.summary",
      reason: "page_hide",
      count: 1
    });
    expect(writes).toHaveLength(1);
  });
});
