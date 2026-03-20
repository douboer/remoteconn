import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = process.cwd();
const TERMINAL_PAGE_PATH = path.join(ROOT, "apps/miniprogram/pages/terminal/index.js");
const TERMINAL_FIXTURE_PATH = path.join(ROOT, "apps/miniprogram/pages/terminal/codexCaptureFixture.js");
const TERMINAL_BUFFER_STATE_PATH = path.join(
  ROOT,
  "apps/miniprogram/pages/terminal/terminalBufferState.js"
);

const DEFAULT_CHUNK_SIZE = 97;
const DEFAULT_CADENCE_MS = 8;
const DEFAULT_REPEAT = 4;
const DEFAULT_SETTLE_MS = 1600;
const DEFAULT_CAPTURE_SPEED = 1;
const DEFAULT_RECT = Object.freeze({
  left: 0,
  top: 0,
  right: 375,
  bottom: 520,
  width: 375,
  height: 520
});

function parsePositiveInteger(raw, fallback) {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return Math.round(value);
}

function parseArgs(argv) {
  const args = Array.isArray(argv) ? argv : [];
  const parsed = {
    chunkSize: DEFAULT_CHUNK_SIZE,
    cadenceMs: DEFAULT_CADENCE_MS,
    repeat: DEFAULT_REPEAT,
    settleMs: DEFAULT_SETTLE_MS,
    fixture: "20260311",
    captureFile: "",
    captureSpeed: DEFAULT_CAPTURE_SPEED,
    quiet: false
  };
  args.forEach((item) => {
    const source = String(item || "");
    if (!source.startsWith("--")) {
      return;
    }
    const [key, rawValue = ""] = source.slice(2).split("=");
    if (key === "chunk-size") {
      parsed.chunkSize = parsePositiveInteger(rawValue, DEFAULT_CHUNK_SIZE);
      return;
    }
    if (key === "cadence-ms") {
      parsed.cadenceMs = Math.max(0, parsePositiveInteger(rawValue, DEFAULT_CADENCE_MS));
      return;
    }
    if (key === "repeat") {
      parsed.repeat = parsePositiveInteger(rawValue, DEFAULT_REPEAT);
      return;
    }
    if (key === "settle-ms") {
      parsed.settleMs = Math.max(0, parsePositiveInteger(rawValue, DEFAULT_SETTLE_MS));
      return;
    }
    if (key === "fixture" && rawValue) {
      parsed.fixture = rawValue;
      return;
    }
    if (key === "capture-file" && rawValue) {
      parsed.captureFile = path.isAbsolute(rawValue) ? rawValue : path.join(ROOT, rawValue);
      return;
    }
    if (key === "capture-speed") {
      const value = Number(rawValue);
      parsed.captureSpeed = Number.isFinite(value) && value > 0 ? value : DEFAULT_CAPTURE_SPEED;
      return;
    }
    if (key === "quiet") {
      parsed.quiet = rawValue !== "false";
    }
  });
  return parsed;
}

function splitTextIntoChunks(text, chunkSize) {
  const chunks = [];
  const size = Math.max(1, parsePositiveInteger(chunkSize, DEFAULT_CHUNK_SIZE));
  for (let index = 0; index < text.length; index += size) {
    chunks.push(text.slice(index, index + size));
  }
  return chunks;
}

function wait(ms) {
  const delay = Math.max(0, Number(ms) || 0);
  return new Promise((resolve) => {
    setTimeout(resolve, delay);
  });
}

function loadCaptureRecording(filePath) {
  const resolvedPath = path.isAbsolute(filePath) ? filePath : path.join(ROOT, filePath);
  const lines = fs
    .readFileSync(resolvedPath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean);
  const events = [];
  let meta = null;

  lines.forEach((line, index) => {
    let parsed = null;
    try {
      parsed = JSON.parse(line);
    } catch (error) {
      throw new Error(`录制文件解析失败，第 ${index + 1} 行不是合法 JSON: ${(error && error.message) || error}`);
    }
    if (!parsed || typeof parsed !== "object") {
      return;
    }
    if (parsed.kind === "meta") {
      meta = parsed;
      return;
    }
    if (parsed.kind === "frame" && typeof parsed.type === "string" && typeof parsed.data === "string") {
      events.push({
        offsetMs: Math.max(0, Number(parsed.offsetMs) || 0),
        type: parsed.type,
        data: parsed.data
      });
    }
  });

  return {
    filePath: resolvedPath,
    meta,
    events
  };
}

