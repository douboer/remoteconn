import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { decryptSecretPayload, encryptSecretPayload } from "./crypto";
import { getSyncDb } from "./sqlite";
import type { SyncRecord, SyncServer, SyncServerCommon, SyncServerSecret, SyncSettingsPayload } from "./schema";

export interface UserRow {
  id: string;
  openid: string;
  unionid: string | null;
  created_at: string;
  updated_at: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function parseJsonObject(input: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(input);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function parseJsonArrayLike<T>(input: string): T {
  return JSON.parse(input) as T;
}

function pickServerCommon(server: SyncServer): SyncServerCommon {
  return {
    id: server.id,
    name: server.name,
    tags: server.tags,
    host: server.host,
    port: server.port,
    username: server.username,
    authType: server.authType,
    projectPath: server.projectPath,
    timeoutSeconds: server.timeoutSeconds,
    heartbeatSeconds: server.heartbeatSeconds,
    transportMode: server.transportMode,
    jumpHost: server.jumpHost,
    sortOrder: server.sortOrder,
    lastConnectedAt: server.lastConnectedAt,
    updatedAt: server.updatedAt,
    deletedAt: server.deletedAt ?? null
  };
}

function pickServerSecrets(server: SyncServer): SyncServerSecret {
  return {
    password: server.password,
    privateKey: server.privateKey,
    passphrase: server.passphrase,
    certificate: server.certificate,
    jumpPassword: server.jumpPassword,
    jumpPrivateKey: server.jumpPrivateKey,
    jumpPassphrase: server.jumpPassphrase,
    jumpCertificate: server.jumpCertificate
  };
}

export class SyncRepository {
  private readonly db: DatabaseSync;

  constructor(database: DatabaseSync = getSyncDb()) {
    this.db = database;
  }

  getOrCreateUser(openid: string, unionid?: string | null): UserRow {
    const found = this.db
      .prepare("SELECT id, openid, unionid, created_at, updated_at FROM users WHERE openid = ?")
      .get(openid) as UserRow | undefined;
    if (found) {
      if (unionid && unionid !== found.unionid) {
        const updatedAt = nowIso();
        this.db
          .prepare("UPDATE users SET unionid = ?, updated_at = ? WHERE id = ?")
          .run(unionid, updatedAt, found.id);
        found.unionid = unionid;
        found.updated_at = updatedAt;
      }
      return found;
    }
    const row: UserRow = {
      id: randomUUID(),
      openid,
      unionid: unionid || null,
      created_at: nowIso(),
      updated_at: nowIso()
    };
    this.db
      .prepare(
        "INSERT INTO users (id, openid, unionid, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
      )
      .run(row.id, row.openid, row.unionid, row.created_at, row.updated_at);
    return row;
  }

  getSettings(userId: string): SyncSettingsPayload | null {
    const row = this.db
      .prepare("SELECT settings_json, updated_at FROM user_settings WHERE user_id = ?")
      .get(userId) as { settings_json: string; updated_at: string } | undefined;
    if (!row) return null;
    return {
      data: parseJsonObject(row.settings_json),
      updatedAt: row.updated_at
    };
  }

  upsertSettings(userId: string, payload: SyncSettingsPayload): void {
    const current = this.getSettings(userId);
    if (current && current.updatedAt > payload.updatedAt) {
      return;
    }
    this.db
      .prepare(
        `
        INSERT INTO user_settings (user_id, settings_json, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          settings_json = excluded.settings_json,
          updated_at = excluded.updated_at
      `
      )
      .run(userId, JSON.stringify(payload.data), payload.updatedAt);
  }

  listServers(userId: string): SyncServer[] {
    const rows = this.db
      .prepare(
        `
        SELECT server_json, secret_blob, secret_version, deleted_at
        FROM user_servers
        WHERE user_id = ?
        ORDER BY updated_at DESC
      `
      )
      .all(userId) as Array<{
      server_json: string;
      secret_blob: string | null;
      secret_version: number;
      deleted_at: string | null;
    }>;
    return rows.map((row) => {
      const common = parseJsonArrayLike<SyncServerCommon>(row.server_json);
      const secrets = row.secret_blob ? (decryptSecretPayload(row.secret_blob, row.secret_version) as SyncServerSecret) : {};
      return {
        ...common,
        ...secrets,
        deletedAt: row.deleted_at ?? common.deletedAt ?? null
      } as SyncServer;
    });
  }

  upsertServers(userId: string, servers: SyncServer[]): void {
    const selectStmt = this.db.prepare(
      "SELECT updated_at FROM user_servers WHERE user_id = ? AND server_id = ?"
    );
    const upsertStmt = this.db.prepare(`
      INSERT INTO user_servers (
        id, user_id, server_id, server_json, secret_blob, secret_version, updated_at, deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, server_id) DO UPDATE SET
        server_json = excluded.server_json,
        secret_blob = excluded.secret_blob,
        secret_version = excluded.secret_version,
        updated_at = excluded.updated_at,
        deleted_at = excluded.deleted_at
    `);
    this.db.exec("BEGIN");
    try {
      servers.forEach((server) => {
        const current = selectStmt.get(userId, server.id) as { updated_at: string } | undefined;
        if (current && current.updated_at > server.updatedAt) {
          return;
        }
        const encrypted = encryptSecretPayload(pickServerSecrets(server));
        upsertStmt.run(
          randomUUID(),
          userId,
          server.id,
          JSON.stringify(pickServerCommon(server)),
          encrypted.secretBlob,
          encrypted.secretVersion,
          server.updatedAt,
          server.deletedAt ?? null
        );
      });
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  listRecords(userId: string): SyncRecord[] {
    const rows = this.db
      .prepare(
        `
        SELECT record_json, deleted_at
        FROM user_records
        WHERE user_id = ?
        ORDER BY updated_at DESC
      `
      )
      .all(userId) as Array<{ record_json: string; deleted_at: string | null }>;
    return rows.map((row) => {
      const record = parseJsonArrayLike<SyncRecord>(row.record_json);
      return {
        ...record,
        deletedAt: row.deleted_at ?? record.deletedAt ?? null
      };
    });
  }

  upsertRecords(userId: string, records: SyncRecord[]): void {
    const selectStmt = this.db.prepare(
      "SELECT updated_at FROM user_records WHERE user_id = ? AND record_id = ?"
    );
    const upsertStmt = this.db.prepare(`
      INSERT INTO user_records (id, user_id, record_id, record_json, updated_at, deleted_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, record_id) DO UPDATE SET
        record_json = excluded.record_json,
        updated_at = excluded.updated_at,
        deleted_at = excluded.deleted_at
    `);
    this.db.exec("BEGIN");
    try {
      records.forEach((record) => {
        const current = selectStmt.get(userId, record.id) as { updated_at: string } | undefined;
        if (current && current.updated_at > record.updatedAt) {
          return;
        }
        upsertStmt.run(
          randomUUID(),
          userId,
          record.id,
          JSON.stringify(record),
          record.updatedAt,
          record.deletedAt ?? null
        );
      });
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
}
