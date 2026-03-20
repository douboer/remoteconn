import { describe, expect, it } from "vitest";
import { readRememberedEnum, writeRememberedEnum } from "./rememberedState";

describe("rememberedState", () => {
  it("可读取允许列表内的持久化值", () => {
    const storage = {
      getItem: (key: string) => (key === "k" ? "shell" : null)
    } as unknown as Storage;
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: storage
    });

    const value = readRememberedEnum("k", ["ui", "shell", "log"] as const);
    expect(value).toBe("shell");
  });

  it("读取到不在允许列表中的值时返回 null", () => {
    const storage = {
      getItem: () => "unknown"
    } as unknown as Storage;
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: storage
    });

    const value = readRememberedEnum("k", ["ui", "shell", "log"] as const);
    expect(value).toBeNull();
  });

  it("localStorage 不可用时应静默降级", () => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new Error("storage blocked");
      }
    });

    expect(readRememberedEnum("k", ["ui", "shell"] as const)).toBeNull();
    expect(() => writeRememberedEnum("k", "ui")).not.toThrow();
  });
});
