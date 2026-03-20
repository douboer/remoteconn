import { spawn, type ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";
import net from "node:net";
import { WebSocket, type RawData } from "ws";

interface BenchOptions {
  ttydBin: string;
  ttydHost: string;
  ttydPort: number;
  sshHost: string;
  sshPort: number;
  sshUsername: string;
  sshIdentity?: string;
  iterations: number;
  payloadKb: number;
  timeoutMs: number;
}

interface BenchStats {
  min: number;
  max: number;
  avg: number;
  p50: number;
  p95: number;
}

/**
 * 读取环境变量，统一与 gateway 基线脚本保持参数名兼容。
 */
function loadOptions(): BenchOptions {
  const identity = process.env.BENCH_SSH_IDENTITY;
  return {
    ttydBin: process.env.BENCH_TTYD_BIN ?? "ttyd",
    ttydHost: process.env.BENCH_TTYD_HOST ?? "127.0.0.1",
    ttydPort: Number(process.env.BENCH_TTYD_PORT ?? "0"),
    sshHost: process.env.BENCH_SSH_HOST ?? "127.0.0.1",
    sshPort: Number(process.env.BENCH_SSH_PORT ?? "22"),
    sshUsername: process.env.BENCH_SSH_USER ?? process.env.USER ?? "root",
    sshIdentity: identity && identity.trim().length > 0 ? identity : undefined,
    iterations: Number(process.env.BENCH_ITERATIONS ?? "30"),
    payloadKb: Number(process.env.BENCH_PAYLOAD_KB ?? "1024"),
    timeoutMs: Number(process.env.BENCH_TIMEOUT_MS ?? "8000")
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 轮询等待状态变化，避免事件乱序导致监听器遗漏。
 */
async function waitFor(check: () => boolean, timeoutMs: number, label: string): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (check()) return;
    await delay(10);
  }
  throw new Error(`等待超时: ${label}`);
}

async function pickFreePort(host: string): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, host, () => resolve());
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  if (!port) {
    throw new Error("无法分配可用端口");
  }
  return port;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * p;
  const base = Math.floor(pos);
  const rest = pos - base;
  const baseValue = sorted[base] ?? 0;
  const nextValue = sorted[base + 1];
  if (nextValue === undefined) {
    return baseValue;
  }
  return baseValue + rest * (nextValue - baseValue);
}

function buildStats(samples: number[]): BenchStats {
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, item) => acc + item, 0);
  return {
    min: sorted[0] ?? 0,
    max: sorted[sorted.length - 1] ?? 0,
    avg: sorted.length > 0 ? sum / sorted.length : 0,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95)
  };
}

function formatMs(value: number): string {
  return `${value.toFixed(2)}ms`;
}

function formatMbps(bytes: number, ms: number): string {
  if (ms <= 0) return "0.00 MB/s";
  const sec = ms / 1000;
  const mb = bytes / 1024 / 1024;
  return `${(mb / sec).toFixed(2)} MB/s`;
}

/**
 * 启动 ttyd 子进程，命令行为：ttyd -> ssh -> 目标 shell。
 */
async function startTtyd(options: BenchOptions): Promise<{ proc: ChildProcessByStdio<null, Readable, Readable>; port: number }> {
  const port = options.ttydPort > 0 ? options.ttydPort : await pickFreePort(options.ttydHost);
  const sshArgs = [
    "-tt",
    "-o",
    "StrictHostKeyChecking=no",
    "-o",
    "UserKnownHostsFile=/dev/null",
    "-o",
    "LogLevel=ERROR"
  ];

  if (options.sshIdentity) {
    sshArgs.push("-i", options.sshIdentity);
  }

  sshArgs.push("-p", String(options.sshPort), `${options.sshUsername}@${options.sshHost}`);

  const args = ["-i", options.ttydHost, "-p", String(port), "-W", "--", "ssh", ...sshArgs];
  const proc = spawn(options.ttydBin, args, {
    stdio: ["ignore", "pipe", "pipe"]
  });

  let stderrText = "";
  proc.stderr.on("data", (chunk: Buffer) => {
    stderrText += chunk.toString("utf8");
  });

  await waitFor(
    () => stderrText.includes("Listening on port:") || proc.exitCode !== null,
    4000,
    "ttyd 启动"
  );

  if (proc.exitCode !== null) {
    throw new Error(`ttyd 启动失败(exit=${proc.exitCode}): ${stderrText.trim()}`);
  }

  return { proc, port };
}

