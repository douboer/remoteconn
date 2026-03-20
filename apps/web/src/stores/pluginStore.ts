import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { PluginManager, type PluginPackage } from "@remoteconn/plugin-runtime";
import { WebPluginFsAdapter } from "@/services/storage/pluginFsAdapter";
import { onSessionEvent } from "@/services/sessionEventBus";
import { useSessionStore } from "./sessionStore";
import { useAppStore } from "./appStore";

/**
 * 插件运行时管理。
 */
export const usePluginStore = defineStore("plugin", () => {
  const runtimeLogs = ref<string[]>([]);
  const initialized = ref(false);
  let bootstrapPromise: Promise<void> | null = null;

  const fsAdapter = new WebPluginFsAdapter();
  const eventUnsubscribers: Array<() => void> = [];

  const manager = new PluginManager(fsAdapter, {
    getAppMeta() {
      return { version: "2.4.0", platform: "web" as const };
    },
    session: {
      async send(input) {
        const sessionStore = useSessionStore();
        await sessionStore.sendCommand(input, "plugin", "manual");
      },
      on(eventName, handler) {
        return onSessionEvent(eventName, handler);
      }
    },
    showNotice(message, level) {
      const appStore = useAppStore();
      appStore.notify(level, message);
    }
  }, {
    appVersion: "2.4.0",
    mountStyle(pluginId, css) {
      const style = document.createElement("style");
      style.dataset.pluginId = pluginId;
      style.textContent = css;
      document.head.append(style);
      return () => style.remove();
    },
    logger(level, pluginId, message) {
      runtimeLogs.value.unshift(`[${new Date().toLocaleTimeString("zh-CN", { hour12: false })}] [${level}] [${pluginId}] ${message}`);
      if (runtimeLogs.value.length > 300) {
        runtimeLogs.value.splice(300);
      }
    }
  });

  const records = computed(() => manager.listRecords());

  const commands = computed(() => {
    const session = useSessionStore();
    return manager.listCommands(session.connected ? "connected" : "disconnected");
  });

  async function ensureBootstrapped(): Promise<void> {
    if (initialized.value) return;
    if (bootstrapPromise) {
      await bootstrapPromise;
      return;
    }

    bootstrapPromise = (async () => {

    await manager.bootstrap();
    await ensureSamplePlugin();

    eventUnsubscribers.push(
      onSessionEvent("connected", () => {
        // 保持 computed 触发
        runtimeLogs.value = [...runtimeLogs.value];
      })
    );

    initialized.value = true;
    })();

    try {
      await bootstrapPromise;
    } finally {
      bootstrapPromise = null;
    }
  }

  async function bootstrap(): Promise<void> {
    await ensureBootstrapped();
  }

  async function ensureSamplePlugin(): Promise<void> {
    const packages = await fsAdapter.listPackages();
    if (packages.length > 0) return;

    await importPackages([
      {
        manifest: {
          id: "codex-shortcuts",
          name: "Codex Shortcuts",
          version: "0.1.0",
          minAppVersion: "0.1.0",
          description: "提供常用 Codex 快捷命令",
          entry: "main.js",
          style: "styles.css",
          permissions: ["commands.register", "session.write", "ui.notice"]
        },
        mainJs: `
module.exports = {
  onload(ctx) {
    ctx.commands.register({
      id: "codex-doctor",
      title: "Codex Doctor",
      when: "connected",
      async handler() {
        await ctx.session.send("codex --doctor");
      }
    });
    ctx.ui.showNotice("插件 codex-shortcuts 已加载", "info");
  }
};
        `.trim(),
        stylesCss: `.plugin-chip[data-plugin-id="codex-shortcuts"] { border-color: rgba(95,228,255,0.7); }`
      }
    ]);
  }

  async function importPackages(payload: PluginPackage[]): Promise<void> {
    for (const pkg of payload) {
      await manager.installPackage(pkg);
    }
  }

  async function importJson(raw: string): Promise<void> {
    const parsed = JSON.parse(raw) as PluginPackage | PluginPackage[];
    const items = Array.isArray(parsed) ? parsed : [parsed];
    await importPackages(items);
  }

  async function exportJson(): Promise<string> {
    const packages = await fsAdapter.listPackages();
    return JSON.stringify(packages, null, 2);
  }

  async function enable(pluginId: string): Promise<void> {
    await manager.enable(pluginId);
  }

  async function disable(pluginId: string): Promise<void> {
    await manager.disable(pluginId);
  }

  async function reload(pluginId: string): Promise<void> {
    await manager.reload(pluginId);
  }

  async function remove(pluginId: string): Promise<void> {
    await manager.remove(pluginId);
  }

  async function runCommand(commandId: string): Promise<void> {
    await manager.runCommand(commandId);
  }

  function dispose(): void {
    for (const off of eventUnsubscribers) {
      off();
    }
    eventUnsubscribers.length = 0;
  }

  return {
    runtimeLogs,
    records,
    commands,
    ensureBootstrapped,
    bootstrap,
    importJson,
    exportJson,
    enable,
    disable,
    reload,
    remove,
    runCommand,
    dispose
  };
});
