import { Client, type ClientChannel, type ConnectConfig } from "ssh2";
import { StringDecoder } from "node:string_decoder";
import { config } from "../config";

interface SshHopOptions {
  host: string;
  port: number;
  username: string;
  credential:
    | { type: "password"; password: string }
    | { type: "privateKey"; privateKey: string; passphrase?: string }
    | { type: "certificate"; privateKey: string; passphrase?: string; certificate: string };
  knownHostFingerprint?: string;
}

export interface SshConnectOptions {
  host: string;
  port: number;
  username: string;
  credential:
    | { type: "password"; password: string }
    | { type: "privateKey"; privateKey: string; passphrase?: string }
    | { type: "certificate"; privateKey: string; passphrase?: string; certificate: string };
  jumpHost?: SshHopOptions;
  pty: { cols: number; rows: number };
  knownHostFingerprint?: string;
  onHostFingerprint?: (payload: { fingerprint: string; hostPort: string; role: "target" | "jump" }) => void;
  onStdout: (data: string) => void;
  onStderr: (data: string) => void;
  onClose: (reason: string) => void;
}

export interface ActiveSshSession {
  write(data: string, traceId?: number): void;
  resize(cols: number, rows: number): void;
  close(reason?: string): void;
}

/**
 * 初始化哨兵：用于标记“静默初始化命令”的开始与结束。
 */
const INIT_BEGIN = "__RCSBEGIN_7f3a__";
const INIT_DONE = "__RCSDONE_7f3a__";

/**
 * 初始化命令分三段写入：
 * 1) 关闭回显 + BEGIN 哨兵
 * 2) shell 兼容初始化
 * 3) 打开回显 + DONE 哨兵
 */
const SHELL_INIT_W1 = "stty -echo; echo '__RCSBEGIN_7f3a__'\r";
const SHELL_INIT_W2 = [
  "stty iutf8 2>/dev/null",
  '; [ -z "$LANG" ] && export LANG=zh_CN.UTF-8',
  '; [ -z "$LC_CTYPE" ] && export LC_CTYPE=zh_CN.UTF-8',
  '; [ -z "$LC_ALL" ] && export LC_ALL=zh_CN.UTF-8',
  "; setopt MULTIBYTE PRINT_EIGHT_BIT 2>/dev/null",
  "; unsetopt PROMPT_SP 2>/dev/null",
  "; PROMPT_EOL_MARK='' 2>/dev/null"
].join("") + "\r";
const SHELL_INIT_W3 = "stty echo; echo '__RCSDONE_7f3a__'\r";

/**
 * 这些特征行一旦出现在 stdout，说明是网关内部初始化泄漏，必须过滤。
 */
const INIT_LEAK_PATTERNS = [
  "stty -echo; echo '__RCSBEGIN_7f3a__'",
  "stty iutf8 2>/dev/null",
  "setopt MULTIBYTE PRINT_EIGHT_BIT",
  "unsetopt PROMPT_SP",
  "PROMPT_EOL_MARK=''",
  "stty echo; echo '__RCSDONE_7f3a__'",
  INIT_BEGIN,
  INIT_DONE
];

/** @internal 仅供测试调用。 */
export const INIT_BEGIN_FOR_TEST = INIT_BEGIN;
/** @internal 仅供测试调用。 */
export const INIT_DONE_FOR_TEST = INIT_DONE;

interface SentinelMatch {
  index: number;
  end: number;
}

/**
 * 输入去噪：去除 C1 控制字符（0x80-0x9F）。
 */
function stripC1Controls(data: string): string {
  return data.replace(/[\u0080-\u009F]/g, "");
}

/**
 * 判断字节串是否可无损按 UTF-8 解释。
 */
function isLosslessUtf8Bytes(bytes: Buffer): boolean {
  const decoded = bytes.toString("utf8");
  if (decoded.includes("\uFFFD")) {
    return false;
  }
  return Buffer.from(decoded, "utf8").equals(bytes);
}

