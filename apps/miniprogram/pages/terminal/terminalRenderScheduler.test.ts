import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createTerminalRenderScheduler, mergeTerminalRenderOptions } = require("./terminalRenderScheduler.js");

describe("terminalRenderScheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("会把渲染选项按单一真相源合并", () => {
    expect(mergeTerminalRenderOptions(null, null)).toEqual({ sendResize: false });
    expect(mergeTerminalRenderOptions({ sendResize: false }, { sendResize: true })).toEqual({
      sendResize: true
    });
    expect(mergeTerminalRenderOptions({ sendResize: true }, { sendResize: false })).toEqual({
      sendResize: true
    });
  });

  it("stdout 高频输出会在一个批窗口内合并成一次渲染", () => {
    const runs = [];
    const scheduler = createTerminalRenderScheduler({
      batchWindowMs: 16,
      runRender(request, done) {
        runs.push(request);
        done({ ok: true });
      }
    });

    scheduler.requestStdout({ appendStartedAt: 10, visibleBytes: 12 });
    scheduler.requestStdout({ appendStartedAt: 12, visibleBytes: 18 });

    expect(runs).toHaveLength(0);

    vi.advanceTimersByTime(16);

    expect(runs).toHaveLength(1);
    expect(runs[0].reason).toBe("stdout_batch");
    expect(runs[0].stdoutSamples).toHaveLength(2);
    expect(runs[0].stdoutSamples[0]).toMatchObject({ appendStartedAt: 10, visibleBytes: 12 });
    expect(runs[0].stdoutSamples[1]).toMatchObject({ appendStartedAt: 12, visibleBytes: 18 });
  });

  it("进行中的渲染完成后，只会补跑一轮合并后的后续请求", () => {
    const runs = [];
    const finishes = [];
    const callbackMarks = [];
    const scheduler = createTerminalRenderScheduler({
      batchWindowMs: 16,
      runRender(request, done) {
        runs.push(request);
        finishes.push(done);
      }
    });

    scheduler.requestImmediate({}, (_result, request) => {
      callbackMarks.push(`first:${request.reason}`);
    });
    expect(runs).toHaveLength(1);

    scheduler.requestImmediate({ sendResize: true }, (_result, request) => {
      callbackMarks.push(`second:${request.reason}:${request.stdoutSamples.length}`);
    });
    scheduler.requestStdout({ appendStartedAt: 20, visibleBytes: 5 });

    expect(runs).toHaveLength(1);

    finishes.shift()({ ok: true });

    expect(runs).toHaveLength(2);
    expect(runs[1].reason).toBe("pending_stdout");
    expect(runs[1].options).toEqual({ sendResize: true });
    expect(runs[1].stdoutSamples).toHaveLength(1);

    finishes.shift()({ ok: true });

    expect(callbackMarks).toEqual(["first:immediate", "second:pending_stdout:1"]);
  });

  it("普通立即渲染会抢占尚未触发的 stdout 定时批处理", () => {
    const runs = [];
    const scheduler = createTerminalRenderScheduler({
      batchWindowMs: 16,
      runRender(request, done) {
        runs.push(request);
        done({ ok: true });
      }
    });

    scheduler.requestStdout({ appendStartedAt: 10, visibleBytes: 3 });
    scheduler.requestImmediate({ sendResize: true });

    expect(runs).toHaveLength(1);
    expect(runs[0].reason).toBe("immediate");
    expect(runs[0].options).toEqual({ sendResize: true });
    expect(runs[0].stdoutSamples).toHaveLength(1);

    vi.advanceTimersByTime(16);

    expect(runs).toHaveLength(1);
  });

  it("支持输出当前 pending 与 in-flight 的调度快照，便于慢场景诊断", () => {
    const finishes = [];
    let now = 100;
    const scheduler = createTerminalRenderScheduler({
      batchWindowMs: 16,
      now: () => now,
      runRender(request, done) {
        finishes.push(done);
      }
    });

    scheduler.requestStdout({ text: "你好", appendStartedAt: 80, visibleBytes: 6 });
    now = 140;
    expect(scheduler.getSnapshot()).toMatchObject({
      inFlight: false,
      pending: {
        waitMs: 40,
        stdoutSampleCount: 1,
        stdoutRawBytes: 6
      },
      active: null
    });

    vi.advanceTimersByTime(16);
    now = 180;
    expect(scheduler.getSnapshot()).toMatchObject({
      inFlight: true,
      pending: null,
      active: {
        reason: "stdout_batch",
        ageMs: 40,
        waitMs: 40,
        stdoutSampleCount: 1,
        stdoutRawBytes: 6
      }
    });

    finishes.shift()({ ok: true });
    expect(scheduler.getSnapshot()).toMatchObject({
      inFlight: false,
      pending: null,
      active: null
    });
  });
});
