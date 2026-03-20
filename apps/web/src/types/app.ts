import type {
  CommandMarker,
  CredentialRef,
  HostKeyPolicy,
  JumpHostProfile,
  ResolvedCredential,
  ServerProfile,
  SessionLog,
  SessionState,
  ThemePreset
} from "@remoteconn/shared";

export type {
  ServerProfile,
  CredentialRef,
  SessionLog,
  SessionState,
  ResolvedCredential,
  CommandMarker,
  HostKeyPolicy,
  JumpHostProfile,
  ThemePreset
};

/**
 * \u5168\u5c40\u8bbe\u7f6e\uff08\u57df\u6536\u655b\u7248\uff09\u3002
 */
export interface GlobalSettings {
  // \u2500\u2500 UI \u5916\u89c2 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  /** 界面语言仅用于配置保真，本轮 Web 端不消费该字段切换文案 */
  uiLanguage: "zh-Hans" | "zh-Hant" | "en" | "ja" | "ko";
  uiThemePreset: ThemePreset;
  /** 界面明暗模式，影响预设色板的 dark/light 变体选择 */
  uiThemeMode: "dark" | "light";
  uiAccentColor: string;
  uiBgColor: string;
  uiTextColor: string;
  uiBtnColor: string;

  // \u2500\u2500 Shell \u663e\u793a \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  shellThemePreset: ThemePreset;
  /** 终端明暗模式，影响终端预设色板的 dark/light 变体选择 */
  shellThemeMode: "dark" | "light";
  shellBgColor: string;
  shellTextColor: string;
  shellAccentColor: string;
  shellFontFamily: string;
  shellFontSize: number;
  shellLineHeight: number;
  unicode11: boolean;

  // \u2500\u2500 \u7ec8\u7aef\u7f13\u51b2 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  terminalBufferMaxEntries: number;
  terminalBufferMaxBytes: number;

  // \u2500\u2500 \u8fde\u63a5\u7b56\u7565 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  autoReconnect: boolean;
  reconnectLimit: number;
  hostKeyPolicy: HostKeyPolicy;
  credentialMemoryPolicy: "remember" | "forget";
  gatewayConnectTimeoutMs: number;
  waitForConnectedTimeoutMs: number;

  // \u2500\u2500 \u670d\u52a1\u5668\u914d\u7f6e\u9884\u586b \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  defaultAuthType: "password" | "key";
  defaultPort: number;
  defaultProjectPath: string;
  defaultTimeoutSeconds: number;
  defaultHeartbeatSeconds: number;
  defaultTransportMode: "gateway" | string;

  // \u2500\u2500 \u65e5\u5fd7 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  logRetentionDays: number;
  maskSecrets: boolean;
  voiceRecordCategories: string[];
  voiceRecordDefaultCategory: string;

  // \u2500\u2500 \u5df2\u5e9f\u5f03\u5b57\u6bb5\uff08\u517c\u5bb9\u4fdd\u7559\uff0c\u4e0b\u4e00\u4e2a\u7248\u672c\u7a97\u53e3\u5220\u9664\uff09\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  /** @deprecated \u8bf7\u4f7f\u7528 shellFontFamily */
  fontFamily?: string;
  /** @deprecated \u8bf7\u4f7f\u7528 shellFontSize */
  fontSize?: number;
  /** @deprecated \u8bf7\u4f7f\u7528 shellLineHeight */
  lineHeight?: number;
  /** @deprecated \u8bf7\u4f7f\u7528 uiThemePreset / shellThemePreset */
  themePreset?: string;
  /** @deprecated \u8bf7\u4f7f\u7528 uiAccentColor / shellAccentColor */
  accentColor?: string;
  /** @deprecated \u8bf7\u4f7f\u7528 uiBgColor / shellBgColor */
  bgColor?: string;
  /** @deprecated \u8bf7\u4f7f\u7528 uiTextColor / shellTextColor */
  textColor?: string;
  /** @deprecated UI \u52a8\u6548\u53c2\u6570\u5df2\u79fb\u9664\uff0c\u6682\u4fdd\u7559\u907f\u514d\u65e7\u6570\u636e\u62a5\u9519 */
  liquidAlpha?: number;
  /** @deprecated UI \u52a8\u6548\u53c2\u6570\u5df2\u79fb\u9664\uff0c\u6682\u4fdd\u7559\u907f\u514d\u65e7\u6570\u636e\u62a5\u9519 */
  blurRadius?: number;
  /** @deprecated UI \u52a8\u6548\u53c2\u6570\u5df2\u79fb\u9664\uff0c\u6682\u4fdd\u7559\u907f\u514d\u65e7\u6570\u636e\u62a5\u9519 */
  motionDuration?: number;
  /** @deprecated \u7f51\u5173 URL \u5df2\u4ece\u7528\u6237\u914d\u7f6e\u79fb\u9664\uff0c\u6539\u7531\u6784\u5efa\u65f6\u6ce8\u5165\u6216\u8fd0\u7ef4\u4e0b\u53d1 */
  gatewayUrl?: string;
  /** @deprecated \u7f51\u5173 Token \u5df2\u4ece\u7528\u6237\u914d\u7f6e\u79fb\u9664\uff0c\u6539\u7531\u6784\u5efa\u65f6\u6ce8\u5165\u6216\u8fd0\u7ef4\u4e0b\u53d1 */
  gatewayToken?: string;

}

/**
 * 凭据密文。
 */
export interface EncryptedCredentialPayload {
  id: string;
  refId: string;
  encrypted: string;
  iv: string;
  createdAt: string;
  updatedAt: string;
}

export interface AppToast {
  id: string;
  level: "info" | "warn" | "error";
  message: string;
}

export interface SessionCommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface SessionContext {
  state: SessionState;
  currentServerId?: string;
  currentSessionId?: string;
  latencyMs?: number;
  connectedAt?: string;
}

/**
 * 闪念记录（语音输入区 record 按钮写入）。
 */
export interface VoiceRecord {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  serverId: string;
  category: string;
  contextLabel: string;
}
