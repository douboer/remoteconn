import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type StorageValue = string | number | boolean | null | undefined | Record<string, unknown> | unknown[];

function createWxRuntime(
  initial: Record<string, StorageValue>,
  options?: {
    onRequest?: (url: string, method: string) => { statusCode: number; data: Record<string, unknown> };
  }
) {
  const store = new Map<string, StorageValue>(Object.entries(initial));
  const extra = options && typeof options === "object" ? options : {};
  return {
    store,
    getStorageSync: vi.fn((key: string) => store.get(key)),
    setStorageSync: vi.fn((key: string, value: StorageValue) => {
      store.set(key, value);
    }),
    getStorageInfoSync: vi.fn(() => ({ keys: Array.from(store.keys()) })),
    login: vi.fn((options?: { success?: (value: { code: string }) => void }) => {
      options?.success?.({ code: "mock-login-code" });
    }),
    request: vi.fn(
      (options?: {
        url?: string;
        method?: string;
        success?: (value: { statusCode: number; data: Record<string, unknown> }) => void;
      }) => {
        const url = String(options?.url || "");
        const method = String(options?.method || "GET").toUpperCase();
        const response = extra.onRequest ? extra.onRequest(url, method) : { statusCode: 200, data: { ok: true } };
        options?.success?.(response);
      }
    )
  };
}

function clearModuleCache() {
  const modulePaths = [
    "./syncService.js",
    "./syncConfigBus.js",
    "./storage.js",
    "./syncAuth.js",
    "./opsConfig.js"
  ].map((path) => require.resolve(path));
  modulePaths.forEach((modulePath) => {
    delete require.cache[modulePath];
  });
}

function loadSyncServiceModule() {
  clearModuleCache();
  return require("./syncService.js");
}

