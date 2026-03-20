import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("gateway config", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("应为火山 V3 单向流式 TTS 提供新的默认 resource id", async () => {
    process.env.TTS_RESOURCE_ID = "";
    const imported = await import("./config");
    expect(imported.config.tts.resourceId).toBe("volc.service_type.10029");
  });

  it("应解析 TTS_CACHE_FILE_MAX_BYTES，并在非法值时回退默认上限", async () => {
    process.env.TTS_CACHE_FILE_MAX_BYTES = "6291456";
    let imported = await import("./config");
    expect(imported.config.tts.cacheFileMaxBytes).toBe(6 * 1024 * 1024);

    vi.resetModules();
    process.env.TTS_CACHE_FILE_MAX_BYTES = "0";
    imported = await import("./config");
    expect(imported.config.tts.cacheFileMaxBytes).toBe(8 * 1024 * 1024);
  });
});
