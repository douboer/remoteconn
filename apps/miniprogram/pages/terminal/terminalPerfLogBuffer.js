/* global module, setTimeout, clearTimeout */

const PERF_SCORE_KEYS = [
  "totalCostMs",
  "costMs",
  "driftMs",
  "queueWaitMs",
  "schedulerWaitMs",
  "cloneCostMs",
  "setDataCostMs",
  "layoutCostMs",
  "overlayCostMs",
  "applyCostMs",
  "trimCostMs",
  "stateApplyCostMs",
  "buildCostMs",
  "renderBuildCostMs",
  "queryCostMs",
  "postLayoutCostMs",
  "waitMs",
  "batchWaitMs"
];

function pickPerfScore(record) {
  const source = record && typeof record === "object" ? record : {};
  let scoreMs = 0;
  for (let index = 0; index < PERF_SCORE_KEYS.length; index += 1) {
    const key = PERF_SCORE_KEYS[index];
    const value = Number(source[key]);
    if (Number.isFinite(value) && value > scoreMs) {
      scoreMs = value;
    }
  }
  return scoreMs;
}

function buildCompactRecord(record, scoreMs) {
  const source = record && typeof record === "object" ? record : {};
  const compact = {
    event: String(source.event || ""),
    scoreMs
  };
  for (let index = 0; index < PERF_SCORE_KEYS.length; index += 1) {
    const key = PERF_SCORE_KEYS[index];
    const value = Number(source[key]);
    if (Number.isFinite(value) && value > 0) {
      compact[key] = value;
    }
  }
  if (source.renderReason) {
    compact.renderReason = String(source.renderReason);
  }
  if (source.lastRenderDecisionReason) {
    compact.lastRenderDecisionReason = String(source.lastRenderDecisionReason);
  }
  if (source.lastRenderDecisionPolicy) {
    compact.lastRenderDecisionPolicy = String(source.lastRenderDecisionPolicy);
  }
  if (source.suspectedBottleneck) {
    compact.suspectedBottleneck = String(source.suspectedBottleneck);
  }
  if (Number.isFinite(Number(source.pendingStdoutSamples))) {
    compact.pendingStdoutSamples = Number(source.pendingStdoutSamples);
  }
  if (Number.isFinite(Number(source.pendingStdoutBytes))) {
    compact.pendingStdoutBytes = Number(source.pendingStdoutBytes);
  }
  if (Number.isFinite(Number(source.activeStdoutAgeMs))) {
    compact.activeStdoutAgeMs = Number(source.activeStdoutAgeMs);
  }
  if (Number.isFinite(Number(source.activeStdoutBytes))) {
    compact.activeStdoutBytes = Number(source.activeStdoutBytes);
  }
  if (Number.isFinite(Number(source.remainingBytes))) {
    compact.remainingBytes = Number(source.remainingBytes);
  }
  if (Number.isFinite(Number(source.sliceCount))) {
    compact.sliceCount = Number(source.sliceCount);
  }
  if (Number.isFinite(Number(source.chunkCount))) {
    compact.chunkCount = Number(source.chunkCount);
  }
  if (Number.isFinite(Number(source.renderRowCount))) {
    compact.renderRowCount = Number(source.renderRowCount);
  }
  if (Number.isFinite(Number(source.renderPassCount))) {
    compact.renderPassCount = Number(source.renderPassCount);
  }
  if (Number.isFinite(Number(source.layoutPassCount))) {
    compact.layoutPassCount = Number(source.layoutPassCount);
  }
  if (Number.isFinite(Number(source.overlayPassCount))) {
    compact.overlayPassCount = Number(source.overlayPassCount);
  }
  if (Number.isFinite(Number(source.deferredRenderPassCount))) {
    compact.deferredRenderPassCount = Number(source.deferredRenderPassCount);
  }
  if (Number.isFinite(Number(source.skippedOverlayPassCount))) {
    compact.skippedOverlayPassCount = Number(source.skippedOverlayPassCount);
  }
  if (Number.isFinite(Number(source.activeRowCount))) {
    compact.activeRowCount = Number(source.activeRowCount);
  }
  if (Number.isFinite(Number(source.activeCellCount))) {
    compact.activeCellCount = Number(source.activeCellCount);
  }
  if (Number.isFinite(Number(source.totalCellCount))) {
    compact.totalCellCount = Number(source.totalCellCount);
  }
  if (Number.isFinite(Number(source.layoutSeq))) {
    compact.layoutSeq = Number(source.layoutSeq);
  }
  if (Number.isFinite(Number(source.overlaySeq))) {
    compact.overlaySeq = Number(source.overlaySeq);
  }
  return compact;
}

