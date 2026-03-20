import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { connectSpy, streamWriteSpy } = vi.hoisted(() => ({
  connectSpy: vi.fn(),
  streamWriteSpy: vi.fn()
}));

let capturedStream: MockChannel | null = null;

class MockChannel extends EventEmitter {
  public stderr = {
    on: (_event: string, _listener: (chunk: Buffer) => void) => {
      return this.stderr;
    }
  };

  public write(data: string | Buffer): void {
    streamWriteSpy(data);
  }

  public setWindow(_rows: number, _cols: number, _height: number, _width: number): void {
    // no-op for tests
  }

  public close(): void {
    this.emit("close");
  }
}

class MockForwardStream extends EventEmitter {}

vi.mock("ssh2", () => ({
  Client: class MockClient extends EventEmitter {
    public connect(config: unknown): this {
      connectSpy(config);
      const host = (config as { host?: string })?.host;
      if (host === "ready-host" || host === "jump-host") {
        queueMicrotask(() => this.emit("ready"));
      } else {
        queueMicrotask(() => this.emit("error", new Error("mock connect failed")));
      }
      return this;
    }

    public shell(
      _options: unknown,
      callback: (shellError: Error | undefined, stream: MockChannel) => void
    ): void {
      const ch = new MockChannel();
      capturedStream = ch;
      callback(undefined, ch);
    }

    public forwardOut(
      _srcIP: string,
      _srcPort: number,
      _dstIP: string,
      _dstPort: number,
      callback: (error: Error | undefined, stream: MockForwardStream) => void
    ): void {
      callback(undefined, new MockForwardStream());
    }

    public end(): void {
      // 模拟 ssh2 客户端 end 行为，无需实际动作。
    }
  }
}));

import { createSshSession, encodeInputForSsh, INIT_BEGIN_FOR_TEST, INIT_DONE_FOR_TEST } from "./sshSession";

