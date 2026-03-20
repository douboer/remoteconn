/* global module, setTimeout, clearTimeout */

function utf8ByteLength(text) {
  const value = String(text || "");
  let total = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x7f) {
      total += 1;
      continue;
    }
    if (code <= 0x7ff) {
      total += 2;
      continue;
    }
    if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        total += 4;
        index += 1;
        continue;
      }
    }
    total += 3;
  }
  return total;
}

/**
 * 统一规范终端渲染选项：
 * 目前页面层只暴露 `sendResize`，后续若增加其他布尔开关，也应在这里集中合并。
 */
function mergeTerminalRenderOptions(base, incoming) {
  const previous = base && typeof base === "object" ? base : {};
  const next = incoming && typeof incoming === "object" ? incoming : {};
  return {
    sendResize: !!(previous.sendResize || next.sendResize)
  };
}

function normalizeStdoutSample(sample) {
  const source = sample && typeof sample === "object" ? sample : {};
  const text = String(source.text || "");
  return {
    text,
    rawBytes: utf8ByteLength(text),
    appendStartedAt: Number(source.appendStartedAt) || 0,
    visibleBytes: Number(source.visibleBytes) || 0,
    visibleFrameCount: Number(source.visibleFrameCount) || 0
  };
}

function createPendingRequest(now) {
  return {
    options: mergeTerminalRenderOptions(),
    callbacks: [],
    stdoutSamples: [],
    requestedAt: now()
  };
}

/**
 * 终端渲染调度器职责只有两件事：
 * 1. stdout 高频输出时，按一个很短的窗口合并成一轮真实渲染；
 * 2. 若上一轮渲染尚未完成，只保留“下一轮需要再跑一次”的脏标记，避免把 scroll-view 刷新堆成风暴。
 *
 * 注意：
 * - 调度器不负责真正的布局/overlay 逻辑，页面层通过 `runRender` 注入；
 * - stdout 合批会把多段文本交给页面层一次性处理，再统一进入 layout/overlay。
 */
function createTerminalRenderScheduler(options) {
  const config = options && typeof options === "object" ? options : {};
  const now = typeof config.now === "function" ? config.now : () => Date.now();
  const setTimer = typeof config.setTimer === "function" ? config.setTimer : setTimeout;
  const clearTimer = typeof config.clearTimer === "function" ? config.clearTimer : clearTimeout;
  const onError = typeof config.onError === "function" ? config.onError : null;
  const batchWindowMs =
    Number.isFinite(Number(config.batchWindowMs)) && Number(config.batchWindowMs) >= 0
      ? Math.round(Number(config.batchWindowMs))
      : 16;
  const runRender = typeof config.runRender === "function" ? config.runRender : null;

  if (!runRender) {
    throw new TypeError("terminal render scheduler 缺少 runRender");
  }

  let inFlight = false;
  let stdoutTimer = null;
  let pendingRequest = null;
  let activeRequest = null;

  function reportError(error) {
    if (onError) {
      onError(error);
      return;
    }
    throw error;
  }

  function ensurePendingRequest() {
    if (!pendingRequest) {
      pendingRequest = createPendingRequest(now);
    }
    return pendingRequest;
  }

  function clearStdoutTimer() {
    if (!stdoutTimer) return;
    clearTimer(stdoutTimer);
    stdoutTimer = null;
  }

  function finalizeRequestCallbacks(request, result) {
    const callbacks = Array.isArray(request && request.callbacks) ? request.callbacks.slice() : [];
    callbacks.forEach((callback) => {
      if (typeof callback !== "function") return;
      try {
        callback(result, request);
      } catch (error) {
        reportError(error);
      }
    });
  }

  function buildRequestSnapshot(request, timestamp) {
    if (!request || typeof request !== "object") {
      return null;
    }
    const samples = Array.isArray(request.stdoutSamples) ? request.stdoutSamples : [];
    return {
      reason: String(request.reason || ""),
      requestedAt: Number(request.requestedAt) || 0,
      startedAt: Number(request.startedAt) || 0,
      waitMs:
        timestamp && Number(request.requestedAt)
          ? Math.max(0, (Number(request.startedAt) || Number(timestamp)) - Number(request.requestedAt))
          : 0,
      ageMs:
        timestamp && Number(request.startedAt)
          ? Math.max(0, Number(timestamp) - Number(request.startedAt))
          : 0,
      stdoutSampleCount: samples.length,
      stdoutRawBytes: samples.reduce(
        (sum, sample) => sum + Math.max(0, Number(sample && sample.rawBytes) || 0),
        0
      ),
      stdoutVisibleBytes: samples.reduce(
        (sum, sample) => sum + Math.max(0, Number(sample && sample.visibleBytes) || 0),
        0
      ),
      callbackCount: Array.isArray(request.callbacks) ? request.callbacks.length : 0
    };
  }

  function startNextRun(reason) {
    if (inFlight || !pendingRequest) {
      return false;
    }
    clearStdoutTimer();
    const request = pendingRequest;
    pendingRequest = null;
    request.reason = String(reason || "");
    request.startedAt = now();
    inFlight = true;
    activeRequest = request;
    try {
      runRender(request, (result) => {
        request.completedAt = now();
        inFlight = false;
        activeRequest = null;
        finalizeRequestCallbacks(request, result);
        if (pendingRequest) {
          startNextRun(pendingRequest.stdoutSamples.length > 0 ? "pending_stdout" : "pending_immediate");
        }
      });
    } catch (error) {
      inFlight = false;
      activeRequest = null;
      reportError(error);
      if (pendingRequest) {
        startNextRun("recover_after_error");
      }
    }
    return true;
  }

  function scheduleStdoutFlush() {
    if (inFlight || stdoutTimer || !pendingRequest) {
      return;
    }
    if (batchWindowMs <= 0) {
      startNextRun("stdout_immediate");
      return;
    }
    stdoutTimer = setTimer(() => {
      stdoutTimer = null;
      startNextRun("stdout_batch");
    }, batchWindowMs);
  }

  return {
    requestImmediate(options, callback) {
      const request = ensurePendingRequest();
      request.options = mergeTerminalRenderOptions(request.options, options);
      if (typeof callback === "function") {
        request.callbacks.push(callback);
      }
      clearStdoutTimer();
      if (!inFlight) {
        startNextRun("immediate");
      }
    },

    requestStdout(sample) {
      const request = ensurePendingRequest();
      request.stdoutSamples.push(normalizeStdoutSample(sample));
      scheduleStdoutFlush();
    },

    clearPending() {
      clearStdoutTimer();
      pendingRequest = null;
    },

    getSnapshot() {
      const timestamp = now();
      return {
        inFlight,
        pending: buildRequestSnapshot(pendingRequest, timestamp),
        active: buildRequestSnapshot(activeRequest, timestamp)
      };
    }
  };
}

module.exports = {
  createTerminalRenderScheduler,
  mergeTerminalRenderOptions
};
