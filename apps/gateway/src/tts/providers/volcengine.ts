import { randomUUID } from "node:crypto";
import { config } from "../../config";
import { logger } from "../../logger";
import type { TtsProviderAdapter, TtsProviderRequest, TtsProviderResult } from "../provider";
import {
  buildTtsUpstreamHttpError,
  buildTtsUpstreamRejectedMessage,
  isTtsUpstreamRejectedDetail,
  normalizeTtsUpstreamDetail,
  TtsServiceError
} from "../provider";

// 对齐当前豆包语音 HTTP 单向流式 SSE demo，默认走 SSE 端点；
// 同时仍保留 chunked JSON 解析兜底，兼容代理层或上游的回退响应。
const VOLCENGINE_TTS_URL = "https://openspeech.bytedance.com/api/v3/tts/unidirectional/sse";
const VOLCENGINE_TTS_SAMPLE_RATE = 24000;
const VOLCENGINE_STREAM_SUCCESS_CODE = 20000000;
const VOLCENGINE_STREAM_AUTH_REJECTED_CODE = 45000000;
const VOLCENGINE_STREAM_TEXT_TOO_LONG_CODE = 40402003;
const VOLCENGINE_STREAM_SENTENCE_END_EVENT = 351;
const VOLCENGINE_STREAM_AUDIO_EVENT = 352;
const VOLCENGINE_STREAM_FINISH_EVENT = 152;
const VOLCENGINE_STREAM_ERROR_EVENT = 153;

interface VolcengineTtsRequestBody {
  user: {
    uid: string;
  };
  req_params: {
    text: string;
    speaker: string;
    audio_params: {
      format: "mp3";
      sample_rate: number;
      speech_rate: number;
    };
    additions: string;
  };
}

interface VolcengineTtsHttpRequest {
  url: string;
  headers: Record<string, string>;
  body: VolcengineTtsRequestBody;
}

interface VolcengineTtsStreamPayload {
  code?: number;
  message?: string;
  event?: number;
  sequence?: number;
  data?: unknown;
  usage?: {
    text_words?: number;
  };
}

interface VolcengineStreamState {
  audioChunks: Buffer[];
  firstChunkAtMs: number;
  finishCode: number | null;
  usageTextWords: number | null;
}

function ensureVolcengineConfig(): void {
  if (!config.tts.appId || !config.tts.accessToken || !config.tts.resourceId) {
    throw new TtsServiceError("TTS_DISABLED", "TTS 服务未配置", 503);
  }
}

/**
 * V3 文档中 `speech_rate` 的取值范围为 `[-50, 100]`：
 * 1. `0` 表示 1.0x；
 * 2. `100` 表示 2.0x；
 * 3. 当前产品只暴露 0.8 / 1.0 / 1.2 三档，因此继续保守映射到同一线性区间。
 */
function mapRatioSpeedToVolcengineSpeechRate(speed: number): number {
  const normalized = Number.isFinite(Number(speed)) ? Number(speed) : 1;
  const mapped = Math.round((normalized - 1) * 100);
  return Math.max(-50, Math.min(100, mapped));
}

export function buildVolcengineTtsRequest(
  request: TtsProviderRequest,
  accessToken: string
): VolcengineTtsHttpRequest {
  ensureVolcengineConfig();
  const requestId = randomUUID();
  return {
    url: VOLCENGINE_TTS_URL,
    headers: {
      "Content-Type": "application/json",
      "X-Api-App-Id": config.tts.appId,
      // 文档里的 header 名仍是 `X-Api-Access-Key`，但其值实际应填写控制台签发的 Access Token。
      "X-Api-Access-Key": accessToken,
      "X-Api-Resource-Id": config.tts.resourceId,
      "X-Api-Request-Id": requestId,
      // 要求在结束事件里返回 text_words，方便记录计费量和排障。
      "X-Control-Require-Usage-Tokens-Return": "text_words"
    },
    body: {
      user: {
        uid: request.traceId || requestId
      },
      req_params: {
        text: request.text,
        speaker: request.voice.volcVoiceType,
        audio_params: {
          format: "mp3",
          sample_rate: VOLCENGINE_TTS_SAMPLE_RATE,
          speech_rate: mapRatioSpeedToVolcengineSpeechRate(request.speed)
        },
        // 小程序送来的播报文本常带 Markdown/终端痕迹，要求上游先做一次语法过滤，降低朗读噪音。
        additions: JSON.stringify({
          disable_markdown_filter: true
        })
      }
    }
  };
}

function extractHttpErrorDetail(rawText: string): string {
  const text = normalizeTtsUpstreamDetail(rawText);
  if (!text) {
    return "";
  }
  try {
    const parsed = JSON.parse(text) as { message?: string; code?: number | string; data?: unknown };
    const detail = normalizeTtsUpstreamDetail(
      parsed.message || (typeof parsed.data === "string" ? parsed.data : "") || text
    );
    if (parsed.code !== undefined) {
      return detail ? `code=${parsed.code} ${detail}` : `code=${parsed.code}`;
    }
    return detail;
  } catch {
    return text;
  }
}

