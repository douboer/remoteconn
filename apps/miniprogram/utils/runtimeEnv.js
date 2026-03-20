const { getRuntimeFingerprint } = require("./systemInfoCompat");

/**
 * 判断当前是否运行在微信开发者工具内。
 * 说明：
 * 1. `page-frame.html` / `getBase64ImagesInCss` 这类告警主要出现在 devtools 渲染层；
 * 2. 在 devtools 中尽量避免把超长 `data:` URI 注入到视图模板，降低解析噪声；
 * 3. 真机与正式运行环境仍保留动态着色能力。
 */
function isDevtoolsRuntime(wxLike) {
  const api = wxLike || (typeof wx !== "undefined" ? wx : null);
  if (!api) return false;
  try {
    const info = getRuntimeFingerprint(api);
    return (
      String(info.platform || "")
        .trim()
        .toLowerCase() === "devtools"
    );
  } catch {
    return false;
  }
}

module.exports = {
  isDevtoolsRuntime
};
