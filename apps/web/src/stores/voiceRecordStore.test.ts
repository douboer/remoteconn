import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import type { VoiceRecord } from "@/types/app";

const { dbState, dbMock } = vi.hoisted(() => {
  const state = {
    voiceRecords: [] as VoiceRecord[]
  };

  const cloneRecord = (item: VoiceRecord): VoiceRecord => ({
    ...item
  });

  const upsertRecord = (item: VoiceRecord): void => {
    const index = state.voiceRecords.findIndex((row) => row.id === item.id);
    if (index >= 0) {
      state.voiceRecords[index] = cloneRecord(item);
    } else {
      state.voiceRecords.push(cloneRecord(item));
    }
  };

  const db = {
    voiceRecords: {
      toArray: vi.fn(async () => state.voiceRecords.map((row) => cloneRecord(row))),
      put: vi.fn(async (item: VoiceRecord) => {
        upsertRecord(item);
      }),
      delete: vi.fn(async (id: string) => {
        state.voiceRecords = state.voiceRecords.filter((row) => row.id !== id);
      })
    }
  };

  return {
    dbState: state,
    dbMock: db
  };
});

vi.mock("@/services/storage/db", () => ({
  db: dbMock
}));

import { useVoiceRecordStore } from "./voiceRecordStore";

describe("voiceRecordStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    dbState.voiceRecords = [];
    dbMock.voiceRecords.toArray.mockClear();
    dbMock.voiceRecords.put.mockClear();
    dbMock.voiceRecords.delete.mockClear();
  });

  it("启动后按 createdAt 倒序输出 latest", async () => {
    dbState.voiceRecords = [
      {
        id: "r1",
        content: "one",
        createdAt: "2026-02-27T00:00:01.000Z",
        updatedAt: "2026-02-27T00:00:01.000Z",
        serverId: "s1",
        category: "问题",
        contextLabel: "alpha-demo"
      },
      {
        id: "r2",
        content: "two",
        createdAt: "2026-02-27T00:00:03.000Z",
        updatedAt: "2026-02-27T00:00:03.000Z",
        serverId: "s1",
        category: "优化",
        contextLabel: "alpha-demo"
      },
      {
        id: "r3",
        content: "three",
        createdAt: "2026-02-27T00:00:02.000Z",
        updatedAt: "2026-02-27T00:00:02.000Z",
        serverId: "s2",
        category: "灵感",
        contextLabel: "beta-api"
      }
    ];

    const store = useVoiceRecordStore();
    await store.ensureBootstrapped();

    expect(store.latest.map((item) => item.id)).toEqual(["r2", "r3", "r1"]);
  });

  it("addRecord 写入前会 trim，空文本不入库", async () => {
    const store = useVoiceRecordStore();
    await store.ensureBootstrapped();

    const empty = await store.addRecord("   ", "s1");
    expect(empty).toBeNull();
    expect(dbMock.voiceRecords.put).toHaveBeenCalledTimes(0);

    const created = await store.addRecord("  hello world  ", "s1", {
      category: "新需求",
      contextLabel: "alpha-demo"
    });
    expect(created).not.toBeNull();
    expect(created?.content).toBe("hello world");
    expect(created?.category).toBe("新需求");
    expect(created?.contextLabel).toBe("alpha-demo");
    expect(dbMock.voiceRecords.put).toHaveBeenCalledTimes(1);
    expect(store.latest[0]?.content).toBe("hello world");
  });

  it("removeRecord 会更新内存并持久化删除", async () => {
    dbState.voiceRecords = [
      {
        id: "r1",
        content: "one",
        createdAt: "2026-02-27T00:00:01.000Z",
        updatedAt: "2026-02-27T00:00:01.000Z",
        serverId: "s1",
        category: "问题",
        contextLabel: "alpha-demo"
      }
    ];

    const store = useVoiceRecordStore();
    await store.ensureBootstrapped();

    await store.removeRecord("r1");
    expect(dbMock.voiceRecords.delete).toHaveBeenCalledWith("r1");
    expect(store.records.length).toBe(0);
  });

  it("updateRecord 会更新内容、分类和 updatedAt", async () => {
    dbState.voiceRecords = [
      {
        id: "r1",
        content: "old",
        createdAt: "2026-02-27T00:00:01.000Z",
        updatedAt: "2026-02-27T00:00:01.000Z",
        serverId: "s1",
        category: "问题",
        contextLabel: "alpha-demo"
      }
    ];

    const store = useVoiceRecordStore();
    await store.ensureBootstrapped();

    const updated = await store.updateRecord({
      id: "r1",
      content: "  new content  ",
      category: "优化"
    });

    expect(updated?.content).toBe("new content");
    expect(updated?.category).toBe("优化");
    expect(updated?.updatedAt).not.toBe("2026-02-27T00:00:01.000Z");
    expect(dbMock.voiceRecords.put).toHaveBeenCalledTimes(1);
  });

  it("search 会按关键字与分类过滤", async () => {
    dbState.voiceRecords = [
      {
        id: "r1",
        content: "修正连接超时",
        createdAt: "2026-02-27T00:00:01.000Z",
        updatedAt: "2026-02-27T00:00:01.000Z",
        serverId: "s1",
        category: "优化",
        contextLabel: "alpha-demo"
      },
      {
        id: "r2",
        content: "记录新的终端问题",
        createdAt: "2026-02-27T00:00:02.000Z",
        updatedAt: "2026-02-27T00:00:02.000Z",
        serverId: "s2",
        category: "问题",
        contextLabel: "beta-api"
      }
    ];

    const store = useVoiceRecordStore();
    await store.ensureBootstrapped();

    expect(store.search({ keyword: "alpha" }).map((item) => item.id)).toEqual(["r1"]);
    expect(store.search({ category: "问题" }).map((item) => item.id)).toEqual(["r2"]);
  });

  it("exportRecords 会包含分类、上下文和更新时间", async () => {
    dbState.voiceRecords = [
      {
        id: "r1",
        content: "修正连接超时",
        createdAt: "2026-02-27T00:00:01.000Z",
        updatedAt: "2026-02-27T00:00:03.000Z",
        serverId: "s1",
        category: "优化",
        contextLabel: "alpha-demo"
      }
    ];

    const store = useVoiceRecordStore();
    await store.ensureBootstrapped();

    const exported = store.exportRecords();
    expect(exported).toContain("updatedAt");
    expect(exported).toContain("category: 优化");
    expect(exported).toContain("contextLabel: alpha-demo");
  });
});
