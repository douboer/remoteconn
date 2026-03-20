import pino from "pino";

/**
 * 将日志时间格式化为紧凑数字串：
 * - 目标格式：YYYYMMDDHHmmssSSSS
 * - 字段含义：年(4)月(2)日(2)时(2)分(2)秒(2)毫秒(4)
 *
 * 说明：
 * 1) JavaScript 原生毫秒精度是 0-999（三位）；
 * 2) 这里按产品约定扩展为四位：`毫秒三位 + 末尾补 0`，例如 `120 -> 1200`；
 * 3) 使用本地时区，便于和用户界面展示时间对齐。
 */
function formatCompactLocalTime(now: Date): string {
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hour = String(now.getHours()).padStart(2, "0");
  const minute = String(now.getMinutes()).padStart(2, "0");
  const second = String(now.getSeconds()).padStart(2, "0");
  const millisecond4 = `${String(now.getMilliseconds()).padStart(3, "0")}0`;
  return `${year}${month}${day}${hour}${minute}${second}${millisecond4}`;
}

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  /**
   * 将默认 epoch 毫秒时间戳（如 1771821864018）改为业务约定数字格式：
   * - 输出示例：`"time":202602231245101200`
   * - 仍使用 `time` 字段，避免破坏现有日志消费方字段约定。
   */
  timestamp: () => `,"time":${formatCompactLocalTime(new Date())}`
});
