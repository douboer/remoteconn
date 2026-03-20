import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import type { ServerProfile } from "@/types/app";

type MockTransportEvent = {
  type: string;
  [key: string]: unknown;
};

type MockResolvedCredential =
  | { type: "password"; password: string }
  | { type: "privateKey"; privateKey: string; passphrase?: string }
  | { type: "certificate"; privateKey: string; certificate: string; passphrase?: string };

type MockResolvedCredentialBundle = {
  target: MockResolvedCredential;
  jump: MockResolvedCredential | null;
};

const {
  settingsStoreMock,
  serverStoreMock,
  logStoreMock,
  appStoreMock,
  createTransportMock,
  transportMock,
  emitSessionEventMock,
  listeners,
  sessionStorageState
} = vi.hoisted(() => {
  const listenersRef: { value: ((event: MockTransportEvent) => Promise<void> | void) | null } = {
    value: null
  };
  const sessionStorageMap = new Map<string, string>();

  const transport = {
    on: vi.fn((handler: (event: MockTransportEvent) => Promise<void> | void) => {
      listenersRef.value = handler;
      return () => {
        listenersRef.value = null;
      };
    }),
    connect: vi.fn(async () => {}),
    send: vi.fn(async () => {}),
    disconnect: vi.fn(async () => {}),
    resize: vi.fn(async () => {})
  };

  return {
    settingsStoreMock: {
      settings: {
        autoReconnect: true,
        reconnectLimit: 2,
        terminalBufferMaxEntries: 5000,
        terminalBufferMaxBytes: 4 * 1024 * 1024,
        gatewayUrl: "ws://127.0.0.1:8787/ws/terminal",
        gatewayToken: "dev-token"
      },
      gatewayUrl: "ws://127.0.0.1:8787/ws/terminal",
      gatewayToken: "dev-token",
      knownHosts: {},
      verifyAndPersistHostFingerprint: vi.fn(async () => true)
    },
    serverStoreMock: {
      servers: [] as ServerProfile[],
      resolveCredential: vi.fn(async () => ({ type: "password", password: "secret" })),
      resolveCredentialBundle: vi.fn(
        async (): Promise<MockResolvedCredentialBundle> => ({
          target: { type: "password", password: "secret" },
          jump: null
        })
      ),
      markConnected: vi.fn(async () => {})
    },
    logStoreMock: {
      startLog: vi.fn(async () => "session-log-1"),
      markStatus: vi.fn(async () => {}),
      addMarker: vi.fn(async () => {})
    },
    appStoreMock: {
      notify: vi.fn()
    },
    createTransportMock: vi.fn(() => transport),
    transportMock: transport,
    emitSessionEventMock: vi.fn(),
    listeners: listenersRef,
    sessionStorageState: {
      map: sessionStorageMap,
      clear: () => sessionStorageMap.clear(),
      getItem: (key: string) => sessionStorageMap.get(key) ?? null,
      setItem: (key: string, value: string) => {
        sessionStorageMap.set(key, value);
      }
    }
  };
});

vi.mock("@remoteconn/shared", () => ({
  allStates: () => [
    "idle",
    "connecting",
    "auth_pending",
    "connected",
    "reconnecting",
    "disconnected",
    "error"
  ],
  buildCdCommand: (projectPath: string) => `cd ${projectPath}`,
  buildCodexPlan: (options: {
    projectPath: string;
    sandbox: "read-only" | "workspace-write" | "danger-full-access";
    resumeLast?: boolean;
  }) => [
    {
      step: "cd",
      command: `cd ${options.projectPath}`,
      markerType: "cd"
    },
    {
      step: "check",
      command: "command -v codex",
      markerType: "check"
    },
    {
      step: "run",
      command: options.resumeLast
        ? `codex resume --last --sandbox ${options.sandbox}`
        : `codex --sandbox ${options.sandbox}`,
      markerType: "run"
    }
  ]
}));

vi.mock("./settingsStore", () => ({
  useSettingsStore: () => settingsStoreMock
}));

vi.mock("./serverStore", () => ({
  useServerStore: () => serverStoreMock
}));

