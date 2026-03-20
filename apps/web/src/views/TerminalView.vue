<template>
  <section class="page-root terminal-page">
    <div class="page-toolbar terminal-toolbar">
      <div class="toolbar-left">
        <button
          class="icon-btn terminal-toolbar-ai-btn"
          :class="{ 'is-connected': !!sessionStore.activeAiProvider }"
          type="button"
          title="AI 快速启动"
          aria-label="AI 快速启动"
          @click="openCodexDialog"
        >
          <span class="icon-mask" style="--icon: url(&quot;/icons/codex.svg&quot;)" aria-hidden="true"></span>
        </button>
        <button
          class="icon-btn"
          type="button"
          title="清屏"
          aria-label="清屏"
          :disabled="clearActionDisabled"
          @click="sessionStore.clearTerminal"
        >
          <span class="icon-mask" style="--icon: url(&quot;/icons/clear.svg&quot;)" aria-hidden="true"></span>
        </button>
      </div>
      <div class="toolbar-spacer"></div>
      <div class="terminal-toolbar-actions">
        <h2 class="page-title terminal-title">{{ terminalTitle }}</h2>
        <span class="state-chip" :class="`state-${sessionStore.state}`">{{ sessionStore.state }}</span>
        <span class="state-chip">{{ sessionStore.latencyMs }}ms</span>
        <span class="terminal-toolbar-divider" aria-hidden="true"></span>
        <button
          class="terminal-connection-switch"
          :class="connectionActionIsReconnect ? 'is-reconnect' : 'is-disconnect'"
          :disabled="connectionActionDisabled"
          :aria-label="connectionActionIsReconnect ? '重连' : '断开'"
          @click="handleConnectionAction"
        >
          <span class="terminal-connection-switch-label">{{
            connectionActionIsReconnect ? "重连" : "断开"
          }}</span>
          <span class="terminal-connection-switch-knob" aria-hidden="true"></span>
        </button>
      </div>
    </div>

    <article class="terminal-surface">
      <section class="surface-panel terminal-card">
        <Suspense>
          <template #default>
            <AsyncTerminalPanel />
          </template>
          <template #fallback>
            <div class="terminal-loading">正在初始化终端…</div>
          </template>
        </Suspense>

        <div v-if="pluginRuntimeEnabled" class="plugin-chips">
          <button
            v-for="commandItem in pluginCommands"
            :key="commandItem.id"
            class="plugin-chip"
            :data-plugin-id="commandItem.id.split(':')[0]"
            @click="runPluginCommand(commandItem.id)"
          >
            {{ commandItem.title }}
          </button>
        </div>
      </section>
    </article>

    <div v-if="codexDialogOpen" class="codex-dialog-mask" @click.self="closeCodexDialog">
      <div class="codex-dialog" role="dialog" aria-modal="true" aria-label="AI 快速启动">
        <h3 class="codex-dialog-title">AI 快速启动</h3>
        <p class="codex-dialog-hint">点击按钮自动切换项目目录启动AICoding</p>

        <section class="ai-launch-card">
          <h4 class="ai-launch-card-title">Codex</h4>
          <div class="ai-launch-actions">
            <button
              v-for="option in codexSandboxOptions"
              :key="option.value"
              class="btn"
              type="button"
              @click="runCodexCommand(option.value)"
            >
              {{ option.label }}
            </button>
          </div>
        </section>

        <section class="ai-launch-card">
          <h4 class="ai-launch-card-title">Copilot</h4>
          <div class="ai-launch-actions">
            <button class="btn" type="button" @click="runCopilotCommand('copilot')">copilot</button>
            <button class="btn" type="button" @click="runCopilotCommand('copilot --experimental')">
              copilot --experimental
            </button>
            <button class="btn" type="button" @click="runCopilotCommand('copilot --allow-all')">
              copilot --allow-all
            </button>
          </div>
        </section>

        <div class="codex-dialog-actions">
          <button class="btn" type="button" @click="closeCodexDialog">关闭</button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import type { ServerProfile } from "@/types/app";
import { useSessionStore } from "@/stores/sessionStore";
import { useServerStore } from "@/stores/serverStore";
import { useAppStore } from "@/stores/appStore";
import "xterm/css/xterm.css";
import { formatActionError } from "@/utils/feedback";

const AsyncTerminalPanel = defineAsyncComponent(() => import("@/components/TerminalPanel.vue"));

type PluginCommandItem = {
  id: string;
  title: string;
};

type PluginStoreLike = {
  commands: PluginCommandItem[];
  ensureBootstrapped: () => Promise<void>;
  runCommand: (commandId: string) => Promise<void>;
};

const sessionStore = useSessionStore();
const serverStore = useServerStore();
const appStore = useAppStore();
const route = useRoute();
const router = useRouter();
const pluginRuntimeEnabled = import.meta.env.VITE_ENABLE_PLUGIN_RUNTIME !== "false";
const pluginStore = ref<PluginStoreLike | null>(null);
const reconnectStates = new Set(["idle", "disconnected", "error"]);
const waitingConnectStates = new Set(["connecting", "auth_pending", "reconnecting"]);
const codexDialogOpen = ref(false);
type CopilotCommand = "copilot" | "copilot --experimental" | "copilot --allow-all";
const codexSandboxOptions = [
  { value: "read-only", label: "codex --sandbox read-only" },
  { value: "workspace-write", label: "codex --sandbox workspace-write" },
  { value: "danger-full-access", label: "codex --sandbox danger-full-access" }
] as const;

const terminalTitle = computed(() => serverStore.selectedServer?.name ?? "remoteconn");
const connectionActionIsReconnect = computed(() => reconnectStates.has(sessionStore.state));
const clearActionDisabled = computed(
  () => sessionStore.state === "connected" && sessionStore.activeAiProvider === "codex"
);
const pluginCommands = computed(() => pluginStore.value?.commands ?? []);

