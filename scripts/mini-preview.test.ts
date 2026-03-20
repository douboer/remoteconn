import { describe, expect, it, vi } from "vitest";

describe("mini preview terminal qrcode redraw", async () => {
  const { normalizeRetryCount, renderTerminalQrcodeWithRetry } = await import("./mini-preview.mjs");

  it("在第一次失败后会自动重画一次", async () => {
    const generateTerminalQrcode = vi
      .fn<(_: string) => Promise<string>>()
      .mockRejectedValueOnce(new Error("decode failed"))
      .mockResolvedValueOnce("terminal-qrcode");
    const onRetry = vi.fn();
    const onRecovered = vi.fn();

    const result = await renderTerminalQrcodeWithRetry({
      qrcodeBase64: "demo",
      generateTerminalQrcode,
      maxRetries: 1,
      waitMs: 0,
      onRetry,
      onRecovered
    });

    expect(result).toBe("terminal-qrcode");
    expect(generateTerminalQrcode).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRecovered).toHaveBeenCalledWith({ attempt: 1, maxRetries: 1 });
  });

  it("超过重画次数后会抛出最后一次错误", async () => {
    const finalError = new Error("still failed");
    const generateTerminalQrcode = vi.fn<(_: string) => Promise<string>>().mockRejectedValue(finalError);

    await expect(
      renderTerminalQrcodeWithRetry({
        qrcodeBase64: "demo",
        generateTerminalQrcode,
        maxRetries: 1,
        waitMs: 0
      })
    ).rejects.toThrow("still failed");
    expect(generateTerminalQrcode).toHaveBeenCalledTimes(2);
  });

  it("重画次数会被归一化为非负整数", () => {
    expect(normalizeRetryCount(undefined)).toBe(1);
    expect(normalizeRetryCount("3.9")).toBe(3);
    expect(normalizeRetryCount("-1")).toBe(0);
    expect(normalizeRetryCount("bad", 2)).toBe(2);
  });
});
