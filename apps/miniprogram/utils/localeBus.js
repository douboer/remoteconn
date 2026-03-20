/* global module */

/**
 * 轻量语言事件总线：
 * 1. 设置页切换界面语言时，当前页内组件可立即刷新；
 * 2. 只传递 uiLanguage，不耦合其它设置项；
 * 3. 订阅方自行决定是否需要重新读取完整 settings。
 */
const listeners = new Set();

function emitLocaleChange(language) {
  listeners.forEach((listener) => {
    try {
      listener(language);
    } catch {
      // 忽略单个订阅方异常，避免影响其它页面刷新。
    }
  });
}

function subscribeLocaleChange(listener) {
  if (typeof listener !== "function") {
    return () => {};
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

module.exports = {
  emitLocaleChange,
  subscribeLocaleChange
};
