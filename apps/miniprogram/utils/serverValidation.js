/* global module */

/**
 * 服务器连接前校验。
 * 约束：
 * 1. 这里只做“用户可立即修正”的前置校验，避免明显配置错误落到网关层才报模糊错误；
 * 2. 端口允许留空并回退默认 22，保持当前表单行为不变；
 * 3. 返回值统一为中文错误文案，空字符串表示校验通过。
 */

function normalizeAuthType(value) {
  const authType = String(value || "").trim();
  if (authType === "privateKey" || authType === "certificate") return authType;
  return "password";
}

function validatePortField(value, label) {
  const raw = String(value == null ? "" : value).trim();
  if (!raw) return "";
  if (!/^\d+$/.test(raw)) return `${label}需为 1-65535 的整数`;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return `${label}需为 1-65535 的整数`;
  }
  return "";
}

function validateServerForConnect(server) {
  const source = server && typeof server === "object" ? server : {};
  const host = String(source.host || "").trim();
  const username = String(source.username || "").trim();
  const portError = validatePortField(source.port, "SSH 端口");
  if (!host) return "主机不能为空";
  if (portError) return portError;
  if (!username) return "用户名不能为空";

  const authType = normalizeAuthType(source.authType);
  if (authType === "password" && !String(source.password || "").trim()) return "密码不能为空";
  if (authType === "privateKey" && !String(source.privateKey || "").trim()) return "私钥内容不能为空";
  if (authType === "certificate") {
    if (!String(source.privateKey || "").trim()) return "证书模式下私钥不能为空";
    if (!String(source.certificate || "").trim()) return "证书模式下证书不能为空";
  }

  const jumpHost = source.jumpHost && typeof source.jumpHost === "object" ? source.jumpHost : null;
  if (!jumpHost || !jumpHost.enabled) return "";

  const jumpHostName = String(jumpHost.host || "").trim();
  const jumpUsername = String(jumpHost.username || "").trim();
  const jumpPortError = validatePortField(jumpHost.port, "跳板机端口");
  if (!jumpHostName) return "跳板机主机不能为空";
  if (jumpPortError) return jumpPortError;
  if (!jumpUsername) return "跳板机用户名不能为空";

  const jumpAuthType = normalizeAuthType(jumpHost.authType);
  if (jumpAuthType === "password" && !String(source.jumpPassword || "").trim()) return "跳板机密码不能为空";
  if (jumpAuthType === "privateKey" && !String(source.jumpPrivateKey || "").trim()) {
    return "跳板机私钥不能为空";
  }
  if (jumpAuthType === "certificate") {
    if (!String(source.jumpPrivateKey || "").trim()) return "跳板机证书模式下私钥不能为空";
    if (!String(source.jumpCertificate || "").trim()) return "跳板机证书模式下证书不能为空";
  }
  return "";
}

module.exports = {
  validateServerForConnect
};