vi.mock("./logStore", () => ({
  useLogStore: () => logStoreMock
}));

vi.mock("./appStore", () => ({
  useAppStore: () => appStoreMock
}));

vi.mock("@/services/transport/factory", () => ({
  createTransport: createTransportMock
}));

vi.mock("@/services/sessionEventBus", () => ({
  emitSessionEvent: emitSessionEventMock
}));

vi.mock("@/utils/feedback", () => ({
  formatActionError: (_prefix: string, error: unknown) => String(error),
  toFriendlyDisconnectReason: (reason: string) => reason,
  toFriendlyError: (message: string) => message
}));

import { useSessionStore } from "./sessionStore";

function setupWindowSessionStorage(): void {
  const sessionStorage = {
    getItem: (key: string) => sessionStorageState.getItem(key),
    setItem: (key: string, value: string) => sessionStorageState.setItem(key, value)
  };

  const windowMock = {
    sessionStorage,
    setTimeout,
    clearTimeout,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  };

  const documentMock = {
    visibilityState: "visible",
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  };

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: windowMock
  });

  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: documentMock
  });
}

describe("sessionStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    sessionStorageState.clear();
    listeners.value = null;

    transportMock.on.mockClear();
    transportMock.connect.mockClear();
    transportMock.send.mockClear();
    transportMock.disconnect.mockClear();
    transportMock.resize.mockClear();

    createTransportMock.mockClear();
    emitSessionEventMock.mockClear();

    appStoreMock.notify.mockClear();
    logStoreMock.startLog.mockClear();
    logStoreMock.markStatus.mockClear();
    serverStoreMock.resolveCredential.mockClear();
    serverStoreMock.resolveCredentialBundle.mockClear();
    serverStoreMock.markConnected.mockClear();
    settingsStoreMock.settings.autoReconnect = true;
    settingsStoreMock.settings.reconnectLimit = 2;
    settingsStoreMock.knownHosts = {};
    serverStoreMock.servers = [];

    setupWindowSessionStorage();
  });

  it("启动时恢复快照并自动重连", async () => {
    const server: ServerProfile = {
      id: "srv-1",
      name: "mini",
      host: "127.0.0.1",
      port: 22,
      username: "gavin",
      authType: "password",
      projectPath: "~",
      projectPresets: [],
      tags: [],
      timeoutSeconds: 20,
      heartbeatSeconds: 15,
      transportMode: "gateway"
    };

    serverStoreMock.servers = [server];

    sessionStorageState.setItem(
      "remoteconn_session_snapshot_v1",
      JSON.stringify({
        version: 2,
        savedAt: Date.now(),
        activeConnectionKey: "srv-1::snapshot",
        lines: ["restored-line"],
        currentServerId: "srv-1",
        reconnectServerId: "srv-1"
      })
    );

    const store = useSessionStore();
    await store.ensureBootstrapped();

    expect(createTransportMock).toHaveBeenCalledTimes(1);
    expect(transportMock.connect).toHaveBeenCalledTimes(1);
    expect(store.currentServerId).toBe("srv-1");
    expect(store.lines).toContain("restored-line");
  });

  it("刷新恢复连接不受 autoReconnect 开关影响", async () => {
    const server: ServerProfile = {
      id: "srv-reload",
      name: "reload",
      host: "127.0.0.1",
      port: 22,
      username: "gavin",
      authType: "password",
      projectPath: "~",
      projectPresets: [],
      tags: [],
      timeoutSeconds: 20,
      heartbeatSeconds: 15,
      transportMode: "gateway"
    };

    serverStoreMock.servers = [server];
    settingsStoreMock.settings.autoReconnect = false;

    sessionStorageState.setItem(
      "remoteconn_session_snapshot_v1",
      JSON.stringify({
        version: 2,
        savedAt: Date.now(),
        activeConnectionKey: "srv-reload::snapshot",
        lines: ["reloaded"],
        currentServerId: "srv-reload",
        reconnectServerId: "srv-reload"
      })
    );

    const store = useSessionStore();
    await store.ensureBootstrapped();

    expect(transportMock.connect).toHaveBeenCalledTimes(1);
    expect(store.currentServerId).toBe("srv-reload");
  });

  it("刷新后若旧 SSH 未续上且快照记得 Codex 前台，应自动执行 codex resume --last", async () => {
    const server: ServerProfile = {
      id: "srv-codex-resume",
      name: "codex-resume",
      host: "127.0.0.1",
      port: 22,
      username: "gavin",
      authType: "password",
      projectPath: "~/workspace/remoteconn",
      projectPresets: [],
      tags: [],
      timeoutSeconds: 20,
      heartbeatSeconds: 15,
      transportMode: "gateway"
    };

    serverStoreMock.servers = [server];
    sessionStorageState.setItem(
      "remoteconn_session_snapshot_v1",
      JSON.stringify({
        version: 2,
        savedAt: Date.now(),
        activeConnectionKey: "srv-codex-resume::snapshot",
        lines: ["codex-running"],
        currentServerId: "srv-codex-resume",
        reconnectServerId: "srv-codex-resume",
        activeAiProvider: "codex",
        codexSandboxMode: "danger-full-access"
      })
    );

    const store = useSessionStore();
    await store.ensureBootstrapped();
    await listeners.value?.({ type: "connected" });

    expect(
      transportMock.send.mock.calls.some((args: unknown[]) =>
        String(args.at(0) ?? "").includes("codex resume --last --sandbox danger-full-access")
      )
    ).toBe(true);
    expect(appStoreMock.notify).toHaveBeenCalledWith("info", "检测到上次 Codex 会话，正在尝试恢复");
    expect(store.currentServerId).toBe("srv-codex-resume");
  });

  it("网关已续上旧 SSH 时，不应重复执行 codex resume --last", async () => {
    const server: ServerProfile = {
      id: "srv-codex-resumed",
      name: "codex-resumed",
      host: "127.0.0.1",
      port: 22,
      username: "gavin",
      authType: "password",
      projectPath: "~/workspace/remoteconn",
      projectPresets: [],
      tags: [],
      timeoutSeconds: 20,
      heartbeatSeconds: 15,
      transportMode: "gateway"
    };

    serverStoreMock.servers = [server];
    sessionStorageState.setItem(
      "remoteconn_session_snapshot_v1",
      JSON.stringify({
        version: 2,
        savedAt: Date.now(),
        activeConnectionKey: "srv-codex-resumed::snapshot",
        lines: ["codex-running"],
        currentServerId: "srv-codex-resumed",
        reconnectServerId: "srv-codex-resumed",
        activeAiProvider: "codex",
        codexSandboxMode: "danger-full-access"
      })
    );

    const store = useSessionStore();
    await store.ensureBootstrapped();
    await listeners.value?.({ type: "connected", resumed: true });

    expect(
      transportMock.send.mock.calls.some((args: unknown[]) =>
        String(args.at(0) ?? "").includes("codex resume --last --sandbox")
      )
    ).toBe(false);
    expect(store.currentServerId).toBe("srv-codex-resumed");
  });

  it("Copilot 前台态会点亮 AI 按钮，并在退出标记到达后自动解除", async () => {
    const server: ServerProfile = {
      id: "srv-copilot",
      name: "copilot",
      host: "127.0.0.1",
      port: 22,
      username: "gavin",
      authType: "password",
      projectPath: "~/workspace/remoteconn",
      projectPresets: [],
      tags: [],
      timeoutSeconds: 20,
      heartbeatSeconds: 15,
      transportMode: "gateway"
    };

    serverStoreMock.servers = [server];

    const store = useSessionStore();
    await store.connect(server);
    await listeners.value?.({ type: "connected" });

    await store.runCopilot(server.projectPath, "copilot --allow-all");

    expect(
      transportMock.send.mock.calls.some((args: unknown[]) => {
        const command = String(args.at(0) ?? "");
        return command.includes("copilot --allow-all") && command.includes("ai-exit=copilot");
      })
    ).toBe(true);
    expect(store.activeAiProvider).toBe("copilot");
    expect(store.isServerAiActive("srv-copilot")).toBe(true);

    await listeners.value?.({ type: "stdout", data: "\u001b]633;RemoteConn;ai-exit=copilot\u0007" });

    expect(store.activeAiProvider).toBe("");
    expect(store.isServerAiActive("srv-copilot")).toBe(false);
  });

  it("ios-native 已完成兼容初始化后，中文输入不重复注入兼容命令", async () => {
    const server: ServerProfile = {
      id: "srv-2",
      name: "ios",
      host: "127.0.0.1",
      port: 22,
      username: "gavin",
      authType: "password",
      projectPath: "~",
      projectPresets: [],
      tags: [],
      timeoutSeconds: 20,
      heartbeatSeconds: 15,
      transportMode: "ios-native"
    };

    serverStoreMock.servers = [server];

    const store = useSessionStore();
    await store.connect(server);

    expect(listeners.value).toBeTypeOf("function");
    await listeners.value?.({ type: "connected" });

    const shellCompatCalls = transportMock.send.mock.calls.filter((args: unknown[]) =>
      String(args.at(0) ?? "").includes("setopt MULTIBYTE PRINT_EIGHT_BIT")
    );
    expect(shellCompatCalls).toHaveLength(1);

    await store.sendInput("中文");

    const shellCompatCallsAfterInput = transportMock.send.mock.calls.filter((args: unknown[]) =>
      String(args.at(0) ?? "").includes("setopt MULTIBYTE PRINT_EIGHT_BIT")
    );
    expect(shellCompatCallsAfterInput).toHaveLength(1);
    expect(transportMock.send).toHaveBeenLastCalledWith("中文", undefined);
  });

  it("启用跳转主机后应先连接基础信息服务器，再跳转到目标主机", async () => {
    const server: ServerProfile = {
      id: "srv-jump",
      name: "jump",
      host: "base.example.com",
      port: 22,
      username: "base-user",
      authType: "password",
      projectPath: "~",
      projectPresets: [],
      tags: [],
      timeoutSeconds: 20,
      heartbeatSeconds: 15,
      transportMode: "gateway",
      jumpHost: {
        enabled: true,
        host: "target.example.com",
        port: 2200,
        username: "target-user",
        authType: "privateKey"
      }
    };

    serverStoreMock.servers = [server];
    settingsStoreMock.knownHosts = {
      "base.example.com:22": "base-fingerprint",
      "target.example.com:2200": "target-fingerprint"
    };
    serverStoreMock.resolveCredentialBundle.mockResolvedValueOnce({
      target: { type: "password", password: "base-secret" },
      jump: { type: "privateKey", privateKey: "target-key" }
    });

    const store = useSessionStore();
    await store.connect(server);

    expect(transportMock.connect).toHaveBeenCalledTimes(1);
    expect(transportMock.connect).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "target.example.com",
        port: 2200,
        username: "target-user",
        credential: { type: "privateKey", privateKey: "target-key" },
        knownHostFingerprint: "target-fingerprint",
        jumpHost: {
          host: "base.example.com",
          port: 22,
          username: "base-user",
          credential: { type: "password", password: "base-secret" },
          knownHostFingerprint: "base-fingerprint"
        }
      })
    );
  });

  it("同服务器手动重连应保留输出历史；切换服务器应隔离历史", async () => {
    const serverA: ServerProfile = {
      id: "srv-a",
      name: "A",
      host: "10.0.0.1",
      port: 22,
      username: "gavin",
      authType: "password",
      projectPath: "~",
      projectPresets: [],
      tags: [],
      timeoutSeconds: 20,
      heartbeatSeconds: 15,
      transportMode: "gateway"
    };
    const serverB = {
      ...serverA,
      id: "srv-b",
      name: "B",
      host: "10.0.0.2"
    };

    serverStoreMock.servers = [serverA, serverB];

    const store = useSessionStore();
    await store.connect(serverA);
    await listeners.value?.({ type: "connected" });
    await listeners.value?.({ type: "stdout", data: "history-from-a\r\n" });
    expect(store.lines.join("")).toContain("history-from-a");

    await store.disconnect("manual", true);
    await store.connect(serverA);
    await listeners.value?.({ type: "connected" });
    expect(store.lines.join("")).toContain("history-from-a");

    await store.connect(serverB);
    await listeners.value?.({ type: "connected" });
    expect(store.lines.join("")).not.toContain("history-from-a");
  });

  it("ws_closed 断开后应进入可续接态，并在手动断开时清除", async () => {
    const server: ServerProfile = {
      id: "srv-resume",
      name: "resume",
      host: "127.0.0.1",
      port: 22,
      username: "gavin",
      authType: "password",
      projectPath: "~",
      projectPresets: [],
      tags: [],
      timeoutSeconds: 20,
      heartbeatSeconds: 15,
      transportMode: "gateway"
    };

    serverStoreMock.servers = [server];
    settingsStoreMock.settings.autoReconnect = false;

    const store = useSessionStore();
    await store.connect(server);
    await listeners.value?.({ type: "connected" });
    expect(store.isServerResumable(server.id)).toBe(false);

    await listeners.value?.({ type: "disconnect", reason: "ws_closed" });
    expect(store.isServerResumable(server.id)).toBe(true);

    await store.disconnect("manual", true);
    expect(store.isServerResumable(server.id)).toBe(false);
  });

  it("手动断开时即使底层回报 ws_closed，也不应触发自动重连", async () => {
    vi.useFakeTimers();
    setupWindowSessionStorage();

    try {
      const server: ServerProfile = {
        id: "srv-manual-no-reconnect",
        name: "manual-no-reconnect",
        host: "127.0.0.1",
        port: 22,
        username: "gavin",
        authType: "password",
        projectPath: "~",
        projectPresets: [],
        tags: [],
        timeoutSeconds: 20,
        heartbeatSeconds: 15,
        transportMode: "gateway"
      };

      serverStoreMock.servers = [server];

      const store = useSessionStore();
      await store.connect(server);
      await listeners.value?.({ type: "connected" });

      transportMock.disconnect.mockImplementationOnce(async () => {
        await listeners.value?.({ type: "disconnect", reason: "ws_closed" });
      });

      await store.disconnect("manual", true);
      await vi.advanceTimersByTimeAsync(2000);

      expect(transportMock.connect).toHaveBeenCalledTimes(1);
      expect(store.state).toBe("disconnected");
    } finally {
      vi.useRealTimers();
    }
  });

  it("Codex 预检命令回显包含 token 时不应误报目录不存在或未安装", async () => {
    const server: ServerProfile = {
      id: "srv-codex-ok",
      name: "codex-ok",
      host: "127.0.0.1",
      port: 22,
      username: "gavin",
      authType: "password",
      projectPath: "~/workspace",
      projectPresets: [],
      tags: [],
      timeoutSeconds: 20,
      heartbeatSeconds: 15,
      transportMode: "gateway"
    };

    serverStoreMock.servers = [server];

    const store = useSessionStore();
    await store.connect(server);
    await listeners.value?.({ type: "connected" });

    const launchedPromise = store.runCodex(server.projectPath, "workspace-write");
    const bootstrapCommand = String((transportMock.send.mock.calls.at(-1) ?? []).join(" "));
    expect(bootstrapCommand.startsWith('sh -lc "')).toBe(true);

    // 模拟 shell 回显“整条 bootstrap 命令”（包含 token 字面量），随后输出 READY。
    await listeners.value?.({
      type: "stdout",
      data:
        "__rc_codex_path_ok=1; __rc_codex_bin_ok=1; [ \"$__rc_codex_path_ok\" -eq 1 ] || printf '__RC_CODEX_DIR_MISSING__\\n'; " +
        "[ \"$__rc_codex_bin_ok\" -eq 1 ] || printf '__RC_CODEX_BIN_MISSING__\\n';\r\n" +
        "__RC_CODEX_READY__\r\nCodex started\r\n"
    });

    const launched = await launchedPromise;
    expect(launched).toBe(true);

    const warnMessages = appStoreMock.notify.mock.calls
      .filter((args: unknown[]) => args[0] === "warn")
      .map((args: unknown[]) => String(args[1] ?? ""));

    expect(warnMessages.some((message) => message.includes("codex工作目录"))).toBe(false);
    expect(warnMessages.some((message) => message.includes("服务器未装codex"))).toBe(false);
  });

  it("Codex 预检收到失败 token 行时应返回失败并提示原因", async () => {
    const server: ServerProfile = {
      id: "srv-codex-missing",
      name: "codex-missing",
      host: "127.0.0.1",
      port: 22,
      username: "gavin",
      authType: "password",
      projectPath: "~/workspace",
      projectPresets: [],
      tags: [],
      timeoutSeconds: 20,
      heartbeatSeconds: 15,
      transportMode: "gateway"
    };

    serverStoreMock.servers = [server];

    const store = useSessionStore();
    await store.connect(server);
    await listeners.value?.({ type: "connected" });

    const launchedPromise = store.runCodex(server.projectPath, "workspace-write");
    const bootstrapCommand = String((transportMock.send.mock.calls.at(-1) ?? []).join(" "));
    expect(bootstrapCommand.startsWith('sh -lc "')).toBe(true);
    await listeners.value?.({ type: "stdout", data: "__RC_CODEX_BIN_MISSING__\r\n" });

    const launched = await launchedPromise;
    expect(launched).toBe(false);
    expect(appStoreMock.notify).toHaveBeenCalledWith("warn", "服务器未装codex");
  });

  it("Codex 前台态时 clearTerminal 不应清空当前缓冲", async () => {
    const server: ServerProfile = {
      id: "srv-codex-clear-guard",
      name: "codex-clear-guard",
      host: "127.0.0.1",
      port: 22,
      username: "gavin",
      authType: "password",
      projectPath: "~/workspace",
      projectPresets: [],
      tags: [],
      timeoutSeconds: 20,
      heartbeatSeconds: 15,
      transportMode: "gateway"
    };

    serverStoreMock.servers = [server];

    const store = useSessionStore();
    await store.connect(server);
    await listeners.value?.({ type: "connected" });
    await listeners.value?.({ type: "stdout", data: "before-clear\r\n" });

    const launchedPromise = store.runCodex(server.projectPath, "workspace-write");
    await listeners.value?.({ type: "stdout", data: "__RC_CODEX_READY__\r\n" });

    const launched = await launchedPromise;
    expect(launched).toBe(true);
    expect(store.activeAiProvider).toBe("codex");

    const previousLines = [...store.lines];
    const previousRevision = store.outputRevision;

    store.clearTerminal();

    expect(store.lines).toEqual(previousLines);
    expect(store.outputRevision).toBe(previousRevision);
  });

  it("命令回显包含 READY 字面量但无 READY token 行时，不应提前判定成功", async () => {
    const server: ServerProfile = {
      id: "srv-codex-ready-literal",
      name: "codex-ready-literal",
      host: "127.0.0.1",
      port: 22,
      username: "gavin",
      authType: "password",
      projectPath: "~",
      projectPresets: [],
      tags: [],
      timeoutSeconds: 20,
      heartbeatSeconds: 15,
      transportMode: "gateway"
    };

    serverStoreMock.servers = [server];

    const store = useSessionStore();
    await store.connect(server);
    await listeners.value?.({ type: "connected" });

    const launchedPromise = store.runCodex(server.projectPath, "workspace-write");

    // 仅回显脚本字面量（包含 READY token 文本，但不是独立 token 行）。
    await listeners.value?.({
      type: "stdout",
      data:
        '__rc_codex_path_ok=1; __rc_codex_bin_ok=1; if [ "$__rc_codex_path_ok" -eq 1 ] && [ "$__rc_codex_bin_ok" -eq 1 ]; ' +
        "then printf '__RC_CODEX_READY__\\n'; codex --sandbox workspace-write; fi\r\n"
    });
    // 随后给出真实失败 token 行，应返回失败并提示未安装。
    await listeners.value?.({ type: "stdout", data: "__RC_CODEX_BIN_MISSING__\r\n" });

    const launched = await launchedPromise;
    expect(launched).toBe(false);
    expect(appStoreMock.notify).toHaveBeenCalledWith("warn", "服务器未装codex");
  });
});
