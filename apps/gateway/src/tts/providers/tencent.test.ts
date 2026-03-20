import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("tencent tts provider", () => {
  beforeEach(() => {
    process.env.TTS_PROVIDER = "tencent";
    process.env.TTS_SECRET_ID = "secret-id";
    process.env.TTS_SECRET_KEY = "secret-key";
    process.env.TTS_REGION = "ap-guangzhou";
    process.env.TTS_TIMEOUT_MS = "10000";
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("buildTencentTextToVoiceRequest 应生成 TC3 请求头并映射语速", async () => {
    const { buildTencentTextToVoiceRequest } = await import("./tencent");

    const built = buildTencentTextToVoiceRequest(
      {
        text: "请先检查 gateway 配置。",
        voice: {
          alias: "female_v1",
          providerVoiceType: 101027,
          volcVoiceType: "BV700_V2_streaming"
        },
        speed: 1,
        traceId: "trace-1"
      },
      Date.UTC(2026, 2, 12, 8, 0, 0)
    );

    expect(built.url).toBe("https://tts.tencentcloudapi.com");
    expect(built.headers["X-TC-Action"]).toBe("TextToVoice");
    expect(built.headers["X-TC-Region"]).toBe("ap-guangzhou");
    expect(built.headers.Authorization).toContain("TC3-HMAC-SHA256");
    expect(built.payload.VoiceType).toBe(101027);
    expect(built.payload.Speed).toBe(0);
  });

  it("较慢与较快倍速应映射到腾讯云 speed 区间", async () => {
    const { buildTencentTextToVoiceRequest } = await import("./tencent");

    const slowBuilt = buildTencentTextToVoiceRequest({
      text: "slow",
      voice: {
        alias: "female_v1",
        providerVoiceType: 101027,
        volcVoiceType: "BV700_V2_streaming"
      },
      speed: 0.8,
      traceId: "trace-slow"
    });
    const fastBuilt = buildTencentTextToVoiceRequest({
      text: "fast",
      voice: {
        alias: "male_v1",
        providerVoiceType: 101004,
        volcVoiceType: "BV700_V2_streaming"
      },
      speed: 1.2,
      traceId: "trace-fast"
    });

    expect(slowBuilt.payload.Speed).toBe(-1);
    expect(fastBuilt.payload.Speed).toBe(1);
  });

  it("上游返回 403 时应识别为鉴权或权限失败", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            Response: {
              Error: {
                Code: "AuthFailure.InvalidSecretId",
                Message: "The SecretId is not found"
              }
            }
          }),
          {
            status: 403,
            headers: {
              "Content-Type": "application/json"
            }
          }
        )
      )
    );
    const { TencentTtsProvider } = await import("./tencent");
    const provider = new TencentTtsProvider();

    await expect(
      provider.synthesize({
        text: "请先检查 gateway 配置。",
        voice: {
          alias: "female_v1",
          providerVoiceType: 101027,
          volcVoiceType: "BV700_V2_streaming"
        },
        speed: 1,
        traceId: "trace-auth-403"
      })
    ).rejects.toMatchObject({
      code: "TTS_UPSTREAM_REJECTED",
      status: 502,
      message: expect.stringContaining("AuthFailure.InvalidSecretId")
    });
  });
});
