import { Buffer } from "node:buffer";
import type WebSocket from "ws";
import type { RawData } from "ws";

/**
 * 这里只保留 gateway 现阶段真正会用到的播客协议常量：
 * 1. 连接生命周期；
 * 2. 会话生命周期；
 * 3. 播客音频 round 输出。
 */
export enum VolcenginePodcastEventType {
  StartConnection = 1,
  FinishConnection = 2,
  ConnectionStarted = 50,
  ConnectionFinished = 52,
  StartSession = 100,
  FinishSession = 102,
  SessionStarted = 150,
  SessionFinished = 152,
  PodcastRoundStart = 360,
  PodcastRoundResponse = 361,
  PodcastRoundEnd = 362,
  PodcastEnd = 363
}

export enum VolcenginePodcastMsgType {
  FullClientRequest = 0b1,
  FullServerResponse = 0b1001,
  AudioOnlyServer = 0b1011,
  Error = 0b1111
}

export enum VolcenginePodcastMsgFlagBits {
  NoSeq = 0,
  PositiveSeq = 0b1,
  NegativeSeq = 0b11,
  WithEvent = 0b100
}

enum VolcenginePodcastVersionBits {
  Version1 = 1
}

enum VolcenginePodcastHeaderSizeBits {
  HeaderSize4 = 1
}

enum VolcenginePodcastSerializationBits {
  JSON = 0b1
}

enum VolcenginePodcastCompressionBits {
  None = 0
}

export interface VolcenginePodcastMessage {
  version: VolcenginePodcastVersionBits;
  headerSize: VolcenginePodcastHeaderSizeBits;
  type: VolcenginePodcastMsgType;
  flag: VolcenginePodcastMsgFlagBits;
  serialization: VolcenginePodcastSerializationBits;
  compression: VolcenginePodcastCompressionBits;
  event?: VolcenginePodcastEventType;
  sessionId?: string;
  connectId?: string;
  sequence?: number;
  errorCode?: number;
  payload: Uint8Array;
}

const messageQueues = new Map<WebSocket, VolcenginePodcastMessage[]>();
const messageResolvers = new Map<
  WebSocket,
  Array<{
    resolve: (message: VolcenginePodcastMessage) => void;
    reject: (error: Error) => void;
    timer?: NodeJS.Timeout;
  }>
>();
const initializedSockets = new WeakSet<WebSocket>();

export function createVolcenginePodcastMessage(
  type: VolcenginePodcastMsgType,
  flag: VolcenginePodcastMsgFlagBits
): VolcenginePodcastMessage {
  return {
    version: VolcenginePodcastVersionBits.Version1,
    headerSize: VolcenginePodcastHeaderSizeBits.HeaderSize4,
    type,
    flag,
    serialization: VolcenginePodcastSerializationBits.JSON,
    compression: VolcenginePodcastCompressionBits.None,
    payload: new Uint8Array(0)
  };
}

function writeUint32(value: number): Uint8Array {
  const buffer = new ArrayBuffer(4);
  new DataView(buffer).setUint32(0, value >>> 0, false);
  return new Uint8Array(buffer);
}

function writeInt32(value: number): Uint8Array {
  const buffer = new ArrayBuffer(4);
  new DataView(buffer).setInt32(0, value | 0, false);
  return new Uint8Array(buffer);
}

function writeString(value: string): Uint8Array {
  const bytes = Buffer.from(String(value || ""), "utf8");
  const result = new Uint8Array(4 + bytes.length);
  result.set(writeUint32(bytes.length), 0);
  result.set(bytes, 4);
  return result;
}

function writePayload(payload: Uint8Array): Uint8Array {
  const normalized = payload instanceof Uint8Array ? payload : new Uint8Array(payload || []);
  const result = new Uint8Array(4 + normalized.length);
  result.set(writeUint32(normalized.length), 0);
  result.set(normalized, 4);
  return result;
}

export function marshalVolcenginePodcastMessage(message: VolcenginePodcastMessage): Uint8Array {
  const parts: Uint8Array[] = [];
  const headerSize = 4 * message.headerSize;
  const header = new Uint8Array(headerSize);
  header[0] = (message.version << 4) | message.headerSize;
  header[1] = (message.type << 4) | message.flag;
  header[2] = (message.serialization << 4) | message.compression;
  parts.push(header);

  if (message.flag === VolcenginePodcastMsgFlagBits.WithEvent) {
    parts.push(writeInt32(message.event ?? 0));
    if (
      message.event === VolcenginePodcastEventType.ConnectionStarted ||
      message.event === VolcenginePodcastEventType.ConnectionFinished
    ) {
      parts.push(writeString(message.connectId || ""));
    } else if (
      message.event !== VolcenginePodcastEventType.StartConnection &&
      message.event !== VolcenginePodcastEventType.FinishConnection
    ) {
      parts.push(writeString(message.sessionId || ""));
    }
  }

  if (
    message.flag === VolcenginePodcastMsgFlagBits.PositiveSeq ||
    message.flag === VolcenginePodcastMsgFlagBits.NegativeSeq
  ) {
    parts.push(writeInt32(message.sequence ?? 0));
  }

  if (message.type === VolcenginePodcastMsgType.Error) {
    parts.push(writeUint32(message.errorCode ?? 0));
  }

  parts.push(writePayload(message.payload));

  const totalLength = parts.reduce((sum, item) => sum + item.length, 0);
  const merged = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    merged.set(part, offset);
    offset += part.length;
  }
  return merged;
}

