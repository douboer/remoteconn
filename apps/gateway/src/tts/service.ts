import path from "node:path";
import { randomUUID } from "node:crypto";
import { config } from "../config";
import { logger } from "../logger";
import { TtsCacheStore } from "./cache";
import type { TtsNormalizedRequest, TtsProviderAdapter, TtsSynthesizeInput } from "./provider";
import { TtsServiceError, normalizeTtsRequest } from "./provider";
import { TencentTtsProvider } from "./providers/tencent";
import { VolcengineTtsProvider } from "./providers/volcengine";
import { createTtsAudioTicket, verifyTtsAudioTicket } from "./ticket";

const TTS_AUDIO_TICKET_TTL_MS = 10 * 60 * 1000;
const TTS_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const TTS_CACHE_TOTAL_MAX_BYTES = 256 * 1024 * 1024;
const TTS_PROVIDER_CONCURRENCY = 4;
const TTS_PROVIDER_QUEUE_TIMEOUT_MS = 10 * 60 * 1000;
const TTS_BACKGROUND_FAILURE_TTL_MS = 5 * 60 * 1000;
const TTS_SYNTHESIZE_INLINE_WAIT_MS = 800;

interface TtsAudioAccess {
  uid: string;
  cacheKey: string;
  exp: number;
}

interface TtsBackgroundFailure {
  code: string;
  message: string;
  status: number;
  expiresAt: number;
}

type TtsSynthesisStatus =
  | { state: "ready" }
  | { state: "pending" }
  | { state: "missing" }
  | { state: "error"; code: string; message: string; status: number };

interface TtsServiceOptions {
  provider?: TtsProviderAdapter;
  cache?: TtsCacheStore;
  inlineWaitMs?: number;
}

function sleep(ms: number): Promise<void> {
  const waitMs = Math.max(0, Math.round(Number(ms) || 0));
  return new Promise((resolve) => {
    setTimeout(resolve, waitMs);
  });
}

/**
 * 最小并发闸门：
 * 1. 每实例只允许少量上游 TTS 并发；
 * 2. 等待结束后立即唤醒下一个请求；
 * 3. v1 不做复杂优先级，保持实现确定性。
 */
class AsyncSemaphore {
  private capacity: number;
  private active: number;
  private queue: Array<() => void>;

  constructor(capacity: number) {
    this.capacity = Math.max(1, capacity);
    this.active = 0;
    this.queue = [];
  }

  async use<T>(task: () => Promise<T>, waitTimeoutMs: number): Promise<T> {
    await this.acquire(waitTimeoutMs);
    try {
      return await task();
    } finally {
      this.release();
    }
  }

  private acquire(waitTimeoutMs: number): Promise<void> {
    if (this.active < this.capacity) {
      this.active += 1;
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const timeoutMs = Math.max(0, Math.round(Number(waitTimeoutMs) || 0));
      let timeout: NodeJS.Timeout | null = null;
      const resume = () => {
        if (timeout) {
          clearTimeout(timeout);
          timeout = null;
        }
        this.active += 1;
        resolve();
      };
      this.queue.push(resume);
      if (timeoutMs <= 0) {
        return;
      }
      timeout = setTimeout(() => {
        const index = this.queue.indexOf(resume);
        if (index >= 0) {
          this.queue.splice(index, 1);
        }
        reject(new TtsServiceError("TTS_BUSY", "语音生成繁忙，请稍后重试", 503));
      }, timeoutMs);
    });
  }

  private release(): void {
    this.active = Math.max(0, this.active - 1);
    const next = this.queue.shift();
    if (next) next();
  }
}

function createProvider(): TtsProviderAdapter {
  const providerName = String(config.tts.provider || "tencent")
    .trim()
    .toLowerCase();
  if (providerName === "volcengine") {
    return new VolcengineTtsProvider();
  }
  if (providerName === "tencent") {
    return new TencentTtsProvider();
  }
  throw new TtsServiceError("TTS_DISABLED", `不支持的 TTS provider: ${providerName}`, 503);
}

