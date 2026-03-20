import type { ResolvedCredential, SessionState, StdinMeta } from "@remoteconn/shared";

export type TransportEvent =
  | { type: "stdout"; data: string }
  | { type: "stderr"; data: string }
  | { type: "latency"; data: number }
  | { type: "disconnect"; reason: string }
  | { type: "connected"; fingerprint?: string; fingerprintHostPort?: string; resumed?: boolean }
  | { type: "error"; code: string; message: string };

export interface ConnectParams {
  host: string;
  port: number;
  username: string;
  clientSessionKey?: string;
  credential: ResolvedCredential;
  jumpHost?: {
    host: string;
    port: number;
    username: string;
    credential: ResolvedCredential;
    knownHostFingerprint?: string;
  };
  knownHostFingerprint?: string;
  cols: number;
  rows: number;
}

export interface TerminalTransport {
  connect(params: ConnectParams): Promise<void>;
  send(data: string, meta?: StdinMeta): Promise<void>;
  resize(cols: number, rows: number): Promise<void>;
  disconnect(reason?: string): Promise<void>;
  on(listener: (event: TransportEvent) => void): () => void;
  getState(): SessionState;
}
