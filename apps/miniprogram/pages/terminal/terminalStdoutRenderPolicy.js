/* global module */

const MEDIUM_BACKLOG_MIN_REMAINING_BYTES = 8 * 1024;
const MEDIUM_BACKLOG_MIN_PENDING_BYTES = 8 * 1024;
const MEDIUM_BACKLOG_MAX_SLICES = 8;
const MEDIUM_BACKLOG_RENDER_COOLDOWN_MS = 220;

const LARGE_BACKLOG_MIN_REMAINING_BYTES = 64 * 1024;
const LARGE_BACKLOG_MIN_PENDING_BYTES = 32 * 1024;
const LARGE_BACKLOG_MAX_SLICES = 32;
const LARGE_BACKLOG_RENDER_COOLDOWN_MS = 320;

const CRITICAL_BACKLOG_MIN_TOTAL_BYTES = 64 * 1024;
const CRITICAL_BACKLOG_MIN_PENDING_BYTES = 24 * 1024;
const CRITICAL_BACKLOG_MIN_PENDING_SAMPLES = 128;
const CRITICAL_BACKLOG_MIN_SCHEDULER_WAIT_MS = 1200;
const CRITICAL_BACKLOG_MIN_ACTIVE_AGE_MS = 1200;
const CRITICAL_BACKLOG_FRAME_PENDING_BYTES = 24 * 1024;
const CRITICAL_BACKLOG_FRAME_MAX_SLICES = 20;
const CRITICAL_BACKLOG_RENDER_COOLDOWN_MS = 520;

const STDOUT_OVERLAY_SYNC_COOLDOWN_MS = 240;

function normalizeNonNegativeInteger(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return Math.max(0, Math.round(Number(fallback) || 0));
  }
  return Math.max(0, Math.round(numeric));
}

function shouldUseCriticalBacklogPolicy(options) {
  const source = options && typeof options === "object" ? options : {};
  const totalRawBytes = normalizeNonNegativeInteger(source.totalRawBytes, 0);
  const pendingStdoutBytes = normalizeNonNegativeInteger(source.pendingStdoutBytes, 0);
  const pendingStdoutSamples = normalizeNonNegativeInteger(source.pendingStdoutSamples, 0);
  const schedulerWaitMs = normalizeNonNegativeInteger(source.schedulerWaitMs, 0);
  const activeStdoutAgeMs = normalizeNonNegativeInteger(source.activeStdoutAgeMs, 0);
  return (
    pendingStdoutBytes >= CRITICAL_BACKLOG_MIN_PENDING_BYTES ||
    pendingStdoutSamples >= CRITICAL_BACKLOG_MIN_PENDING_SAMPLES ||
    schedulerWaitMs >= CRITICAL_BACKLOG_MIN_SCHEDULER_WAIT_MS ||
    (totalRawBytes >= CRITICAL_BACKLOG_MIN_TOTAL_BYTES &&
      activeStdoutAgeMs >= CRITICAL_BACKLOG_MIN_ACTIVE_AGE_MS)
  );
}

/**
 * stdout 的真正瓶颈不是 VT 解析，而是每个 slice 都把整份 `outputRenderLines`
 * 重新通过 `setData` 送去视图层。
 *
 * 这里按 backlog 做两档降频：
 * 1. 中等 backlog：累计到 8KB 或 8 个 slice 再提交一次；
 * 2. 大 backlog：累计到 32KB 或 32 个 slice 再提交一次。
 *
 * 若用户刚有输入，或当前 slice 触发了终端响应帧，则立即提交，避免交互被延后。
 */
