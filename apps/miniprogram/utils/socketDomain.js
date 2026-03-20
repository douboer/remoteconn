/* global module */

/**
 * 统一解析小程序 socket 合法域名提示里的协议与主机部分。
 * 保持纯函数，供设置页与终端页复用，避免重复维护 URL 归一化逻辑。
 */

function resolveSocketDomainHint(rawGatewayUrl) {
  const input = String(rawGatewayUrl || "").trim();
  if (!input) return "";

  let normalized = input;
  if (!normalized.startsWith("ws://") && !normalized.startsWith("wss://")) {
    if (normalized.startsWith("http://")) {
      normalized = `ws://${normalized.slice(7)}`;
    } else if (normalized.startsWith("https://")) {
      normalized = `wss://${normalized.slice(8)}`;
    } else {
      normalized = `wss://${normalized}`;
    }
  }

  /**
   * 小程序真机环境不保证存在标准 URL 全局对象，这里改为纯字符串解析，
   * 只提取协议与 host:port，避免诊断面板在真机里错误显示“暂无”。
   */
  const matched = normalized.match(/^(wss?):\/\/([^/?#]+)/i);
  if (!matched) {
    return "";
  }

  const protocol = String(matched[1] || "").toLowerCase();
  const host = String(matched[2] || "").replace(/:443$/i, "");
  if (!protocol || !host) {
    return "";
  }
  return `${protocol}://${host}`;
}

module.exports = {
  resolveSocketDomainHint
};