onMounted(async () => {
  await Promise.all([serverStore.ensureBootstrapped(), sessionStore.ensureBootstrapped()]);
  if (route.query.openCodex === "1") {
    codexDialogOpen.value = true;
    await router.replace({ path: "/terminal", query: {} });
  }

  if (!pluginRuntimeEnabled) {
    return;
  }

  const { usePluginStore } = await import("@/stores/pluginStore");
  pluginStore.value = usePluginStore() as unknown as PluginStoreLike;
  await pluginStore.value.ensureBootstrapped();
});

onBeforeUnmount(() => {
  sessionStore.cancelReconnect("leave_terminal_page");
});

async function runPluginCommand(commandId: string): Promise<void> {
  if (!pluginStore.value) {
    return;
  }
  await pluginStore.value.runCommand(commandId);
}

/**
 * 断开态时需要有可重连的目标服务器，避免“重连”按钮点击后无效。
 * 优先使用当前会话记录的服务器 ID，其次使用当前选中的服务器。
 */
const connectionActionDisabled = computed(() => {
  if (!connectionActionIsReconnect.value) {
    return false;
  }
  return !resolveReconnectServer();
});

function openCodexDialog(): void {
  codexDialogOpen.value = true;
}

function closeCodexDialog(): void {
  codexDialogOpen.value = false;
}

async function runCodexCommand(
  sandbox: "read-only" | "workspace-write" | "danger-full-access"
): Promise<void> {
  // 交互要求：点击命令按钮后立即关闭窗口，执行结果通过 toast 和终端输出反馈。
  codexDialogOpen.value = false;
  await runCodex(sandbox);
}

async function runCodex(sandbox: "read-only" | "workspace-write" | "danger-full-access"): Promise<boolean> {
  try {
    const server = await ensureConnectedForAi();
    if (!server) {
      return false;
    }
    const launched = await sessionStore.runCodex(server.projectPath, sandbox);
    return launched;
  } catch (error) {
    appStore.notify("error", formatActionError("Codex 启动失败", error));
    return false;
  }
}

async function runCopilotCommand(command: CopilotCommand): Promise<void> {
  // 交互要求：点击命令按钮后立即关闭窗口，执行结果通过 toast 和终端输出反馈。
  codexDialogOpen.value = false;
  await runCopilot(command);
}

async function runCopilot(command: CopilotCommand): Promise<boolean> {
  try {
    const server = await ensureConnectedForAi();
    if (!server) {
      return false;
    }
    return await sessionStore.runCopilot(server.projectPath, command);
  } catch (error) {
    appStore.notify("error", formatActionError("Copilot 启动失败", error));
    return false;
  }
}

/**
 * 构造可重连目标：
 * 1) 当前会话绑定的服务器优先；
 * 2) 若会话 ID 丢失，则退化到当前选中服务器；
 * 3) 返回纯数据快照，避免把响应式对象直接传入会话层。
 */
function resolveReconnectServer(): ServerProfile | null {
  const targetId = sessionStore.currentServerId || serverStore.selectedServerId;
  const target = serverStore.servers.find((item) => item.id === targetId) ?? serverStore.selectedServer;
  if (!target) {
    return null;
  }
  return {
    ...target,
    projectPresets: [...target.projectPresets],
    tags: [...target.tags],
    jumpHost: target.jumpHost ? { ...target.jumpHost } : undefined
  };
}

/**
 * 等待会话进入 connected：
 * 1) 连接链路是异步事件驱动（connect() 返回时可能仍在 auth_pending）；
 * 2) 这里用轻量轮询等待最终状态，避免“刚点连接就发命令”触发会话未连接；
 * 3) 明确超时与失败态，避免无限等待。
 */
function waitForConnected(timeoutMs = 15_000): Promise<void> {
  if (sessionStore.state === "connected") {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const check = (): void => {
      if (sessionStore.state === "connected") {
        resolve();
        return;
      }
      if (!waitingConnectStates.has(sessionStore.state)) {
        reject(new Error(`连接未就绪，当前状态: ${sessionStore.state}`));
        return;
      }
      if (Date.now() - startedAt > timeoutMs) {
        reject(new Error("等待会话连接超时"));
        return;
      }
      window.setTimeout(check, 120);
    };
    check();
  });
}

/**
 * AI 启动前自动确保连接可用：
 * - 断开态：先按“重连”逻辑自动重连；
 * - 连接中：直接等待 connected；
 * - 已连接：直接返回当前目标服务器。
 */
async function ensureConnectedForAi(): Promise<ServerProfile | null> {
  const target = resolveReconnectServer();
  if (!target) {
    appStore.notify("warn", "未找到可连接的服务器");
    return null;
  }
  if (sessionStore.state === "connected") {
    return target;
  }
  if (!waitingConnectStates.has(sessionStore.state)) {
    appStore.notify("info", `正在连接: ${target.username}@${target.host}:${target.port}`);
    await sessionStore.connect(target);
  }
  await waitForConnected();
  return target;
}

async function handleConnectionAction(): Promise<void> {
  if (connectionActionIsReconnect.value) {
    const target = resolveReconnectServer();
    if (!target) {
      appStore.notify("warn", "未找到可重连的服务器");
      return;
    }
    try {
      appStore.notify("info", `正在重连: ${target.username}@${target.host}:${target.port}`);
      await sessionStore.connect(target);
    } catch (error) {
      appStore.notify("error", formatActionError("重连失败", error));
    }
    return;
  }

  await sessionStore.disconnect("manual", true);
}
</script>