export class TtsService {
  private provider: TtsProviderAdapter;
  private cache: TtsCacheStore;
  private semaphore: AsyncSemaphore;
  private inflight: Map<string, Promise<void>>;
  private failures: Map<string, TtsBackgroundFailure>;
  private inlineWaitMs: number;

  constructor(options?: TtsServiceOptions) {
    this.provider = options?.provider ?? createProvider();
    this.cache =
      options?.cache ??
      new TtsCacheStore({
        cacheDir: path.resolve(process.cwd(), "data/tts-cache"),
        ttlMs: TTS_CACHE_TTL_MS,
        maxTotalBytes: TTS_CACHE_TOTAL_MAX_BYTES,
        // 不同 TTS 供应商的分片/码率差异较大，单文件上限统一改由配置驱动。
        maxFileBytes: config.tts.cacheFileMaxBytes
      });
    this.semaphore = new AsyncSemaphore(TTS_PROVIDER_CONCURRENCY);
    this.inflight = new Map();
    this.failures = new Map();
    this.inlineWaitMs = Math.max(0, Math.round(Number(options?.inlineWaitMs) || TTS_SYNTHESIZE_INLINE_WAIT_MS));
  }

  private ticketSecret(): string {
    const secret = `${config.sync.secretCurrent}:${config.gatewayToken}`;
    if (!config.sync.secretCurrent) {
      throw new TtsServiceError("TTS_DISABLED", "同步密钥未配置，无法签发音频票据", 503);
    }
    return secret;
  }

  private ensureEnabled(): void {
    if (!config.tts.enabled) {
      throw new TtsServiceError("TTS_DISABLED", "TTS 服务未配置", 503);
    }
  }

  private buildAudioAccessUrls(baseUrl: string, uid: string, cacheKey: string) {
    const exp = Date.now() + TTS_AUDIO_TICKET_TTL_MS;
    const ticket = createTtsAudioTicket(this.ticketSecret(), { uid, cacheKey, exp });
    return {
      audioUrl: `${baseUrl}/api/miniprogram/tts/audio/${cacheKey}?ticket=${encodeURIComponent(ticket)}`,
      statusUrl: `${baseUrl}/api/miniprogram/tts/status/${cacheKey}?ticket=${encodeURIComponent(ticket)}`,
      expiresAt: new Date(exp).toISOString()
    };
  }

  private getRecentFailure(cacheKey: string): TtsBackgroundFailure | null {
    const row = this.failures.get(cacheKey);
    if (!row) {
      return null;
    }
    if (row.expiresAt <= Date.now()) {
      this.failures.delete(cacheKey);
      return null;
    }
    return row;
  }

  private rememberFailure(cacheKey: string, error: unknown): void {
    const failure =
      error instanceof TtsServiceError
        ? {
            code: error.code,
            message: error.message,
            status: error.status,
            expiresAt: Date.now() + TTS_BACKGROUND_FAILURE_TTL_MS
          }
        : {
            code: "TTS_INTERNAL_ERROR",
            message: error instanceof Error && error.message ? error.message : "语音生成失败",
            status: 500,
            expiresAt: Date.now() + TTS_BACKGROUND_FAILURE_TTL_MS
          };
    this.failures.set(cacheKey, failure);
  }

  private async synthesizeCacheMiss(normalized: TtsNormalizedRequest): Promise<void> {
    const result = await this.semaphore.use(async () => {
      return await this.provider.synthesize({
        text: normalized.normalizedText,
        voice: normalized.voice,
        speed: normalized.speed,
        traceId: randomUUID()
      });
    }, TTS_PROVIDER_QUEUE_TIMEOUT_MS);
    await this.cache.put(normalized.cacheKey, result.audio, result.contentType);
  }

