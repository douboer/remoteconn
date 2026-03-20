import { beforeEach, describe, expect, it, vi } from "vitest";

type StorageValue = string | number | boolean | null | undefined | Record<string, unknown> | unknown[];

function createWxStorage(initial: Record<string, StorageValue>) {
  const store = new Map<string, StorageValue>(Object.entries(initial));
  return {
    store,
    getStorageSync(key: string) {
      return store.get(key);
    },
    setStorageSync(key: string, value: StorageValue) {
      store.set(key, value);
    },
    getStorageInfoSync() {
      return { keys: Array.from(store.keys()) };
    }
  };
}

function loadStorageModule() {
  const modulePath = require.resolve("./storage.js");
  delete require.cache[modulePath];
  return require("./storage.js");
}

describe("miniprogram storage bootstrap", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("当前正式 key 缺失时可从稳定备份恢复服务器列表", () => {
    const backupServers = [
      {
        id: "srv-backup-1",
        name: "backup",
        host: "127.0.0.1",
        port: 22,
        username: "root",
        authType: "password",
        projectPath: "~/workspace",
        timeoutSeconds: 20,
        heartbeatSeconds: 15,
        transportMode: "gateway",
        tags: ["prod"],
        jumpHost: {},
        sortOrder: 1,
        lastConnectedAt: ""
      }
    ];
    const wxStorage = createWxStorage({
      "remoteconn.backup.servers": backupServers
    });
    (global as typeof globalThis & { wx: typeof wxStorage }).wx = wxStorage;

    const storage = loadStorageModule();
    const rows = storage.listServers();

    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("srv-backup-1");
    expect(wxStorage.store.get("remoteconn.servers.v2")).toEqual(backupServers);
  });

  it("当前正式 key 与备份都缺失时可从历史 key 迁移记录数据", () => {
    const legacyRecords = [
      {
        id: "rec-legacy-1",
        content: "legacy note",
        serverId: "srv-legacy-1",
        createdAt: "2026-03-09T10:00:00.000Z"
      }
    ];
    const wxStorage = createWxStorage({
      "remoteconn.records.v1": legacyRecords
    });
    (global as typeof globalThis & { wx: typeof wxStorage }).wx = wxStorage;

    const storage = loadStorageModule();
    const rows = storage.listRecords();

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "rec-legacy-1",
      content: "legacy note",
      serverId: "srv-legacy-1"
    });
    expect(wxStorage.store.get("remoteconn.records.v2")).toEqual(rows);
    expect(wxStorage.store.get("remoteconn.backup.records")).toEqual(rows);
  });

  it("闪念处理状态会归一化并按互斥规则稳定写回", () => {
    const wxStorage = createWxStorage({
      "remoteconn.records.v2": [
        {
          id: "rec-1",
          content: "待处理事项",
          category: "问题",
          createdAt: "2026-03-10T10:00:00.000Z",
          updatedAt: "2026-03-10T10:00:00.000Z"
        }
      ]
    });
    (global as typeof globalThis & { wx: typeof wxStorage }).wx = wxStorage;

    const storage = loadStorageModule();
    const normalized = storage.listRecords();
    expect(normalized[0]?.processed).toBe(false);
    expect(normalized[0]?.discarded).toBe(false);

    const processed = storage.updateRecord({
      id: "rec-1",
      content: "待处理事项",
      category: "问题",
      processed: true
    });

    expect(processed?.processed).toBe(true);
    expect(processed?.discarded).toBe(false);

    const discarded = storage.updateRecord({
      id: "rec-1",
      content: "待处理事项",
      category: "问题",
      discarded: true
    });

    expect(discarded?.processed).toBe(false);
    expect(discarded?.discarded).toBe(true);
    expect(storage.listRecords()[0]?.processed).toBe(false);
    expect(storage.listRecords()[0]?.discarded).toBe(true);
    expect(wxStorage.store.get("remoteconn.records.v2")).toEqual(storage.listRecords());
  });

  it("写入正式 key 时会同步刷新稳定备份", () => {
    const wxStorage = createWxStorage({});
    (global as typeof globalThis & { wx: typeof wxStorage }).wx = wxStorage;

    const storage = loadStorageModule();
    storage.saveSettings({
      uiThemeMode: "light",
      uiBgColor: "#f4f1de",
      uiTextColor: "#222222",
      uiBtnColor: "#111111",
      uiAccentColor: "#123456"
    });

    expect(wxStorage.store.get("remoteconn.settings.v2")).toEqual(
      wxStorage.store.get("remoteconn.backup.settings")
    );
  });

  it("syncConfigEnabled 关闭后可稳定读回", () => {
    const wxStorage = createWxStorage({});
    (global as typeof globalThis & { wx: typeof wxStorage }).wx = wxStorage;

    const storage = loadStorageModule();
    storage.saveSettings({
      syncConfigEnabled: false
    });

    expect(storage.getSettings().syncConfigEnabled).toBe(false);
  });

  it("showVoiceInputButton 关闭后可稳定读回", () => {
    const wxStorage = createWxStorage({});
    (global as typeof globalThis & { wx: typeof wxStorage }).wx = wxStorage;

    const storage = loadStorageModule();
    expect(storage.getSettings().showVoiceInputButton).toBe(true);

    storage.saveSettings({
      showVoiceInputButton: false
    });

    expect(storage.getSettings().showVoiceInputButton).toBe(false);
  });

  it("ttsSpeakableMaxChars 会按边界归一化并稳定读回", () => {
    const wxStorage = createWxStorage({});
    (global as typeof globalThis & { wx: typeof wxStorage }).wx = wxStorage;

    const storage = loadStorageModule();
    expect(storage.getSettings().ttsSpeakableMaxChars).toBe(500);
    expect(storage.getSettings().ttsSegmentMaxChars).toBe(80);

    storage.saveSettings({
      ttsSpeakableMaxChars: 50
    });
    expect(storage.getSettings().ttsSpeakableMaxChars).toBe(120);

    storage.saveSettings({
      ttsSpeakableMaxChars: 500
    });
    expect(storage.getSettings().ttsSpeakableMaxChars).toBe(500);

    storage.saveSettings({
      ttsSpeakableMaxChars: 5000
    });
    expect(storage.getSettings().ttsSpeakableMaxChars).toBe(1200);

    storage.saveSettings({
      ttsSegmentMaxChars: 10
    });
    expect(storage.getSettings().ttsSegmentMaxChars).toBe(40);

    storage.saveSettings({
      ttsSegmentMaxChars: 80
    });
    expect(storage.getSettings().ttsSegmentMaxChars).toBe(80);

    storage.saveSettings({
      ttsSegmentMaxChars: 1000
    });
    expect(storage.getSettings().ttsSegmentMaxChars).toBe(200);
  });

  it("AI 连接默认模式会稳定读回，非法值会回退到默认档位", () => {
    const wxStorage = createWxStorage({});
    (global as typeof globalThis & { wx: typeof wxStorage }).wx = wxStorage;

    const storage = loadStorageModule();
    expect(storage.getSettings().aiDefaultProvider).toBe("codex");
    expect(storage.getSettings().aiCodexSandboxMode).toBe("workspace-write");
    expect(storage.getSettings().aiCopilotPermissionMode).toBe("default");

    storage.saveSettings({
      aiDefaultProvider: "copilot",
      aiCodexSandboxMode: "read-only",
      aiCopilotPermissionMode: "experimental"
    });
    expect(storage.getSettings().aiDefaultProvider).toBe("copilot");
    expect(storage.getSettings().aiCodexSandboxMode).toBe("read-only");
    expect(storage.getSettings().aiCopilotPermissionMode).toBe("experimental");

    storage.saveSettings({
      aiDefaultProvider: "invalid",
      aiCodexSandboxMode: "invalid",
      aiCopilotPermissionMode: "invalid"
    });
    expect(storage.getSettings().aiDefaultProvider).toBe("codex");
    expect(storage.getSettings().aiCodexSandboxMode).toBe("workspace-write");
    expect(storage.getSettings().aiCopilotPermissionMode).toBe("default");
  });

  it("续接快照行数会按边界归一化后稳定读回", () => {
    const wxStorage = createWxStorage({});
    (global as typeof globalThis & { wx: typeof wxStorage }).wx = wxStorage;

    const storage = loadStorageModule();
    expect(storage.getSettings().shellBufferSnapshotMaxLines).toBe(
      storage.DEFAULT_TERMINAL_BUFFER_SNAPSHOT_MAX_LINES
    );

    storage.saveSettings({
      shellBufferSnapshotMaxLines: storage.MIN_TERMINAL_BUFFER_SNAPSHOT_MAX_LINES - 1
    });
    expect(storage.getSettings().shellBufferSnapshotMaxLines).toBe(
      storage.MIN_TERMINAL_BUFFER_SNAPSHOT_MAX_LINES
    );

    storage.saveSettings({
      shellBufferSnapshotMaxLines: storage.MAX_TERMINAL_BUFFER_SNAPSHOT_MAX_LINES + 1
    });
    expect(storage.getSettings().shellBufferSnapshotMaxLines).toBe(
      storage.MAX_TERMINAL_BUFFER_SNAPSHOT_MAX_LINES
    );
  });

  it("uiLanguage 会回退到合法值并稳定读回", () => {
    const wxStorage = createWxStorage({});
    (global as typeof globalThis & { wx: typeof wxStorage }).wx = wxStorage;

    const storage = loadStorageModule();
    expect(storage.getSettings().uiLanguage).toBe("zh-Hans");

    storage.saveSettings({
      uiLanguage: "ja"
    });
    expect(storage.getSettings().uiLanguage).toBe("ja");

    storage.saveSettings({
      uiLanguage: "ko"
    });
    expect(storage.getSettings().uiLanguage).toBe("ko");

    storage.saveSettings({
      uiLanguage: "invalid-language"
    });
    expect(storage.getSettings().uiLanguage).toBe("zh-Hans");
  });

  it("历史服务器脏数据会先归一化，再参与同步上传", () => {
    const wxStorage = createWxStorage({
      "remoteconn.servers.v2": [
        {
          id: "srv-legacy-1",
          name: null,
          tags: ["prod", "", "prod"],
          host: " 10.0.0.8 ",
          port: "22",
          username: null,
          authType: "key",
          password: null,
          privateKey: null,
          passphrase: null,
          certificate: null,
          projectPath: null,
          timeoutSeconds: "30",
          heartbeatSeconds: "12",
          transportMode: null,
          jumpHost: {
            enabled: true,
            host: " jump.local ",
            port: "2222",
            username: null,
            authType: "key"
          },
          jumpPassword: null,
          jumpPrivateKey: null,
          jumpPassphrase: null,
          jumpCertificate: null,
          sortOrder: "9",
          lastConnectedAt: null,
          updatedAt: ""
        }
      ]
    });
    (global as typeof globalThis & { wx: typeof wxStorage }).wx = wxStorage;

    const storage = loadStorageModule();
    const rows = storage.listServers();

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "srv-legacy-1",
      name: "",
      tags: ["prod"],
      host: "10.0.0.8",
      port: 22,
      username: "",
      authType: "password",
      password: "",
      privateKey: "",
      passphrase: "",
      certificate: "",
      projectPath: "",
      timeoutSeconds: 30,
      heartbeatSeconds: 12,
      transportMode: "gateway",
      jumpHost: {
        enabled: true,
        host: "jump.local",
        port: 2222,
        username: "",
        authType: "password"
      },
      jumpPassword: "",
      jumpPrivateKey: "",
      jumpPassphrase: "",
      jumpCertificate: "",
      sortOrder: 9,
      lastConnectedAt: ""
    });
    expect(typeof rows[0].updatedAt).toBe("string");
    expect(rows[0].updatedAt.length).toBeGreaterThan(0);
  });
});