function decodeByteRun(bytes: number[]): string {
  if (bytes.length === 0) {
    return "";
  }
  const buf = Buffer.from(bytes);
  if (isLosslessUtf8Bytes(buf)) {
    return buf.toString("utf8");
  }
  return String.fromCharCode(...bytes.filter((b) => (b >= 0x20 && b <= 0x7e) || b === 0x09));
}

/**
 * 混合输入归一：宽字符原样保留，单字节段按 UTF-8 尝试解码。
 */
function normalizeMixedInput(data: string): string {
  let output = "";
  let byteRun: number[] = [];

  const flushByteRun = (): void => {
    output += decodeByteRun(byteRun);
    byteRun = [];
  };

  for (const ch of data) {
    const codePoint = ch.codePointAt(0) ?? 0;
    if (codePoint <= 0xff) {
      byteRun.push(codePoint);
      continue;
    }
    flushByteRun();
    output += ch;
  }
  flushByteRun();
  return output;
}

/**
 * 将前端输入转换为 SSH 可写内容。
 */
export function encodeInputForSsh(data: string): string {
  let hasHighByte = false;
  let hasWideChar = false;

  for (let i = 0; i < data.length; i += 1) {
    const code = data.charCodeAt(i);
    if (code > 0xff) {
      hasWideChar = true;
      continue;
    }
    if (code >= 0x80) {
      hasHighByte = true;
    }
  }

  if (hasWideChar) {
    return normalizeMixedInput(data).replace(/\uFFFD/g, "");
  }

  if (!hasHighByte) {
    return data;
  }

  const bytes = Buffer.from(data, "latin1");
  if (isLosslessUtf8Bytes(bytes)) {
    return bytes.toString("utf8");
  }

  return stripC1Controls(data);
}

/**
 * 匹配哨兵真实输出行（SENTINEL + \n 或 \r\n）。
 * 注意：不会误匹配命令回显里的 `echo '__RCS...__'`（后面是单引号）。
 */
function findSentinelLine(buffer: string, sentinel: string): SentinelMatch | null {
  let from = 0;
  while (from < buffer.length) {
    const index = buffer.indexOf(sentinel, from);
    if (index < 0) {
      return null;
    }

    const next = buffer[index + sentinel.length];
    const nextNext = buffer[index + sentinel.length + 1];

    if (next === "\n") {
      return { index, end: index + sentinel.length + 1 };
    }
    if (next === "\r" && nextNext === "\n") {
      return { index, end: index + sentinel.length + 2 };
    }

    // 落在 chunk 边界，等下个 chunk 再判定。
    if (next === undefined || (next === "\r" && nextNext === undefined)) {
      return null;
    }

    from = index + 1;
  }

  return null;
}

/**
 * 兜底清理初始化泄漏内容，保留 banner 与提示符。
 */
function sanitizeInitLeakOutput(text: string): string {
  return text
    .split(/(\r\n|\n|\r)/)
    .reduce((acc, current, index, parts) => {
      if (index % 2 === 1) {
        return acc;
      }
      const shouldDrop = INIT_LEAK_PATTERNS.some((pattern) => current.includes(pattern));
      if (shouldDrop) {
        return acc;
      }
      return acc + current + (parts[index + 1] ?? "");
    }, "");
}

/**
 * 统一可读错误信息，便于前端提示用户。
 */
function normalizeSshError(error: Error): Error {
  const raw = String(error.message ?? "");
  if (raw.includes("All configured authentication methods failed")) {
    return new Error(
      `SSH 认证失败：用户名/密码不正确，或目标服务器要求额外认证（如 publickey + keyboard-interactive 多因子）。原始错误: ${raw}`
    );
  }
  if (raw.includes("Timed out while waiting for handshake")) {
    return new Error(`SSH 握手超时，请检查目标主机连通性与端口（原始错误: ${raw}）`);
  }
  return error;
}

function toPrivateKeyPayload(
  credential: Extract<SshHopOptions["credential"], { type: "privateKey" | "certificate" }>
): string {
  if (credential.type === "certificate") {
    return `${credential.privateKey}\n${credential.certificate}`;
  }
  return credential.privateKey;
}

/**
 * 统一构造 ssh2 connect 配置：
 * - 密码模式优先 keyboard-interactive，再回退 password；
 * - 私钥/证书模式直接走 publickey；
 * - hostVerifier 在每个 hop 独立上报指纹，便于前端分别确认。
 */