function readUint32(data: Uint8Array, offset: number): number {
  return new DataView(data.buffer, data.byteOffset + offset, 4).getUint32(0, false);
}

function readInt32(data: Uint8Array, offset: number): number {
  return new DataView(data.buffer, data.byteOffset + offset, 4).getInt32(0, false);
}

function readLengthPrefixedString(data: Uint8Array, offset: number): { value: string; nextOffset: number } {
  if (offset + 4 > data.length) {
    throw new Error("播客 TTS 协议帧缺少字符串长度");
  }
  const size = readUint32(data, offset);
  const nextOffset = offset + 4;
  const endOffset = nextOffset + size;
  if (endOffset > data.length) {
    throw new Error("播客 TTS 协议帧字符串数据不完整");
  }
  return {
    value: size > 0 ? new TextDecoder().decode(data.slice(nextOffset, endOffset)) : "",
    nextOffset: endOffset
  };
}

export function unmarshalVolcenginePodcastMessage(data: Uint8Array): VolcenginePodcastMessage {
  if (data.length < 4) {
    throw new Error("播客 TTS 协议帧长度不足");
  }
  let offset = 0;
  const versionAndHeaderSize = data[offset] ?? 0;
  offset += 1;
  const typeAndFlag = data[offset] ?? 0;
  offset += 1;
  const serializationAndCompression = data[offset] ?? 0;
  offset += 1;
  offset = 4 * (versionAndHeaderSize & 0b00001111);

  const message: VolcenginePodcastMessage = {
    version: (versionAndHeaderSize >> 4) as VolcenginePodcastVersionBits,
    headerSize: (versionAndHeaderSize & 0b00001111) as VolcenginePodcastHeaderSizeBits,
    type: (typeAndFlag >> 4) as VolcenginePodcastMsgType,
    flag: (typeAndFlag & 0b00001111) as VolcenginePodcastMsgFlagBits,
    serialization: (serializationAndCompression >> 4) as VolcenginePodcastSerializationBits,
    compression: (serializationAndCompression & 0b00001111) as VolcenginePodcastCompressionBits,
    payload: new Uint8Array(0)
  };

  if (message.flag === VolcenginePodcastMsgFlagBits.WithEvent) {
    message.event = readInt32(data, offset) as VolcenginePodcastEventType;
    offset += 4;
    if (
      message.event !== VolcenginePodcastEventType.StartConnection &&
      message.event !== VolcenginePodcastEventType.FinishConnection &&
      message.event !== VolcenginePodcastEventType.ConnectionStarted &&
      message.event !== VolcenginePodcastEventType.ConnectionFinished
    ) {
      const sessionId = readLengthPrefixedString(data, offset);
      message.sessionId = sessionId.value;
      offset = sessionId.nextOffset;
    }
    if (
      message.event === VolcenginePodcastEventType.ConnectionStarted ||
      message.event === VolcenginePodcastEventType.ConnectionFinished
    ) {
      const connectId = readLengthPrefixedString(data, offset);
      message.connectId = connectId.value;
      offset = connectId.nextOffset;
    }
  }

  if (
    message.flag === VolcenginePodcastMsgFlagBits.PositiveSeq ||
    message.flag === VolcenginePodcastMsgFlagBits.NegativeSeq
  ) {
    message.sequence = readInt32(data, offset);
    offset += 4;
  }

  if (message.type === VolcenginePodcastMsgType.Error) {
    message.errorCode = readUint32(data, offset);
    offset += 4;
  }

  if (offset + 4 > data.length) {
    throw new Error("播客 TTS 协议帧缺少 payload 长度");
  }
  const payloadSize = readUint32(data, offset);
  offset += 4;
  if (offset + payloadSize > data.length) {
    throw new Error("播客 TTS 协议帧 payload 数据不完整");
  }
  message.payload = payloadSize > 0 ? data.slice(offset, offset + payloadSize) : new Uint8Array(0);
  return message;
}