describe("miniprogram syncService", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers();
    delete (globalThis as typeof globalThis & { __REMOTE_CONN_OPS__?: unknown }).__REMOTE_CONN_OPS__;
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (global as typeof globalThis & { wx?: unknown }).wx;
    delete (globalThis as typeof globalThis & { __REMOTE_CONN_OPS__?: unknown }).__REMOTE_CONN_OPS__;
    clearModuleCache();
  });

  it("pickLatest 在远端缺项时保留本地记录，避免读取 null.updatedAt", () => {
    const wxRuntime = createWxRuntime({});
    (global as typeof globalThis & { wx: typeof wxRuntime }).wx = wxRuntime;

    const syncService = loadSyncServiceModule();
    const localRow = {
      id: "srv-local-1",
      name: "local",
      updatedAt: "2026-03-09T10:00:00.000Z"
    };

    expect(syncService.__test__.pickLatest(localRow, null)).toEqual(localRow);
  });

  it("pickLatest 在本地缺项时保留远端记录", () => {
    const wxRuntime = createWxRuntime({});
    (global as typeof globalThis & { wx: typeof wxRuntime }).wx = wxRuntime;

    const syncService = loadSyncServiceModule();
    const remoteRow = {
      id: "srv-remote-1",
      name: "remote",
      updatedAt: "2026-03-09T11:00:00.000Z"
    };

    expect(syncService.__test__.pickLatest(null, remoteRow)).toEqual(remoteRow);
  });

  it("pickLatestRecord 在终态与普通态冲突时保留终态记录", () => {
    const wxRuntime = createWxRuntime({});
    (global as typeof globalThis & { wx: typeof wxRuntime }).wx = wxRuntime;

    const syncService = loadSyncServiceModule();
    const localRow = {
      id: "rec-local-1",
      content: "local discarded",
      serverId: "",
      category: "问题",
      contextLabel: "",
      processed: false,
      discarded: true,
      createdAt: "2026-03-09T00:00:00.000Z",
      updatedAt: "2026-03-09T10:00:00.000Z",
      deletedAt: null
    };
    const remoteRow = {
      id: "rec-local-1",
      content: "remote normal",
      serverId: "",
      category: "问题",
      contextLabel: "",
      processed: false,
      discarded: false,
      createdAt: "2026-03-09T00:00:00.000Z",
      updatedAt: "2026-03-09T11:00:00.000Z",
      deletedAt: null
    };

    expect(syncService.__test__.pickLatestRecord(localRow, remoteRow)).toEqual(localRow);
  });

  it("scheduleRecordsSync 不会用服务端普通态覆盖本地已废弃记录", async () => {
    const wxRuntime = createWxRuntime(
      {
        "remoteconn.settings.v2": {
          syncConfigEnabled: true,
          updatedAt: "2026-03-10T00:00:00.000Z"
        },
        "remoteconn.records.v2": []
      },
      {
        onRequest(url) {
          if (url.endsWith("/api/miniprogram/auth/login")) {
            return {
              statusCode: 200,
              data: {
                ok: true,
                token: "mock-token",
                expiresAt: "2099-01-01T00:00:00.000Z"
              }
            };
          }
          if (url.endsWith("/api/miniprogram/sync/records")) {
            return {
              statusCode: 200,
              data: {
                ok: true,
                records: [
                  {
                    id: "rec-a",
                    content: "alpha",
                    serverId: "",
                    category: "问题",
                    contextLabel: "",
                    processed: false,
                    discarded: false,
                    createdAt: "2026-03-09T00:00:00.000Z",
                    updatedAt: "2026-03-11T12:00:00.000Z",
                    deletedAt: null
                  },
                  {
                    id: "rec-b",
                    content: "beta",
                    serverId: "",
                    category: "问题",
                    contextLabel: "",
                    processed: true,
                    discarded: false,
                    createdAt: "2026-03-09T00:05:00.000Z",
                    updatedAt: "2026-03-11T10:05:00.000Z",
                    deletedAt: null
                  }
                ]
              }
            };
          }
          return { statusCode: 200, data: { ok: true } };
        }
      }
    );
    (global as typeof globalThis & { wx: typeof wxRuntime }).wx = wxRuntime;
    (globalThis as typeof globalThis & { __REMOTE_CONN_OPS__?: unknown }).__REMOTE_CONN_OPS__ = {
      gatewayUrl: "https://gateway.example.com",
      gatewayToken: "token"
    };

    clearModuleCache();
    const storage = require("./storage.js");
    storage.saveRecords(
      [
        {
          id: "rec-a",
          content: "alpha",
          serverId: "",
          category: "问题",
          contextLabel: "",
          processed: false,
          discarded: true,
          createdAt: "2026-03-09T00:00:00.000Z",
          updatedAt: "2026-03-11T10:00:00.000Z"
        },
        {
          id: "rec-b",
          content: "beta",
          serverId: "",
          category: "问题",
          contextLabel: "",
          processed: true,
          discarded: false,
          createdAt: "2026-03-09T00:05:00.000Z",
          updatedAt: "2026-03-11T10:05:00.000Z"
        }
      ],
      { silentSync: true }
    );

    const syncService = require("./syncService.js");
    syncService.scheduleRecordsSync();
    await vi.runAllTimersAsync();

    const rows = storage.listRecords();
    const recordA = rows.find((item: { id: string }) => item.id === "rec-a");
    const recordB = rows.find((item: { id: string }) => item.id === "rec-b");

    expect(recordA && recordA.discarded).toBe(true);
    expect(recordA && recordA.processed).toBe(false);
    expect(recordB && recordB.processed).toBe(true);
  });

  it("关闭 syncConfigEnabled 后不会再启动同步任务", async () => {
    const wxRuntime = createWxRuntime({
      "remoteconn.settings.v2": {
        syncConfigEnabled: false,
        updatedAt: "2026-03-10T00:00:00.000Z"
      }
    });
    (global as typeof globalThis & { wx: typeof wxRuntime }).wx = wxRuntime;

    const syncService = loadSyncServiceModule();
    syncService.scheduleSettingsSync();
    await vi.advanceTimersByTimeAsync(250);

    expect(syncService.__test__.isSyncConfigEnabled()).toBe(false);
    expect(wxRuntime.login).not.toHaveBeenCalled();
    expect(wxRuntime.request).not.toHaveBeenCalled();
  });

  it("关闭 syncConfigEnabled 后会跳过启动 bootstrap", async () => {
    const wxRuntime = createWxRuntime({
      "remoteconn.settings.v2": {
        syncConfigEnabled: false,
        updatedAt: "2026-03-10T00:00:00.000Z"
      }
    });
    (global as typeof globalThis & { wx: typeof wxRuntime }).wx = wxRuntime;
    (globalThis as typeof globalThis & { __REMOTE_CONN_OPS__?: unknown }).__REMOTE_CONN_OPS__ = {
      gatewayUrl: "https://gateway.example.com",
      gatewayToken: "token"
    };

    const syncService = loadSyncServiceModule();
    await expect(syncService.ensureSyncBootstrap()).resolves.toBeNull();

    expect(wxRuntime.login).not.toHaveBeenCalled();
    expect(wxRuntime.request).not.toHaveBeenCalled();
  });

  it("重新打开 syncConfigEnabled 时会先 bootstrap 再补推本地配置", async () => {
    const requestUrls: string[] = [];
    const wxRuntime = createWxRuntime(
      {
        "remoteconn.settings.v2": {
          syncConfigEnabled: false,
          uiThemeMode: "dark",
          updatedAt: "2026-03-10T00:00:00.000Z"
        },
        "remoteconn.servers.v2": [],
        "remoteconn.records.v2": []
      },
      {
        onRequest(url, method) {
          requestUrls.push(`${method} ${url}`);
          if (url.endsWith("/api/miniprogram/auth/login")) {
            return {
              statusCode: 200,
              data: {
                ok: true,
                token: "mock-token",
                expiresAt: "2099-01-01T00:00:00.000Z"
              }
            };
          }
          if (url.endsWith("/api/miniprogram/sync/bootstrap")) {
            return {
              statusCode: 200,
              data: {
                ok: true,
                settings: {
                  updatedAt: "2026-03-09T00:00:00.000Z",
                  data: {
                    syncConfigEnabled: true,
                    uiThemeMode: "light"
                  }
                },
                servers: [],
                records: []
              }
            };
          }
          if (url.endsWith("/api/miniprogram/sync/settings")) {
            return { statusCode: 200, data: { ok: true } };
          }
          if (url.endsWith("/api/miniprogram/sync/servers")) {
            return { statusCode: 200, data: { ok: true, servers: [] } };
          }
          if (url.endsWith("/api/miniprogram/sync/records")) {
            return { statusCode: 200, data: { ok: true, records: [] } };
          }
          return { statusCode: 200, data: { ok: true } };
        }
      }
    );
    (global as typeof globalThis & { wx: typeof wxRuntime }).wx = wxRuntime;
    (globalThis as typeof globalThis & { __REMOTE_CONN_OPS__?: unknown }).__REMOTE_CONN_OPS__ = {
      gatewayUrl: "https://gateway.example.com",
      gatewayToken: "token"
    };

    clearModuleCache();
    const storage = require("./storage.js");

    storage.saveSettings({
      syncConfigEnabled: true,
      uiThemeMode: "dark"
    });

    await vi.runAllTimersAsync();

    expect(requestUrls).toEqual([
      "POST https://gateway.example.com/api/miniprogram/auth/login",
      "GET https://gateway.example.com/api/miniprogram/sync/bootstrap",
      "PUT https://gateway.example.com/api/miniprogram/sync/settings",
      "PUT https://gateway.example.com/api/miniprogram/sync/servers",
      "PUT https://gateway.example.com/api/miniprogram/sync/records"
    ]);

    expect(storage.getSettings().syncConfigEnabled).toBe(true);
    expect(storage.getSettings().uiThemeMode).toBe("dark");
  });

  it("启动 bootstrap 合并完成后会广播刷新事件，供当前页面立刻重读本地配置", async () => {
    const wxRuntime = createWxRuntime(
      {
        "remoteconn.settings.v2": {
          syncConfigEnabled: true,
          uiThemeMode: "dark",
          updatedAt: "2026-03-10T00:00:00.000Z"
        },
        "remoteconn.servers.v2": [],
        "remoteconn.records.v2": []
      },
      {
        onRequest(url) {
          if (url.endsWith("/api/miniprogram/auth/login")) {
            return {
              statusCode: 200,
              data: {
                ok: true,
                token: "mock-token",
                expiresAt: "2099-01-01T00:00:00.000Z"
              }
            };
          }
          if (url.endsWith("/api/miniprogram/sync/bootstrap")) {
            return {
              statusCode: 200,
              data: {
                ok: true,
                settings: {
                  updatedAt: "2026-03-11T00:00:00.000Z",
                  data: {
                    syncConfigEnabled: true,
                    uiThemeMode: "light"
                  }
                },
                servers: [
                  {
                    id: "srv-1",
                    name: "remote-1",
                    tags: [],
                    host: "1.1.1.1",
                    port: 22,
                    username: "root",
                    authType: "password",
                    password: "",
                    privateKey: "",
                    passphrase: "",
                    certificate: "",
                    projectPath: "",
                    timeoutSeconds: 15,
                    heartbeatSeconds: 10,
                    transportMode: "gateway",
                    jumpHost: {
                      enabled: false,
                      host: "",
                      port: 22,
                      username: "",
                      authType: "password"
                    },
                    jumpPassword: "",
                    jumpPrivateKey: "",
                    jumpPassphrase: "",
                    jumpCertificate: "",
                    sortOrder: 1,
                    lastConnectedAt: "",
                    updatedAt: "2026-03-11T00:00:00.000Z",
                    deletedAt: null
                  }
                ],
                records: []
              }
            };
          }
          return { statusCode: 200, data: { ok: true } };
        }
      }
    );
    (global as typeof globalThis & { wx: typeof wxRuntime }).wx = wxRuntime;
    (globalThis as typeof globalThis & { __REMOTE_CONN_OPS__?: unknown }).__REMOTE_CONN_OPS__ = {
      gatewayUrl: "https://gateway.example.com",
      gatewayToken: "token"
    };

    clearModuleCache();
    const syncConfigBus = require("./syncConfigBus.js");
    const listener = vi.fn();
    const unsubscribe = syncConfigBus.subscribeSyncConfigApplied(listener);
    const syncService = require("./syncService.js");

    await expect(syncService.ensureSyncBootstrap()).resolves.toMatchObject({
      ok: true
    });

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "bootstrap",
        hasSettings: true,
        serverCount: 1,
        recordCount: 0
      })
    );

    unsubscribe();
  });
});
