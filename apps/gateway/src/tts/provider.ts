import { createHash } from "node:crypto";
import { config } from "../config";

export interface TtsSynthesizeInput {
  text: string;
  scene: "codex_terminal";
  voice?: string;
  speed?: number;
}

export interface TtsVoiceProfile {
  alias: string;
  providerVoiceType: number;
  volcVoiceType: string;
}

export interface TtsNormalizedRequest {
  scene: "codex_terminal";
  normalizedText: string;
  voice: TtsVoiceProfile;
  speed: number;
  textHash: string;
  cacheKey: string;
  provider: string;
}

export interface TtsProviderRequest {
  text: string;
  voice: TtsVoiceProfile;
  speed: number;
  traceId: string;
}

export interface TtsProviderResult {
  audio: Buffer;
  contentType: string;
}

export interface TtsProviderAdapter {
  readonly providerName: string;
  synthesize(request: TtsProviderRequest): Promise<TtsProviderResult>;
}

export const TTS_UPSTREAM_REJECTED_MESSAGE = "TTS 上游鉴权或权限失败，请检查密钥、地域和账号权限";

const TTS_VOICE_PROFILES: Record<string, TtsVoiceProfile> = Object.freeze({
  female_v1: {
    alias: "female_v1",
    providerVoiceType: 101027,
    // 豆包语音合成 1.0 公共女声音色，和 `volc.service_type.10029` 同代可直接配套使用。
    volcVoiceType: "zh_female_cancan_mars_bigtts"
  },
  male_v1: {
    alias: "male_v1",
    providerVoiceType: 101004,
    // 同步切到豆包 1.0 公共男声音色，避免旧 BV700 音色与当前 resource_id 代际不匹配。
    volcVoiceType: "zh_male_qingshuangnanda_mars_bigtts"
  }
});

const TTS_MAX_NORMALIZED_UTF8_BYTES = 450;

/**
 * 对外错误统一带 code / status，路由层只做一次翻译。
 */
export class TtsServiceError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "TtsServiceError";
    this.code = code;
    this.status = status;
  }
}

/**
 * 上游错误正文经常包含换行、长追踪串或 HTML 片段：
 * 1. 压成单行，便于进入日志和小程序 warning；
 * 2. 截断到有限长度，避免把整段上游响应直接透给前端；
 * 3. 保留最关键的错误码和首句说明。
 */
export function normalizeTtsUpstreamDetail(rawDetail: unknown): string {
  const detail = typeof rawDetail === "string" ? rawDetail : String(rawDetail || "");
  if (!detail.trim()) return "";
  const singleLine = detail.replace(/\s+/g, " ").trim();
  return singleLine.length > 180 ? `${singleLine.slice(0, 177)}...` : singleLine;
}

export function buildTtsUpstreamRejectedMessage(detail?: string): string {
  const normalizedDetail = normalizeTtsUpstreamDetail(detail);
  return normalizedDetail
    ? `${TTS_UPSTREAM_REJECTED_MESSAGE}（${normalizedDetail}）`
    : TTS_UPSTREAM_REJECTED_MESSAGE;
}

export function isTtsUpstreamRejectedDetail(detail: string): boolean {
  return /(not granted|access token|authorization|auth|permission|forbidden|unauthorized|resource|grant|鉴权|权限|令牌|密钥)/i.test(
    normalizeTtsUpstreamDetail(detail)
  );
}

export function buildTtsUpstreamHttpError(status: number, detail?: string): TtsServiceError {
  if (status === 401 || status === 403) {
    return new TtsServiceError("TTS_UPSTREAM_REJECTED", buildTtsUpstreamRejectedMessage(detail), 502);
  }
  const normalizedDetail = normalizeTtsUpstreamDetail(detail);
  return new TtsServiceError(
    "TTS_UPSTREAM_FAILED",
    normalizedDetail ? `TTS 上游请求失败: ${status} ${normalizedDetail}` : `TTS 上游请求失败: ${status}`,
    502
  );
}

export function buildTextHash(text: string): string {
  return createHash("sha1")
    .update(String(text || ""), "utf8")
    .digest("hex");
}

/**
 * 网关二次归一化文本：
 * 1. 合并 CRLF / 多空格，避免同义文本重复生成缓存；
 * 2. 压缩重复标点，降低 TTS 朗读噪音；
 * 3. 保留自然语言句间空格，不在服务端做过度语义改写。
 */
export function normalizeTtsText(rawText: string): string {
  return String(rawText || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .replace(/([。！？!?.,，；;:：])\1{1,}/g, "$1")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .trim();
}

export function normalizeTtsSpeed(rawSpeed: unknown): number {
  const fallback = Number(config.tts.speedDefault) || 1;
  const numeric = Number(rawSpeed);
  if (!Number.isFinite(numeric)) {
    return Math.max(0.8, Math.min(1.2, fallback));
  }
  return Math.max(0.8, Math.min(1.2, Number(numeric.toFixed(2))));
}

export function resolveTtsVoiceProfile(rawVoice: unknown): TtsVoiceProfile {
  const normalized = String(rawVoice || config.tts.voiceDefault || "female_v1")
    .trim()
    .toLowerCase();
  return TTS_VOICE_PROFILES[normalized] ?? TTS_VOICE_PROFILES.female_v1!;
}

export function buildTtsCacheKey(
  providerName: string,
  voice: TtsVoiceProfile,
  speed: number,
  normalizedText: string
): string {
  return createHash("sha1")
    .update(
      [
        String(providerName || "")
          .trim()
          .toLowerCase(),
        String(voice.alias || ""),
        String(Number(speed).toFixed(2)),
        normalizedText,
        "v1"
      ].join("\n"),
      "utf8"
    )
    .digest("hex");
}

export function normalizeTtsRequest(input: TtsSynthesizeInput): TtsNormalizedRequest {
  const source: Partial<TtsSynthesizeInput> =
    input && typeof input === "object" ? input : { text: "", scene: "codex_terminal" };
  const rawText = String(source.text || "");
  if (rawText.length > 500) {
    throw new TtsServiceError("TEXT_TOO_LONG", "播报文本过长", 400);
  }
  const normalizedText = normalizeTtsText(rawText);
  if (!normalizedText) {
    throw new TtsServiceError("TEXT_NOT_SPEAKABLE", "当前内容不适合播报", 400);
  }
  if (Buffer.byteLength(normalizedText, "utf8") > TTS_MAX_NORMALIZED_UTF8_BYTES) {
    throw new TtsServiceError("TEXT_TOO_LONG", "播报文本过长", 400);
  }
  if (normalizedText.length > 280) {
    throw new TtsServiceError("TEXT_TOO_LONG", "播报文本过长", 400);
  }
  const voice = resolveTtsVoiceProfile(source.voice);
  const speed = normalizeTtsSpeed(source.speed);
  const providerName =
    String(config.tts.provider || "tencent")
      .trim()
      .toLowerCase() || "tencent";
  const scene = source.scene === "codex_terminal" ? "codex_terminal" : "codex_terminal";
  return {
    scene,
    normalizedText,
    voice,
    speed,
    textHash: buildTextHash(normalizedText),
    cacheKey: buildTtsCacheKey(providerName, voice, speed, normalizedText),
    provider: providerName
  };
}
