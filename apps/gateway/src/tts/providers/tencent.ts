import { createHmac, createHash, randomUUID } from "node:crypto";
import { config } from "../../config";
import type { TtsProviderAdapter, TtsProviderRequest, TtsProviderResult } from "../provider";
import {
  buildTtsUpstreamHttpError,
  buildTtsUpstreamRejectedMessage,
  normalizeTtsUpstreamDetail,
  TtsServiceError
} from "../provider";

const TENCENT_TTS_HOST = "tts.tencentcloudapi.com";
const TENCENT_TTS_ACTION = "TextToVoice";
const TENCENT_TTS_VERSION = "2019-08-23";
const TENCENT_TTS_SERVICE = "tts";

interface TencentTtsRequestPayload {
  Text: string;
  SessionId: string;
  ModelType: number;
  VoiceType: number;
  Codec: "mp3";
  SampleRate: number;
  PrimaryLanguage: number;
  Speed: number;
  Volume: number;
}

interface TencentTtsResponse {
  Response?: {
    Audio?: string;
    Error?: {
      Code?: string;
      Message?: string;
    };
  };
}

/**
 * 小程序侧把 speed 暴露为“倍速语义”：
 * - 1.0 表示 1x；
 * - 0.8 / 1.2 分别对应较慢 / 较快。
 * 腾讯云 `Speed` 的 0 才是 1x，因此这里做一层线性映射：
 *   0.8 -> -1
 *   1.0 ->  0
 *   1.2 ->  1
 */
function mapRatioSpeedToTencentSpeed(speed: number): number {
  const normalized = Number.isFinite(Number(speed)) ? Number(speed) : 1;
  const providerSpeed = (normalized - 1) / 0.2;
  return Math.max(-2, Math.min(6, Number(providerSpeed.toFixed(2))));
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function hmacSha256(
  key: Buffer | string,
  value: string,
  output: "hex" | "buffer" = "buffer"
): Buffer | string {
  const digest = createHmac("sha256", key).update(value, "utf8");
  return output === "hex" ? digest.digest("hex") : digest.digest();
}

function parseTencentTtsResponse(rawText: string): TencentTtsResponse | null {
  try {
    return JSON.parse(rawText) as TencentTtsResponse;
  } catch {
    return null;
  }
}

/**
 * 腾讯云错误体通常同时带 Code 和 Message：
 * 1. 优先把 Code 保留下来，便于直接定位 CAM/签名/权限问题；
 * 2. 无 JSON 时再退回原始文本，避免完全丢掉上游返回。
 */
function formatTencentErrorDetail(
  errorPayload?: { Code?: string; Message?: string } | null,
  rawText?: string
): string {
  const code = normalizeTtsUpstreamDetail(errorPayload?.Code);
  const message = normalizeTtsUpstreamDetail(errorPayload?.Message);
  if (code && message) {
    return `${code}: ${message}`;
  }
  if (code) {
    return code;
  }
  if (message) {
    return message;
  }
  return normalizeTtsUpstreamDetail(rawText);
}

/**
 * 腾讯云 API 3.0（TC3-HMAC-SHA256）签名：
 * 1. 仅签当前固定 header 集合，避免实现过度泛化；
 * 2. action / version / host 都来自官方 TextToVoice 接口；
 * 3. TTS v1 只走短文本同步合成，返回 base64 音频。
 */
export function buildTencentTextToVoiceRequest(request: TtsProviderRequest, now = Date.now()) {
  const secretId = String(config.tts.secretId || "").trim();
  const secretKey = String(config.tts.secretKey || "").trim();
  if (!secretId || !secretKey) {
    throw new TtsServiceError("TTS_DISABLED", "TTS 服务未配置", 503);
  }
  const payload: TencentTtsRequestPayload = {
    Text: request.text,
    SessionId: request.traceId || randomUUID(),
    ModelType: 1,
    VoiceType: request.voice.providerVoiceType,
    Codec: "mp3",
    SampleRate: 16000,
    PrimaryLanguage: 1,
    Speed: mapRatioSpeedToTencentSpeed(request.speed),
    Volume: 1
  };
  const body = JSON.stringify(payload);
  const timestamp = Math.max(1, Math.floor(now / 1000));
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
  const canonicalHeaders = [
    "content-type:application/json; charset=utf-8",
    `host:${TENCENT_TTS_HOST}`,
    `x-tc-action:${TENCENT_TTS_ACTION.toLowerCase()}`
  ].join("\n");
  const signedHeaders = "content-type;host;x-tc-action";
  const canonicalRequest = ["POST", "/", "", `${canonicalHeaders}\n`, signedHeaders, sha256Hex(body)].join(
    "\n"
  );
  const credentialScope = `${date}/${TENCENT_TTS_SERVICE}/tc3_request`;
  const stringToSign = [
    "TC3-HMAC-SHA256",
    String(timestamp),
    credentialScope,
    sha256Hex(canonicalRequest)
  ].join("\n");
  const secretDate = hmacSha256(`TC3${secretKey}`, date) as Buffer;
  const secretService = hmacSha256(secretDate, TENCENT_TTS_SERVICE) as Buffer;
  const secretSigning = hmacSha256(secretService, "tc3_request") as Buffer;
  const signature = hmacSha256(secretSigning, stringToSign, "hex") as string;
  const authorization = [
    "TC3-HMAC-SHA256",
    `Credential=${secretId}/${credentialScope}`,
    `SignedHeaders=${signedHeaders}`,
    `Signature=${signature}`
  ].join(", ");
  return {
    url: `https://${TENCENT_TTS_HOST}`,
    body,
    payload,
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json; charset=utf-8",
      Host: TENCENT_TTS_HOST,
      "X-TC-Action": TENCENT_TTS_ACTION,
      "X-TC-Region": config.tts.region,
      "X-TC-Timestamp": String(timestamp),
      "X-TC-Version": TENCENT_TTS_VERSION
    }
  };
}