function buildSshConnectConfig(
  hop: SshHopOptions,
  onHostFingerprint: SshConnectOptions["onHostFingerprint"],
  role: "target" | "jump",
  sock?: ConnectConfig["sock"]
): ConnectConfig {
  const hostPort = `${hop.host}:${hop.port}`;
  const baseConfig: ConnectConfig = {
    host: hop.host,
    port: hop.port,
    username: hop.username,
    readyTimeout: config.sshReadyTimeoutMs,
    keepaliveInterval: config.sshKeepaliveIntervalMs,
    keepaliveCountMax: config.sshKeepaliveCountMax,
    hostHash: "sha256",
    ...(sock ? { sock } : {}),
    hostVerifier: (keyHash: string) => {
      onHostFingerprint?.({ fingerprint: keyHash, hostPort, role });
      return !hop.knownHostFingerprint || keyHash === hop.knownHostFingerprint;
    }
  };

  if (hop.credential.type === "password") {
    const authPassword = hop.credential.password;
    const authHandler = [
      {
        type: "keyboard-interactive",
        username: hop.username,
        prompt(
          _name: string,
          _instructions: string,
          _lang: string,
          prompts: Array<{ prompt: string; echo?: boolean }>,
          finish: (responses: string[]) => void
        ) {
          finish(prompts.map(() => authPassword));
        }
      },
      { type: "password", username: hop.username, password: authPassword }
    ] as unknown as ConnectConfig["authHandler"];

    return {
      ...baseConfig,
      password: authPassword,
      tryKeyboard: true,
      authHandler
    };
  }

  return {
    ...baseConfig,
    privateKey: toPrivateKeyPayload(hop.credential),
    passphrase: hop.credential.passphrase
  };
}

/**
 * 建立 SSH 会话并返回可操作句柄。
 * 仅保留已验证有效的链路：双哨兵过滤 + 超时兜底净化。
 */