function buildTopEvents(eventCounts) {
  return Object.entries(eventCounts || {})
    .sort((left, right) => {
      if (right[1] !== left[1]) {
        return right[1] - left[1];
      }
      return String(left[0]).localeCompare(String(right[0]));
    })
    .slice(0, 5)
    .map(([event, count]) => ({ event, count }));
}

/**
 * 终端 perf 日志默认按窗口聚合：
 * 1. 高频 stdout / layout / overlay 事件只在窗口结束时输出 1 条摘要；
 * 2. 摘要保留“最常见事件 + 最慢事件 + 最新事件”，便于复盘卡顿；
 * 3. 这样既能在真机上抓现场，又不会让 console 自身成为性能噪声。
 */
function createTerminalPerfLogBuffer(options) {
  const config = options && typeof options === "object" ? options : {};
  const now = typeof config.now === "function" ? config.now : () => Date.now();
  const setTimer = typeof config.setTimer === "function" ? config.setTimer : setTimeout;
  const clearTimer = typeof config.clearTimer === "function" ? config.clearTimer : clearTimeout;
  const write = typeof config.write === "function" ? config.write : null;
  const windowMs =
    Number.isFinite(Number(config.windowMs)) && Number(config.windowMs) >= 1000
      ? Math.round(Number(config.windowMs))
      : 5000;

  if (!write) {
    throw new TypeError("terminal perf log buffer 缺少 write");
  }

  let flushTimer = null;
  let bucket = null;

  function clearFlushTimer() {
    if (!flushTimer) {
      return;
    }
    clearTimer(flushTimer);
    flushTimer = null;
  }

  function ensureBucket(record) {
    if (bucket) {
      return bucket;
    }
    const startedAt = Number(record && record.at) || now();
    bucket = {
      startedAt,
      latestAt: startedAt,
      latestSinceLoadMs: Number(record && record.sinceLoadMs) || 0,
      latestStatus: String((record && record.status) || ""),
      count: 0,
      eventCounts: {},
      slowest: null,
      latest: null
    };
    flushTimer = setTimer(() => {
      flush("interval");
    }, windowMs);
    return bucket;
  }

  function push(record) {
    const source = record && typeof record === "object" ? record : {};
    const scoreMs = pickPerfScore(source);
    const activeBucket = ensureBucket(source);
    const event = String(source.event || "unknown");
    activeBucket.count += 1;
    activeBucket.eventCounts[event] = (activeBucket.eventCounts[event] || 0) + 1;
    activeBucket.latestAt = Number(source.at) || now();
    activeBucket.latestSinceLoadMs = Number(source.sinceLoadMs) || activeBucket.latestSinceLoadMs;
    activeBucket.latestStatus = String(source.status || activeBucket.latestStatus || "");
    activeBucket.latest = buildCompactRecord(source, scoreMs);
    if (!activeBucket.slowest || scoreMs >= Number(activeBucket.slowest.scoreMs || 0)) {
      activeBucket.slowest = buildCompactRecord(source, scoreMs);
    }
  }

  function flush(reason) {
    if (!bucket) {
      return null;
    }
    clearFlushTimer();
    const endedAt = now();
    const summary = {
      event: "perf.summary",
      reason: String(reason || "manual"),
      at: endedAt,
      sinceLoadMs: bucket.latestSinceLoadMs,
      status: bucket.latestStatus,
      windowMs: Math.max(0, endedAt - bucket.startedAt),
      count: bucket.count,
      topEvents: buildTopEvents(bucket.eventCounts),
      slowest: bucket.slowest,
      latest: bucket.latest
    };
    bucket = null;
    write(summary);
    return summary;
  }

  function clear() {
    clearFlushTimer();
    bucket = null;
  }

  return {
    push,
    flush,
    clear
  };
}

module.exports = {
  createTerminalPerfLogBuffer,
  pickPerfScore
};
