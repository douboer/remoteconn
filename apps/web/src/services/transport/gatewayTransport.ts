import type { GatewayFrame, SessionState, StdinMeta } from "@remoteconn/shared";
import type { ConnectParams, TerminalTransport, TransportEvent } from "./terminalTransport";

/**
 * 网关传输实现：Web/小程序共用。
 */
export class GatewayTransport implements TerminalTransport {
  private static readonly CONNECT_TIMEOUT_MS = 12000;
  private socket: WebSocket | null = null;
  private listeners = new Set<(event: TransportEvent) => void>();
  private pingAt = 0;
  private heartbeatTimer: number | null = null;
  private state: SessionState = "idle";

  public constructor(
    private readonly gatewayUrl: string,
    private readonly token: string
  ) {}

  public async connect(params: ConnectParams): Promise<void> {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      throw new Error("会话已连接");
    }

    this.state = "connecting";

    this.socket = await new Promise<WebSocket>((resolve, reject) => {
      const endpoints = this.buildEndpoints();
      const reasons: string[] = [];
      let index = 0;
      const candidateHint = `候选地址: ${endpoints.join(", ")}`;

      const tryConnect = (): void => {
        const endpoint = endpoints[index];
        if (!endpoint) {
          reject(new Error(`无法连接网关: ${reasons.join(" | ") || "无可用网关地址"} | ${candidateHint}`));
          return;
        }
        let settled = false;
        let socket: WebSocket;
        let timeoutTimer: number | null = null;

        try {
          socket = new WebSocket(endpoint);
        } catch {
          reasons.push(`地址无效: ${endpoint}`);
          if (index < endpoints.length - 1) {
            index += 1;
            tryConnect();
            return;
          }
          reject(new Error(`无法连接网关: ${reasons.join(" | ")} | ${candidateHint}`));
          return;
        }

        timeoutTimer = window.setTimeout(() => {
          fail(`连接超时>${GatewayTransport.CONNECT_TIMEOUT_MS}ms`);
        }, GatewayTransport.CONNECT_TIMEOUT_MS);

        const clearTimer = (): void => {
          if (timeoutTimer !== null) {
            window.clearTimeout(timeoutTimer);
            timeoutTimer = null;
          }
        };

        const fail = (reason: string): void => {
          if (settled) return;
          settled = true;
          clearTimer();
          reasons.push(`${reason}: ${endpoint}`);
          try {
            socket.close();
          } catch {
            // 忽略关闭阶段异常，继续下一个候选地址。
          }

          if (index < endpoints.length - 1) {
            index += 1;
            tryConnect();
            return;
          }

          reject(new Error(`无法连接网关: ${reasons.join(" | ")} | ${candidateHint}`));
        };

        socket.onopen = () => {
          if (settled) return;
          settled = true;
          clearTimer();
          resolve(socket);
        };
        socket.onerror = () => fail("网络或协议错误");
        socket.onclose = (event) => {
          if (!settled) {
            fail(`连接关闭 code=${event.code}`);
          }
        };
      };

      tryConnect();
    });

    this.socket.onmessage = (event) => {
      const frame = JSON.parse(event.data as string) as GatewayFrame;
      this.handleFrame(frame);
    };

    this.socket.onclose = () => {
      this.stopHeartbeat();
      this.state = "disconnected";
      this.emit({ type: "disconnect", reason: "ws_closed" });
    };

    this.socket.onerror = () => {
      this.stopHeartbeat();
      this.state = "error";
      this.emit({ type: "error", code: "WS_ERROR", message: "WebSocket 异常" });
    };

    const initFrame: GatewayFrame = {
      type: "init",
      payload: {
        host: params.host,
        port: params.port,
        username: params.username,
        ...(params.clientSessionKey ? { clientSessionKey: params.clientSessionKey } : {}),
        credential: params.credential,
        ...(params.jumpHost ? { jumpHost: params.jumpHost } : {}),
        knownHostFingerprint: params.knownHostFingerprint,
        pty: { cols: params.cols, rows: params.rows }
      }
    };

