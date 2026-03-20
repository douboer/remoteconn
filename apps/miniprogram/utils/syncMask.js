/* global module */

/**
 * 页面展示层如需回显敏感字段，应统一走遮罩处理，避免误展示完整凭据。
 */
function maskSecret(value) {
  const raw = String(value || "");
  if (!raw) return "";
  if (raw.length <= 8) return `${raw.slice(0, 1)}***${raw.slice(-1)}`;
  return `${raw.slice(0, 4)}***${raw.slice(-4)}`;
}

module.exports = {
  maskSecret
};
