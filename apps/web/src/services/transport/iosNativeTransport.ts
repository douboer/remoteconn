import type { SessionState, StdinMeta } from "@remoteconn/shared";
import type { ConnectParams, TerminalTransport, TransportEvent } from "./terminalTransport";

declare global {
  interface Window {
    Capacitor?: {
      Plugins?: {
        RemoteConnSSH?: {
          connect(options: ConnectParams): Promise<void>;
          send(options: { data: string }): Promise<void>;
          resize(options: { cols: number; rows: number }): Promise<void>;
          disconnect(options: { reason?: string }): Promise<void>;
          addListener(
            eventName: "stdout" | "stderr" | "disconnect" | "latency" | "error" | "connected",
            listener: (payload: unknown) => void
          ): Promise<{ remove: () => void }>;
        };
      };
    };
  }
}

type NativeCredentialPayload =
  | { type: "password"; password: string }
  | { type: "privateKey"; privateKey: string; passphrase?: string }
  | { type: "certificate"; privateKey: string; passphrase?: string; certificate: string };

interface NativeConnectPayload {
  host: string;
  port: number;
  username: string;
  knownHostFingerprint?: string;
  cols: number;
  rows: number;
  credential: NativeCredentialPayload;
}

/**
 * 将 ConnectParams 规整为仅包含 JSON 原始类型的对象。
 * 目的：Capacitor Bridge 在 iOS 侧会对参数做克隆/序列化，`undefined` 或代理对象可能触发 DataCloneError。
 */
function buildNativeConnectPayload(params: ConnectParams): NativeConnectPayload {
  const base = {
    host: String(params.host ?? ""),
    port: Number(params.port ?? 22),
    username: String(params.username ?? ""),
    cols: Number(params.cols ?? 80),
    rows: Number(params.rows ?? 24)
  };

  const knownHostFingerprint =
    typeof params.knownHostFingerprint === "string" && params.knownHostFingerprint.trim().length > 0
      ? params.knownHostFingerprint.trim()
      : undefined;

  if (params.credential.type === "password") {
    return {
      ...base,
      ...(knownHostFingerprint ? { knownHostFingerprint } : {}),
      credential: {
        type: "password",
        password: String(params.credential.password ?? "")
      }
    };
  }

  if (params.credential.type === "privateKey") {
    return {
      ...base,
      ...(knownHostFingerprint ? { knownHostFingerprint } : {}),
      credential: {
        type: "privateKey",
        privateKey: String(params.credential.privateKey ?? ""),
        ...(params.credential.passphrase ? { passphrase: String(params.credential.passphrase) } : {})
      }
    };
  }

  return {
    ...base,
    ...(knownHostFingerprint ? { knownHostFingerprint } : {}),
    credential: {
      type: "certificate",
      privateKey: String(params.credential.privateKey ?? ""),
      certificate: String(params.credential.certificate ?? ""),
      ...(params.credential.passphrase ? { passphrase: String(params.credential.passphrase) } : {})
    }
  };
}

/**
 * iOS 原生 SSH 传输适配。
 */
export class IosNativeTransport implements TerminalTransport {
  private state: SessionState = "idle";
  private listeners = new Set<(event: TransportEvent) => void>();
  private disposers: Array<() => void> = [];

  public async connect(params: ConnectParams): Promise<void> {
    const plugin = window.Capacitor?.Plugins?.RemoteConnSSH;
    if (!plugin) {
      throw new Error("iOS 原生插件不可用");
    }

    this.state = "connecting";

    const onStdout = await plugin.addListener("stdout", (payload) => {
      this.state = "connected";
      this.emit({ type: "stdout", data: (payload as { data: string }).data });
    });
    this.disposers.push(() => onStdout.remove());

    const onStderr = await plugin.addListener("stderr", (payload) => {
      this.emit({ type: "stderr", data: (payload as { data: string }).data });
    });
    this.disposers.push(() => onStderr.remove());

    const onDisconnect = await plugin.addListener("disconnect", (payload) => {
      this.state = "disconnected";
      this.emit({ type: "disconnect", reason: (payload as { reason: string }).reason });
    });
    this.disposers.push(() => onDisconnect.remove());

    const onLatency = await plugin.addListener("latency", (payload) => {
      this.emit({ type: "latency", data: (payload as { latency: number }).latency });
    });
    this.disposers.push(() => onLatency.remove());

    const onError = await plugin.addListener("error", (payload) => {
      this.state = "error";
      const error = payload as { code: string; message: string };
      this.emit({ type: "error", code: error.code, message: error.message });
    });
    this.disposers.push(() => onError.remove());

    await plugin.connect(buildNativeConnectPayload(params));
  }

  public async send(data: string, _meta?: StdinMeta): Promise<void> {
    await window.Capacitor?.Plugins?.RemoteConnSSH?.send({ data });
  }

  public async resize(cols: number, rows: number): Promise<void> {
    await window.Capacitor?.Plugins?.RemoteConnSSH?.resize({ cols, rows });
  }

  public async disconnect(reason?: string): Promise<void> {
    await window.Capacitor?.Plugins?.RemoteConnSSH?.disconnect({ reason });
    for (const dispose of this.disposers) {
      dispose();
    }
    this.disposers = [];
    this.state = "disconnected";
  }

  public on(listener: (event: TransportEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public getState(): SessionState {
    return this.state;
  }

  private emit(event: TransportEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}
