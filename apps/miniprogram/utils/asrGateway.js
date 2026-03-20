/**
 * 小程序语音网关客户端：
 * 1. 对齐 Web 端 /ws/asr 协议（ready/result/round_end/error）；
 * 2. 控制帧走 JSON，音频分片走二进制帧。
 */
const READY_TIMEOUT_MS = 7000;
const CLOSE_TIMEOUT_MS = 2600;

function buildAsrWsUrl(rawGatewayUrl, token) {
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
  return `${base}/ws/asr?token=${safeToken}`;
}

function createAsrGatewayClient(options) {
  const config = options || {};
  const endpoint = buildAsrWsUrl(config.gatewayUrl, config.gatewayToken);
  let socketTask = null;
  let ready = false;
  let closed = false;
  let stopCloseTimer = null;
  let readyTimer = null;
  let readyResolve = null;
  let readyReject = null;

  function clearReadyTimer() {
    if (readyTimer) {
      clearTimeout(readyTimer);
      readyTimer = null;
    }
  }

  function clearStopCloseTimer() {
    if (stopCloseTimer) {
      clearTimeout(stopCloseTimer);
      stopCloseTimer = null;
    }
  }

  function rejectPendingReady(error) {
    if (typeof readyReject === "function") {
      readyReject(error);
    }
    readyResolve = null;
    readyReject = null;
  }

  function resolvePendingReady() {
    if (typeof readyResolve === "function") {
      readyResolve();
    }
    readyResolve = null;
    readyReject = null;
  }

  function sendJson(frame) {
    if (!socketTask || closed) return;
    socketTask.send({ data: JSON.stringify(frame) });
  }

  function connect() {
    if (socketTask && !closed) {
      return Promise.resolve();
    }

    closed = false;
    ready = false;

    return new Promise((resolve, reject) => {
      readyResolve = resolve;
      readyReject = reject;
      socketTask = wx.connectSocket({ url: endpoint, timeout: READY_TIMEOUT_MS });
      clearReadyTimer();
      readyTimer = setTimeout(() => {
        if (ready) return;
        close("ready_timeout");
        rejectPendingReady(new Error("语音网关连接超时"));
      }, READY_TIMEOUT_MS);

      socketTask.onOpen(() => {
        if (typeof config.onOpen === "function") {
          config.onOpen();
        }
      });

      socketTask.onMessage((event) => {
        const raw = event && event.data;
        if (typeof raw !== "string") {
          return;
        }
        let frame = null;
        try {
          frame = JSON.parse(raw);
        } catch {
          return;
        }

        if (frame.type === "ready") {
          ready = true;
          clearReadyTimer();
          resolvePendingReady();
          if (typeof config.onReady === "function") {
            config.onReady(frame.payload || {});
          }
          return;
        }

        if (frame.type === "result") {
          if (typeof config.onResult === "function") {
            config.onResult(frame.payload || {});
          }
          return;
        }

        if (frame.type === "round_end") {
          clearStopCloseTimer();
          if (typeof config.onRoundEnd === "function") {
            config.onRoundEnd(frame.payload || {});
          }
          return;
        }

        if (frame.type === "pong") {
          return;
        }

        if (frame.type === "error") {
          const message = String((frame.payload && frame.payload.message) || "语音网关异常");
          const error = new Error(message);
          if (!ready) {
            clearReadyTimer();
            rejectPendingReady(error);
          }
          if (typeof config.onError === "function") {
            config.onError(error);
          }
          return;
        }
      });

      socketTask.onError((event) => {
        const detail = event && event.errMsg ? String(event.errMsg) : "";
        const error = new Error(detail ? `语音网关连接失败: ${detail}` : "语音网关连接失败");
        if (!ready) {
          clearReadyTimer();
          rejectPendingReady(error);
        }
        if (typeof config.onError === "function") {
          config.onError(error);
        }
      });

      socketTask.onClose((event) => {
        const wasReady = ready;
        ready = false;
        closed = true;
        clearReadyTimer();
        clearStopCloseTimer();
        socketTask = null;
        if (!wasReady) {
          const code = event && typeof event.code === "number" ? event.code : "";
          const reason = event && event.reason ? String(event.reason) : "";
          rejectPendingReady(
            new Error(`语音连接已关闭${code ? `(${code})` : ""}${reason ? `: ${reason}` : ""}`)
          );
        }
        if (typeof config.onClose === "function") {
          config.onClose(event || {});
        }
      });
    });
  }

  function startRound(payload) {
    if (!ready) {
      throw new Error("语音网关未就绪");
    }
    sendJson({
      type: "start",
      payload:
        payload && typeof payload === "object"
          ? payload
          : {
              audio: {
                format: "pcm",
                codec: "raw",
                rate: 16000,
                bits: 16,
                channel: 1
              },
              request: {
                model_name: "bigmodel",
                enable_itn: true,
                enable_punc: true,
                result_type: "full"
              }
            }
    });
  }

  function sendAudio(buffer) {
    if (!ready || !socketTask || closed) {
      return;
    }
    if (!(buffer instanceof ArrayBuffer) || buffer.byteLength <= 0) {
      return;
    }
    socketTask.send({ data: buffer });
  }

  function stopRound() {
    if (!ready) return;
    sendJson({ type: "stop" });
    clearStopCloseTimer();
    stopCloseTimer = setTimeout(() => {
      close("round_timeout");
    }, CLOSE_TIMEOUT_MS);
  }

  function cancelRound() {
    if (!ready) {
      close("cancel_before_ready");
      return;
    }
    sendJson({ type: "cancel" });
    close("cancel");
  }

  function ping() {
    if (!ready) return;
    sendJson({ type: "ping" });
  }

  function close(reason) {
    clearReadyTimer();
    clearStopCloseTimer();
    closed = true;
    ready = false;
    if (!socketTask) return;
    try {
      socketTask.close({ code: 1000, reason: reason || "client_close" });
    } catch (error) {
      console.warn("[asrGateway.close]", error);
    }
    socketTask = null;
  }

  return {
    connect,
    startRound,
    sendAudio,
    stopRound,
    cancelRound,
    ping,
    close,
    isReady() {
      return ready;
    }
  };
}

module.exports = {
  READY_TIMEOUT_MS,
  CLOSE_TIMEOUT_MS,
  buildAsrWsUrl,
  createAsrGatewayClient
};