function cloneRect(rect) {
  const source = rect && typeof rect === "object" ? rect : DEFAULT_RECT;
  return {
    left: Number(source.left) || 0,
    top: Number(source.top) || 0,
    right: Number(source.right) || 0,
    bottom: Number(source.bottom) || 0,
    width: Number(source.width) || DEFAULT_RECT.width,
    height: Number(source.height) || DEFAULT_RECT.height
  };
}

function createSelectorQueryStub() {
  const queue = [];
  const api = {
    in() {
      return api;
    },
    select() {
      return {
        boundingClientRect(callback) {
          queue.push({
            type: "rect",
            callback: typeof callback === "function" ? callback : null
          });
          return api;
        },
        scrollOffset(callback) {
          queue.push({
            type: "scroll",
            callback: typeof callback === "function" ? callback : null
          });
          return api;
        }
      };
    },
    exec(callback) {
      const results = queue.map((item) =>
        item.type === "rect"
          ? cloneRect(DEFAULT_RECT)
          : {
              scrollTop: 0,
              scrollLeft: 0
            }
      );
      queue.forEach((item, index) => {
        if (item.callback) {
          item.callback(results[index]);
        }
      });
      if (typeof callback === "function") {
        callback(results);
      }
    }
  };
  return api;
}

function installMiniprogramGlobals() {
  const globalState = globalThis;
  const previousPage = globalState.Page;
  const previousWx = globalState.wx;
  let capturedPageOptions = null;
  const noop = () => {};
  // 回放脚本只需要一个轻量的内存存储桩，避免触发真实小程序存储分支。
  const storage = new Map();

  globalState.Page = (options) => {
    capturedPageOptions = options;
  };
  globalState.wx = {
    env: {
      USER_DATA_PATH: "/tmp"
    },
    getRecorderManager: () => ({
      onStart: noop,
      onStop: noop,
      onError: noop,
      onFrameRecorded: noop,
      start: noop,
      stop: noop
    }),
    createInnerAudioContext: () => ({
      onCanplay: noop,
      onPlay: noop,
      onEnded: noop,
      onStop: noop,
      onError: noop,
      stop: noop,
      destroy: noop
    }),
    setInnerAudioOption: noop,
    createSelectorQuery: () => createSelectorQueryStub(),
    nextTick: (callback) => {
      if (typeof callback === "function") {
        callback();
      }
    },
    getSystemInfoSync: () => ({
      windowWidth: DEFAULT_RECT.width,
      windowHeight: 667,
      screenWidth: DEFAULT_RECT.width,
      screenHeight: 667,
      pixelRatio: 2
    }),
    canIUse: () => false,
    getStorageSync: (key) => storage.get(String(key)),
    setStorageSync: (key, value) => {
      storage.set(String(key), value);
    },
    removeStorageSync: (key) => {
      storage.delete(String(key));
    },
    clearStorageSync: () => {
      storage.clear();
    },
    getStorageInfoSync: () => ({
      keys: Array.from(storage.keys()),
      currentSize: storage.size,
      limitSize: 10240
    }),
    setNavigationBarTitle: noop,
    showToast: noop,
    showModal: noop,
    hideKeyboard: noop
  };

  delete require.cache[require.resolve(TERMINAL_PAGE_PATH)];
  require(TERMINAL_PAGE_PATH);

  return {
    capturedPageOptions,
    restore() {
      if (previousPage === undefined) {
        delete globalState.Page;
      } else {
        globalState.Page = previousPage;
      }
      if (previousWx === undefined) {
        delete globalState.wx;
      } else {
        globalState.wx = previousWx;
      }
    }
  };
}

