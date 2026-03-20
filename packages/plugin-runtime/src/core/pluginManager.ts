import type { PluginHostApis, PluginPackage, PluginRecord, PluginFsAdapter, PluginCommand } from "../types/plugin";
import { validatePluginPackage } from "./validator";

interface RuntimeSlot {
  pluginId: string;
  cleanupFns: Array<() => void>;
  styleDisposer?: () => void;
  api?: {
    onload?: (ctx: unknown) => Promise<void> | void;
    onunload?: () => Promise<void> | void;
  };
}

/**
 * 生产可用插件管理器：
 * 1. 安装校验
 * 2. 生命周期
 * 3. 单插件熔断
 * 4. 权限最小化
 */
export class PluginManager {
  private readonly records = new Map<string, PluginRecord>();
  private readonly runtime = new Map<string, RuntimeSlot>();
  private readonly commands = new Map<string, PluginCommand>();

  public constructor(
    private readonly fs: PluginFsAdapter,
    private readonly apis: PluginHostApis,
    private readonly options: {
      appVersion: string;
      mountStyle: (pluginId: string, css: string) => () => void;
      logger: (level: "info" | "warn" | "error", pluginId: string, message: string) => void;
    }
  ) {}

  public async bootstrap(): Promise<void> {
    const stored = await this.fs.readStore<PluginRecord[]>("plugin_records", []);
    for (const record of stored) {
      this.records.set(record.id, record);
    }

    const packages = await this.fs.listPackages();
    for (const item of packages) {
      if (!this.records.has(item.manifest.id)) {
        this.records.set(item.manifest.id, this.createRecord(item.manifest.id));
      }
    }

    await this.persistRecords();
    for (const record of this.records.values()) {
      if (record.enabled) {
        try {
          await this.enable(record.id);
        } catch (error) {
          this.options.logger("error", record.id, `自动启用失败: ${(error as Error).message}`);
        }
      }
    }
  }

  public async installPackage(payload: PluginPackage): Promise<void> {
    const valid = validatePluginPackage(payload);
    await this.fs.upsertPackage(valid);
    const record = this.records.get(valid.manifest.id) ?? this.createRecord(valid.manifest.id);
    record.status = "validated";
    record.updatedAt = new Date().toISOString();
    record.lastError = "";
    this.records.set(valid.manifest.id, record);
    await this.persistRecords();
  }

  public async enable(pluginId: string): Promise<void> {
    const pluginPackage = await this.fs.getPackage(pluginId);
    if (!pluginPackage) {
      throw new Error("插件不存在");
    }

    const validPackage = validatePluginPackage(pluginPackage);
    const record = this.records.get(pluginId) ?? this.createRecord(pluginId);

    if (record.errorCount >= 3) {
      throw new Error("插件已熔断，请先重载后再启用");
    }

    if (this.runtime.has(pluginId)) {
      await this.disable(pluginId);
    }

    record.status = "loading";
    record.lastError = "";
    this.records.set(pluginId, record);
    await this.persistRecords();

    const runtime: RuntimeSlot = {
      pluginId,
      cleanupFns: []
    };

    try {
      runtime.styleDisposer = this.options.mountStyle(pluginId, validPackage.stylesCss);
      const ctx = this.createContext(validPackage.manifest, runtime);
      runtime.api = this.loadPluginApi(validPackage.mainJs, ctx);

      if (runtime.api?.onload) {
        await this.runWithTimeout(Promise.resolve(runtime.api.onload(ctx)), 3000, "onload 超时");
      }

      record.enabled = true;
      record.status = "active";
      record.lastLoadedAt = new Date().toISOString();
      this.runtime.set(pluginId, runtime);
      await this.persistRecords();
      this.options.logger("info", pluginId, "插件已启用");
    } catch (error) {
      runtime.styleDisposer?.();
      record.enabled = false;
      record.status = "failed";
      record.errorCount += 1;
      record.lastError = (error as Error).message;
      this.records.set(pluginId, record);
      await this.persistRecords();
      this.options.logger("error", pluginId, `启用失败: ${(error as Error).message}`);
      throw error;
    }
  }

  public async disable(pluginId: string): Promise<void> {
    const runtime = this.runtime.get(pluginId);
    const record = this.records.get(pluginId) ?? this.createRecord(pluginId);

    if (runtime) {
      try {
        if (runtime.api?.onunload) {
          await this.runWithTimeout(Promise.resolve(runtime.api.onunload()), 3000, "onunload 超时");
        }
      } catch (error) {
        this.options.logger("warn", pluginId, `onunload 异常: ${(error as Error).message}`);
      }

      for (const cleanup of runtime.cleanupFns) {
        cleanup();
      }
      runtime.styleDisposer?.();
      this.runtime.delete(pluginId);
    }

    for (const id of Array.from(this.commands.keys())) {
      if (id.startsWith(`${pluginId}:`)) {
        this.commands.delete(id);
      }
    }

    record.enabled = false;
    if (record.status !== "failed") {
      record.status = "stopped";
    }
    this.records.set(pluginId, record);
    await this.persistRecords();
  }

