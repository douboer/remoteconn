import { describe, expect, it } from "vitest";
import { parseVoiceClientFrame } from "./clientProtocol";

describe("parseVoiceClientFrame", () => {
  it("文本控制帧即使以 Buffer 形式到达也能解析为 start", () => {
    const raw = Buffer.from(
      JSON.stringify({
        type: "start",
        payload: {
          audio: { format: "pcm", rate: 16000, bits: 16, channel: 1 }
        }
      }),
      "utf8"
    );
    const frame = parseVoiceClientFrame(raw, false);
    expect(frame.type).toBe("start");
  });

  it("二进制帧应解析为 audio", () => {
    const raw = Buffer.from([1, 2, 3, 4]);
    const frame = parseVoiceClientFrame(raw, true);
    expect(frame.type).toBe("audio");
    if (frame.type !== "audio") {
      return;
    }
    expect(frame.payload.length).toBe(4);
  });
});