function createTerminalPageHarness() {
  const { createEmptyTerminalBufferState, cloneAnsiState, ANSI_RESET_STATE } = require(
    TERMINAL_BUFFER_STATE_PATH
  );
  const { capturedPageOptions, restore } = installMiniprogramGlobals();
  if (!capturedPageOptions) {
    restore();
    throw new Error("terminal page not captured");
  }

  const captured = capturedPageOptions;
  const page = {
    ...captured,
    data: JSON.parse(JSON.stringify(captured.data || {})),
    setData(patch, callback) {
      Object.assign(this.data, patch || {});
      if (typeof callback === "function") {
        callback();
      }
    }
  };

  page.initTerminalPerfState();
  page.initTerminalRenderScheduler();
  page.connectionDiagnosticNetworkProbeTimer = null;
  page.connectionDiagnosticNetworkProbePending = false;
  page.connectionDiagnosticKeepSamplesOnNextConnect = false;
  page.outputCursorRow = 0;
  page.outputCursorCol = 0;
  page.outputCells = [[]];
  page.outputReplayText = "";
  page.outputReplayBytes = 0;
  page.outputAnsiState = cloneAnsiState(ANSI_RESET_STATE);
  page.outputRectWidth = DEFAULT_RECT.width;
  page.outputRectHeight = DEFAULT_RECT.height;
  page.stdoutReplayCarryText = "";
  page.terminalSyncUpdateState = page.terminalSyncUpdateState || { depth: 0, carryText: "", bufferedText: "" };
  page.terminalStdoutUserInputPending = false;
  page.terminalCols = 80;
  page.terminalRows = 24;
  page.outputTerminalState = createEmptyTerminalBufferState({
    bufferCols: page.terminalCols,
    bufferRows: page.terminalRows
  });
  page.applyTerminalBufferState(page.outputTerminalState);
  page.currentOutputScrollTop = 0;
  page.outputRectSnapshot = cloneRect(DEFAULT_RECT);
  page.outputViewportWindow = null;
  page.outputViewportScrollRefreshPending = false;
  page.terminalScrollOverlayTimer = null;
  page.terminalScrollIdleTimer = null;
  page.terminalScrollViewportPrefetchTimer = null;
  page.terminalScrollLastOverlayAt = 0;
  page.terminalScrollLastViewportRefreshAt = 0;
  page.terminalScrollDirection = 0;
  page.shellFontSizePx = 15;
  page.shellLineHeightRatio = 1.4;
  page.shellLineHeightPx = 21;
  page.shellCharWidthPx = 9;
  page.outputHorizontalPaddingPx = 8;
  page.outputRightPaddingPx = 8;
  page.windowWidth = DEFAULT_RECT.width;
  page.windowHeight = 667;
  page.keyboardVisibleHeightPx = 0;
  page.keyboardRestoreScrollTop = null;
  page.keyboardSessionActive = false;
  page.sessionSuspended = false;
  page.codexBootstrapGuard = null;
  page.activeAiProvider = "codex";
  page.activeCodexSandboxMode = "";
  page.aiSessionShellReady = true;
  page.aiRuntimeExitCarry = "";
  page.pendingCodexResumeAfterReconnect = false;
  page.client = null;
  page.data.statusText = "connected";
  page.data.statusClass = "connected";
  page.data.serverId = "terminal-replay";
  page.data.sessionId = "terminal-replay-session";
  page.data.serverLabel = "terminal-replay";

  page.queryOutputRect = function queryOutputRect(callback) {
    this.currentOutputScrollTop = Math.max(0, Number(this.currentOutputScrollTop) || 0);
    this.outputRectSnapshot = cloneRect(DEFAULT_RECT);
    if (typeof callback === "function") {
      callback(cloneRect(DEFAULT_RECT));
    }
  };
  page.runAfterTerminalLayout = function runAfterTerminalLayout(callback) {
    if (typeof callback === "function") {
      callback();
    }
  };
  page.measureShellMetrics = function measureShellMetrics(callback) {
    if (typeof callback === "function") {
      callback();
    }
  };
  page.setStatus = function setStatus(status) {
    const nextStatus = String(status || "");
    this.data.statusText = nextStatus;
    this.data.statusClass = nextStatus === "connected" ? "connected" : "idle";
  };
  page.syncConnectionAction = () => {};
  page.persistTerminalSessionStatus = () => {};
  page.persistConnectionDiagnosticSamples = () => {};
  page.resetTtsRoundState = () => {};
  page.appendTtsRoundOutput = () => {};
  page.handleError = (error) => {
    throw error instanceof Error ? error : new Error(String(error || "terminal replay error"));
  };

  return {
    page,
    restore
  };
}

