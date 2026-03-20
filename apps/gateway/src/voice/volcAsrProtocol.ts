import { gunzipSync, gzipSync } from "node:zlib";

export const VOLC_PROTOCOL_VERSION = 0b0001;
export const VOLC_HEADER_SIZE_WORDS = 0b0001; // 1 * 4 bytes

export const enum VolcMessageType {
  FULL_CLIENT_REQUEST = 0b0001,
  AUDIO_ONLY_REQUEST = 0b0010,
  FULL_SERVER_RESPONSE = 0b1001,
  ERROR_RESPONSE = 0b1111
}

export const enum VolcMessageFlags {
  NONE = 0b0000,
  POSITIVE_SEQUENCE = 0b0001,
  LAST_PACKAGE = 0b0010,
  NEGATIVE_SEQUENCE = 0b0011
}

export const enum VolcSerialization {
  NONE = 0b0000,
  JSON = 0b0001
}

export const enum VolcCompression {
  NONE = 0b0000,
  GZIP = 0b0001
}

export interface VolcFullClientRequestPayload {
  user?: Record<string, unknown>;
  audio: {
    format: "pcm" | "wav" | "ogg" | "mp3";
    codec?: "raw" | "opus";
    rate?: number;
    bits?: number;
    channel?: number;
    language?: string;
  };
  request: Record<string, unknown> & {
    model_name: string;
  };
}

export interface ParsedVolcServerResponse {
  kind: "server_response";
  flags: number;
  sequence: number | null;
  payload: unknown;
}

export interface ParsedVolcServerError {
  kind: "error";
  flags: number;
  errorCode: number;
  payload: unknown;
}

export interface ParsedVolcUnknownFrame {
  kind: "unknown";
  messageType: number;
  flags: number;
  payload: unknown;
}

export type ParsedVolcServerFrame = ParsedVolcServerResponse | ParsedVolcServerError | ParsedVolcUnknownFrame;

function decodePayload(serialization: number, compression: number, payload: Buffer): unknown {
  const inflated = compression === VolcCompression.GZIP ? gunzipSync(payload) : payload;
  if (serialization === VolcSerialization.NONE) {
    return inflated;
  }
  if (serialization === VolcSerialization.JSON) {
    const rawText = inflated.toString("utf8");
    return JSON.parse(rawText);
  }
  throw new Error(`unsupported serialization method: ${serialization}`);
}

function encodeJsonPayload(payload: unknown, compression: VolcCompression): Buffer {
  const raw = Buffer.from(JSON.stringify(payload), "utf8");
  if (compression === VolcCompression.GZIP) {
    return gzipSync(raw);
  }
  return raw;
}

function encodeBinaryPayload(payload: Buffer, compression: VolcCompression): Buffer {
  if (compression === VolcCompression.GZIP) {
    return gzipSync(payload);
  }
  return payload;
}

export function buildVolcHeader(params: {
  messageType: number;
  flags: number;
  serialization: number;
  compression: number;
}): Buffer {
  const header = Buffer.alloc(4);
  header[0] = ((VOLC_PROTOCOL_VERSION & 0x0f) << 4) | (VOLC_HEADER_SIZE_WORDS & 0x0f);
  header[1] = ((params.messageType & 0x0f) << 4) | (params.flags & 0x0f);
  header[2] = ((params.serialization & 0x0f) << 4) | (params.compression & 0x0f);
  header[3] = 0;
  return header;
}

/**
 * 构造 full client request：
 * 1) JSON 序列化；
 * 2) 使用 GZIP 压缩；
 * 3) payload size 使用 4 字节大端无符号整数。
 */
export function buildFullClientRequestFrame(payload: VolcFullClientRequestPayload): Buffer {
  const compressedPayload = encodeJsonPayload(payload, VolcCompression.GZIP);
  const header = buildVolcHeader({
    messageType: VolcMessageType.FULL_CLIENT_REQUEST,
    flags: VolcMessageFlags.NONE,
    serialization: VolcSerialization.JSON,
    compression: VolcCompression.GZIP
  });
  const payloadSize = Buffer.alloc(4);
  payloadSize.writeUInt32BE(compressedPayload.length, 0);
  return Buffer.concat([header, payloadSize, compressedPayload]);
}

/**
 * 构造 audio-only request：
 * - payload 直接是二进制音频（PCM16LE）；
 * - 与 full request 保持一致，启用 GZIP 压缩；
 * - final=true 时设置 LAST_PACKAGE 标记。
 */
