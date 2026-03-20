import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { config } from "../config";

let db: DatabaseSync | null = null;

export function initializeSyncDb(database: DatabaseSync): DatabaseSync {
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      openid TEXT NOT NULL UNIQUE,
      unionid TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_settings (
      user_id TEXT PRIMARY KEY,
      settings_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS user_servers (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      server_id TEXT NOT NULL,
      server_json TEXT NOT NULL,
      secret_blob TEXT,
      secret_version INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_user_servers_user_server
      ON user_servers(user_id, server_id);
    CREATE INDEX IF NOT EXISTS idx_user_servers_user_updated
      ON user_servers(user_id, updated_at);

    CREATE TABLE IF NOT EXISTS user_records (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      record_id TEXT NOT NULL,
      record_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_user_records_user_record
      ON user_records(user_id, record_id);
    CREATE INDEX IF NOT EXISTS idx_user_records_user_updated
      ON user_records(user_id, updated_at);

    CREATE TABLE IF NOT EXISTS schema_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  return database;
}

export function getSyncDb(): DatabaseSync {
  if (db) {
    return db;
  }
  const sqlitePath = path.resolve(process.cwd(), config.sync.sqlitePath);
  mkdirSync(path.dirname(sqlitePath), { recursive: true });
  db = new DatabaseSync(sqlitePath);
  initializeSyncDb(db);
  return db;
}
