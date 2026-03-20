import { beforeEach, describe, expect, it, vi } from "vitest";

describe("tts provider helpers", () => {
  beforeEach(() => {
    process.env.TTS_PROVIDER = "tencent";
    process.env.TTS_VOICE_DEFAULT = "female_v1";
    process.env.TTS_SPEED_DEFAULT = "1";
    vi.resetModules();
  });

  it("normalizeTtsRequest 会压缩空白并生成缓存键", async () => {
    const { normalizeTtsRequest } = await import("./provider");

    const result = normalizeTtsRequest({
      text: "请 先检查\r\n\r\n gateway   配置。。。。",
      scene: "codex_terminal"
    });

    expect(result.normalizedText).toBe("请 先检查\ngateway 配置。");
    expect(result.cacheKey).toMatch(/^[a-f0-9]{40}$/);
    expect(result.voice.alias).toBe("female_v1");
    expect(result.speed).toBe(1);
  });

  it("resolveTtsVoiceProfile 应映射到豆包 1.0 公共音色", async () => {
    const { resolveTtsVoiceProfile } = await import("./provider");

    expect(resolveTtsVoiceProfile("female_v1").volcVoiceType).toBe("zh_female_cancan_mars_bigtts");
    expect(resolveTtsVoiceProfile("male_v1").volcVoiceType).toBe("zh_male_qingshuangnanda_mars_bigtts");
  });

  it("normalizeTtsRequest 会拒绝超出腾讯云安全字节上限的文本", async () => {
    const { normalizeTtsRequest, TtsServiceError } = await import("./provider");

    expect(() =>
      normalizeTtsRequest({
        text: "测".repeat(151),
        scene: "codex_terminal"
      })
    ).toThrowError(TtsServiceError);
  });
});
