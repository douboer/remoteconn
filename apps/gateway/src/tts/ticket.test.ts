import { describe, expect, it } from "vitest";

import { createTtsAudioTicket, verifyTtsAudioTicket } from "./ticket";

describe("tts ticket", () => {
  it("应能签发并校验短时音频票据", () => {
    const ticket = createTtsAudioTicket("ticket-secret", {
      uid: "user-1",
      cacheKey: "cache-1",
      exp: Date.now() + 60_000
    });

    expect(verifyTtsAudioTicket("ticket-secret", ticket)).toMatchObject({
      uid: "user-1",
      cacheKey: "cache-1"
    });
  });

  it("签名不一致时应拒绝通过", () => {
    const ticket = createTtsAudioTicket("ticket-secret", {
      uid: "user-1",
      cacheKey: "cache-1",
      exp: Date.now() + 60_000
    });

    expect(() => verifyTtsAudioTicket("other-secret", ticket)).toThrow(/signature invalid/);
  });
});
