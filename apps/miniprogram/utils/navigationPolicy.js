/**
 * 小程序页面导航策略：
 * 1. 底部导航在“页面之间横跳”时优先使用 redirectTo，避免长期堆积页面实例；
 * 2. 同一路径返回 noop，避免重复触发无意义导航；
 * 3. 仅当目标不是标准页面路由时，才退回 navigateTo。
 */
function resolvePageNavigationMethod(currentPath, targetPath) {
  const current = String(currentPath || "").trim();
  const target = String(targetPath || "").trim();
  if (!target) return "noop";
  if (current && current === target) return "noop";
  if (/^\/pages\/.+\/index$/.test(target)) {
    return "redirectTo";
  }
  return "navigateTo";
}

module.exports = {
  resolvePageNavigationMethod
};
