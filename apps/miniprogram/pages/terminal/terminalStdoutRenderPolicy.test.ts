import { describe, expect, it } from "vitest";

const {
  resolveTerminalStdoutOverlayDecision,
  resolveTerminalStdoutRenderDecision,
  shouldDeferTerminalStdoutRender
} = require("./terminalStdoutRenderPolicy.js");

describe("terminalStdoutRenderPolicy", () => {
  it("小 backlog 不会延后视图提交", () => {
    expect(
      shouldDeferTerminalStdoutRender({
        remainingBytes: 4096,
        pendingReplayBytes: 1024,
        nextSlicesSinceLastRender: 1,
        pendingResponseCount: 0,
        yieldedToUserInput: false
      })
    ).toBe(false);
  });

  it("中等 backlog 会先累计到阈值再提交", () => {
    expect(
      shouldDeferTerminalStdoutRender({
        remainingBytes: 24 * 1024,
        pendingReplayBytes: 3 * 1024,
        nextSlicesSinceLastRender: 3,
        pendingResponseCount: 0,
        yieldedToUserInput: false
      })
    ).toBe(true);
    expect(
      shouldDeferTerminalStdoutRender({
        remainingBytes: 24 * 1024,
        pendingReplayBytes: 8 * 1024,
        nextSlicesSinceLastRender: 3,
        pendingResponseCount: 0,
        yieldedToUserInput: false
      })
    ).toBe(false);
  });

  it("大 backlog 会使用更高阈值，避免频繁整包 setData", () => {
    expect(
      shouldDeferTerminalStdoutRender({
        remainingBytes: 512 * 1024,
        pendingReplayBytes: 16 * 1024,
        nextSlicesSinceLastRender: 12,
        pendingResponseCount: 0,
        yieldedToUserInput: false
      })
    ).toBe(true);
    expect(
      shouldDeferTerminalStdoutRender({
        remainingBytes: 512 * 1024,
        pendingReplayBytes: 16 * 1024,
        nextSlicesSinceLastRender: 32,
        pendingResponseCount: 0,
        yieldedToUserInput: false
      })
    ).toBe(false);
  });

  it("用户输入或终端响应存在时必须立即提交", () => {
    expect(
      shouldDeferTerminalStdoutRender({
        remainingBytes: 512 * 1024,
        pendingReplayBytes: 1024,
        nextSlicesSinceLastRender: 1,
        pendingResponseCount: 1,
        yieldedToUserInput: false
      })
    ).toBe(false);
    expect(
      shouldDeferTerminalStdoutRender({
        remainingBytes: 512 * 1024,
        pendingReplayBytes: 1024,
        nextSlicesSinceLastRender: 1,
        pendingResponseCount: 0,
        yieldedToUserInput: true
      })
    ).toBe(false);
  });

  it("会给出本轮提交或延后的决策原因，便于诊断 render 频率", () => {
    expect(
      resolveTerminalStdoutRenderDecision({
        remainingBytes: 512 * 1024,
        pendingReplayBytes: 1024,
        nextSlicesSinceLastRender: 1,
        pendingResponseCount: 0,
        yieldedToUserInput: true
      })
    ).toMatchObject({
      defer: false,
      reason: "user_input",
      policy: "interactive"
    });

    expect(
      resolveTerminalStdoutRenderDecision({
        remainingBytes: 24 * 1024,
        pendingReplayBytes: 3 * 1024,
        nextSlicesSinceLastRender: 3,
        pendingResponseCount: 0,
        yieldedToUserInput: false
      })
    ).toMatchObject({
      defer: true,
      reason: "defer_backlog",
      policy: "medium_backlog"
    });

    expect(
      resolveTerminalStdoutRenderDecision({
        remainingBytes: 24 * 1024,
        pendingReplayBytes: 8 * 1024,
        nextSlicesSinceLastRender: 3,
        pendingResponseCount: 0,
        yieldedToUserInput: false
      })
    ).toMatchObject({
      defer: false,
      reason: "pending_bytes_threshold",
      policy: "medium_backlog"
    });
  });

  it("render 冷却期间即使进入尾段，也会继续延后视图提交", () => {
    expect(
      resolveTerminalStdoutRenderDecision({
        remainingBytes: 4096,
        pendingReplayBytes: 2048,
        nextSlicesSinceLastRender: 2,
        pendingResponseCount: 0,
        yieldedToUserInput: false,
        timeSinceLastRenderMs: 80,
        taskDone: false
      })
    ).toMatchObject({
      defer: true,
      reason: "render_cooldown",
      policy: "medium_backlog"
    });

    expect(
      resolveTerminalStdoutRenderDecision({
        remainingBytes: 4096,
        pendingReplayBytes: 2048,
        nextSlicesSinceLastRender: 2,
        pendingResponseCount: 0,
        yieldedToUserInput: false,
        timeSinceLastRenderMs: 280,
        taskDone: false
      })
    ).toMatchObject({
      defer: false,
      reason: "remaining_below_threshold",
      policy: "medium_backlog"
    });

    expect(
      resolveTerminalStdoutRenderDecision({
        remainingBytes: 0,
        pendingReplayBytes: 1024,
        nextSlicesSinceLastRender: 2,
        pendingResponseCount: 0,
        yieldedToUserInput: false,
        timeSinceLastRenderMs: 20,
        taskDone: true
      })
    ).toMatchObject({
      defer: false,
      reason: "task_complete"
    });
  });

  it("高 backlog 时会进入更激进的降级模式，优先丢弃中间帧", () => {
    expect(
      resolveTerminalStdoutRenderDecision({
        remainingBytes: 4096,
        pendingReplayBytes: 4096,
        nextSlicesSinceLastRender: 4,
        pendingResponseCount: 0,
        yieldedToUserInput: false,
        timeSinceLastRenderMs: 600,
        taskDone: false,
        totalRawBytes: 80 * 1024,
        pendingStdoutBytes: 48 * 1024,
        pendingStdoutSamples: 160,
        schedulerWaitMs: 2400,
        activeStdoutAgeMs: 1800
      })
    ).toMatchObject({
      defer: true,
      reason: "defer_critical_backlog",
      policy: "critical_backlog"
    });

    expect(
      resolveTerminalStdoutRenderDecision({
        remainingBytes: 4096,
        pendingReplayBytes: 28 * 1024,
        nextSlicesSinceLastRender: 4,
        pendingResponseCount: 0,
        yieldedToUserInput: false,
        timeSinceLastRenderMs: 600,
        taskDone: false,
        totalRawBytes: 80 * 1024,
        pendingStdoutBytes: 48 * 1024,
        pendingStdoutSamples: 160,
        schedulerWaitMs: 2400,
        activeStdoutAgeMs: 1800
      })
    ).toMatchObject({
      defer: false,
      reason: "pending_bytes_threshold",
      policy: "critical_backlog"
    });

    expect(
      resolveTerminalStdoutRenderDecision({
        remainingBytes: 4096,
        pendingReplayBytes: 4096,
        nextSlicesSinceLastRender: 24,
        pendingResponseCount: 0,
        yieldedToUserInput: false,
        timeSinceLastRenderMs: 600,
        taskDone: false,
        totalRawBytes: 80 * 1024,
        pendingStdoutBytes: 48 * 1024,
        pendingStdoutSamples: 160,
        schedulerWaitMs: 2400,
        activeStdoutAgeMs: 1800
      })
    ).toMatchObject({
      defer: false,
      reason: "slice_threshold",
      policy: "critical_backlog"
    });
  });

  it("stdout 持续输出时会对 overlay 做节流，但最终一帧仍会同步", () => {
    expect(
      resolveTerminalStdoutOverlayDecision({
        isFinalRender: false,
        yieldedToUserInput: false,
        overlayPassCount: 0,
        timeSinceLastOverlayMs: 0
      })
    ).toMatchObject({
      sync: true,
      reason: "first_render"
    });

    expect(
      resolveTerminalStdoutOverlayDecision({
        isFinalRender: false,
        yieldedToUserInput: false,
        overlayPassCount: 2,
        timeSinceLastOverlayMs: 80
      })
    ).toMatchObject({
      sync: false,
      reason: "overlay_throttled"
    });

    expect(
      resolveTerminalStdoutOverlayDecision({
        isFinalRender: false,
        yieldedToUserInput: false,
        overlayPassCount: 2,
        timeSinceLastOverlayMs: 260
      })
    ).toMatchObject({
      sync: true,
      reason: "overlay_cooldown_elapsed"
    });

    expect(
      resolveTerminalStdoutOverlayDecision({
        isFinalRender: true,
        yieldedToUserInput: false,
        overlayPassCount: 2,
        timeSinceLastOverlayMs: 80
      })
    ).toMatchObject({
      sync: true,
      reason: "task_complete"
    });
  });
});
