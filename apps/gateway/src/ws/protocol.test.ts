import { describe, expect, it } from "vitest";
import { parseInboundFrame } from "./protocol";

describe("gateway protocol", () => {
  it("解析 init 帧", () => {
    const parsed = parseInboundFrame(
      JSON.stringify({
        type: "init",
        payload: {
          host: "127.0.0.1",
          port: 22,
          username: "root",
          resumeGraceMs: 900000,
          credential: { type: "password", password: "x" },
          pty: { cols: 80, rows: 24 }
        }
      })
    );
    expect(parsed.type).toBe("init");
    if (parsed.type === "init") {
      expect(parsed.payload.resumeGraceMs).toBe(900000);
    }
  });

  it("解析带跳板机的 init 帧", () => {
    const parsed = parseInboundFrame(
      JSON.stringify({
        type: "init",
        payload: {
          host: "10.0.0.10",
          port: 22,
          username: "deploy",
          credential: { type: "privateKey", privateKey: "TARGET_KEY" },
          jumpHost: {
            host: "10.0.0.1",
            port: 2222,
            username: "bastion",
            credential: { type: "password", password: "secret" }
          },
          pty: { cols: 120, rows: 32 }
        }
      })
    );
    expect(parsed.type).toBe("init");
    if (parsed.type === "init") {
      expect(parsed.payload.jumpHost?.host).toBe("10.0.0.1");
      expect(parsed.payload.jumpHost?.port).toBe(2222);
      expect(parsed.payload.jumpHost?.username).toBe("bastion");
    }
  });

  it("解析带 meta 的 stdin 帧", () => {
    const parsed = parseInboundFrame(
      JSON.stringify({
        type: "stdin",
        payload: {
          data: "测试",
          meta: {
            source: "assist",
            txnId: "assist-1"
          }
        }
      })
    );
    expect(parsed.type).toBe("stdin");
    if (parsed.type === "stdin") {
      expect(parsed.payload.meta?.source).toBe("assist");
      expect(parsed.payload.meta?.txnId).toBe("assist-1");
    }
  });

  it("解析带原因的 disconnect 控制帧", () => {
    const parsed = parseInboundFrame(
      JSON.stringify({
        type: "control",
        payload: {
          action: "disconnect",
          reason: "manual"
        }
      })
    );
    expect(parsed.type).toBe("control");
    if (parsed.type === "control") {
      expect(parsed.payload.action).toBe("disconnect");
      expect(parsed.payload.reason).toBe("manual");
    }
  });
});
