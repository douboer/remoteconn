/**
 * 小程序系统信息兼容层：
 * 1. 优先使用微信推荐的新接口，避免 `getSystemInfoSync` 废弃告警；
 * 2. 老基础库不存在新接口时，回退到旧接口，保证兼容；
 * 3. 仅暴露当前仓库真正需要的最小字段，避免把整份系统信息继续向外扩散。
 */

function callSyncApi(api, name) {
  if (!api || typeof api[name] !== "function") return {};
  try {
    const result = api[name]();
    return result && typeof result === "object" ? result : {};
  } catch {
    return {};
  }
}

function resolveWxApi(wxLike) {
  return wxLike || (typeof wx !== "undefined" ? wx : null);
}

/**
 * 读取窗口尺寸。
 * 微信已建议从 `getWindowInfo` 获取窗口相关字段；旧环境则回退到 `getSystemInfoSync`。
 */
function getWindowMetrics(wxLike) {
  const api = resolveWxApi(wxLike);
  const modern = callSyncApi(api, "getWindowInfo");
  if (Object.keys(modern).length > 0) {
    return {
      windowWidth: Number(modern.windowWidth),
      windowHeight: Number(modern.windowHeight)
    };
  }
  const legacy = callSyncApi(api, "getSystemInfoSync");
  return {
    windowWidth: Number(legacy.windowWidth),
    windowHeight: Number(legacy.windowHeight)
  };
}

/**
 * 组合“运行环境 + 设备”指纹。
 * 这里只保留当前代码真正用到的 `platform/system/brand` 三个字段。
 */
function getRuntimeFingerprint(wxLike) {
  const api = resolveWxApi(wxLike);
  const appBase = callSyncApi(api, "getAppBaseInfo");
  const device = callSyncApi(api, "getDeviceInfo");
  if (Object.keys(appBase).length > 0 || Object.keys(device).length > 0) {
    return {
      platform: String(appBase.platform || device.platform || ""),
      system: String(device.system || appBase.system || ""),
      brand: String(device.brand || appBase.brand || "")
    };
  }
  const legacy = callSyncApi(api, "getSystemInfoSync");
  return {
    platform: String(legacy.platform || ""),
    system: String(legacy.system || ""),
    brand: String(legacy.brand || "")
  };
}

module.exports = {
  getWindowMetrics,
  getRuntimeFingerprint
};