  public async reload(pluginId: string): Promise<void> {
    const record = this.records.get(pluginId) ?? this.createRecord(pluginId);
    record.errorCount = 0;
    record.lastError = "";
    this.records.set(pluginId, record);
    await this.persistRecords();

    await this.disable(pluginId);
    await this.enable(pluginId);
  }

  public async remove(pluginId: string): Promise<void> {
    await this.disable(pluginId);
    await this.fs.removePackage(pluginId);
    this.records.delete(pluginId);
    await this.persistRecords();
  }

  public listRecords(): PluginRecord[] {
    return Array.from(this.records.values());
  }

  public listCommands(sessionState: "connected" | "disconnected"): PluginCommand[] {
    return Array.from(this.commands.values()).filter((command) => {
      if (command.when === "connected") {
        return sessionState === "connected";
      }
      return true;
    });
  }

  public async runCommand(commandId: string): Promise<void> {
    const command = this.commands.get(commandId);
    if (!command) {
      throw new Error("命令不存在");
    }
    await Promise.resolve(command.handler());
  }

  private createContext(manifest: PluginPackage["manifest"], runtime: RuntimeSlot): unknown {
    const assertPermission = (permission: string): void => {
      if (!manifest.permissions.includes(permission as never)) {
        throw new Error(`权限不足: ${permission}`);
      }
    };

    return {
      app: this.apis.getAppMeta(),
      commands: {
        register: (command: PluginCommand) => {
          assertPermission("commands.register");
          const id = `${manifest.id}:${command.id}`;
          this.commands.set(id, {
            ...command,
            id
          });
          runtime.cleanupFns.push(() => this.commands.delete(id));
        }
      },
      session: {
        send: async (input: string) => {
          assertPermission("session.write");
          await this.apis.session.send(input);
        },
        on: (eventName: "connected" | "disconnected" | "stdout" | "stderr" | "latency", handler: (payload: unknown) => void) => {
          assertPermission("session.read");
          const off = this.apis.session.on(eventName, handler);
          runtime.cleanupFns.push(off);
          return off;
        }
      },
      storage: {
        get: async (key: string) => {
          assertPermission("storage.read");
          const value = await this.fs.readStore<Record<string, unknown>>(`plugin_data_${manifest.id}`, {});
          return value[key];
        },
        set: async (key: string, value: unknown) => {
          assertPermission("storage.write");
          const previous = await this.fs.readStore<Record<string, unknown>>(`plugin_data_${manifest.id}`, {});
          previous[key] = value;
          await this.fs.writeStore(`plugin_data_${manifest.id}`, previous);
        }
      },
      ui: {
        showNotice: (message: string, level: "info" | "warn" | "error" = "info") => {
          assertPermission("ui.notice");
          this.apis.showNotice(message, level);
        }
      },
      logger: {
        info: (...args: string[]) => this.options.logger("info", manifest.id, args.join(" ")),
        warn: (...args: string[]) => this.options.logger("warn", manifest.id, args.join(" ")),
        error: (...args: string[]) => this.options.logger("error", manifest.id, args.join(" "))
      }
    };
  }

  private loadPluginApi(mainJs: string, ctx: unknown): RuntimeSlot["api"] {
    const module = { exports: {} as RuntimeSlot["api"] };
    const exportsRef = module.exports;

    const fn = new Function(
      "ctx",
      "module",
      "exports",
      `"use strict";
const window = undefined;
const document = undefined;
const localStorage = undefined;
const globalThis = undefined;
${mainJs}
return module.exports;`
    );

    return (fn(ctx, module, exportsRef) as RuntimeSlot["api"]) ?? module.exports;
  }

  private async runWithTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    });

    try {
      return await Promise.race([promise, timeout]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  private createRecord(id: string): PluginRecord {
    const now = new Date().toISOString();
    return {
      id,
      enabled: false,
      status: "discovered",
      errorCount: 0,
      lastError: "",
      installedAt: now,
      updatedAt: now,
      lastLoadedAt: ""
    };
  }

  private async persistRecords(): Promise<void> {
    await this.fs.writeStore("plugin_records", Array.from(this.records.values()));
  }
}
