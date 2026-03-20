/* global getApp */

const TERMINAL_INTENT_KEY = "pendingTerminalIntent";

/**
 * 记录一次“进入终端后要做什么”的瞬时意图。
 * 当前仅用于服务器列表页点击 AI 图标后，通知终端页自动启动默认 AI。
 */
function setPendingTerminalIntent(intent) {
  const app = getApp && getApp();
  if (!app || !app.globalData) {
    return;
  }
  app.globalData[TERMINAL_INTENT_KEY] = intent || null;
}

/**
 * 读取当前挂起的终端意图，但不清除。
 */
function getPendingTerminalIntent() {
  const app = getApp && getApp();
  if (!app || !app.globalData) {
    return null;
  }
  return app.globalData[TERMINAL_INTENT_KEY] || null;
}

/**
 * 清理已消费的终端意图，避免后续页面误触发。
 */
function clearPendingTerminalIntent() {
  const app = getApp && getApp();
  if (!app || !app.globalData) {
    return;
  }
  app.globalData[TERMINAL_INTENT_KEY] = null;
}

module.exports = {
  setPendingTerminalIntent,
  getPendingTerminalIntent,
  clearPendingTerminalIntent
};
