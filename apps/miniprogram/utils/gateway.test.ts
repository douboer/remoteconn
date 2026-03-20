import { afterEach, describe, expect, it, vi } from "vitest";

const { createGatewayClient } = require("./gateway.js");

function createMockSocketTask() {
  const handlers = {
    open: null,
    message: null,
    close: null,
    error: null
  } as {
    open: null | (() => void);
    message: null | ((event: { data: string }) => void);
    close: null | ((event?: { code?: number; reason?: string }) => void);
    error: null | ((error?: { errMsg?: string }) => void);
  };

  const task = {
    send: vi.fn(),
    close: vi.fn(),
    onOpen(callback: () => void) {
      handlers.open = callback;
    },
    onMessage(callback: (event: { data: string }) => void) {
      handlers.message = callback;
    },
    onClose(callback: (event?: { code?: number; reason?: string }) => void) {
      handlers.close = callback;
    },
    onError(callback: (error?: { errMsg?: string }) => void) {
      handlers.error = callback;
    }
  };

  return { handlers, task };
}

describe("gateway", () => {
  afterEach(() => {
    const runtime = globalThis as typeof globalThis & { wx?: unknown };
    delete runtime.wx;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("收到 connected 后可立刻补发一拍时延采样", async () => {
    vi.useFakeTimers();
    const { handlers, task } = createMockSocketTask();
    const runtime = globalThis as typeof globalThis & { wx?: { connectSocket: ReturnType<typeof vi.fn> } };
    runtime.wx = {
      connectSocket: vi.fn(() => task)
    };
    const onLatency = vi.fn();
    const client = createGatewayClient({
      gatewayUrl: "wss://conn.biboer.cn",
      gatewayToken: "demo-token",
      onLatency
    });

    const connectPromise = client.connect({
      host: "example.com",
      port: 22,
      username: "root",
      credential: { type: "password", password: "secret" }
    });

    handlers.open?.();
    await connectPromise;

    expect(task.send).toHaveBeenCalledTimes(1);
    expect(JSON.parse(task.send.mock.calls[0][0].data)).toMatchObject({
      type: "init"
    });

    client.sampleLatency();

    expect(task.send).toHaveBeenCalledTimes(2);
    expect(JSON.parse(task.send.mock.calls[1][0].data)).toEqual({
      type: "control",
      payload: { action: "ping" }
    });

    handlers.message?.({
      data: JSON.stringify({
        type: "control",
        payload: { action: "pong" }
      })
    });

    expect(onLatency).toHaveBeenCalledTimes(1);
    expect(onLatency.mock.calls[0][0]).toBeGreaterThanOrEqual(0);

    client.disconnect("test");
  });

  it("支持按需切换时延采样心跳间隔", async () => {
    vi.useFakeTimers();
    const { handlers, task } = createMockSocketTask();
    const runtime = globalThis as typeof globalThis & { wx?: { connectSocket: ReturnType<typeof vi.fn> } };
    runtime.wx = {
      connectSocket: vi.fn(() => task)
    };
    const client = createGatewayClient({
      gatewayUrl: "wss://conn.biboer.cn",
      gatewayToken: "demo-token"
    });

    const connectPromise = client.connect({
      host: "example.com",
      port: 22,
      username: "root",
      credential: { type: "password", password: "secret" }
    });

    handlers.open?.();
    await connectPromise;

    expect(task.send).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(9999);
    expect(task.send).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(JSON.parse(task.send.mock.calls[1][0].data)).toEqual({
      type: "control",
      payload: { action: "ping" }
    });

    client.setLatencySampleInterval(3000);
    vi.advanceTimersByTime(2999);
    expect(task.send).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(1);
    expect(JSON.parse(task.send.mock.calls[2][0].data)).toEqual({
      type: "control",
      payload: { action: "ping" }
    });

    client.setLatencySampleInterval(10000);
    vi.advanceTimersByTime(3000);
    expect(task.send).toHaveBeenCalledTimes(3);
    vi.advanceTimersByTime(7000);
    expect(JSON.parse(task.send.mock.calls[3][0].data)).toEqual({
      type: "control",
      payload: { action: "ping" }
    });

    client.disconnect("test");
  });

  it("首连遇到 connection refused 时会自动重试一次", async () => {
    vi.useFakeTimers();
    const first = createMockSocketTask();
    const second = createMockSocketTask();
    const runtime = globalThis as typeof globalThis & { wx?: { connectSocket: ReturnType<typeof vi.fn> } };
    runtime.wx = {
      connectSocket: vi.fn().mockReturnValueOnce(first.task).mockReturnValueOnce(second.task)
    };
    const onError = vi.fn();
    const client = createGatewayClient({
      gatewayUrl: "wss://conn.biboer.cn",
      gatewayToken: "demo-token",
      onError
    });

    const connectPromise = client.connect({
      host: "example.com",
      port: 22,
      username: "root",
      credential: { type: "password", password: "secret" }
    });

    first.handlers.error?.({
      errMsg: "connectSocket:fail createWebSocketTask:fail connection refused"
    });
    await vi.advanceTimersByTimeAsync(400);
    second.handlers.open?.();

    await expect(connectPromise).resolves.toBeUndefined();
    expect(runtime.wx.connectSocket).toHaveBeenCalledTimes(2);
    expect(first.task.close).toHaveBeenCalledTimes(1);
    expect(second.task.send).toHaveBeenCalledTimes(1);
    expect(JSON.parse(second.task.send.mock.calls[0][0].data)).toMatchObject({
      type: "init"
    });
    expect(onError).not.toHaveBeenCalled();

    client.disconnect("test");
  });

  it("域名白名单错误不会进入自动重试", async () => {
    vi.useFakeTimers();
    const first = createMockSocketTask();
    const runtime = globalThis as typeof globalThis & { wx?: { connectSocket: ReturnType<typeof vi.fn> } };
    runtime.wx = {
      connectSocket: vi.fn(() => first.task)
    };
    const client = createGatewayClient({
      gatewayUrl: "wss://conn.biboer.cn",
      gatewayToken: "demo-token"
    });

    const connectPromise = client.connect({
      host: "example.com",
      port: 22,
      username: "root",
      credential: { type: "password", password: "secret" }
    });

    first.handlers.error?.({
      errMsg: "connectSocket:fail Error: url not in domain list"
    });

    await expect(connectPromise).rejects.toThrow("url not in domain list");
    expect(runtime.wx.connectSocket).toHaveBeenCalledTimes(1);
  });
});