function extractStreamDetail(payload: VolcengineTtsStreamPayload): string {
  const directMessage = normalizeTtsUpstreamDetail(payload.message || "");
  if (directMessage) {
    return directMessage;
  }
  if (typeof payload.data === "string") {
    return normalizeTtsUpstreamDetail(payload.data);
  }
  return "";
}

function resolveAudioBase64(data: unknown): string {
  if (typeof data === "string") {
    return data.trim();
  }
  if (!data || typeof data !== "object") {
    return "";
  }
  const row = data as Record<string, unknown>;
  const direct = row.audio_base64 ?? row.audio ?? row.audio_data;
  return typeof direct === "string" ? direct.trim() : "";
}

function createVolcengineStreamError(payload: VolcengineTtsStreamPayload): TtsServiceError {
  const code = Number(payload.code ?? 0);
  const detail = extractStreamDetail(payload);
  if (code === VOLCENGINE_STREAM_TEXT_TOO_LONG_CODE) {
    return new TtsServiceError("TEXT_TOO_LONG", "播报文本过长", 400);
  }
  if (/quota exceeded.*concurrency|concurrency.*quota exceeded|too many requests/i.test(detail)) {
    return new TtsServiceError("TTS_BUSY", "语音生成繁忙，请稍后重试", 503);
  }
  if (code === VOLCENGINE_STREAM_AUTH_REJECTED_CODE || isTtsUpstreamRejectedDetail(detail)) {
    return new TtsServiceError("TTS_UPSTREAM_REJECTED", buildTtsUpstreamRejectedMessage(detail), 502);
  }
  const codeLabel = code > 0 ? `火山 TTS 错误码 ${code}` : "语音生成失败";
  return new TtsServiceError("TTS_UPSTREAM_FAILED", detail ? `${codeLabel}: ${detail}` : codeLabel, 502);
}

function extractJsonObjects(source: string): { items: string[]; rest: string } {
  const items: string[] = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]!;
    if (start < 0) {
      if (char === "{") {
        start = index;
        depth = 1;
      }
      continue;
    }
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{") {
      depth += 1;
      continue;
    }
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        items.push(source.slice(start, index + 1));
        start = -1;
      }
    }
  }

  return {
    items,
    rest: start >= 0 ? source.slice(start) : ""
  };
}

function extractSseBlocks(source: string, flush: boolean): { items: string[]; rest: string } {
  const items: string[] = [];
  let rest = source;

  while (true) {
    const matched = rest.match(/\r\n\r\n|\n\n/);
    if (!matched || matched.index === undefined) {
      break;
    }
    const block = rest.slice(0, matched.index);
    rest = rest.slice(matched.index + matched[0].length);
    const dataLines = block
      .split(/\r\n|\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice("data:".length).trimStart());
    if (dataLines.length > 0) {
      items.push(dataLines.join("\n"));
    }
  }

  if (flush && rest.trim()) {
    const dataLines = rest
      .split(/\r\n|\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice("data:".length).trimStart());
    if (dataLines.length > 0) {
      items.push(dataLines.join("\n"));
      rest = "";
    }
  }

  return { items, rest };
}

function applyStreamPayload(
  state: VolcengineStreamState,
  payload: VolcengineTtsStreamPayload,
  startedAt: number,
  traceId: string
): void {
  const event = Number(payload.event ?? 0);
  const code = Number(payload.code ?? 0);
  if (event === VOLCENGINE_STREAM_ERROR_EVENT || (code !== 0 && code !== VOLCENGINE_STREAM_SUCCESS_CODE)) {
    throw createVolcengineStreamError(payload);
  }

  const audioBase64 = resolveAudioBase64(payload.data);
  if (audioBase64 && (event === 0 || event === VOLCENGINE_STREAM_AUDIO_EVENT)) {
    if (!state.firstChunkAtMs) {
      state.firstChunkAtMs = Date.now();
      logger.info(
        {
          traceId,
          resourceId: config.tts.resourceId,
          elapsedMs: state.firstChunkAtMs - startedAt
        },
        "火山 TTS 收到首个音频分片"
      );
    }
    state.audioChunks.push(Buffer.from(audioBase64, "base64"));
    return;
  }

  if (event === VOLCENGINE_STREAM_SENTENCE_END_EVENT) {
    return;
  }

  if (event === VOLCENGINE_STREAM_FINISH_EVENT || code === VOLCENGINE_STREAM_SUCCESS_CODE) {
    state.finishCode = code || VOLCENGINE_STREAM_SUCCESS_CODE;
    state.usageTextWords =
      payload.usage && typeof payload.usage.text_words === "number"
        ? payload.usage.text_words
        : state.usageTextWords;
  }
}

