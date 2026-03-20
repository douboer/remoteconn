import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function clearModuleCache() {
  ["./ttsGateway.js", "./syncAuth.js", "./opsConfig.js"].forEach((modulePath) => {
    delete require.cache[require.resolve(modulePath)];
  });
}

describe("ttsGateway", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    clearModuleCache();
  });

  afterEach(() => {
    clearModuleCache();
    delete (global as typeof globalThis & { wx?: unknown }).wx;
    delete (globalThis as typeof globalThis & { __REMOTE_CONN_OPS__?: unknown }).__REMOTE_CONN_OPS__;
  });

  it("应使用同步 token 请求 TTS synthesize 接口", async () => {
    const downloadFile = vi.fn(
      (options?: { success?: (value: { statusCode: number }) => void; filePath?: string }) => {
        options?.success?.({
          statusCode: 200
        });
      }
    );
    const wxRuntime = {
      env: {
        USER_DATA_PATH: "/userdata"
      },
      getStorageSync: vi.fn(),
      setStorageSync: vi.fn(),
      getFileSystemManager: vi.fn(() => ({
        access: vi.fn((options?: { fail?: () => void }) => {
          options?.fail?.();
        })
      })),
      login: vi.fn((options?: { success?: (value: { code: string }) => void }) => {
        options?.success?.({ code: "mock-code" });
      }),
      downloadFile,
      request: vi.fn(
        (options?: {
          url?: string;
          method?: string;
          header?: Record<string, string>;
          timeout?: number;
          success?: (value: { statusCode: number; data: Record<string, unknown> }) => void;
        }) => {
          if (String(options?.url).endsWith("/api/miniprogram/auth/login")) {
            options?.success?.({
              statusCode: 200,
              data: {
                ok: true,
                token: "sync-token",
                expiresAt: "2099-01-01T00:00:00.000Z"
              }
            });
            return;
          }
          options?.success?.({
            statusCode: 200,
            data: {
              ok: true,
              cacheKey: "cache-1",
              cached: true,
              audioUrl: "https://gateway.example.com/api/miniprogram/tts/audio/cache-1?ticket=demo",
              expiresAt: "2099-01-01T00:00:00.000Z"
            }
          });
        }
      )
    };
    (global as typeof globalThis & { wx: typeof wxRuntime }).wx = wxRuntime;
    (globalThis as typeof globalThis & { __REMOTE_CONN_OPS__?: unknown }).__REMOTE_CONN_OPS__ = {
      gatewayUrl: "https://gateway.example.com",
      gatewayToken: "gateway-token"
    };

    const { synthesizeTerminalSpeech } = require("./ttsGateway.js");
    const result = await synthesizeTerminalSpeech({
      text: "请先检查配置。"
    });

    expect(result.audioUrl).toBe("/userdata/tts-cache-cache-1.mp3");
    expect(result.remoteAudioUrl).toContain("/api/miniprogram/tts/audio/cache-1");
    expect(downloadFile).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://gateway.example.com/api/miniprogram/tts/audio/cache-1?ticket=demo",
        filePath: "/userdata/tts-cache-cache-1.mp3",
        timeout: 15000
      })
    );
    expect(wxRuntime.request).toHaveBeenLastCalledWith(
      expect.objectContaining({
        url: "https://gateway.example.com/api/miniprogram/tts/synthesize",
        method: "POST",
        timeout: 15000,
        header: expect.objectContaining({
          authorization: "Bearer sync-token"
        })
      })
    );
  });

  it("应在后台合成时轮询状态直到音频就绪", async () => {
    const requestCalls: Array<{ url: string; method: string; timeout?: number }> = [];
    const downloadFile = vi.fn(
      (options?: { success?: (value: { statusCode: number }) => void; filePath?: string }) => {
        options?.success?.({
          statusCode: 200
        });
      }
    );
    const wxRuntime = {
      env: {
        USER_DATA_PATH: "/userdata"
      },
      getStorageSync: vi.fn(() => ({
        token: "sync-token",
        expiresAt: "2099-01-01T00:00:00.000Z"
      })),
      setStorageSync: vi.fn(),
      getFileSystemManager: vi.fn(() => ({
        access: vi.fn((options?: { fail?: () => void }) => {
          options?.fail?.();
        })
      })),
      login: vi.fn(),
      downloadFile,
      request: vi.fn(
        (options?: {
          url?: string;
          method?: string;
          timeout?: number;
          success?: (value: { statusCode: number; data: Record<string, unknown> }) => void;
        }) => {
          requestCalls.push({
            url: String(options?.url || ""),
            method: String(options?.method || "GET").toUpperCase(),
            timeout: options?.timeout
          });
          if (String(options?.url).endsWith("/api/miniprogram/tts/synthesize")) {
            options?.success?.({
              statusCode: 200,
              data: {
                ok: true,
                status: "pending",
                cacheKey: "cache-2",
                cached: false,
                audioUrl: "https://gateway.example.com/api/miniprogram/tts/audio/cache-2?ticket=demo",
                statusUrl: "https://gateway.example.com/api/miniprogram/tts/status/cache-2?ticket=demo",
                expiresAt: "2099-01-01T00:00:00.000Z"
              }
            });
            return;
          }
          options?.success?.({
            statusCode: 200,
            data:
              requestCalls.filter((item) => item.url.includes("/api/miniprogram/tts/status/")).length >= 2
                ? { ok: true, status: "ready" }
                : { ok: true, status: "pending" }
          });
        }
      )
    };
    (global as typeof globalThis & { wx: typeof wxRuntime }).wx = wxRuntime;
    (globalThis as typeof globalThis & { __REMOTE_CONN_OPS__?: unknown }).__REMOTE_CONN_OPS__ = {
      gatewayUrl: "https://gateway.example.com",
      gatewayToken: "gateway-token"
    };

    const { synthesizeTerminalSpeech } = require("./ttsGateway.js");
    const result = await synthesizeTerminalSpeech({
      text: "请先检查配置。",
      timeoutMs: 10000
    });

    expect(result.audioUrl).toBe("/userdata/tts-cache-cache-2.mp3");
    expect(result.remoteAudioUrl).toContain("/api/miniprogram/tts/audio/cache-2");
    expect(requestCalls.filter((item) => item.url.includes("/api/miniprogram/tts/status/")).length).toBe(2);
    expect(downloadFile).toHaveBeenCalledTimes(1);
  });

  it("应把网关返回的 TTS 地址重写到当前同步基地址同源", async () => {
    const requestCalls: string[] = [];
    const downloadFile = vi.fn(
      (options?: { success?: (value: { statusCode: number }) => void; filePath?: string }) => {
        options?.success?.({
          statusCode: 200
        });
      }
    );
    const wxRuntime = {
      env: {
        USER_DATA_PATH: "/userdata"
      },
      getStorageSync: vi.fn(() => ({
        token: "sync-token",
        expiresAt: "2099-01-01T00:00:00.000Z"
      })),
      setStorageSync: vi.fn(),
      getFileSystemManager: vi.fn(() => ({
        access: vi.fn((options?: { fail?: () => void }) => {
          options?.fail?.();
        })
      })),
      login: vi.fn(),
      downloadFile,
      request: vi.fn(
        (options?: {
          url?: string;
          success?: (value: { statusCode: number; data: Record<string, unknown> }) => void;
        }) => {
          requestCalls.push(String(options?.url || ""));
          if (String(options?.url).endsWith("/api/miniprogram/tts/synthesize")) {
            options?.success?.({
              statusCode: 200,
              data: {
                ok: true,
                status: "pending",
                cacheKey: "cache-3",
                cached: false,
                audioUrl: "http://127.0.0.1:8787/api/miniprogram/tts/audio/cache-3?ticket=demo",
                statusUrl: "http://127.0.0.1:8787/api/miniprogram/tts/status/cache-3?ticket=demo",
                expiresAt: "2099-01-01T00:00:00.000Z"
              }
            });
            return;
          }
          options?.success?.({
            statusCode: 200,
            data: { ok: true, status: "ready" }
          });
        }
      )
    };
    (global as typeof globalThis & { wx: typeof wxRuntime }).wx = wxRuntime;
    (globalThis as typeof globalThis & { __REMOTE_CONN_OPS__?: unknown }).__REMOTE_CONN_OPS__ = {
      gatewayUrl: "https://gateway.example.com",
      gatewayToken: "gateway-token"
    };

    const { synthesizeTerminalSpeech } = require("./ttsGateway.js");
    const result = await synthesizeTerminalSpeech({
      text: "请先检查配置。"
    });

    expect(result.audioUrl).toBe("/userdata/tts-cache-cache-3.mp3");
    expect(result.remoteAudioUrl).toBe("https://gateway.example.com/api/miniprogram/tts/audio/cache-3?ticket=demo");
    expect(requestCalls).toContain("https://gateway.example.com/api/miniprogram/tts/status/cache-3?ticket=demo");
    expect(downloadFile).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://gateway.example.com/api/miniprogram/tts/audio/cache-3?ticket=demo",
        filePath: "/userdata/tts-cache-cache-3.mp3"
      })
    );
  });

  it("本地已命中 TTS 缓存时应直接复用，不再重复下载", async () => {
    const downloadFile = vi.fn();
    const wxRuntime = {
      env: {
        USER_DATA_PATH: "/userdata"
      },
      getStorageSync: vi.fn(() => ({
        token: "sync-token",
        expiresAt: "2099-01-01T00:00:00.000Z"
      })),
      setStorageSync: vi.fn(),
      getFileSystemManager: vi.fn(() => ({
        access: vi.fn((options?: { success?: () => void }) => {
          options?.success?.();
        })
      })),
      login: vi.fn(),
      downloadFile,
      request: vi.fn(
        (options?: {
          success?: (value: { statusCode: number; data: Record<string, unknown> }) => void;
        }) => {
          options?.success?.({
            statusCode: 200,
            data: {
              ok: true,
              cacheKey: "cache-4",
              cached: true,
              audioUrl: "https://gateway.example.com/api/miniprogram/tts/audio/cache-4?ticket=demo",
              expiresAt: "2099-01-01T00:00:00.000Z"
            }
          });
        }
      )
    };
    (global as typeof globalThis & { wx: typeof wxRuntime }).wx = wxRuntime;
    (globalThis as typeof globalThis & { __REMOTE_CONN_OPS__?: unknown }).__REMOTE_CONN_OPS__ = {
      gatewayUrl: "https://gateway.example.com",
      gatewayToken: "gateway-token"
    };

    const { synthesizeTerminalSpeech } = require("./ttsGateway.js");
    const result = await synthesizeTerminalSpeech({
      text: "请先检查配置。"
    });

    expect(result.audioUrl).toBe("/userdata/tts-cache-cache-4.mp3");
    expect(downloadFile).not.toHaveBeenCalled();
  });

  it("应保留上游鉴权或权限失败提示", async () => {
    const wxRuntime = {
      env: {
        USER_DATA_PATH: "/userdata"
      },
      getStorageSync: vi.fn(() => ({
        token: "sync-token",
        expiresAt: "2099-01-01T00:00:00.000Z"
      })),
      setStorageSync: vi.fn(),
      getFileSystemManager: vi.fn(() => ({
        access: vi.fn((options?: { fail?: () => void }) => {
          options?.fail?.();
        })
      })),
      login: vi.fn(),
      downloadFile: vi.fn(),
      request: vi.fn(
        (options?: {
          success?: (value: { statusCode: number; data: Record<string, unknown> }) => void;
        }) => {
          options?.success?.({
            statusCode: 502,
            data: {
              ok: false,
              message:
                "TTS 上游鉴权或权限失败，请检查密钥、地域和账号权限（AuthFailure.InvalidSecretId: The SecretId is not found）"
            }
          });
        }
      )
    };
    (global as typeof globalThis & { wx: typeof wxRuntime }).wx = wxRuntime;
    (globalThis as typeof globalThis & { __REMOTE_CONN_OPS__?: unknown }).__REMOTE_CONN_OPS__ = {
      gatewayUrl: "https://gateway.example.com",
      gatewayToken: "gateway-token"
    };

    const { synthesizeTerminalSpeech } = require("./ttsGateway.js");

    await expect(
      synthesizeTerminalSpeech({
        text: "请先检查配置。"
      })
    ).rejects.toThrow("TTS 上游鉴权或权限失败，请检查密钥、地域和账号权限");
  });
});