  private ensureBackgroundSynthesis(normalized: TtsNormalizedRequest): void {
    if (this.inflight.has(normalized.cacheKey)) {
      return;
    }
    this.failures.delete(normalized.cacheKey);
    const job = (async () => {
      try {
        await this.synthesizeCacheMiss(normalized);
      } catch (error) {
        this.rememberFailure(normalized.cacheKey, error);
        logger.warn(
          {
            scene: normalized.scene,
            textHash: normalized.textHash,
            textLength: normalized.normalizedText.length,
            cacheKey: normalized.cacheKey,
            provider: this.provider.providerName,
            err: error
          },
          "小程序 TTS 后台合成失败"
        );
      } finally {
        this.inflight.delete(normalized.cacheKey);
      }
    })();
    job.catch(() => {
      // 后台任务的错误已经在内部收口到日志与 failure map，这里只防止未处理拒绝。
    });
    this.inflight.set(normalized.cacheKey, job);
  }

  /**
   * 首次 miss 时短暂等待后台任务：
   * 1. 短文本常在 1 秒内就能合成完成，直接返回 ready 可省掉一轮轮询；
   * 2. 等待窗口很短，慢请求仍按原有 pending 模式异步完成；
   * 3. 这里复用同一个 inflight 任务，不会增加上游并发。
   */
  private async waitInlineForReady(cacheKey: string): Promise<void> {
    if (this.inlineWaitMs <= 0) {
      return;
    }
    const inflight = this.inflight.get(cacheKey);
    if (!inflight) {
      return;
    }
    await Promise.race([
      inflight.catch(() => {
        // 失败状态仍交给后续 status 查询和 failure map 处理。
      }),
      sleep(this.inlineWaitMs)
    ]);
  }

  async synthesizeForUser(baseUrl: string, uid: string, input: TtsSynthesizeInput) {
    this.ensureEnabled();
    const normalized = normalizeTtsRequest(input);
    let cached = await this.cache.get(normalized.cacheKey);
    if (!cached) {
      this.ensureBackgroundSynthesis(normalized);
      await this.waitInlineForReady(normalized.cacheKey);
      cached = await this.cache.get(normalized.cacheKey);
    }
    const ticketResult = this.buildAudioAccessUrls(baseUrl, uid, normalized.cacheKey);
    const status = cached ? "ready" : "pending";
    logger.info(
      {
        uid,
        scene: normalized.scene,
        textHash: normalized.textHash,
        textLength: normalized.normalizedText.length,
        cacheKey: normalized.cacheKey,
        provider: this.provider.providerName,
        cacheHit: !!cached,
        synthStatus: status
      },
      cached ? "小程序 TTS 合成完成" : "小程序 TTS 合成任务已提交"
    );
    return {
      ok: true,
      cacheKey: normalized.cacheKey,
      cached: !!cached,
      status,
      audioUrl: ticketResult.audioUrl,
      statusUrl: ticketResult.statusUrl,
      expiresAt: ticketResult.expiresAt
    };
  }

  async getSynthesisStatus(cacheKey: string): Promise<TtsSynthesisStatus> {
    // 先看内存态，再碰磁盘，避免轮询刚好撞在 cache.put 的写入窗口里把半成品误删。
    if (this.inflight.has(cacheKey)) {
      return { state: "pending" };
    }
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      return { state: "ready" };
    }
    const failure = this.getRecentFailure(cacheKey);
    if (failure) {
      return {
        state: "error",
        code: failure.code,
        message: failure.message,
        status: failure.status
      };
    }
    return { state: "missing" };
  }

  verifyAudioAccess(cacheKey: string, ticket: string): TtsAudioAccess {
    const payload = verifyTtsAudioTicket(this.ticketSecret(), ticket);
    if (payload.cacheKey !== cacheKey) {
      throw new TtsServiceError("TTS_TICKET_INVALID", "音频票据无效", 403);
    }
    return payload;
  }

  async resolveCachedAudio(cacheKey: string) {
    return await this.cache.get(cacheKey);
  }
}
