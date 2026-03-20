import { once } from "node:events";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { WebSocket } from "ws";

interface BenchOptions {
  gatewayUrl?: string;
  gatewayToken?: string;
  sshHost: string;
  sshPort: number;
  sshUsername: string;
  privateKeyPath: string;
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
 * 将 `~` 展开为用户目录，方便通过环境变量传入私钥路径。
 */
function expandHome(inputPath: string): string {
  if (!inputPath.startsWith("~/")) {
    return inputPath;
  }
  return path.join(os.homedir(), inputPath.slice(2));
}

/**
 * 从环境变量读取压测参数，保证脚本可在 CI/本地复用。
 */
function loadOptions(): BenchOptions {
  return {
    gatewayUrl: process.env.BENCH_GATEWAY_URL,
    gatewayToken: process.env.BENCH_GATEWAY_TOKEN,
    sshHost: process.env.BENCH_SSH_HOST ?? "127.0.0.1",
    sshPort: Number(process.env.BENCH_SSH_PORT ?? "22"),
    sshUsername: process.env.BENCH_SSH_USER ?? process.env.USER ?? "root",
    privateKeyPath: expandHome(process.env.BENCH_PRIVATE_KEY ?? "~/.ssh/id_ed25519"),
    iterations: Number(process.env.BENCH_ITERATIONS ?? "30"),
    payloadKb: Number(process.env.BENCH_PAYLOAD_KB ?? "1024"),
    timeoutMs: Number(process.env.BENCH_TIMEOUT_MS ?? "8000")
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 循环轮询条件，避免把一堆一次性监听器挂到 WS 上导致泄漏。
 */
async function waitFor(check: () => boolean, timeoutMs: number, label: string): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (check()) return;
    await delay(10);
  }
  throw new Error(`等待超时: ${label}`);
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
 * 本地未提供网关地址时，启动一份临时网关实例用于基线压测。
 */
async function startLocalGateway(): Promise<{ url: string; token: string; close: () => Promise<void> }> {
  const token = `bench-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  process.env.HOST = "127.0.0.1";
  process.env.PORT = "0";
  process.env.GATEWAY_TOKEN = token;
  process.env.CORS_ORIGIN = "*";

  const { createGatewayServer } = await import("../server");
  const server = createGatewayServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;

  return {
    url: `ws://127.0.0.1:${address.port}`,
    token,
    close: async () => {
      server.close();
      await once(server, "close");
    }
  };
}

async function main(): Promise<void> {
  const options = loadOptions();
  const privateKey = await readFile(options.privateKeyPath, "utf8");
  const cleanupTasks: Array<() => Promise<void>> = [];

  let gatewayUrl = options.gatewayUrl;
  let gatewayToken = options.gatewayToken;

  if (!gatewayUrl) {
    const localGateway = await startLocalGateway();
    gatewayUrl = localGateway.url;
    gatewayToken = localGateway.token;
    cleanupTasks.push(localGateway.close);
  }

  if (!gatewayToken) {
    throw new Error("缺少网关 token：请设置 BENCH_GATEWAY_TOKEN，或让脚本自动启动本地网关");
  }

  const endpoint = `${gatewayUrl.replace(/\/$/, "")}/ws/terminal?token=${encodeURIComponent(gatewayToken)}`;
  const ws = new WebSocket(endpoint);

  let stdoutText = "";
  let stdoutBytes = 0;
  let connected = false;
  let disconnectedReason = "";
  let fatalError = "";

  ws.on("message", (raw) => {
    try {
      const frame = JSON.parse(raw.toString()) as {
        type: string;
        payload?: { data?: string; action?: string; reason?: string; message?: string };
      };

      if (frame.type === "stdout") {
        const data = frame.payload?.data ?? "";
        stdoutText += data;
        stdoutBytes += Buffer.byteLength(data, "utf8");
        return;
      }

      if (frame.type === "control" && frame.payload?.action === "connected") {
        connected = true;
        return;
      }

      if (frame.type === "control" && frame.payload?.action === "disconnect") {
        disconnectedReason = frame.payload?.reason ?? "unknown";
        return;
      }

      if (frame.type === "error") {
        fatalError = frame.payload?.message ?? "gateway error";
      }
    } catch {
      fatalError = "网关返回了无法解析的消息";
    }
  });

  ws.on("error", (error) => {
    fatalError = String(error);
  });

  const connectedStartedAt = performance.now();
  await once(ws, "open");
  ws.send(
    JSON.stringify({
      type: "init",
      payload: {
        host: options.sshHost,
        port: options.sshPort,
        username: options.sshUsername,
        credential: { type: "privateKey", privateKey },
        pty: { cols: 140, rows: 40 }
      }
    })
  );

  await waitFor(() => connected || fatalError.length > 0, options.timeoutMs, "SSH 连接建立");
  if (fatalError) {
    throw new Error(fatalError);
  }
  const connectMs = performance.now() - connectedStartedAt;

  // 关闭 TTY 回显，避免命令内容干扰 RTT 统计（否则 marker 可能因本地 echo 提前出现）。
  ws.send(JSON.stringify({ type: "stdin", payload: { data: "stty -echo\n" } }));
  await delay(120);

  const rttSamples: number[] = [];
  for (let index = 0; index < options.iterations; index += 1) {
    const marker = `__RCBENCH_${Date.now()}_${index}__`;
    const stdoutStart = stdoutText.length;
    const startedAt = performance.now();

    ws.send(JSON.stringify({ type: "stdin", payload: { data: `printf '${marker}\\n'\n` } }));

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
  const throughputStartAt = performance.now();
  ws.send(
    JSON.stringify({
      type: "stdin",
      payload: {
        data: `dd if=/dev/zero bs=1024 count=${options.payloadKb} 2>/dev/null | tr '\\0' 'x'\n`
      }
    })
  );

  await waitFor(
    () => stdoutBytes - throughputStartBytes >= payloadBytes || fatalError.length > 0,
    options.timeoutMs * 4,
    "吞吐测试输出收集"
  );
  if (fatalError) {
    throw new Error(fatalError);
  }
  const throughputMs = performance.now() - throughputStartAt;

  ws.send(JSON.stringify({ type: "control", payload: { action: "disconnect" } }));
  await delay(80);
  ws.close();

  const rtt = buildStats(rttSamples);
  console.log("=== Gateway SSH2 基线压测结果 ===");
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
        },
        disconnectReason: disconnectedReason || "client_disconnect"
      },
      null,
      2
    )
  );

  for (const task of cleanupTasks) {
    await task();
  }
}

main().catch((error) => {
  console.error("[bench] 执行失败:", (error as Error).message);
  process.exitCode = 1;
});
