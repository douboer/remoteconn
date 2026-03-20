import type { PluginFsAdapter, PluginPackage } from "@remoteconn/plugin-runtime";
import { db } from "./db";

/**
 * Web 端插件存储适配：
 * - 插件包与记录保存在 IndexedDB
 * - 提供与插件运行时一致的读写接口
 */
export class WebPluginFsAdapter implements PluginFsAdapter {
  public async listPackages(): Promise<PluginPackage[]> {
    const rows = await db.pluginPackages.toArray();
    return rows.map(({ id: _id, ...pkg }) => pkg);
  }

  public async getPackage(pluginId: string): Promise<PluginPackage | null> {
    const row = await db.pluginPackages.get(pluginId);
    if (!row) {
      return null;
    }
    const { id: _id, ...pkg } = row;
    return pkg;
  }

  public async upsertPackage(pluginPackage: PluginPackage): Promise<void> {
    await db.pluginPackages.put({ id: pluginPackage.manifest.id, ...pluginPackage });
  }

  public async removePackage(pluginId: string): Promise<void> {
    await db.pluginPackages.delete(pluginId);
  }

  public async readStore<T>(key: string, fallback: T): Promise<T> {
    const row = await db.pluginData.get(key);
    if (!row) {
      return fallback;
    }
    return row.value as T;
  }

  public async writeStore<T>(key: string, value: T): Promise<void> {
    await db.pluginData.put({ key, value });
  }
}