export function buildAudioOnlyRequestFrame(audioPayload: Buffer, final: boolean): Buffer {
  const compressedPayload = encodeBinaryPayload(audioPayload, VolcCompression.GZIP);
  const header = buildVolcHeader({
    messageType: VolcMessageType.AUDIO_ONLY_REQUEST,
    flags: final ? VolcMessageFlags.LAST_PACKAGE : VolcMessageFlags.NONE,
    serialization: VolcSerialization.NONE,
    compression: VolcCompression.GZIP
  });
  const payloadSize = Buffer.alloc(4);
  payloadSize.writeUInt32BE(compressedPayload.length, 0);
  return Buffer.concat([header, payloadSize, compressedPayload]);
}

/**
 * 根据文档约定判断“服务端是否为最后一包结果”。
 */
export function isFinalServerResponse(flags: number): boolean {
  return flags === VolcMessageFlags.LAST_PACKAGE || flags === VolcMessageFlags.NEGATIVE_SEQUENCE;
}

/**
 * 解析服务端二进制帧：
 * - FULL_SERVER_RESPONSE: [header][sequence?][payload_size][payload]
 * - ERROR_RESPONSE:       [header][error_code][payload_size][payload]
 */
export function parseVolcServerFrame(frame: Buffer): ParsedVolcServerFrame {
  if (frame.length < 8) {
    throw new Error("invalid volc frame: too short");
  }
  const headerByte0 = frame[0] ?? 0;
  const headerByte1 = frame[1] ?? 0;
  const headerByte2 = frame[2] ?? 0;
  const headerSizeWords = headerByte0 & 0x0f;
  const headerSizeBytes = headerSizeWords * 4;
  if (headerSizeWords < 1 || frame.length < headerSizeBytes + 4) {
    throw new Error("invalid volc frame: bad header size");
  }

  const messageType = (headerByte1 & 0xf0) >> 4;
  const flags = headerByte1 & 0x0f;
  const serialization = (headerByte2 & 0xf0) >> 4;
  const compression = headerByte2 & 0x0f;

  if (messageType === VolcMessageType.FULL_SERVER_RESPONSE) {
    const parseServerResponseVariant = (
      withSequence: boolean
    ): { ok: true; value: ParsedVolcServerResponse } | { ok: false; reason: string } => {
      let offset = headerSizeBytes;
      let sequence: number | null = null;
      if (withSequence) {
        if (frame.length < offset + 4) {
          return { ok: false, reason: "invalid volc frame: missing sequence" };
        }
        sequence = frame.readInt32BE(offset);
        offset += 4;
      }
      if (frame.length < offset + 4) {
        return { ok: false, reason: "invalid volc frame: missing payload size" };
      }
      const payloadSize = frame.readUInt32BE(offset);
      offset += 4;
      if (frame.length < offset + payloadSize) {
        return { ok: false, reason: "invalid volc frame: payload truncated" };
      }
      const payloadBuffer = frame.subarray(offset, offset + payloadSize);
      try {
        return {
          ok: true,
          value: {
            kind: "server_response",
            flags,
            sequence,
            payload: decodePayload(serialization, compression, payloadBuffer)
          }
        };
      } catch (error) {
        return {
          ok: false,
          reason: `invalid volc frame: ${(error as Error).message}`
        };
      }
    };

    const preferSequenceFirst = flags === VolcMessageFlags.POSITIVE_SEQUENCE || flags === VolcMessageFlags.NEGATIVE_SEQUENCE;
    const firstTry = parseServerResponseVariant(preferSequenceFirst);
    if (firstTry.ok) {
      return firstTry.value;
    }
    const secondTry = parseServerResponseVariant(!preferSequenceFirst);
    if (secondTry.ok) {
      return secondTry.value;
    }
    throw new Error(secondTry.reason || firstTry.reason);
  }

  if (messageType === VolcMessageType.ERROR_RESPONSE) {
    let offset = headerSizeBytes;
    if (frame.length < offset + 8) {
      throw new Error("invalid volc frame: bad error frame");
    }
    const errorCode = frame.readUInt32BE(offset);
    offset += 4;
    const payloadSize = frame.readUInt32BE(offset);
    offset += 4;
    if (frame.length < offset + payloadSize) {
      throw new Error("invalid volc frame: error payload truncated");
    }
    const payloadBuffer = frame.subarray(offset, offset + payloadSize);
    return {
      kind: "error",
      flags,
      errorCode,
      payload: decodePayload(serialization, compression, payloadBuffer)
    };
  }

  let payload: unknown = Buffer.alloc(0);
  if (frame.length >= headerSizeBytes + 4) {
    const payloadSize = frame.readUInt32BE(headerSizeBytes);
    const payloadOffset = headerSizeBytes + 4;
    if (frame.length >= payloadOffset + payloadSize) {
      payload = decodePayload(serialization, compression, frame.subarray(payloadOffset, payloadOffset + payloadSize));
    }
  }

  return {
    kind: "unknown",
    messageType,
    flags,
    payload
  };
}
