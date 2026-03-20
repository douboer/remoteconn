/**
 * 认证类型：首期支持密码和私钥，证书为二期预留。
 */
export type AuthType = "password" | "privateKey" | "certificate";

/**
 * 终端传输模式：Web/小程序通过网关，iOS 走原生插件。
 */
export type TransportMode = "gateway" | "ios-native";

/**
 * 服务器配置。
 */
export interface JumpHostProfile {
  enabled: boolean;
  host: string;
  port: number;
  username: string;
  authType: AuthType;
}

/**
 * 跳板机配置默认值：
 * - `enabled=false` 表示走现有单跳链路；
 * - 其余字段保留，便于前端表单直接双向绑定。
 */
export const DEFAULT_JUMP_HOST: JumpHostProfile = {
  enabled: false,
  host: "",
  port: 22,
  username: "",
  authType: "password"
};

export interface ServerProfile {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  authType: AuthType;
  projectPath: string;
  projectPresets: string[];
  tags: string[];
  timeoutSeconds: number;
  heartbeatSeconds: number;
  transportMode: TransportMode;
  jumpHost?: JumpHostProfile;
  /**
   * 服务器列表排序位次（值越小越靠前）：
   * - 仅用于前端“我的服务器”列表排序持久化；
   * - 历史数据可能缺失，业务层会在加载时自动回填。
   */
  sortOrder?: number;
  lastConnectedAt?: string;
}

/**
 * 凭据引用，不在业务对象中保存明文。
 */
export interface CredentialRef {
  id: string;
  type: AuthType;
  secureStoreKey: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * 已解析凭据，通常仅在临时连接阶段短时存在内存里。
 */
export interface ResolvedCredential {
  type: AuthType;
  password?: string;
  privateKey?: string;
  passphrase?: string;
  certificate?: string;
}

/**
 * 一次终端建链中的“连接跳点”。
 * - `target`：最终业务主机；
 * - `jump`：可选跳板机。
 */
export interface GatewayConnectHop {
  host: string;
  port: number;
  username: string;
  credential: ResolvedCredential;
  knownHostFingerprint?: string;
}

export type SessionState =
  | "idle"
  | "connecting"
  | "auth_pending"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "error";

export interface CommandMarker {
  at: string;
  command: string;
  source: "manual" | "codex" | "copilot" | "plugin";
  markerType: "manual" | "cd" | "check" | "run";
  code: number;
  elapsedMs: number;
}

export interface SessionLog {
  sessionId: string;
  serverId: string;
  startAt: string;
  endAt?: string;
  status: SessionState;
  commandMarkers: CommandMarker[];
  error?: string;
}

/**
 * stdin 输入来源标识：
 * - keyboard：常规键盘输入（含终端快捷键与控制字符）。
 * - assist：输入法/语音等“候选提交型”输入。
 */
export type StdinSource = "keyboard" | "assist";

/**
 * stdin 元信息：
 * - source 用于区分输入路径，便于网关侧做策略（如去重、观测）。
 * - txnId 用于 assist 路径幂等去重（同一事务只接受一次最终提交）。
 */
export interface StdinMeta {
  source: StdinSource;
  txnId?: string;
}

/**
 * WebSocket 网关协议。
 */
export type GatewayFrame =
  | {
      type: "init";
      payload: {
        host: string;
        port: number;
        username: string;
        credential: ResolvedCredential;
        jumpHost?: GatewayConnectHop;
        clientSessionKey?: string;
        /**
         * 终端续接驻留窗口（毫秒）：
         * - 客户端切后台/离开终端页时，可请求网关将 SSH 会话驻留一段时间；
         * - 网关侧会再按服务端上限做收敛，避免单端无限占用资源。
         */
        resumeGraceMs?: number;
        knownHostFingerprint?: string;
        pty: { cols: number; rows: number };
      };
    }
  | { type: "stdin"; payload: { data: string; meta?: StdinMeta } }
  | { type: "stdout"; payload: { data: string } }
  | { type: "stderr"; payload: { data: string } }
  | { type: "resize"; payload: { cols: number; rows: number } }
  | {
      type: "control";
      payload: {
        action: "ping" | "pong" | "disconnect" | "connected";
        reason?: string;
        fingerprint?: string;
        fingerprintHostPort?: string;
        resumed?: boolean;
      };
    }
  | {
      type: "error";
      payload: {
        code: string;
        message: string;
      };
    };
