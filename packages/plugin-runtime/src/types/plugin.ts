export const PERMISSION_WHITELIST = [
  "commands.register",
  "session.read",
  "session.write",
  "ui.notice",
  "ui.statusbar",
  "storage.read",
  "storage.write",
  "logs.read"
] as const;

export type PluginPermission = (typeof PERMISSION_WHITELIST)[number];

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  minAppVersion: string;
  description: string;
  entry: "main.js";
  style: "styles.css";
  permissions: PluginPermission[];
  author?: string;
  homepage?: string;
}

export interface PluginPackage {
  manifest: PluginManifest;
  mainJs: string;
  stylesCss: string;
}

export interface PluginRecord {
  id: string;
  enabled: boolean;
  status: "discovered" | "validated" | "loading" | "active" | "stopped" | "failed";
  errorCount: number;
  lastError?: string;
  installedAt: string;
  updatedAt: string;
  lastLoadedAt?: string;
}

export interface PluginCommand {
  id: string;
  title: string;
  when?: "always" | "connected";
  handler: () => Promise<void> | void;
}

export interface PluginFsAdapter {
  listPackages(): Promise<PluginPackage[]>;
  getPackage(pluginId: string): Promise<PluginPackage | null>;
  upsertPackage(pluginPackage: PluginPackage): Promise<void>;
  removePackage(pluginId: string): Promise<void>;
  readStore<T>(key: string, fallback: T): Promise<T>;
  writeStore<T>(key: string, value: T): Promise<void>;
}

export interface PluginSessionApi {
  send(input: string): Promise<void>;
  on(eventName: "connected" | "disconnected" | "stdout" | "stderr" | "latency", handler: (payload: unknown) => void): () => void;
}

export interface PluginHostApis {
  getAppMeta(): { version: string; platform: "web" | "ios" | "miniapp" };
  session: PluginSessionApi;
  showNotice(message: string, level: "info" | "warn" | "error"): void;
}
