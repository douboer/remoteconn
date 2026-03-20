/* global module, require */

const { resolveVoicePrivacyErrorMessage } = require("./voicePrivacy");

/**
 * 统一收敛语音网关错误：
 * 1. 隐私权限错误优先翻译，避免误报为网关问题；
 * 2. `url not in domain list` 单独归类为 socket 合法域名问题；
 * 3. 其他 `connectSocket:fail` 视为网络或网关配置问题，不再误导成域名问题。
 */

function normalizeMessage(input, fallback) {
  if (typeof input === "string" && input.trim()) return input.trim();
  return typeof fallback === "string" ? fallback : "";
}

function resolveVoiceGatewayErrorState(input, fallback) {
  const raw = normalizeMessage(input, fallback);
  if (!raw) {
    return { message: "", showSocketDomainModal: false };
  }

  const privacyMessage = resolveVoicePrivacyErrorMessage(raw, raw);
  if (privacyMessage !== raw) {
    return { message: privacyMessage, showSocketDomainModal: false };
  }

  if (/auth deny|scope\.record|authorize/i.test(raw)) {
    return {
      message: "麦克风权限未开启，请在设置中允许录音",
      showSocketDomainModal: false
    };
  }

  if (/url not in domain list/i.test(raw)) {
    return {
      message: "语音网关连接失败，请检查小程序 socket 合法域名",
      showSocketDomainModal: true
    };
  }

  if (/ready_timeout|连接超时/i.test(raw)) {
    return {
      message: "语音服务连接超时，请稍后重试",
      showSocketDomainModal: false
    };
  }

  if (/connectSocket:fail/i.test(raw)) {
    return {
      message: "语音网关连接失败，请检查网络或网关配置",
      showSocketDomainModal: false
    };
  }

  return { message: raw, showSocketDomainModal: false };
}

module.exports = {
  resolveVoiceGatewayErrorState
};