export async function createSshSession(options: SshConnectOptions): Promise<ActiveSshSession> {
  const targetConn = new Client();
  const jumpConn = options.jumpHost ? new Client() : null;

  return await new Promise<ActiveSshSession>((resolve, reject) => {
    let streamRef: {
      write: (data: string | Buffer) => void;
      setWindow: (rows: number, cols: number, height: number, width: number) => void;
      close: () => void;
      on: (event: string, listener: (...args: unknown[]) => void) => void;
      stderr: { on: (event: string, listener: (chunk: Buffer) => void) => void };
    } | null = null;
    let closeReported = false;
    /**
     * 关闭原因只允许上报一次，避免 `close()` / `stream.close` / `conn.close`
     * 多路并发触发导致日志重复。
     */
    const reportCloseOnce = (reason: string): void => {
      if (closeReported) {
        return;
      }
      closeReported = true;
      options.onClose(reason);
    };

    const onError = (error: Error): void => {
      reject(normalizeSshError(error));
      targetConn.end();
      jumpConn?.end();
    };

    const openShell = (): void => {
      targetConn.shell(
        { cols: options.pty.cols, rows: options.pty.rows, term: "xterm-256color", modes: { ECHO: 0 } },
        (shellError: Error | undefined, stream: ClientChannel) => {
          if (shellError) {
            onError(shellError);
            return;
          }

          streamRef = stream as typeof streamRef;
          const stdoutDecoder = new StringDecoder("utf8");
          const stderrDecoder = new StringDecoder("utf8");

          let initState: "waiting_begin" | "waiting_done" | "done" = "waiting_begin";
          let initBuffer = "";
          const initTimeoutHandle = setTimeout(() => {
            if (initState !== "done") {
              initState = "done";
              const sanitized = sanitizeInitLeakOutput(initBuffer);
              if (sanitized) {
                options.onStdout(sanitized);
              }
              initBuffer = "";
            }
          }, 3000);

          stream.on("data", (chunk: Buffer) => {
            const text = stdoutDecoder.write(chunk);
            if (!text) {
              return;
            }

            if (initState === "done") {
              options.onStdout(text);
              return;
            }

            initBuffer += text;

            if (initState === "waiting_begin") {
              const beginMatch = findSentinelLine(initBuffer, INIT_BEGIN);
              if (!beginMatch) {
                return;
              }

              const rawBefore = initBuffer.slice(0, beginMatch.index);
              const echoIndex = rawBefore.lastIndexOf("stty -echo");
              const newlineBeforeEcho = echoIndex >= 0 ? rawBefore.lastIndexOf("\n", echoIndex) : -1;
              const before =
                echoIndex >= 0 ? (newlineBeforeEcho >= 0 ? rawBefore.slice(0, newlineBeforeEcho + 1) : "") : rawBefore;

              initBuffer = initBuffer.slice(beginMatch.end);
              initState = "waiting_done";

              const sanitizedBefore = sanitizeInitLeakOutput(before);
              if (sanitizedBefore) {
                options.onStdout(sanitizedBefore);
              }
            }

            if (initState === "waiting_done") {
              const doneMatch = findSentinelLine(initBuffer, INIT_DONE);
              if (!doneMatch) {
                const keepTail = INIT_DONE.length + 2;
                if (initBuffer.length > keepTail) {
                  initBuffer = initBuffer.slice(-keepTail);
                }
                return;
              }

              const after = sanitizeInitLeakOutput(initBuffer.slice(doneMatch.end));
              initBuffer = "";
              initState = "done";
              clearTimeout(initTimeoutHandle);

              if (after) {
                options.onStdout(after);
              }
            }
          });

          stream.stderr.on("data", (chunk: Buffer) => {
            const text = stderrDecoder.write(chunk);
            if (text) {
              options.onStderr(text);
            }
          });

          try {
            stream.write(Buffer.from(SHELL_INIT_W1, "utf8"));
            stream.write(Buffer.from(SHELL_INIT_W2, "utf8"));
            stream.write(Buffer.from(SHELL_INIT_W3, "utf8"));
          } catch {
            clearTimeout(initTimeoutHandle);
            initState = "done";
          }

          stream.on("close", () => {
            clearTimeout(initTimeoutHandle);
            const remainOut = stdoutDecoder.end();
            if (remainOut) {
              options.onStdout(remainOut);
            }
            const remainErr = stderrDecoder.end();
            if (remainErr) {
              options.onStderr(remainErr);
            }
            reportCloseOnce("shell_closed");
            targetConn.end();
            jumpConn?.end();
          });

          resolve({
            write(data: string, _traceId?: number) {
              const payload = encodeInputForSsh(data).replace(/\uFFFD/g, "");
              if (payload) {
                streamRef?.write(Buffer.from(payload, "utf8"));
              }
            },
            resize(cols: number, rows: number) {
              streamRef?.setWindow(rows, cols, 0, 0);
            },
            close(reason = "manual") {
              reportCloseOnce(reason);
              streamRef?.close();
              targetConn.end();
              jumpConn?.end();
            }
          });
        }
      );
    };

    targetConn.on("ready", openShell);
    targetConn.on("error", onError);
    targetConn.on("close", () => {
      reportCloseOnce("connection_closed");
    });

    const targetHop: SshHopOptions = {
      host: options.host,
      port: options.port,
      username: options.username,
      credential: options.credential,
      knownHostFingerprint: options.knownHostFingerprint
    };

    if (!options.jumpHost) {
      targetConn.connect(buildSshConnectConfig(targetHop, options.onHostFingerprint, "target"));
      return;
    }

    jumpConn?.on("error", onError);
    jumpConn?.on("close", () => {
      reportCloseOnce("jump_connection_closed");
    });

    jumpConn?.on("ready", () => {
      jumpConn.forwardOut("127.0.0.1", 0, options.host, options.port, (error, stream) => {
        if (error || !stream) {
          onError(error ?? new Error("jump forward stream missing"));
          return;
        }
        targetConn.connect(buildSshConnectConfig(targetHop, options.onHostFingerprint, "target", stream));
      });
    });

    jumpConn?.connect(buildSshConnectConfig(options.jumpHost, options.onHostFingerprint, "jump"));
  });
}