async function consumeVolcengineStream(
  response: Response,
  request: TtsProviderRequest,
  startedAt: number
): Promise<VolcengineStreamState> {
  if (!response.body) {
    throw new TtsServiceError("TTS_UPSTREAM_FAILED", "TTS 上游未返回流式响应体", 502);
  }
  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  const isSse = contentType.includes("text/event-stream");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const state: VolcengineStreamState = {
    audioChunks: [],
    firstChunkAtMs: 0,
    finishCode: null,
    usageTextWords: null
  };
  let streamBuffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (value) {
      streamBuffer += decoder.decode(value, { stream: !done });
      if (isSse) {
        const parsed = extractSseBlocks(streamBuffer, false);
        streamBuffer = parsed.rest;
        for (const item of parsed.items) {
          applyStreamPayload(
            state,
            JSON.parse(item) as VolcengineTtsStreamPayload,
            startedAt,
            request.traceId
          );
        }
      } else {
        const parsed = extractJsonObjects(streamBuffer);
        streamBuffer = parsed.rest;
        for (const item of parsed.items) {
          applyStreamPayload(
            state,
            JSON.parse(item) as VolcengineTtsStreamPayload,
            startedAt,
            request.traceId
          );
        }
      }
    }
    if (done) {
      break;
    }
  }

  streamBuffer += decoder.decode();
  if (streamBuffer.trim()) {
    if (isSse) {
      const parsed = extractSseBlocks(streamBuffer, true);
      streamBuffer = parsed.rest;
      for (const item of parsed.items) {
        applyStreamPayload(state, JSON.parse(item) as VolcengineTtsStreamPayload, startedAt, request.traceId);
      }
    } else {
      const parsed = extractJsonObjects(streamBuffer);
      streamBuffer = parsed.rest;
      for (const item of parsed.items) {
        applyStreamPayload(state, JSON.parse(item) as VolcengineTtsStreamPayload, startedAt, request.traceId);
      }
      if (streamBuffer.trim()) {
        applyStreamPayload(
          state,
          JSON.parse(streamBuffer) as VolcengineTtsStreamPayload,
          startedAt,
          request.traceId
        );
        streamBuffer = "";
      }
    }
  }

  if (streamBuffer.trim()) {
    throw new TtsServiceError("TTS_UPSTREAM_FAILED", "TTS 上游流式响应不完整", 502);
  }

  return state;
}

export class VolcengineTtsProvider implements TtsProviderAdapter {
  readonly providerName = "volcengine";

  async synthesize(request: TtsProviderRequest): Promise<TtsProviderResult> {
    const token = String(config.tts.accessToken || "").trim();
    if (!token) {
      throw new TtsServiceError("TTS_DISABLED", "TTS 服务未配置", 503);
    }
    const built = buildVolcengineTtsRequest(request, token);
    const timeoutMs = config.tts.timeoutMs;
    const startedAt = Date.now();
    let stage = "requesting";

    logger.info(
      {
        traceId: request.traceId,
        textLength: request.text.length,
        resourceId: config.tts.resourceId,
        timeoutMs
      },
      "火山 TTS 合成开始"
    );

    try {
      const response = await fetch(built.url, {
        method: "POST",
        headers: built.headers,
        body: JSON.stringify(built.body),
        signal: AbortSignal.timeout(timeoutMs)
      });
      stage = "response_headers";

      if (!response.ok) {
        const detail = extractHttpErrorDetail(await response.text());
        throw buildTtsUpstreamHttpError(response.status, detail);
      }

      stage = "streaming";
      const streamState = await consumeVolcengineStream(response, request, startedAt);

      if (streamState.audioChunks.length === 0) {
        throw new TtsServiceError("TTS_UPSTREAM_FAILED", "TTS 上游未返回音频", 502);
      }

      logger.info(
        {
          traceId: request.traceId,
          resourceId: config.tts.resourceId,
          chunkCount: streamState.audioChunks.length,
          audioBytes: streamState.audioChunks.reduce((sum, item) => sum + item.length, 0),
          elapsedMs: Date.now() - startedAt,
          firstChunkDelayMs: streamState.firstChunkAtMs ? streamState.firstChunkAtMs - startedAt : null,
          usageTextWords: streamState.usageTextWords
        },
        "火山 TTS 合成完成"
      );

      return {
        audio: Buffer.concat(streamState.audioChunks),
        contentType: "audio/mpeg"
      };
    } catch (error) {
      logger.warn(
        {
          traceId: request.traceId,
          resourceId: config.tts.resourceId,
          stage,
          elapsedMs: Date.now() - startedAt,
          err: error
        },
        "火山 TTS 合成失败"
      );
      if (error instanceof TtsServiceError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error || "");
      if (/timeout|timed out|aborted|超时/i.test(message)) {
        throw new TtsServiceError("TTS_UPSTREAM_FAILED", "语音生成超时，请稍后重试", 502);
      }
      if (isTtsUpstreamRejectedDetail(message)) {
        throw new TtsServiceError("TTS_UPSTREAM_REJECTED", buildTtsUpstreamRejectedMessage(message), 502);
      }
      throw new TtsServiceError(
        "TTS_UPSTREAM_FAILED",
        normalizeTtsUpstreamDetail(message) || "语音生成失败",
        502
      );
    }
  }
}
