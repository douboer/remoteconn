import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { verifyHostKey } from "@remoteconn/shared";
import type { GlobalSettings } from "@/types/app";
import { defaultSettings, normalizeGlobalSettings, resolveGatewayUrl, resolveGatewayToken } from "@/utils/defaults";
import { getKnownHosts, getSettings, setSettings, upsertKnownHost } from "@/services/storage/db";

/**
 * 设置与主题管理。
 */
export const useSettingsStore = defineStore("settings", () => {
  const settings = ref<GlobalSettings>(normalizeGlobalSettings(defaultSettings));
  const knownHosts = ref<Record<string, string>>({});
  const loaded = ref(false);
  let bootstrapPromise: Promise<void> | null = null;

  const themeVars = computed(() => ({
    "--bg": settings.value.uiBgColor,
    "--accent": settings.value.uiAccentColor,
    "--text": settings.value.uiTextColor,
    "--btn": settings.value.uiBtnColor,
    "--shell-bg": settings.value.shellBgColor,
    "--shell-text": settings.value.shellTextColor,
    "--shell-accent": settings.value.shellAccentColor
  }));

  async function ensureBootstrapped(): Promise<void> {
    if (loaded.value) return;
    if (bootstrapPromise) {
      await bootstrapPromise;
      return;
    }
    bootstrapPromise = (async () => {
    settings.value = normalizeGlobalSettings(await getSettings());
    knownHosts.value = await getKnownHosts();
    loaded.value = true;
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

  async function save(next: GlobalSettings): Promise<void> {
    const normalized = normalizeGlobalSettings(next);
    settings.value = normalized;
    await setSettings({ ...normalized });
  }

  /** 运行时推导网关 URL，不从持久化设置读取 */
  const gatewayUrl = computed(() => resolveGatewayUrl(settings.value));
  /** 运行时推导网关 Token，不从持久化设置读取 */
  const gatewayToken = computed(() => resolveGatewayToken(settings.value));

  async function verifyAndPersistHostFingerprint(hostPort: string, incomingFingerprint: string): Promise<boolean> {
    const result = await verifyHostKey({
      hostPort,
      incomingFingerprint,
      policy: settings.value.hostKeyPolicy,
      knownHosts: knownHosts.value,
      onConfirm: async ({ hostPort: host, fingerprint, reason }) => {
        return window.confirm(`${reason}\n主机: ${host}\n指纹: ${fingerprint}\n是否信任并继续？`);
      }
    });

    if (result.accepted && result.updated[hostPort]) {
      knownHosts.value = { ...result.updated };
      await upsertKnownHost(hostPort, result.updated[hostPort]);
    }

    return result.accepted;
  }

  return {
    settings,
    knownHosts,
    themeVars,
    gatewayUrl,
    gatewayToken,
    ensureBootstrapped,
    bootstrap,
    save,
    verifyAndPersistHostFingerprint
  };
});
