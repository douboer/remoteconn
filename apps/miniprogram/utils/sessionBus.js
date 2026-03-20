/**
 * 小程序终端会话事件总线：
 * 1. 插件运行时通过该总线订阅会话事件；
 * 2. 终端页通过该总线暴露“当前活动会话”的发送能力。
 */
const EVENT_NAMES = ["connected", "disconnected", "stdout", "stderr", "latency"];

const listeners = EVENT_NAMES.reduce((acc, key) => {
  acc[key] = new Set();
  return acc;
}, {});

let activeSessionSender = null;
let currentSessionState = "disconnected";

function onSessionEvent(eventName, handler) {
  const name = String(eventName || "");
  if (!listeners[name] || typeof handler !== "function") {
    return () => {};
  }
  listeners[name].add(handler);
  return () => {
    listeners[name].delete(handler);
  };
}

function emitSessionEvent(eventName, payload) {
  const name = String(eventName || "");
  const bucket = listeners[name];
  if (name === "connected") {
    currentSessionState = "connected";
  } else if (name === "disconnected") {
    currentSessionState = "disconnected";
  }
  if (!bucket) return;
  bucket.forEach((handler) => {
    try {
      handler(payload);
    } catch (error) {
      console.error("[sessionBus.emit]", name, error);
    }
  });
}

function setActiveSessionSender(sender) {
  activeSessionSender = typeof sender === "function" ? sender : null;
  if (!activeSessionSender) {
    currentSessionState = "disconnected";
  }
}

async function sendToActiveSession(input, meta) {
  if (!activeSessionSender) {
    throw new Error("当前无活动终端会话");
  }
  await Promise.resolve(activeSessionSender(String(input || ""), meta));
}

module.exports = {
  onSessionEvent,
  emitSessionEvent,
  setActiveSessionSender,
  sendToActiveSession,
  getSessionState() {
    return currentSessionState;
  }
};
