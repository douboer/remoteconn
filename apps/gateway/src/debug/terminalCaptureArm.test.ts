import { describe, expect, it, vi } from "vitest";
import { createTerminalCaptureArmStore } from "./terminalCaptureArm";

describe("terminalCaptureArm", () => {
  it("会拒绝没有匹配条件的录制规则", () => {
    const store = createTerminalCaptureArmStore();
    expect(() =>
      store.arm({
        captureDir: "/tmp/remoteconn-captures",
        ttlMs: 60_000
      })
    ).toThrow(/至少需要提供一个匹配条件/);
  });

  it("命中后会一次性取走规则", () => {
    const store = createTerminalCaptureArmStore();
    const rule = store.arm({
      captureDir: "/tmp/remoteconn-captures",
      ttlMs: 60_000,
      clientSessionKey: "mini-session-1",
      host: "example.com",
      username: "gavin"
    });

    const matched = store.take({
      ip: "127.0.0.1",
      clientSessionKey: "mini-session-1",
      host: "example.com",
      port: 22,
      username: "gavin"
    });

    expect(matched?.id).toBe(rule.id);
    expect(store.list()).toEqual([]);
  });

  it("过期规则不会再命中", () => {
    const nowSpy = vi.spyOn(Date, "now");
    nowSpy.mockReturnValue(1_000);
    const store = createTerminalCaptureArmStore();
    store.arm({
      captureDir: "/tmp/remoteconn-captures",
      ttlMs: 1_000,
      username: "gavin"
    });

    nowSpy.mockReturnValue(2_500);
    const matched = store.take({
      ip: "127.0.0.1",
      host: "example.com",
      port: 22,
      username: "gavin"
    });

    expect(matched).toBeNull();
    nowSpy.mockRestore();
  });
});