export class TencentTtsProvider implements TtsProviderAdapter {
  readonly providerName = "tencent";

  async synthesize(request: TtsProviderRequest): Promise<TtsProviderResult> {
    const built = buildTencentTextToVoiceRequest(request);
    let response: Response;
    try {
      response = await fetch(built.url, {
        method: "POST",
        headers: built.headers,
        body: built.body,
        signal: AbortSignal.timeout(config.tts.timeoutMs)
      });
    } catch (error) {
      throw new TtsServiceError(
        "TTS_UPSTREAM_FAILED",
        error instanceof Error && /timeout/i.test(error.message)
          ? "语音生成超时，请稍后重试"
          : "语音生成失败",
        502
      );
    }
    const rawText = await response.text();
    const parsed = parseTencentTtsResponse(rawText);
    if (!response.ok) {
      throw buildTtsUpstreamHttpError(response.status, formatTencentErrorDetail(parsed?.Response?.Error, rawText));
    }
    if (!parsed) {
      throw new TtsServiceError("TTS_UPSTREAM_FAILED", "TTS 上游返回格式异常", 502);
    }
    const errorPayload = parsed.Response?.Error;
    if (errorPayload) {
      const detail = formatTencentErrorDetail(errorPayload, rawText);
      if (/^(AuthFailure|UnauthorizedOperation)\b/.test(String(errorPayload.Code || "").trim())) {
        throw new TtsServiceError("TTS_UPSTREAM_REJECTED", buildTtsUpstreamRejectedMessage(detail), 502);
      }
      throw new TtsServiceError(
        "TTS_UPSTREAM_FAILED",
        detail || "TTS 上游返回错误",
        502
      );
    }
    const audioBase64 = String(parsed.Response?.Audio || "").trim();
    if (!audioBase64) {
      throw new TtsServiceError("TTS_UPSTREAM_FAILED", "TTS 上游未返回音频", 502);
    }
    return {
      audio: Buffer.from(audioBase64, "base64"),
      contentType: "audio/mpeg"
    };
  }
}