function loadFixture(name) {
  const fixtureModule = require(TERMINAL_FIXTURE_PATH);
  if (name === "20260311" && typeof fixtureModule.decodeCodexTtyCapture20260311 === "function") {
    return fixtureModule.decodeCodexTtyCapture20260311();
  }
  throw new Error(`未知 fixture：${name}`);
}

function parsePerfLine(line) {
  const source = String(line || "");
  const marker = "[terminal.perf] ";
  const index = source.indexOf(marker);
  if (index < 0) {
    return null;
  }
  const jsonText = source.slice(index + marker.length).trim();
  try {
    return JSON.parse(jsonText);
  } catch {
    return null;
  }
}

async function runReplay(options) {
  const config = options && typeof options === "object" ? options : {};
  const recording = config.captureFile ? loadCaptureRecording(config.captureFile) : null;
  const capture = recording ? "" : loadFixture(config.fixture || "20260311");
  const chunks = recording ? [] : splitTextIntoChunks(capture, config.chunkSize);
  const { page, restore } = createTerminalPageHarness();
  const originalConsoleInfo = console.info;
  const perfRecords = [];

  console.info = (...args) => {
    const line = args.map((item) => String(item)).join(" ");
    const parsed = parsePerfLine(line);
    if (parsed) {
      perfRecords.push(parsed);
    }
    if (!config.quiet) {
      originalConsoleInfo(...args);
    }
  };

  try {
    for (let round = 0; round < config.repeat; round += 1) {
      if (recording) {
        let previousOffsetMs = 0;
        for (let index = 0; index < recording.events.length; index += 1) {
          const event = recording.events[index];
          const deltaMs = Math.max(0, event.offsetMs - previousOffsetMs);
          previousOffsetMs = event.offsetMs;
          if (deltaMs > 0) {
            await wait(deltaMs / config.captureSpeed);
          }
          if (event.type === "stdout" || event.type === "stderr") {
            page.handleFrame({
              type: event.type,
              payload: {
                data: event.data
              }
            });
          }
        }
      } else {
        for (let index = 0; index < chunks.length; index += 1) {
          page.handleFrame({
            type: "stdout",
            payload: {
              data: chunks[index]
            }
          });
          if (config.cadenceMs > 0) {
            await wait(config.cadenceMs);
          }
        }
      }
    }
    if (config.settleMs > 0) {
      await wait(config.settleMs);
    }
    const flushedSummary = page.flushTerminalPerfLogs("script_end");
    const scheduler = page.getTerminalRenderSchedulerSnapshot();
    const activeTask = page.getActiveStdoutTaskSnapshot();
    const summaries = perfRecords.filter((item) => item && item.event === "perf.summary");
    const snapshots = perfRecords.filter((item) => item && item.event === "perf.snapshot");
    return {
      captureFile: recording ? recording.filePath : "",
      captureMeta: recording ? recording.meta : null,
      fixture: config.fixture,
      chunkSize: config.chunkSize,
      cadenceMs: config.cadenceMs,
      captureSpeed: config.captureSpeed,
      repeat: config.repeat,
      settleMs: config.settleMs,
      chunkCount: recording ? recording.events.length : chunks.length,
      captureChars: capture.length,
      perfSummaryCount: summaries.length,
      perfSnapshotCount: snapshots.length,
      lastPerfSummary: flushedSummary || summaries.at(-1) || null,
      lastPerfSnapshot: snapshots.at(-1) || null,
      scheduler,
      activeTask,
      outputLineCount: Array.isArray(page.data.outputRenderLines) ? page.data.outputRenderLines.length : 0,
      outputTopSpacerPx: Number(page.data.outputTopSpacerPx) || 0,
      outputBottomSpacerPx: Number(page.data.outputBottomSpacerPx) || 0
    };
  } finally {
    console.info = originalConsoleInfo;
    restore();
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = await runReplay(options);
  console.log(JSON.stringify(result, null, 2));
}

export {
  createTerminalPageHarness,
  parseArgs,
  runReplay,
  splitTextIntoChunks
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
