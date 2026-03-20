import Dexie, { type EntityTable } from "dexie";
import type { CredentialRef, ServerProfile, SessionLog } from "@remoteconn/shared";
import type { EncryptedCredentialPayload, GlobalSettings, VoiceRecord } from "@/types/app";
import type { PluginPackage, PluginRecord } from "@remoteconn/plugin-runtime";

interface KnownHostEntity {
  key: string;
  fingerprint: string;
  updatedAt: string;
}

interface SettingEntity {
  key: string;
  value: GlobalSettings;
}

interface PluginDataEntity {
  key: string;
  value: unknown;
}

class RemoteConnDb extends Dexie {
  public servers!: EntityTable<ServerProfile, "id">;
  public credentialRefs!: EntityTable<CredentialRef, "id">;
  public credentials!: EntityTable<EncryptedCredentialPayload, "id">;
  public sessionLogs!: EntityTable<SessionLog, "sessionId">;
  public knownHosts!: EntityTable<KnownHostEntity, "key">;
  public settings!: EntityTable<SettingEntity, "key">;
  public pluginPackages!: EntityTable<PluginPackage & { id: string }, "id">;
  public pluginRecords!: EntityTable<PluginRecord & { id: string }, "id">;
  public pluginData!: EntityTable<PluginDataEntity, "key">;
  public voiceRecords!: EntityTable<VoiceRecord, "id">;

  public constructor() {
    super("remoteconn_db");

    this.version(2).stores({
      servers: "id, name, host, lastConnectedAt",
      credentialRefs: "id, type, updatedAt",
      credentials: "id, refId, updatedAt",
      sessionLogs: "sessionId, serverId, startAt, status",
      knownHosts: "key, updatedAt",
      settings: "key",
      pluginPackages: "id",
      pluginRecords: "id, status",
      pluginData: "key"
    });

    this.version(3).stores({
      servers: "id, name, host, lastConnectedAt",
      credentialRefs: "id, type, updatedAt",
      credentials: "id, refId, updatedAt",
      sessionLogs: "sessionId, serverId, startAt, status",
      knownHosts: "key, updatedAt",
      settings: "key",
      pluginPackages: "id",
      pluginRecords: "id, status",
      pluginData: "key",
      voiceRecords: "id, createdAt, serverId"
    });

    this.version(4)
      .stores({
        servers: "id, name, host, lastConnectedAt",
        credentialRefs: "id, type, updatedAt",
        credentials: "id, refId, updatedAt",
        sessionLogs: "sessionId, serverId, startAt, status",
        knownHosts: "key, updatedAt",
        settings: "key",
        pluginPackages: "id",
        pluginRecords: "id, status",
        pluginData: "key",
        voiceRecords: "id, createdAt, updatedAt, serverId, category, contextLabel"
      })
      .upgrade(async (tx) => {
        await tx
          .table("voiceRecords")
          .toCollection()
          .modify((row: VoiceRecord & Partial<Record<"updatedAt" | "category" | "contextLabel", string>>) => {
            row.updatedAt = String(row.updatedAt || row.createdAt || new Date().toISOString());
            row.category = String(row.category || "未分类");
            row.contextLabel = String(row.contextLabel || "");
          });
      });
  }
}

export const db = new RemoteConnDb();
async function ensureDbOpen(): Promise<void> {
  if (!db.isOpen()) {
    await db.open();
  }
}

export async function getSettings(): Promise<GlobalSettings | null> {
  await ensureDbOpen();
  const row = await db.settings.get("global");
  return row?.value ?? null;
}

export async function setSettings(value: GlobalSettings): Promise<void> {
  await ensureDbOpen();
  await db.settings.put({ key: "global", value });
}

export async function getKnownHosts(): Promise<Record<string, string>> {
  await ensureDbOpen();
  const rows = await db.knownHosts.toArray();
  return Object.fromEntries(rows.map((row) => [row.key, row.fingerprint]));
}

export async function upsertKnownHost(key: string, fingerprint: string): Promise<void> {
  await ensureDbOpen();
  await db.knownHosts.put({
    key,
    fingerprint,
    updatedAt: new Date().toISOString()
  });
}
