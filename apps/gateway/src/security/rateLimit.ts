import { RateLimiterMemory } from "rate-limiter-flexible";
import { config } from "../config";

/**
 * 连接限流：同一 IP 每分钟限制一定连接次数，防止爆破和资源耗尽。
 * 参数由 config.rateLimitPoints / config.rateLimitDurationSec 控制。
 */
const limiter = new RateLimiterMemory({
  points: config.rateLimitPoints,
  duration: config.rateLimitDurationSec
});

export async function checkConnectionRate(ip: string): Promise<void> {
  await limiter.consume(ip || "unknown", 1);
}
