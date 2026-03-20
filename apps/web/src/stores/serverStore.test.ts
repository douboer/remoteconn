import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import type { ServerProfile } from "@/types/app";

const { dbState, dbMock } = vi.hoisted(() => {
  const state = {
    servers: [] as ServerProfile[]
  };

  const cloneServer = (server: ServerProfile): ServerProfile => ({
    ...server,
    projectPresets: [...server.projectPresets],
    tags: [...server.tags],
    jumpHost: server.jumpHost ? { ...server.jumpHost } : undefined
  });

  const upsertServer = (server: ServerProfile): void => {
    const index = state.servers.findIndex((item) => item.id === server.id);
    if (index >= 0) {
      state.servers[index] = cloneServer(server);
    } else {
      state.servers.push(cloneServer(server));
    }
  };

  const db = {
    servers: {
      toArray: vi.fn(async () => state.servers.map((item) => cloneServer(item))),
      add: vi.fn(async (server: ServerProfile) => {
        state.servers.push(cloneServer(server));
      }),
      put: vi.fn(async (server: ServerProfile) => {
        upsertServer(server);
      }),
      bulkPut: vi.fn(async (servers: ServerProfile[]) => {
        servers.forEach((server) => upsertServer(server));
      }),
      delete: vi.fn(async (serverId: string) => {
        state.servers = state.servers.filter((item) => item.id !== serverId);
      })
    },
    credentialRefs: {
      toArray: vi.fn(async () => [])
    },
    credentials: {
      where: vi.fn(() => ({
        equals: vi.fn(() => ({
          first: vi.fn(async () => null),
          delete: vi.fn(async () => {})
        }))
      })),
      put: vi.fn(async () => {})
    }
  };

  return {
    dbState: state,
    dbMock: db
  };
});

vi.mock("@/services/storage/db", () => ({
  db: dbMock
}));

vi.mock("@/services/security/credentialVault", () => ({
  decryptCredential: vi.fn(async () => ({})),
  encryptCredential: vi.fn(async () => ({
    id: "enc-1",
    refId: "enc-1",
    encrypted: "",
    iv: "",
    createdAt: "",
    updatedAt: ""
  }))
}));

import { useServerStore } from "./serverStore";

function makeServer(id: string, sortOrder?: number): ServerProfile {
  return {
    id,
    name: id,
    host: "127.0.0.1",
    port: 22,
    username: "root",
    authType: "password",
    projectPath: "~",
    projectPresets: [],
    tags: [],
    timeoutSeconds: 20,
    heartbeatSeconds: 15,
    transportMode: "gateway",
    jumpHost: {
      enabled: false,
      host: "",
      port: 22,
      username: "",
      authType: "password"
    },
    ...(sortOrder !== undefined ? { sortOrder } : {})
  };
}

describe("serverStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    dbState.servers = [];
    dbMock.servers.toArray.mockClear();
    dbMock.servers.add.mockClear();
    dbMock.servers.put.mockClear();
    dbMock.servers.bulkPut.mockClear();
    dbMock.servers.delete.mockClear();
    dbMock.credentialRefs.toArray.mockClear();
  });

  it("启动时按 sortOrder 恢复顺序并回填连续排序值", async () => {
    dbState.servers = [makeServer("srv-b", 2), makeServer("srv-a"), makeServer("srv-c", 0)];

    const store = useServerStore();
    await store.ensureBootstrapped();

    expect(store.servers.map((item) => item.id)).toEqual(["srv-c", "srv-b", "srv-a"]);
    expect(dbMock.servers.bulkPut).toHaveBeenCalledTimes(1);
    expect(store.servers.map((item) => item.sortOrder)).toEqual([0, 1, 2]);
  });

  it("支持服务器上下移动并持久化顺序", async () => {
    dbState.servers = [makeServer("srv-1", 0), makeServer("srv-2", 1), makeServer("srv-3", 2)];

    const store = useServerStore();
    await store.ensureBootstrapped();
    expect(dbMock.servers.bulkPut).toHaveBeenCalledTimes(0);

    const movedDown = await store.moveServerDown("srv-1");
    expect(movedDown).toBe(true);
    expect(store.servers.map((item) => item.id)).toEqual(["srv-2", "srv-1", "srv-3"]);
    expect(store.servers.map((item) => item.sortOrder)).toEqual([0, 1, 2]);

    const movedUp = await store.moveServerUp("srv-1");
    expect(movedUp).toBe(true);
    expect(store.servers.map((item) => item.id)).toEqual(["srv-1", "srv-2", "srv-3"]);

    const topBoundary = await store.moveServerUp("srv-1");
    const bottomBoundary = await store.moveServerDown("srv-3");
    expect(topBoundary).toBe(false);
    expect(bottomBoundary).toBe(false);
  });

  it("支持按指定 id 顺序重排", async () => {
    dbState.servers = [makeServer("srv-1", 0), makeServer("srv-2", 1), makeServer("srv-3", 2)];

    const store = useServerStore();
    await store.ensureBootstrapped();

    const changed = await store.applyServerOrder(["srv-3", "srv-1", "srv-2"]);
    expect(changed).toBe(true);
    expect(store.servers.map((item) => item.id)).toEqual(["srv-3", "srv-1", "srv-2"]);
    expect(store.servers.map((item) => item.sortOrder)).toEqual([0, 1, 2]);

    const unchanged = await store.applyServerOrder(["srv-3", "srv-1", "srv-2"]);
    expect(unchanged).toBe(false);
  });
});
