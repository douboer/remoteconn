import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";

process.env.MINIPROGRAM_APP_ID = "wx-test-app";
process.env.MINIPROGRAM_APP_SECRET = "wx-test-secret";
process.env.SYNC_SECRET_CURRENT = "sync-secret-for-test";

const { SyncRepository } = await import("./repository");
const { initializeSyncDb } = await import("./sqlite");

const tempDirs: string[] = [];

function createRepository() {
  const dir = mkdtempSync(path.join(tmpdir(), "remoteconn-sync-"));
  tempDirs.push(dir);
  const db = initializeSyncDb(new DatabaseSync(path.join(dir, "sync.db")));
  return new SyncRepository(db);
}

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (!dir) break;
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("sync repository", () => {
  it("应保存并取回带加密凭据的服务器配置", () => {
    const repo = createRepository();
    const user = repo.getOrCreateUser("openid-user");
    repo.upsertServers(user.id, [
      {
        id: "srv-1",
        name: "server-1",
        tags: ["prod"],
        host: "10.0.0.1",
        port: 22,
        username: "root",
        authType: "privateKey",
        projectPath: "~/workspace",
        timeoutSeconds: 20,
        heartbeatSeconds: 15,
        transportMode: "gateway",
        jumpHost: {
          enabled: true,
          host: "10.0.0.2",
          port: 22,
          username: "jump",
          authType: "password"
        },
        sortOrder: 1,
        lastConnectedAt: "",
        updatedAt: "2026-03-09T00:00:00.000Z",
        deletedAt: null,
        password: "",
        privateKey: "secret-key",
        passphrase: "secret-passphrase",
        certificate: "",
        jumpPassword: "jump-secret",
        jumpPrivateKey: "",
        jumpPassphrase: "",
        jumpCertificate: ""
      }
    ]);

    const rows = repo.listServers(user.id);
    expect(rows).toHaveLength(1);
    const first = rows[0];
    expect(first).toBeDefined();
    expect(first && first.host).toBe("10.0.0.1");
    expect(first && first.privateKey).toBe("secret-key");
    expect(first && first.jumpPassword).toBe("jump-secret");
  });

  it("应保存并返回闪念记录", () => {
    const repo = createRepository();
    const user = repo.getOrCreateUser("openid-user-2");
    repo.upsertRecords(user.id, [
      {
        id: "rec-1",
        content: "deploy before 18:00",
        serverId: "srv-1",
        category: "问题",
        contextLabel: "prod-api",
        processed: false,
        discarded: true,
        createdAt: "2026-03-09T00:00:00.000Z",
        updatedAt: "2026-03-09T00:10:00.000Z",
        deletedAt: null
      }
    ]);

    const rows = repo.listRecords(user.id);
    expect(rows).toHaveLength(1);
    const first = rows[0];
    expect(first).toBeDefined();
    expect(first && first.content).toBe("deploy before 18:00");
    expect(first && first.category).toBe("问题");
    expect(first && first.discarded).toBe(true);
  });
});
