/* global wx, console, module, clearInterval, setInterval, setTimeout */

const DEFAULT_LATENCY_SAMPLE_INTERVAL_MS = 10000;
const DEFAULT_CONNECT_RETRY_COUNT = 1;
const DEFAULT_CONNECT_RETRY_DELAY_MS = 400;

function normalizeLatencySampleIntervalMs(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 1000) {
    return DEFAULT_LATENCY_SAMPLE_INTERVAL_MS;
  }
  return Math.round(numeric);
}

function normalizeConnectRetryCount(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return DEFAULT_CONNECT_RETRY_COUNT;
  }
  return Math.min(2, Math.round(numeric));
}

function normalizeConnectRetryDelayMs(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 100) {
    return DEFAULT_CONNECT_RETRY_DELAY_MS;
  }
  return Math.min(2000, Math.round(numeric));
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, Math.max(0, Math.round(Number(ms) || 0)));
  });
}

/**
 * 仅对“明显属于临时网络态”的首连失败做一次短退避重试：
 * 1. `connection refused / timeout / reset` 一类通常是客户端网络栈或链路瞬时抖动；
 * 2. 域名白名单、证书、URL 非法等配置问题不会被重试，避免掩盖真实错误；
 * 3. 这里只处理 `onOpen` 之前的失败，已建立的会话仍按原有断线逻辑处理。
 */
function isRetryableConnectFailure(detail) {
  const text = String(detail || "")
    .trim()
    .toLowerCase();
  if (!text) return false;

  const blockedHints = [
    "url not in domain list",
    "socket 域名",
    "invalid url",
    "ssl handshake failed",
    "certificate",
    "cert",
    "tls",
    "token 无效",
    "auth_failed"
  ];
  if (blockedHints.some((hint) => text.includes(hint))) {
    return false;
  }

  const retryableHints = [
    "connection refused",
    "econnrefused",
    "software caused connection abort",
    "connection abort",
    "connection reset",
    "econnreset",
    "network is unreachable",
    "host is unreachable",
    "timed out",
    "timeout",
    "temporarily unavailable",
    "socket hang up",
    "failed to connect"
  ];
  return retryableHints.some((hint) => text.includes(hint));
}

function isRetryablePreOpenClose(event) {
  const code = event && typeof event.code === "number" ? event.code : 0;
  if (!code) return true;
  return code === 1001 || code === 1006 || code === 1011;
}

/**
 * 微信小程序网关传输层（最小可用版）。
 * 协议与 Web 端保持一致：
 * - init / stdin / resize / control(ping-pong-disconnect)
 */
function buildWsUrl(rawGatewayUrl, token) {
  const input = String(rawGatewayUrl || "").trim();
  if (!input) {
    throw new Error("网关地址为空");
  }

  let base = input;
  if (base.startsWith("http://")) base = `ws://${base.slice(7)}`;
  if (base.startsWith("https://")) base = `wss://${base.slice(8)}`;
  if (!base.startsWith("ws://") && !base.startsWith("wss://")) {
    base = `wss://${base}`;
  }
  base = base.replace(/\/+$/, "");
  const safeToken = encodeURIComponent(String(token || ""));
  return `${base}/ws/terminal?token=${safeToken}`;
}