function sendMessage(ws: WebSocket, message: VolcenginePodcastMessage): Promise<void> {
  const data = marshalVolcenginePodcastMessage(message);
  return new Promise((resolve, reject) => {
    ws.send(data, (error?: Error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function toUint8Array(data: RawData): Uint8Array {
  if (Buffer.isBuffer(data)) {
    return new Uint8Array(data);
  }
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }
  if (data instanceof Uint8Array) {
    return data;
  }
  if (Array.isArray(data)) {
    return Buffer.concat(data.map((item) => Buffer.from(item)));
  }
  throw new Error(`不支持的播客 TTS 消息类型: ${typeof data}`);
}

function rejectAllResolvers(ws: WebSocket, error: Error): void {
  const resolvers = messageResolvers.get(ws) || [];
  while (resolvers.length > 0) {
    const resolver = resolvers.shift();
    if (!resolver) continue;
    if (resolver.timer) {
      clearTimeout(resolver.timer);
    }
    resolver.reject(error);
  }
}

function setupMessageHandler(ws: WebSocket): void {
  if (initializedSockets.has(ws)) {
    return;
  }
  initializedSockets.add(ws);
  messageQueues.set(ws, []);
  messageResolvers.set(ws, []);

  ws.on("message", (data: RawData) => {
    try {
      const message = unmarshalVolcenginePodcastMessage(toUint8Array(data));
      const resolvers = messageResolvers.get(ws) || [];
      const queue = messageQueues.get(ws) || [];
      const pending = resolvers.shift();
      if (pending) {
        if (pending.timer) {
          clearTimeout(pending.timer);
        }
        pending.resolve(message);
        return;
      }
      queue.push(message);
      messageQueues.set(ws, queue);
    } catch (error) {
      rejectAllResolvers(
        ws,
        error instanceof Error ? error : new Error("解析播客 TTS 消息失败")
      );
    }
  });

  ws.on("error", (error) => {
    rejectAllResolvers(ws, error instanceof Error ? error : new Error("播客 TTS 连接失败"));
  });

  ws.on("close", () => {
    rejectAllResolvers(ws, new Error("播客 TTS 连接已关闭"));
    messageQueues.delete(ws);
    messageResolvers.delete(ws);
  });
}

export async function receiveVolcenginePodcastMessage(
  ws: WebSocket,
  timeoutMs: number
): Promise<VolcenginePodcastMessage> {
  setupMessageHandler(ws);
  const queue = messageQueues.get(ws) || [];
  if (queue.length > 0) {
    return queue.shift() as VolcenginePodcastMessage;
  }
  return new Promise((resolve, reject) => {
    const resolvers = messageResolvers.get(ws) || [];
    const resolver = {
      resolve,
      reject,
      timer:
        timeoutMs > 0
          ? setTimeout(() => {
              const currentResolvers = messageResolvers.get(ws) || [];
              const index = currentResolvers.indexOf(resolver);
              if (index >= 0) {
                currentResolvers.splice(index, 1);
              }
              reject(new Error("播客 TTS 响应超时"));
            }, timeoutMs)
          : undefined
    };
    resolvers.push(resolver);
    messageResolvers.set(ws, resolvers);
  });
}

export async function waitForVolcenginePodcastEvent(
  ws: WebSocket,
  messageType: VolcenginePodcastMsgType,
  eventType: VolcenginePodcastEventType,
  timeoutMs: number
): Promise<VolcenginePodcastMessage> {
  const message = await receiveVolcenginePodcastMessage(ws, timeoutMs);
  if (message.type !== messageType || message.event !== eventType) {
    throw new Error(`播客 TTS 返回了未预期事件: type=${message.type}, event=${message.event}`);
  }
  return message;
}

function buildEventPayload(payload: Uint8Array, event: VolcenginePodcastEventType, sessionId?: string) {
  const message = createVolcenginePodcastMessage(
    VolcenginePodcastMsgType.FullClientRequest,
    VolcenginePodcastMsgFlagBits.WithEvent
  );
  message.event = event;
  if (sessionId) {
    message.sessionId = sessionId;
  }
  message.payload = payload;
  return message;
}

export async function startVolcenginePodcastConnection(ws: WebSocket): Promise<void> {
  await sendMessage(
    ws,
    buildEventPayload(new TextEncoder().encode("{}"), VolcenginePodcastEventType.StartConnection)
  );
}

export async function finishVolcenginePodcastConnection(ws: WebSocket): Promise<void> {
  await sendMessage(
    ws,
    buildEventPayload(new TextEncoder().encode("{}"), VolcenginePodcastEventType.FinishConnection)
  );
}

export async function startVolcenginePodcastSession(
  ws: WebSocket,
  payload: Uint8Array,
  sessionId: string
): Promise<void> {
  await sendMessage(ws, buildEventPayload(payload, VolcenginePodcastEventType.StartSession, sessionId));
}

export async function finishVolcenginePodcastSession(ws: WebSocket, sessionId: string): Promise<void> {
  await sendMessage(
    ws,
    buildEventPayload(new TextEncoder().encode("{}"), VolcenginePodcastEventType.FinishSession, sessionId)
  );
}
