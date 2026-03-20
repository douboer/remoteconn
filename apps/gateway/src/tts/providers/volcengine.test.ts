import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function createStreamResponse(chunks: string[], contentType: string): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    }
  });
  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": contentType
    }
  });
}

describe("volcengine tts provider", () => {
  beforeEach(() => {
    process.env.TTS_PROVIDER = "volcengine";
    process.env.TTS_APP_ID = "app-id";
    process.env.TTS_ACCESS_TOKEN = "access-token";
    process.env.TTS_RESOURCE_ID = "volc.service_type.10029";
    process.env.TTS_TIMEOUT_MS = "200";
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("buildVolcengineTtsRequest 应生成 V3 HTTP 单向流式请求", async () => {
    const { buildVolcengineTtsRequest } = await import("./volcengine");

    const built = buildVolcengineTtsRequest(
      {
        text: "请先检查 gateway 配置。",
        voice: {
          alias: "female_v1",
          providerVoiceType: 101027,
          volcVoiceType: "zh_female_cancan_mars_bigtts"
        },
        speed: 1.2,
        traceId: "trace-1"
      },
      "access-token"
    );

    expect(built.url).toBe("https://openspeech.bytedance.com/api/v3/tts/unidirectional/sse");
    expect(built.headers).toMatchObject({
      "Content-Type": "application/json",
      "X-Api-App-Id": "app-id",
      "X-Api-Access-Key": "access-token",
      "X-Api-Resource-Id": "volc.service_type.10029",
      "X-Control-Require-Usage-Tokens-Return": "text_words"
    });
    expect(built.body).toMatchObject({
      user: {
        uid: "trace-1"
      },
      req_params: {
        text: "请先检查 gateway 配置。",
        speaker: "zh_female_cancan_mars_bigtts",
        audio_params: {
          format: "mp3",
          sample_rate: 24000,
          speech_rate: 20
        },
        additions: '{"disable_markdown_filter":true}'
      }
    });
  });

  it("synthesize 应拼接 HTTP Chunked 流式音频块", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        createStreamResponse(
          [
            '{"code":0,"message":"Success","sequence":1,"data":"',
            'YXVkaW8tMQ=="}\n{"code":0,"message":"Success","sequence":2,"data":"YXVkaW8tMg=="}',
            '\n{"code":20000000,"message":"OK","event":152,"data":null,"usage":{"text_words":7}}\n'
          ],
          "application/json"
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    const { VolcengineTtsProvider } = await import("./volcengine");
    const provider = new VolcengineTtsProvider();

    const result = await provider.synthesize({
      text: "请先检查 gateway 配置。",
      voice: {
        alias: "female_v1",
        providerVoiceType: 101027,
        volcVoiceType: "zh_female_cancan_mars_bigtts"
      },
      speed: 1,
      traceId: "trace-demo"
    });

    expect(result.contentType).toBe("audio/mpeg");
    expect(result.audio).toEqual(Buffer.from("audio-1audio-2"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://openspeech.bytedance.com/api/v3/tts/unidirectional/sse",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "X-Api-Resource-Id": "volc.service_type.10029"
        })
      })
    );
  });

  it("synthesize 应兼容 SSE 单向流式响应", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        createStreamResponse(
          [
            'event: 352\ndata: {"code":0,"message":"Success","event":352,"sequence":1,"data":"YXVkaW8tMQ=="}\n\n',
            'event: 351\ndata: {"code":0,"message":"Success","event":351,"data":null}\n\n',
            'event: 352\ndata: {"code":0,"message":"Success","event":352,"sequence":2,"data":"YXVkaW8tMg=="}\n\n',
            'event: 152\ndata: {"code":20000000,"message":"OK","event":152,"data":null,"usage":{"text_words":9}}\n\n'
          ],
          "text/event-stream"
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    const { VolcengineTtsProvider } = await import("./volcengine");
    const provider = new VolcengineTtsProvider();

    const result = await provider.synthesize({
      text: "请先检查 gateway 配置。",
      voice: {
        alias: "female_v1",
        providerVoiceType: 101027,
        volcVoiceType: "zh_female_cancan_mars_bigtts"
      },
      speed: 1,
      traceId: "trace-sse"
    });

    expect(result.audio).toEqual(Buffer.from("audio-1audio-2"));
    expect(result.contentType).toBe("audio/mpeg");
  });

  it("上游返回鉴权错误时应识别为权限失败", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            code: 45000000,
            message: "resource is not authorized"
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

    const { VolcengineTtsProvider } = await import("./volcengine");
    const provider = new VolcengineTtsProvider();

    await expect(
      provider.synthesize({
        text: "请先检查 gateway 配置。",
        voice: {
          alias: "female_v1",
          providerVoiceType: 101027,
          volcVoiceType: "zh_female_cancan_mars_bigtts"
        },
        speed: 1,
        traceId: "trace-auth-403"
      })
    ).rejects.toMatchObject({
      code: "TTS_UPSTREAM_REJECTED",
      status: 502,
      message: expect.stringContaining("resource is not authorized")
    });
  });
});