describe("sshSession", () => {
  beforeEach(() => {
    connectSpy.mockReset();
    streamWriteSpy.mockReset();
    capturedStream = null;
  });

  it("密码认证显式优先 keyboard-interactive 再回退 password", async () => {
    await expect(
      createSshSession({
        host: "127.0.0.1",
        port: 22,
        username: "gavin",
        credential: { type: "password", password: "secret" },
        pty: { cols: 80, rows: 24 },
        onStdout: () => {},
        onStderr: () => {},
        onClose: () => {}
      })
    ).rejects.toThrow("mock connect failed");

    expect(connectSpy).toHaveBeenCalledTimes(1);
    const config = connectSpy.mock.calls[0]?.[0] as {
      authHandler?: Array<{ type: string; username: string; password?: string; prompt?: (...args: unknown[]) => void }>;
      tryKeyboard?: boolean;
      password?: string;
    };
    expect(config.password).toBe("secret");
    expect(config.tryKeyboard).toBe(true);
    expect(config.authHandler).toHaveLength(2);
    expect(config.authHandler?.[0]?.type).toBe("keyboard-interactive");
    expect(config.authHandler?.[0]?.username).toBe("gavin");
    expect(typeof config.authHandler?.[0]?.prompt).toBe("function");
    expect(config.authHandler?.[1]).toEqual({
      type: "password",
      username: "gavin",
      password: "secret"
    });
  });

  it("私钥认证不应注入密码认证策略", async () => {
    await expect(
      createSshSession({
        host: "127.0.0.1",
        port: 22,
        username: "gavin",
        credential: { type: "privateKey", privateKey: "mock-key" },
        pty: { cols: 80, rows: 24 },
        onStdout: () => {},
        onStderr: () => {},
        onClose: () => {}
      })
    ).rejects.toThrow("mock connect failed");

    expect(connectSpy).toHaveBeenCalledTimes(1);
    const config = connectSpy.mock.calls[0]?.[0] as { authHandler?: string[]; privateKey?: string };
    expect(config.privateKey).toBe("mock-key");
    expect(config.authHandler).toBeUndefined();
  });

  it("字节串样式输入应按 latin1 还原为原始字节", () => {
    const byteString = "\u00e4\u00b8\u00ad\u00e6\u0096\u0087";
    const encoded = encodeInputForSsh(byteString);
    expect(typeof encoded).toBe("string");
    expect(encoded).toBe("中文");
  });

  it("普通 Unicode 输入应保持字符串，避免误判", () => {
    const encoded = encodeInputForSsh("中文");
    expect(typeof encoded).toBe("string");
    expect(encoded).toBe("中文");
  });

  it("混合输入（Unicode + 字节串）应归一为正确 Unicode 字符串", () => {
    const mixed = "测\u00e8\u00af\u0095";
    const encoded = encodeInputForSsh(mixed);
    expect(typeof encoded).toBe("string");
    expect(encoded).toBe("测试");
  });

  it("非法高位噪声应过滤 C1 控制字符", () => {
    const encoded = encodeInputForSsh("\u008b\u0095");
    expect(typeof encoded).toBe("string");
    expect(encoded).toBe("");
  });

  it("gateway 建链后应分三次写入：w1=stty-echo+BEGIN, w2=init, w3=stty+echo+DONE", async () => {
    await createSshSession({
      host: "ready-host",
      port: 22,
      username: "gavin",
      credential: { type: "password", password: "secret" },
      pty: { cols: 80, rows: 24 },
      onStdout: () => {},
      onStderr: () => {},
      onClose: () => {}
    });

    // 独立三次写入，确保 BEGIN/DONE 即使 init 失败也一定发出
    expect(streamWriteSpy).toHaveBeenCalledTimes(3);

    const w1 = Buffer.isBuffer(streamWriteSpy.mock.calls[0]?.[0])
      ? (streamWriteSpy.mock.calls[0][0] as Buffer).toString("utf8")
      : String(streamWriteSpy.mock.calls[0]?.[0]);
    const w2 = Buffer.isBuffer(streamWriteSpy.mock.calls[1]?.[0])
      ? (streamWriteSpy.mock.calls[1][0] as Buffer).toString("utf8")
      : String(streamWriteSpy.mock.calls[1]?.[0]);
    const w3 = Buffer.isBuffer(streamWriteSpy.mock.calls[2]?.[0])
      ? (streamWriteSpy.mock.calls[2][0] as Buffer).toString("utf8")
      : String(streamWriteSpy.mock.calls[2]?.[0]);

    // w1: 关回显 + BEGIN 哨兵
    expect(w1).toContain("stty -echo");
    expect(w1).toContain("RCSBEGIN");

    // w2: shell 初始化，不含 ${VAR:-} 语法，兼容 bash/dash
    expect(w2).toContain("setopt MULTIBYTE PRINT_EIGHT_BIT");
    expect(w2).not.toContain("${"); // 不用 parameter expansion 默认值语法

    // w3: 开回显 + DONE 哨兵
    expect(w3).toContain("stty echo");
    expect(w3).toContain("RCSDONE");
  });

  it("配置跳板机后应先连接 jump，再通过 sock 连接 target", async () => {
    await createSshSession({
      host: "ready-host",
      port: 22,
      username: "target-user",
      credential: { type: "password", password: "target-secret" },
      jumpHost: {
        host: "jump-host",
        port: 2222,
        username: "jump-user",
        credential: { type: "privateKey", privateKey: "jump-key" }
      },
      pty: { cols: 80, rows: 24 },
      onStdout: () => {},
      onStderr: () => {},
      onClose: () => {}
    });

    expect(connectSpy).toHaveBeenCalledTimes(2);
    const jumpConfig = connectSpy.mock.calls[0]?.[0] as { host?: string; username?: string; privateKey?: string };
    const targetConfig = connectSpy.mock.calls[1]?.[0] as {
      host?: string;
      username?: string;
      password?: string;
      sock?: unknown;
    };

    expect(jumpConfig.host).toBe("jump-host");
    expect(jumpConfig.username).toBe("jump-user");
    expect(jumpConfig.privateKey).toBe("jump-key");
    expect(targetConfig.host).toBe("ready-host");
    expect(targetConfig.username).toBe("target-user");
    expect(targetConfig.password).toBe("target-secret");
    expect(targetConfig.sock).toBeTruthy();
  });

  it("BEGIN 前的内容（Last login）保留；BEGIN→DONE 之间丢弃；DONE 后正常转发", async () => {
    const received: string[] = [];

    await createSshSession({
      host: "ready-host",
      port: 22,
      username: "gavin",
      credential: { type: "password", password: "secret" },
      pty: { cols: 80, rows: 24 },
      onStdout: (d) => received.push(d),
      onStderr: () => {},
      onClose: () => {}
    });

    const ch = capturedStream!;

    // Last login（sshd 在 shell 启动前输出）
    ch.emit("data", Buffer.from("Last login: Wed Feb 25 10:20:19 2026\r\n", "utf8"));
    expect(received).toHaveLength(0); // BEGIN 未到，缓冲中

    // BEGIN 哨兵 + 命令回显（init 命令被 zsh echo）
    // 真实场景：echo 输出为 SENTINEL\r\n，命令回显里 sentinel 后面跟 '
    const beginLine = Buffer.from(INIT_BEGIN_FOR_TEST + "\r\n", "utf8");
    ch.emit("data", beginLine.subarray(0, 3));
    ch.emit("data", Buffer.concat([
      beginLine.subarray(3),
      Buffer.from("stty iutf8 2>/dev/null; setopt MULTIBYTE...\r\n", "utf8")
    ]));

    // BEGIN 之前的 Last login 应已转发
    expect(received.join("")).toContain("Last login:");
    // init 命令回显在 BEGIN 之后，在丢弃区内
    expect(received.join("")).not.toContain("setopt MULTIBYTE");

    const prevLen = received.length;

    // DONE 哨兵（分两个 chunk 验证跨 chunk，SENTINEL\r\n 中途截断）
    const doneLine = Buffer.from(INIT_DONE_FOR_TEST + "\r\n", "utf8");
    ch.emit("data", doneLine.subarray(0, 3));
    expect(received.length).toBe(prevLen); // DONE 未完整，仍丢弃

    ch.emit("data", Buffer.concat([
      doneLine.subarray(3),
      Buffer.from("gavin mini ~ % ", "utf8")
    ]));

    const output = received.join("");
    expect(output).toContain("Last login:");          // 保留
    expect(output).not.toContain("setopt MULTIBYTE"); // init 回显已丢弃
    expect(output).toContain("gavin mini ~ %");       // DONE 后正常转发
  });

  it("rawBefore 末尾含命令回显（prompt + stty -echo...）时，仅保留 banner，丢弃回显行", async () => {
    const received: string[] = [];

    await createSshSession({
      host: "ready-host",
      port: 22,
      username: "gavin",
      credential: { type: "password", password: "secret" },
      pty: { cols: 80, rows: 24 },
      onStdout: (d) => received.push(d),
      onStderr: () => {},
      onClose: () => {}
    });

    const ch = capturedStream!;

    // 真实 SSH 场景：banner → 命令回显 → BEGIN
    // sshd banner
    ch.emit("data", Buffer.from("Last login: Wed Feb 25 10:00:00 2026\r\n\r\n", "utf8"));
    // PTY 对 W1 的 echo（提示符 + 命令 + CRLF，由 PTY ONLCR 添加）
    ch.emit("data", Buffer.from("~ % stty -echo; echo '__RCSBEGIN_7f3a__'\r\n", "utf8"));
    // BEGIN 哨兵本体：echo 输出为 SENTINEL\r\n（PTY ONLCR）
    ch.emit("data", Buffer.from(INIT_BEGIN_FOR_TEST + "\r\n", "utf8"));
    // W2 回显（在丢弃区内）
    ch.emit("data", Buffer.from("stty iutf8; setopt MULTIBYTE...\r\n", "utf8"));
    // DONE 哨兵：命令回显（sentinel 后跟 '）+ 实际 echo 输出（sentinel + \r\n）
    // 这正是产生 bug 的场景：命令回显里有 __RCSDONE_7f3a__' ，实际输出是 __RCSDONE_7f3a__\r\n
    ch.emit("data", Buffer.from("stty echo; echo '__RCSDONE_7f3a__'\r\n", "utf8"));
    ch.emit("data", Buffer.concat([
      Buffer.from(INIT_DONE_FOR_TEST + "\r\n", "utf8"),
      Buffer.from("gavin mini ~ % ", "utf8")
    ]));

    const output = received.join("");
    expect(output).toContain("Last login:");              // banner 保留
    expect(output).not.toContain("stty -echo");           // 命令回显被丢弃
    expect(output).not.toContain("setopt MULTIBYTE");     // init 回显在丢弃区内
    expect(output).not.toContain("__RCSDONE_7f3a__");    // DONE 哨兵本身不可见
    expect(output).not.toContain("stty echo");            // W3 命令回显不可见
    expect(output).toContain("gavin mini ~ %");           // DONE 后正常转发
  });

  it("哨兵行仅为 LF 时，仍应过滤内部初始化命令", async () => {
    const received: string[] = [];

    await createSshSession({
      host: "ready-host",
      port: 22,
      username: "gavin",
      credential: { type: "password", password: "secret" },
      pty: { cols: 80, rows: 24 },
      onStdout: (d) => received.push(d),
      onStderr: () => {},
      onClose: () => {}
    });

    const ch = capturedStream!;
    ch.emit("data", Buffer.from("Last login: Wed Feb 25 12:07:16 2026 from 202.96.99.162\n", "utf8"));
    ch.emit("data", Buffer.from("~ % stty -echo; echo '__RCSBEGIN_7f3a__'\n", "utf8"));
    ch.emit("data", Buffer.from(INIT_BEGIN_FOR_TEST + "\n", "utf8"));
    ch.emit("data", Buffer.from("stty iutf8; setopt MULTIBYTE...\n", "utf8"));
    ch.emit("data", Buffer.from("stty echo; echo '__RCSDONE_7f3a__'\n", "utf8"));
    ch.emit("data", Buffer.concat([
      Buffer.from(INIT_DONE_FOR_TEST + "\n", "utf8"),
      Buffer.from("gavin mini ~ % ", "utf8")
    ]));

    const output = received.join("");
    expect(output).toContain("Last login:");
    expect(output).toContain("gavin mini ~ %");
    expect(output).not.toContain("stty -echo");
    expect(output).not.toContain("setopt MULTIBYTE");
    expect(output).not.toContain("stty echo");
    expect(output).not.toContain("__RCSBEGIN_7f3a__");
    expect(output).not.toContain("__RCSDONE_7f3a__");
  });

  it("BEGIN/DONE 未命中并超时时，仍应兜底清理内部初始化命令", async () => {
    const received: string[] = [];
    vi.useFakeTimers();

    try {
      await createSshSession({
        host: "ready-host",
        port: 22,
        username: "gavin",
        credential: { type: "password", password: "secret" },
        pty: { cols: 80, rows: 24 },
        onStdout: (d) => received.push(d),
        onStderr: () => {},
        onClose: () => {}
      });

      const ch = capturedStream!;
      ch.emit("data", Buffer.from("Activate the web console with: systemctl enable --now cockpit.socket\r\n", "utf8"));
      ch.emit("data", Buffer.from("Last login: Wed Feb 25 12:20:32 2026 from 115.193.12.66\r\n", "utf8"));
      ch.emit("data", Buffer.from("stty -echo; echo '__RCSBEGIN_7f3a__'\r\n", "utf8"));
      ch.emit("data", Buffer.from("stty iutf8 2>/dev/null; setopt MULTIBYTE PRINT_EIGHT_BIT 2>/dev/null; unsetopt PROMPT_SP 2>/dev/null; PROMPT_EOL_MARK=''\r\n", "utf8"));
      ch.emit("data", Buffer.from("stty echo; echo '__RCSDONE_7f3a__'\r\n", "utf8"));
      ch.emit("data", Buffer.from("[gavin@kvm-douboer ~]$ ", "utf8"));

      await vi.advanceTimersByTimeAsync(3100);

      const output = received.join("");
      expect(output).toContain("Activate the web console");
      expect(output).toContain("Last login:");
      expect(output).toContain("[gavin@kvm-douboer ~]$");
      expect(output).not.toContain("stty -echo; echo");
      expect(output).not.toContain("stty iutf8");
      expect(output).not.toContain("setopt MULTIBYTE");
      expect(output).not.toContain("PROMPT_EOL_MARK");
      expect(output).not.toContain("stty echo; echo");
      expect(output).not.toContain("__RCSBEGIN_7f3a__");
      expect(output).not.toContain("__RCSDONE_7f3a__");
    } finally {
      vi.useRealTimers();
    }
  });

  it("主动 close 后不应重复触发 onClose（避免 switch 日志重复）", async () => {
    const closeReasons: string[] = [];

    const session = await createSshSession({
      host: "ready-host",
      port: 22,
      username: "gavin",
      credential: { type: "password", password: "secret" },
      pty: { cols: 80, rows: 24 },
      onStdout: () => {},
      onStderr: () => {},
      onClose: (reason) => closeReasons.push(reason)
    });

    session.close("switch");
    expect(closeReasons).toEqual(["switch"]);
  });
});
