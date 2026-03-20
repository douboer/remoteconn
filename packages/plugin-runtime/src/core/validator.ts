import { PERMISSION_WHITELIST, type PluginPackage } from "../types/plugin";

/**
 * 插件包静态校验。
 */
export function validatePluginPackage(pluginPackage: PluginPackage): PluginPackage {
  const manifest = pluginPackage?.manifest;
  if (!manifest) {
    throw new Error("缺少 manifest");
  }

  const required = ["id", "name", "version", "minAppVersion", "description", "entry", "style", "permissions"];
  for (const key of required) {
    if (!(key in manifest)) {
      throw new Error(`manifest 缺少字段: ${key}`);
    }
  }

  if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(manifest.id)) {
    throw new Error("插件 id 不符合规范");
  }

  if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) {
    throw new Error("version 必须是 SemVer，例如 0.1.0");
  }

  if (!/^\d+\.\d+\.\d+$/.test(manifest.minAppVersion)) {
    throw new Error("minAppVersion 必须是 SemVer");
  }

  if (manifest.entry !== "main.js" || manifest.style !== "styles.css") {
    throw new Error("entry/style 目前固定为 main.js / styles.css");
  }

  const allowed = new Set(PERMISSION_WHITELIST);
  for (const permission of manifest.permissions || []) {
    if (!allowed.has(permission)) {
      throw new Error(`未知权限: ${permission}`);
    }
  }

  if (!pluginPackage.mainJs?.trim()) {
    throw new Error("mainJs 不能为空");
  }

  if (pluginPackage.stylesCss == null) {
    throw new Error("stylesCss 不能为空");
  }

  if (/^\s*(\*|body|html)\s*[{,]/m.test(pluginPackage.stylesCss)) {
    throw new Error("styles.css 禁止全局选择器（* / body / html）");
  }

  return pluginPackage;
}
