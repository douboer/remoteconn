import { defineStore } from "pinia";
import { computed, ref, toRaw } from "vue";
import type { VoiceRecord } from "@/types/app";
import { db } from "@/services/storage/db";
import { nowIso } from "@/utils/time";
import { DEFAULT_VOICE_RECORD_CATEGORY_FALLBACK } from "@/utils/defaults";

interface AddVoiceRecordInput {
  category?: string;
  contextLabel?: string;
}

interface UpdateVoiceRecordInput {
  id: string;
  content: string;
  category: string;
}

interface SearchVoiceRecordInput {
  keyword?: string;
  category?: string;
}

/**
 * 闪念记录存储与导出。
 */
export const useVoiceRecordStore = defineStore("voiceRecord", () => {
  const records = ref<VoiceRecord[]>([]);
  const loaded = ref(false);
  let bootstrapPromise: Promise<void> | null = null;

  const latest = computed(() => [...records.value].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)));

  function normalizeCategory(value: string): string {
    const normalized = String(value ?? "").trim();
    return normalized || DEFAULT_VOICE_RECORD_CATEGORY_FALLBACK;
  }

  /**
   * 将历史记录补齐到最新结构，避免 UI 层反复做兼容判断。
   */
  function normalizeRecord(item: VoiceRecord): VoiceRecord {
    const raw = toRaw(item);
    const createdAt = String(raw.createdAt || nowIso());
    return {
      id: String(raw.id),
      content: String(raw.content ?? "").trim(),
      createdAt,
      updatedAt: String(raw.updatedAt || createdAt),
      serverId: String(raw.serverId ?? ""),
      category: normalizeCategory(raw.category),
      contextLabel: String(raw.contextLabel ?? "")
    };
  }

  async function ensureBootstrapped(): Promise<void> {
    if (loaded.value) return;
    if (bootstrapPromise) {
      await bootstrapPromise;
      return;
    }
    bootstrapPromise = (async () => {
      records.value = (await db.voiceRecords.toArray()).map((item) => normalizeRecord(item));
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

  /**
   * 统一做实体快照，避免 Vue Proxy 直接写入 IndexedDB 触发 DataCloneError。
   */
  function toVoiceRecordEntity(item: VoiceRecord): VoiceRecord {
    return normalizeRecord(item);
  }

  async function addRecord(content: string, serverId = "", options: AddVoiceRecordInput = {}): Promise<VoiceRecord | null> {
    const normalizedContent = String(content ?? "").trim();
    if (!normalizedContent) {
      return null;
    }

    const timestamp = nowIso();
    const next: VoiceRecord = {
      id: `voice-${crypto.randomUUID()}`,
      content: normalizedContent,
      createdAt: timestamp,
      updatedAt: timestamp,
      serverId: String(serverId || ""),
      category: normalizeCategory(options.category ?? DEFAULT_VOICE_RECORD_CATEGORY_FALLBACK),
      contextLabel: String(options.contextLabel ?? "")
    };
    records.value.unshift(next);
    await db.voiceRecords.put(toVoiceRecordEntity(next));
    return next;
  }

  async function updateRecord(payload: UpdateVoiceRecordInput): Promise<VoiceRecord | null> {
    const recordId = String(payload.id || "");
    const normalizedContent = String(payload.content ?? "").trim();
    if (!recordId || !normalizedContent) {
      return null;
    }

    const index = records.value.findIndex((item) => item.id === recordId);
    if (index < 0) {
      return null;
    }

    const current = records.value[index];
    if (!current) {
      return null;
    }

    const next: VoiceRecord = {
      ...current,
      content: normalizedContent,
      category: normalizeCategory(payload.category),
      updatedAt: nowIso()
    };
    records.value[index] = next;
    await db.voiceRecords.put(toVoiceRecordEntity(next));
    return next;
  }

  async function removeRecord(recordId: string): Promise<void> {
    const nextId = String(recordId || "");
    if (!nextId) return;
    records.value = records.value.filter((item) => item.id !== nextId);
    await db.voiceRecords.delete(nextId);
  }

  function search(input: SearchVoiceRecordInput = {}): VoiceRecord[] {
    const keyword = String(input.keyword ?? "").trim().toLowerCase();
    const category = String(input.category ?? "").trim();
    return latest.value.filter((item) => {
      if (category && item.category !== category) {
        return false;
      }
      if (!keyword) {
        return true;
      }
      const haystack = [item.content, item.category, item.contextLabel, item.createdAt].join(" ").toLowerCase();
      return haystack.includes(keyword);
    });
  }

  function exportRecords(): string {
    const rows = latest.value.map((item) => {
      return [
        `## ${item.id}`,
        `- createdAt: ${item.createdAt}`,
        `- updatedAt: ${item.updatedAt}`,
        `- serverId: ${item.serverId || "--"}`,
        `- category: ${item.category}`,
        `- contextLabel: ${item.contextLabel || "--"}`,
        `- content:`,
        item.content
      ].join("\n");
    });
    return [`# RemoteConn Voice Records Export ${nowIso()}`, "", ...rows].join("\n\n");
  }

  return {
    records,
    latest,
    ensureBootstrapped,
    bootstrap,
    addRecord,
    updateRecord,
    removeRecord,
    search,
    exportRecords
  };
});