function createGatewayClient(options) {
  const config = options || {};
  let socketTask = null;
  let socketReady = false;
  let heartbeatTimer = null;
  let heartbeatIntervalMs = normalizeLatencySampleIntervalMs(config.heartbeatIntervalMs);
  const connectRetryCount = normalizeConnectRetryCount(config.connectRetryCount);
  const connectRetryDelayMs = normalizeConnectRetryDelayMs(config.connectRetryDelayMs);
  let pingAt = 0;
  let connectPromise = null;
  let activeSeq = 0;
  let activeConnectRunSeq = 0;
  const debugLog = typeof config.debugLog === "function" ? config.debugLog : null;

  function log(event, payload) {
    if (!debugLog) return;
    try {
      debugLog(event, payload || {});
    } catch (error) {
      console.warn("[gateway.debug]", error);
    }
  }

  function clearHeartbeat() {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }

  function releaseSocketTask(task) {
    if (task && task === socketTask) {
      socketTask = null;
    }
    socketReady = false;
    clearHeartbeat();
  }

  function safeCloseSocketTask(task, reason) {
    if (!task || typeof task.close !== "function") return;
    try {
      task.close({ code: 1000, reason: reason || "cleanup" });
    } catch (error) {
      console.warn("[gateway.cleanup]", error);
    }
  }

  function sendFrame(frame) {
    if (!socketTask) return;
    socketTask.send({ data: JSON.stringify(frame) });
  }

  function sendLatencyPing() {
    if (!socketTask) return;
    pingAt = Date.now();
    sendFrame({ type: "control", payload: { action: "ping" } });
  }

  function startHeartbeat() {
    clearHeartbeat();
    if (!socketReady) return;
    heartbeatTimer = setInterval(() => {
      sendLatencyPing();
    }, heartbeatIntervalMs);
  }

  /**
   * 连接真正进入可用态后，允许上层主动补一拍时延采样，
   * 避免首个 ping 早于 shell ready，导致 UI 要等下一轮 10 秒心跳。
   */
  function sampleLatency() {
    sendLatencyPing();
  }

  /**
   * 诊断面板展开时，小程序会把采样频率提升到 3 秒；
   * 收起后再恢复默认节奏，这里只负责切换 WebSocket ping 心跳本身。
   */
  function setLatencySampleInterval(intervalMs) {
    const nextIntervalMs = normalizeLatencySampleIntervalMs(intervalMs);
    if (nextIntervalMs === heartbeatIntervalMs) {
      return;
    }
    heartbeatIntervalMs = nextIntervalMs;
    if (socketReady) {
      startHeartbeat();
    }
  }

  function connect(params) {
    const payload = params || {};
    const url = buildWsUrl(config.gatewayUrl, config.gatewayToken);
    const connectTimeoutMs = Number(config.connectTimeoutMs);
    const timeout = Number.isFinite(connectTimeoutMs) && connectTimeoutMs >= 1000 ? connectTimeoutMs : 12000;
    const maxAttempts = 1 + connectRetryCount;

    if (connectPromise) return connectPromise;

    const connectRunSeq = ++activeConnectRunSeq;

    function connectOnce(attempt) {
      return new Promise((resolve, reject) => {
        let settled = false;
        let opened = false;
        const seq = ++activeSeq;
        log("gateway.socket.connecting", {
          attempt,
          maxAttempts,
          timeoutMs: timeout,
          host: payload.host,
          port: Number(payload.port) || 22,
          cols: Number(payload.cols) || 80,
          rows: Number(payload.rows) || 24,
          hasJumpHost: !!payload.jumpHost
        });

        const previousSocket = socketTask;
        if (previousSocket) {
          releaseSocketTask(previousSocket);
          safeCloseSocketTask(previousSocket, "replace_before_connect");
        }

        const rejectOnce = (message, retryable) => {
          if (settled) return;
          settled = true;
          reject({ message, retryable: !!retryable });
        };
        const resolveOnce = () => {
          if (settled) return;
          settled = true;
          resolve();
        };

        const task = wx.connectSocket({ url, timeout });
        socketTask = task;

        task.onOpen(() => {
          if (seq !== activeSeq || task !== socketTask) return;
          opened = true;
          socketReady = true;
          log("gateway.socket.open", { seq, attempt, maxAttempts });
          sendFrame({
            type: "init",
            payload: {
              host: payload.host,
              port: Number(payload.port) || 22,
              username: payload.username,
              ...(payload.clientSessionKey ? { clientSessionKey: String(payload.clientSessionKey) } : {}),
              ...(Number.isFinite(Number(payload.resumeGraceMs))
                ? { resumeGraceMs: Math.round(Number(payload.resumeGraceMs)) }
                : {}),
              credential: payload.credential || { type: "password", password: "" },
              ...(payload.jumpHost ? { jumpHost: payload.jumpHost } : {}),
              pty: {
                cols: Number(payload.cols) || 80,
                rows: Number(payload.rows) || 24
              }
            }
          });
          log("gateway.init.sent", {
            seq,
            attempt,
            cols: Number(payload.cols) || 80,
            rows: Number(payload.rows) || 24,
            hasJumpHost: !!payload.jumpHost,
            hasClientSessionKey: !!payload.clientSessionKey
          });
          startHeartbeat();
          resolveOnce();
        });

        task.onMessage((event) => {
          if (seq !== activeSeq || task !== socketTask) return;
          try {
            const frame = JSON.parse(event.data || "{}");
            if (frame.type === "control" && frame.payload?.action === "ping") {
              sendFrame({ type: "control", payload: { action: "pong" } });
              return;
            }
            if (frame.type === "control" && frame.payload?.action === "pong") {
              if (typeof config.onLatency === "function" && pingAt > 0) {
                config.onLatency(Date.now() - pingAt);
              }
              return;
            }
            if (typeof config.onFrame === "function") {
              config.onFrame(frame);
            }
          } catch (error) {
            if (typeof config.onError === "function") {
              config.onError(error);
            }
          }
        });

        task.onClose((event) => {
          if (seq !== activeSeq || task !== socketTask) return;
          const code = event && typeof event.code === "number" ? event.code : "";
          const reason = event && event.reason ? String(event.reason) : "";
          releaseSocketTask(task);
          log("gateway.socket.close", {
            seq,
            attempt,
            opened,
            code,
            reason
          });
          if (!opened) {
            rejectOnce(
              `网关连接失败${code ? `(${code})` : ""}${reason ? `: ${reason}` : ""}`,
              isRetryablePreOpenClose(event)
            );
            return;
          }
          if (typeof config.onClose === "function") {
            config.onClose(event);
          }
        });

        task.onError((error) => {
          if (seq !== activeSeq || task !== socketTask) return;
          const detail = error && error.errMsg ? String(error.errMsg) : "";
          const message = detail ? `网关连接失败: ${detail}` : "网关连接失败";
          log("gateway.socket.error", {
            seq,
            attempt,
            errMsg: detail
          });
          if (!opened) {
            const retryable = isRetryableConnectFailure(detail);
            releaseSocketTask(task);
            safeCloseSocketTask(task, "connect_error");
            rejectOnce(message, retryable);
            return;
          }
          if (typeof config.onError === "function") {
            config.onError(error);
          }
        });
      });
    }

    connectPromise = (async () => {
      let lastMessage = "网关连接失败";
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        if (connectRunSeq !== activeConnectRunSeq) {
          return;
        }
        try {
          await connectOnce(attempt);
          return;
        } catch (error) {
          if (connectRunSeq !== activeConnectRunSeq) {
            return;
          }
          const detail = error && typeof error === "object" ? error : {};
          const message = detail.message ? String(detail.message) : "网关连接失败";
          lastMessage = message;
          const canRetry = attempt < maxAttempts && !!detail.retryable;
          log("gateway.socket.attempt_failed", {
            attempt,
            maxAttempts,
            retryable: !!detail.retryable,
            message
          });
          if (!canRetry) {
            throw new Error(message);
          }
          log("gateway.socket.retry_scheduled", {
            attempt,
            nextAttempt: attempt + 1,
            delayMs: connectRetryDelayMs,
            message
          });
          await wait(connectRetryDelayMs);
        }
      }
      throw new Error(lastMessage);
    })().finally(() => {
      connectPromise = null;
    });

    return connectPromise;
  }

  function sendStdin(text, meta) {
    const inputMeta = meta && typeof meta === "object" ? meta : {};
    sendFrame({
      type: "stdin",
      payload: {
        data: String(text || ""),
        meta: {
          source: inputMeta.source === "assist" ? "assist" : "keyboard",
          ...(inputMeta.txnId ? { txnId: String(inputMeta.txnId) } : {})
        }
      }
    });
  }

  function resize(cols, rows) {
    sendFrame({ type: "resize", payload: { cols: Number(cols) || 80, rows: Number(rows) || 24 } });
  }

  function disconnect(reason) {
    activeConnectRunSeq += 1;
    activeSeq += 1;
    sendFrame({ type: "control", payload: { action: "disconnect", reason: reason || "manual" } });
    socketReady = false;
    clearHeartbeat();
    if (socketTask) {
      socketTask.close({ code: 1000, reason: "manual" });
      socketTask = null;
    }
    connectPromise = null;
  }

  /**
   * 仅关闭 WebSocket，不向服务端发送 disconnect 控制帧：
   * - 供终端页切后台/离开页面时使用；
   * - 网关会把 SSH 会话转入“驻留等待续接”窗口。
   */
  function suspend(reason) {
    activeConnectRunSeq += 1;
    activeSeq += 1;
    socketReady = false;
    clearHeartbeat();
    if (socketTask) {
      try {
        socketTask.close({ code: 1000, reason: reason || "suspend" });
      } catch (error) {
        console.warn("[gateway.suspend]", error);
      }
      socketTask = null;
    }
    connectPromise = null;
  }

  return {
    connect,
    sendStdin,
    resize,
    sampleLatency,
    setLatencySampleInterval,
    disconnect,
    suspend
  };
}

module.exports = {
  createGatewayClient,
  buildWsUrl
};
