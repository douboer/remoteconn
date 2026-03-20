import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("tts service", () => {
  const originalEnv = { ...process.env };
  const tempDirs: string[] = [];

  interface MockProvider {
    providerName: string;
    synthesize: () => Promise<{ audio: Buffer; contentType: string }>;
  }

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      TTS_PROVIDER: "volcengine",
      TTS_APP_ID: "test-app-id",
      TTS_ACCESS_TOKEN: "test-access-token",
      GATEWAY_TOKEN: "test-gateway-token",
      SYNC_SECRET_CURRENT: "test-sync-secret"
    };
    vi.resetModules();
  });

  afterEach(async () => {
    process.env = { ...originalEnv };
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  async function createService(provider: MockProvider, options?: { inlineWaitMs?: number }) {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "remoteconn-tts-"));
    tempDirs.push(tempDir);
    const [{ TtsService }, { TtsCacheStore }] = await Promise.all([import("./service"), import("./cache")]);
    const cache = new TtsCacheStore({
      cacheDir: tempDir,
      ttlMs: 60 * 1000,
      maxTotalBytes: 32 * 1024 * 1024,
      maxFileBytes: 8 * 1024 * 1024
    });
    return new TtsService({
      provider,
      cache,
      inlineWaitMs: options?.inlineWaitMs
    });
  }

  async function waitForIdle(service: { getSynthesisStatus: (cacheKey: string) => Promise<{ state: string }> }, cacheKey: string) {
    for (let i = 0; i < 20; i += 1) {
      const status = await service.getSynthesisStatus(cacheKey);
      if (status.state !== "pending") {
        return status;
      }
      await new Promise((resolve) => {
        setTimeout(resolve, 10);
      });
    }
    throw new Error("后台任务未在预期时间内结束");
  }

  it("应在缓存未命中时立即返回 pending，并在后台合成完成后变为 ready", async () => {
    let resolveSynthesize: (value: { audio: Buffer; contentType: string }) => void = () => {};
    const provider: MockProvider = {
      providerName: "volcengine",
      synthesize: vi.fn<MockProvider["synthesize"]>(() => {
        return new Promise<{ audio: Buffer; contentType: string }>((resolve) => {
          resolveSynthesize = resolve;
        });
      })
    };
    const service = await createService(provider, { inlineWaitMs: 20 });
    const payload = await service.synthesizeForUser("https://gateway.example.com", "user-1", {
      text: "连接成功，可以继续。",
      scene: "codex_terminal"
    });

    expect(payload.status).toBe("pending");
    expect(payload.cached).toBe(false);
    expect((await service.getSynthesisStatus(payload.cacheKey)).state).toBe("pending");

    resolveSynthesize({
      audio: Buffer.from("fake-mp3-data"),
      contentType: "audio/mpeg"
    });

    expect((await waitForIdle(service, payload.cacheKey)).state).toBe("ready");

    const cachedPayload = await service.synthesizeForUser("https://gateway.example.com", "user-1", {
      text: "连接成功，可以继续。",
      scene: "codex_terminal"
    });
    expect(cachedPayload.status).toBe("ready");
    expect(cachedPayload.cached).toBe(true);
  });

  it("应在短时间内完成合成时直接返回 ready，减少小程序额外轮询", async () => {
    const provider: MockProvider = {
      providerName: "volcengine",
      synthesize: vi.fn<MockProvider["synthesize"]>(
        async () =>
          await new Promise<{ audio: Buffer; contentType: string }>((resolve) => {
            setTimeout(() => {
              resolve({
                audio: Buffer.from("fake-mp3-data"),
                contentType: "audio/mpeg"
              });
            }, 10);
          })
      )
    };
    const service = await createService(provider, { inlineWaitMs: 80 });
    const payload = await service.synthesizeForUser("https://gateway.example.com", "user-1", {
      text: "连接成功，可以继续。",
      scene: "codex_terminal"
    });

    expect(payload.status).toBe("ready");
    expect(payload.cached).toBe(true);
  });

  it("应暴露后台合成失败状态，便于小程序轮询时停止等待", async () => {
    const { TtsServiceError } = await import("./provider");
    const provider: MockProvider = {
      providerName: "volcengine",
      synthesize: vi.fn<MockProvider["synthesize"]>(async () => {
        throw new TtsServiceError("TTS_UPSTREAM_FAILED", "语音生成失败", 502);
      })
    };
    const service = await createService(provider, { inlineWaitMs: 20 });
    const payload = await service.synthesizeForUser("https://gateway.example.com", "user-1", {
      text: "连接成功，可以继续。",
      scene: "codex_terminal"
    });

    const status = await waitForIdle(service, payload.cacheKey);
    expect(status).toMatchObject({
      state: "error",
      code: "TTS_UPSTREAM_FAILED",
      message: "语音生成失败"
    });
  });
});
