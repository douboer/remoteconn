/**
 * 日志脱敏函数，避免导出文本泄露密码和主机信息。
 */
export function maskSensitive(value: string): string {
  return String(value)
    .replace(/([0-9]{1,3}\.){3}[0-9]{1,3}/g, "***.***.***.***")
    .replace(/(token|password|passphrase|secret)\s*[=:]\s*[^\s]+/gi, "$1=***")
    .replace(/~\/.+?(?=\s|$)/g, "~/***");
}

export function maskHost(host: string): string {
  return String(host)
    .replace(/([a-zA-Z0-9._%+-]+)@/, "***@")
    .replace(/([0-9]{1,3}\.){3}[0-9]{1,3}/, "***.***.***.***");
}
