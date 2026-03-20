/* global module */

/**
 * 同步配置刷新事件总线：
 * 1. 启动 bootstrap 完成并合并回本地后，当前已打开页面需要立刻重读 storage；
 * 2. 这里只广播“配置已落地”这一件事，不承载具体网络细节；
 * 3. 订阅方自行决定刷新服务器列表、主题或其它展示数据，避免总线和页面逻辑耦死。
 */
const listeners = new Set();

function emitSyncConfigApplied(payload) {
  listeners.forEach((listener) => {
    try {
      listener(payload);
    } catch {
      // 忽略单个订阅方异常，避免影响其它页面刷新。
    }
  });
}

function subscribeSyncConfigApplied(listener) {
  if (typeof listener !== "function") {
    return () => {};
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

module.exports = {
  emitSyncConfigApplied,
  subscribeSyncConfigApplied
};