    this.sendRaw(initFrame);
    this.startHeartbeat();
    this.state = "auth_pending";
  }

  public async send(data: string, meta?: StdinMeta): Promise<void> {
    this.sendRaw({
      type: "stdin",
      payload: {
        data,
        ...(meta ? { meta } : {})
      }
    });
  }

  public async resize(cols: number, rows: number): Promise<void> {
    this.sendRaw({ type: "resize", payload: { cols, rows } });
  }

  public async disconnect(reason = "manual"): Promise<void> {
    this.stopHeartbeat();
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.sendRaw({ type: "control", payload: { action: "disconnect", reason } });
      this.socket.close();
    }
    this.socket = null;
    this.state = "disconnected";
  }

  public on(listener: (event: TransportEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public getState(): SessionState {
    return this.state;
  }

  private sendRaw(frame: GatewayFrame): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error("网关连接未建立");
    }
    this.socket.send(JSON.stringify(frame));
  }

  private handleFrame(frame: GatewayFrame): void {
    if (frame.type === "stdout") {
      this.state = "connected";
      this.emit({ type: "stdout", data: frame.payload.data });
      return;
    }

    if (frame.type === "stderr") {
      this.emit({ type: "stderr", data: frame.payload.data });
      return;
    }

    if (frame.type === "error") {
      this.state = "error";
      this.emit({ type: "error", code: frame.payload.code, message: frame.payload.message });
      return;
    }

    if (frame.type === "control") {
      if (frame.payload.action === "ping") {
        this.sendRaw({ type: "control", payload: { action: "pong" } });
        return;
      }

      if (frame.payload.action === "pong") {
        if (this.pingAt > 0) {
          this.emit({ type: "latency", data: Date.now() - this.pingAt });
        }
        return;
      }

      if (frame.payload.action === "connected") {
        this.state = "connected";
        this.emit({
          type: "connected",
          fingerprint: frame.payload.fingerprint,
          fingerprintHostPort: frame.payload.fingerprintHostPort,
          resumed: frame.payload.resumed === true
        });
        return;
      }

      if (frame.payload.action === "disconnect") {
        this.state = "disconnected";
        this.stopHeartbeat();
        this.emit({ type: "disconnect", reason: frame.payload.reason ?? "unknown" });
      }
    }
  }

  private emit(event: TransportEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = window.setInterval(() => {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
        return;
      }
      this.pingAt = Date.now();
      this.sendRaw({ type: "control", payload: { action: "ping" } });
    }, 10000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      window.clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * 统一网关地址构造（含容错候选）：
   * 1) 自动将 http/https 转换为 ws/wss；
   * 2) 页面非本机访问时，避免把 localhost 误连到客户端本机；
   * 3) https 页面下，补充 wss 与去端口候选，适配反向代理场景；
   * 4) 统一补全 /ws/terminal?token=...
   */
  private buildEndpoints(): string[] {
    const pageIsHttps = window.location.protocol === "https:";
    const pageHost = window.location.hostname;
    const pageProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const rawInput = this.gatewayUrl.trim();
    const fallback = `${pageProtocol}//${pageHost}`;
    const input = rawInput.length > 0 ? rawInput : fallback;
    const candidates: string[] = [];
    const pushCandidate = (next: URL): void => {
      if (pageIsHttps && next.protocol === "ws:") {
        return;
      }
      candidates.push(finalizeEndpoint(next));
    };

    let url: URL;
    try {
      const maybeUrl = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(input) ? input : `${pageProtocol}//${input}`;
      url = new URL(maybeUrl);
    } catch {
      url = new URL(fallback);
    }

    if (url.protocol === "http:") url.protocol = "ws:";
    if (url.protocol === "https:") url.protocol = "wss:";

    const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
    const pageIsLocal = localHosts.has(pageHost);
    const targetIsLocal = localHosts.has(url.hostname);
    if (!pageIsLocal && targetIsLocal) {
      url.hostname = pageHost;
    }

    const finalizeEndpoint = (source: URL): string => {
      const next = new URL(source.toString());
      const pathname = next.pathname.replace(/\/+$/, "");
      next.pathname = pathname.endsWith("/ws/terminal") ? pathname : `${pathname}/ws/terminal`.replace(/\/{2,}/g, "/");
      next.search = `token=${encodeURIComponent(this.token)}`;
      return next.toString();
    };

    // 1) 优先使用用户配置原始地址。
    pushCandidate(url);

    // 2) 补充同主机不同协议候选（ws <-> wss）。
    // HTTPS 页面禁止 ws://（混合内容会被浏览器直接拦截）。
    if (!pageIsHttps && url.protocol === "ws:") {
      const tlsUrl = new URL(url.toString());
      tlsUrl.protocol = "wss:";
      pushCandidate(tlsUrl);
    } else if (url.protocol === "wss:") {
      const plainUrl = new URL(url.toString());
      if (!pageIsHttps) {
        plainUrl.protocol = "ws:";
        pushCandidate(plainUrl);
      }
    }

    // 3) 远端主机时，始终补充“去端口走反向代理(80/443)”候选。
    // 适配公网仅开放 443、Nginx 反代到内网端口的部署。
    if (!targetIsLocal) {
      const noPort = new URL(url.toString());
      noPort.port = "";
      pushCandidate(noPort);

      if (!pageIsHttps && noPort.protocol === "ws:") {
        const noPortTls = new URL(noPort.toString());
        noPortTls.protocol = "wss:";
        pushCandidate(noPortTls);
      } else if (noPort.protocol === "wss:") {
        if (!pageIsHttps) {
          const noPortPlain = new URL(noPort.toString());
          noPortPlain.protocol = "ws:";
          pushCandidate(noPortPlain);
        }
      }
    }

    return [...new Set(candidates)];
  }
}