function resolveTerminalStdoutRenderDecision(options) {
  const source = options && typeof options === "object" ? options : {};
  if (source.yieldedToUserInput) {
    return {
      defer: false,
      reason: "user_input",
      policy: "interactive"
    };
  }
  if (normalizeNonNegativeInteger(source.pendingResponseCount, 0) > 0) {
    return {
      defer: false,
      reason: "pending_response",
      policy: "interactive"
    };
  }

  const remainingBytes = normalizeNonNegativeInteger(source.remainingBytes, 0);
  const pendingReplayBytes = normalizeNonNegativeInteger(source.pendingReplayBytes, 0);
  const nextSlicesSinceLastRender = normalizeNonNegativeInteger(source.nextSlicesSinceLastRender, 0);
  const timeSinceLastRenderMs = normalizeNonNegativeInteger(
    source.timeSinceLastRenderMs,
    Number.MAX_SAFE_INTEGER
  );
  const taskDone = !!source.taskDone;
  const usingCriticalPolicy = shouldUseCriticalBacklogPolicy(source);

  if (usingCriticalPolicy) {
    if (taskDone) {
      return {
        defer: false,
        reason: "task_complete",
        policy: "critical_backlog"
      };
    }
    if (
      nextSlicesSinceLastRender > 0 &&
      timeSinceLastRenderMs < CRITICAL_BACKLOG_RENDER_COOLDOWN_MS
    ) {
      return {
        defer: true,
        reason: "render_cooldown",
        policy: "critical_backlog"
      };
    }
    if (pendingReplayBytes >= CRITICAL_BACKLOG_FRAME_PENDING_BYTES) {
      return {
        defer: false,
        reason: "pending_bytes_threshold",
        policy: "critical_backlog"
      };
    }
    if (nextSlicesSinceLastRender >= CRITICAL_BACKLOG_FRAME_MAX_SLICES) {
      return {
        defer: false,
        reason: "slice_threshold",
        policy: "critical_backlog"
      };
    }
    return {
      defer: true,
      reason: "defer_critical_backlog",
      policy: "critical_backlog"
    };
  }

  const usingLargePolicy =
    remainingBytes >= LARGE_BACKLOG_MIN_REMAINING_BYTES ||
    pendingReplayBytes >= LARGE_BACKLOG_MIN_PENDING_BYTES;
  const minRemainingBytes = usingLargePolicy
    ? LARGE_BACKLOG_MIN_REMAINING_BYTES
    : MEDIUM_BACKLOG_MIN_REMAINING_BYTES;
  const minPendingBytes = usingLargePolicy
    ? LARGE_BACKLOG_MIN_PENDING_BYTES
    : MEDIUM_BACKLOG_MIN_PENDING_BYTES;
  const maxSlicesSinceRender = usingLargePolicy ? LARGE_BACKLOG_MAX_SLICES : MEDIUM_BACKLOG_MAX_SLICES;
  const renderCooldownMs = usingLargePolicy
    ? LARGE_BACKLOG_RENDER_COOLDOWN_MS
    : MEDIUM_BACKLOG_RENDER_COOLDOWN_MS;
  const policy = usingLargePolicy ? "large_backlog" : "medium_backlog";

  if (taskDone) {
    return {
      defer: false,
      reason: "task_complete",
      policy
    };
  }

  if (
    nextSlicesSinceLastRender > 0 &&
    timeSinceLastRenderMs < renderCooldownMs &&
    pendingReplayBytes < minPendingBytes &&
    nextSlicesSinceLastRender < maxSlicesSinceRender
  ) {
    return {
      defer: true,
      reason: "render_cooldown",
      policy
    };
  }

  if (remainingBytes < minRemainingBytes) {
    return {
      defer: false,
      reason: "remaining_below_threshold",
      policy
    };
  }
  if (pendingReplayBytes >= minPendingBytes) {
    return {
      defer: false,
      reason: "pending_bytes_threshold",
      policy
    };
  }
  if (nextSlicesSinceLastRender >= maxSlicesSinceRender) {
    return {
      defer: false,
      reason: "slice_threshold",
      policy
    };
  }
  return {
    defer: true,
    reason: "defer_backlog",
    policy
  };
}

function resolveTerminalStdoutOverlayDecision(options) {
  const source = options && typeof options === "object" ? options : {};
  if (source.isFinalRender) {
    return {
      sync: true,
      reason: "task_complete"
    };
  }
  if (source.yieldedToUserInput) {
    return {
      sync: true,
      reason: "user_input"
    };
  }
  const overlayPassCount = normalizeNonNegativeInteger(source.overlayPassCount, 0);
  if (overlayPassCount <= 0) {
    return {
      sync: true,
      reason: "first_render"
    };
  }
  const timeSinceLastOverlayMs = normalizeNonNegativeInteger(
    source.timeSinceLastOverlayMs,
    Number.MAX_SAFE_INTEGER
  );
  if (timeSinceLastOverlayMs >= STDOUT_OVERLAY_SYNC_COOLDOWN_MS) {
    return {
      sync: true,
      reason: "overlay_cooldown_elapsed"
    };
  }
  return {
    sync: false,
    reason: "overlay_throttled"
  };
}

function shouldDeferTerminalStdoutRender(options) {
  return resolveTerminalStdoutRenderDecision(options).defer;
}

module.exports = {
  resolveTerminalStdoutOverlayDecision,
  resolveTerminalStdoutRenderDecision,
  shouldDeferTerminalStdoutRender
};
