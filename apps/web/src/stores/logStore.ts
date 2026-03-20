import { defineStore } from "pinia";
import { computed, toRaw, ref } from "vue";
import { maskHost, maskSensitive, type CommandMarker, type SessionLog } from "@remoteconn/shared";
import { db } from "@/services/storage/db";
import { nowIso } from "@/utils/time";

/**
 * 会话日志存储与导出。
 */
export const useLogStore = defineStore("log", () => {
  const logs = ref<SessionLog[]>([]);
  const loaded = ref(false);
  let bootstrapPromise: Promise<void> | null = null;

  const latest = computed(() => [...logs.value].sort((a, b) => +new Date(b.startAt) - +new Date(a.startAt)).slice(0, 50));

  async function ensureBootstrapped(): Promise<void> {
    if (loaded.value) return;
    if (bootstrapPromise) {
      await bootstrapPromise;
      return;
    }
    bootstrapPromise = (async () => {
    logs.value = await db.sessionLogs.toArray();
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

  async function startLog(serverId: string): Promise<string> {
    const log: SessionLog = {
      sessionId: `sess-${crypto.randomUUID()}`,
      serverId,
      startAt: nowIso(),
      status: "connecting",
      commandMarkers: []
    };
    logs.value.unshift(log);
    await db.sessionLogs.put(log);
    return log.sessionId;
  }

  /**
   * Dexie/IndexedDB 使用结构化克隆写入数据，Vue 响应式代理对象会触发 DataCloneError。
   * 这里统一做实体快照，确保入库对象仅包含可序列化的普通 JSON 数据。
   */
  function toSessionLogEntity(log: SessionLog): SessionLog {
    const raw = toRaw(log);
    return {
      ...raw,
      commandMarkers: raw.commandMarkers.map((marker) => ({ ...marker }))
    };
  }

  async function markStatus(sessionId: string, status: SessionLog["status"], error?: string): Promise<void> {
    const target = logs.value.find((item) => item.sessionId === sessionId);
    if (!target) return;
    target.status = status;
    if (status === "disconnected" || status === "error") {
      target.endAt = nowIso();
    }
    if (error) {
      target.error = error;
    }
    await db.sessionLogs.put(toSessionLogEntity(target));
  }

  async function addMarker(sessionId: string, marker: Omit<CommandMarker, "at">): Promise<void> {
    const target = logs.value.find((item) => item.sessionId === sessionId);
    if (!target) return;
    target.commandMarkers.push({ ...marker, at: nowIso() });
    await db.sessionLogs.put(toSessionLogEntity(target));
  }

  function exportLogs(mask = true): string {
    const rows = logs.value.map((log) => {
      const commands = log.commandMarkers
        .map((marker) => {
          const cmd = mask ? maskSensitive(marker.command) : marker.command;
          return `  - [${marker.at}] ${cmd} => code:${marker.code}`;
        })
        .join("\n");
      return [
        `## ${log.sessionId} [${log.status}]`,
        `- server: ${log.serverId}`,
        `- start: ${log.startAt}`,
        `- end: ${log.endAt ?? "--"}`,
        `- error: ${mask ? maskSensitive(log.error ?? "") : log.error ?? ""}`,
        `- host: ${mask ? maskHost(log.serverId) : log.serverId}`,
        "- commands:",
        commands || "  - 无"
      ].join("\n");
    });

    return [`# RemoteConn Session Export ${nowIso()}`, "", ...rows].join("\n\n");
  }

  return {
    logs,
    latest,
    ensureBootstrapped,
    bootstrap,
    startLog,
    markStatus,
    addMarker,
    exportLogs
  };
});