function sendTtydInput(ws: WebSocket, data: string): void {
  ws.send(Buffer.concat([Buffer.from("0"), Buffer.from(data, "utf8")]));
}

function toBuffer(raw: RawData): Buffer {
  if (Buffer.isBuffer(raw)) {
    return raw;
  }

  if (raw instanceof ArrayBuffer) {
    return Buffer.from(raw);
  }

  if (Array.isArray(raw)) {
    return Buffer.concat(
      raw.map((chunk) => {
        if (Buffer.isBuffer(chunk)) {
          return chunk;
        }
        return Buffer.from(chunk);
      })
    );
  }

  return Buffer.from(raw);
}

async function main(): Promise<void> {
  const options = loadOptions();
  const { proc, port } = await startTtyd(options);
  const endpoint = `ws://${options.ttydHost}:${port}/ws`;

  const ws = new WebSocket(endpoint, ["tty"]);
  let stdoutText = "";
  let stdoutBytes = 0;
  let fatalError = "";
  let opened = false;

  ws.on("open", () => {
    opened = true;
    ws.send(JSON.stringify({ columns: 140, rows: 40 }));
  });

  ws.on("message", (raw, isBinary) => {
    if (!isBinary) return;

    const data = toBuffer(raw);
    const cmd = String.fromCharCode(data[0] ?? 0);
    if (cmd !== "0") {
      return;
    }

    const text = data.slice(1).toString("utf8");
    stdoutText += text;
    stdoutBytes += Buffer.byteLength(text, "utf8");
  });

  ws.on("error", (error) => {
    fatalError = String(error);
  });

  const connectStartedAt = performance.now();
  await waitFor(() => opened || fatalError.length > 0, options.timeoutMs, "ttyd ws 连接");
  if (fatalError) {
    throw new Error(fatalError);
  }

  const markerInit = `__TTYD_INIT_${Date.now()}__`;
  sendTtydInput(ws, `printf '${markerInit}\\n'\n`);
  await waitFor(() => stdoutText.includes(markerInit) || fatalError.length > 0, options.timeoutMs, "初始就绪");
  if (fatalError) {
    throw new Error(fatalError);
  }
  const connectMs = performance.now() - connectStartedAt;

  // 关闭回显，避免输入回显干扰 RTT 检测。
  sendTtydInput(ws, "stty -echo\n");
  await delay(120);

  const rttSamples: number[] = [];
  for (let index = 0; index < options.iterations; index += 1) {
    const marker = `__TTYDBENCH_${Date.now()}_${index}__`;
    const stdoutStart = stdoutText.length;
    const startedAt = performance.now();

    sendTtydInput(ws, `printf '${marker}\\n'\n`);

    await waitFor(
      () => stdoutText.slice(stdoutStart).includes(marker) || fatalError.length > 0,
      options.timeoutMs,
      `命令回显 RTT #${index + 1}`
    );

    if (fatalError) {
      throw new Error(fatalError);
    }

    rttSamples.push(performance.now() - startedAt);
  }

  const payloadBytes = options.payloadKb * 1024;
  const throughputStartBytes = stdoutBytes;
  const throughputStartedAt = performance.now();
  sendTtydInput(ws, `dd if=/dev/zero bs=1024 count=${options.payloadKb} 2>/dev/null | tr '\\0' 'x'\n`);
  await waitFor(
    () => stdoutBytes - throughputStartBytes >= payloadBytes || fatalError.length > 0,
    options.timeoutMs * 4,
    "吞吐测试输出收集"
  );
  if (fatalError) {
    throw new Error(fatalError);
  }
  const throughputMs = performance.now() - throughputStartedAt;

  ws.close();
  proc.kill("SIGTERM");

  const rtt = buildStats(rttSamples);
  console.log("=== TTYD 基线压测结果 ===");
  console.log(
    JSON.stringify(
      {
        ts: new Date().toISOString(),
        endpoint,
        sshTarget: `${options.sshUsername}@${options.sshHost}:${options.sshPort}`,
        iterations: options.iterations,
        payloadKb: options.payloadKb,
        connect: formatMs(connectMs),
        rtt: {
          min: formatMs(rtt.min),
          p50: formatMs(rtt.p50),
          p95: formatMs(rtt.p95),
          max: formatMs(rtt.max),
          avg: formatMs(rtt.avg)
        },
        throughput: {
          bytes: payloadBytes,
          cost: formatMs(throughputMs),
          speed: formatMbps(payloadBytes, throughputMs)
        }
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error("[bench] 执行失败:", (error as Error).message);
  process.exitCode = 1;
});
