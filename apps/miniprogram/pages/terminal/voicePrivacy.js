/**
 * 统一收敛微信隐私相关错误，避免页面层散落字符串匹配。
 * 这里保持纯函数，便于 Vitest 直接覆盖，不依赖小程序运行时。
 */

function normalizeMessage(input, fallback) {
  if (typeof input === "string" && input.trim()) return input.trim();
  return typeof fallback === "string" ? fallback : "";
}

function isPrivacyApiBannedMessage(message) {
  return /appid privacy api banned/i.test(String(message || ""));
}

function isPrivacyScopeUndeclaredMessage(message) {
  return /api scope is not declared in the privacy agreement/i.test(String(message || ""));
}

function isPrivacyAuthorizationDeniedMessage(message) {
  return /privacy.*(deny|denied|disagree|reject|refuse)|errno["']?\s*[:=]\s*10[34]/i.test(
    String(message || "")
  );
}

/**
 * 将微信侧原始隐私错误翻译成可执行的中文提示。
 */
function resolveVoicePrivacyErrorMessage(input, fallback) {
  const message = normalizeMessage(input, fallback);
  if (!message) return "";
  if (isPrivacyApiBannedMessage(message)) {
    return "小程序后台未完成隐私声明，录音接口已被微信平台禁用，请在微信公众平台补充用户隐私保护指引后重新提审并发布";
  }
  if (isPrivacyScopeUndeclaredMessage(message)) {
    return "小程序隐私指引未声明录音相关用途，请在微信公众平台“服务内容声明-用户隐私保护指引”补充麦克风采集说明";
  }
  if (isPrivacyAuthorizationDeniedMessage(message)) {
    return "未同意隐私协议，暂时无法使用录音";
  }
  return message;
}

module.exports = {
  isPrivacyApiBannedMessage,
  isPrivacyScopeUndeclaredMessage,
  resolveVoicePrivacyErrorMessage
};
