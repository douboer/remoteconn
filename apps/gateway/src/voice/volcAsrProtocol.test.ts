import { describe, expect, it } from "vitest";
import { gzipSync } from "node:zlib";
import {
  VolcCompression,
  VolcMessageFlags,
  VolcMessageType,
  VolcSerialization,
  buildAudioOnlyRequestFrame,
  buildVolcHeader,
  isFinalServerResponse,
  parseVolcServerFrame
} from "./volcAsrProtocol";

describe("volcAsrProtocol", () => {
  it("audio-only 最后一包应携带 LAST_PACKAGE flag", () => {
    const frame = buildAudioOnlyRequestFrame(Buffer.from([1, 2, 3, 4]), true);
    const flag = (frame[1] ?? 0) & 0x0f;
    expect(flag).toBe(VolcMessageFlags.LAST_PACKAGE);
  });

  it("可解析 gzip + json 的 full server response", () => {
    const payloadObj = {
      result: {
        text: "测试文本"
      }
    };
    const payload = gzipSync(Buffer.from(JSON.stringify(payloadObj), "utf8"));
    const header = buildVolcHeader({
      messageType: VolcMessageType.FULL_SERVER_RESPONSE,
      flags: VolcMessageFlags.POSITIVE_SEQUENCE,
      serialization: VolcSerialization.JSON,
      compression: VolcCompression.GZIP
    });
    const sequence = Buffer.alloc(4);
    sequence.writeInt32BE(2, 0);
    const payloadSize = Buffer.alloc(4);
    payloadSize.writeUInt32BE(payload.length, 0);

    const parsed = parseVolcServerFrame(Buffer.concat([header, sequence, payloadSize, payload]));
    expect(parsed.kind).toBe("server_response");
    if (parsed.kind !== "server_response") {
      return;
    }
    expect(parsed.sequence).toBe(2);
    expect((parsed.payload as { result: { text: string } }).result.text).toBe("测试文本");
  });

  it("flags=LAST_PACKAGE 且包含 sequence 时可兼容解析", () => {
    const payloadObj = {
      result: {
        text: "结束包"
      }
    };
    const payload = gzipSync(Buffer.from(JSON.stringify(payloadObj), "utf8"));
    const header = buildVolcHeader({
      messageType: VolcMessageType.FULL_SERVER_RESPONSE,
      flags: VolcMessageFlags.LAST_PACKAGE,
      serialization: VolcSerialization.JSON,
      compression: VolcCompression.GZIP
    });
    const sequence = Buffer.alloc(4);
    sequence.writeInt32BE(7, 0);
    const payloadSize = Buffer.alloc(4);
    payloadSize.writeUInt32BE(payload.length, 0);

    const parsed = parseVolcServerFrame(Buffer.concat([header, sequence, payloadSize, payload]));
    expect(parsed.kind).toBe("server_response");
    if (parsed.kind !== "server_response") {
      return;
    }
    expect(parsed.sequence).toBe(7);
    expect((parsed.payload as { result: { text: string } }).result.text).toBe("结束包");
  });

  it("可解析 error response", () => {
    const errorPayload = Buffer.from("invalid request", "utf8");
    const header = buildVolcHeader({
      messageType: VolcMessageType.ERROR_RESPONSE,
      flags: VolcMessageFlags.NONE,
      serialization: VolcSerialization.NONE,
      compression: VolcCompression.NONE
    });
    const errorCode = Buffer.alloc(4);
    errorCode.writeUInt32BE(45000001, 0);
    const payloadSize = Buffer.alloc(4);
    payloadSize.writeUInt32BE(errorPayload.length, 0);

    const parsed = parseVolcServerFrame(Buffer.concat([header, errorCode, payloadSize, errorPayload]));
    expect(parsed.kind).toBe("error");
    if (parsed.kind !== "error") {
      return;
    }
    expect(parsed.errorCode).toBe(45000001);
    expect(Buffer.isBuffer(parsed.payload)).toBe(true);
    expect((parsed.payload as Buffer).toString("utf8")).toBe("invalid request");
  });

  it("final flag 判定覆盖 LAST_PACKAGE 与 NEGATIVE_SEQUENCE", () => {
    expect(isFinalServerResponse(VolcMessageFlags.LAST_PACKAGE)).toBe(true);
    expect(isFinalServerResponse(VolcMessageFlags.NEGATIVE_SEQUENCE)).toBe(true);
    expect(isFinalServerResponse(VolcMessageFlags.POSITIVE_SEQUENCE)).toBe(false);
  });
});
