import { defineStore } from "pinia";
import { computed, toRaw, ref } from "vue";
import { DEFAULT_JUMP_HOST } from "@remoteconn/shared";
import type { CredentialRef, JumpHostProfile, ResolvedCredential, ServerProfile } from "@/types/app";
import { db } from "@/services/storage/db";
import { decryptCredential, encryptCredential } from "@/services/security/credentialVault";
import { nowIso } from "@/utils/time";

interface ServerCredentialInput {
  type: CredentialRef["type"];
  password?: string;
  privateKey?: string;
  passphrase?: string;
  certificate?: string;
}

interface ServerCredentialBundleInput {
  target: ServerCredentialInput;
  jump?: ServerCredentialInput | null;
}

/**
 * 服务器与凭据管理。
 */
export const useServerStore = defineStore("server", () => {
  const servers = ref<ServerProfile[]>([]);
  const credentialRefs = ref<CredentialRef[]>([]);
  const selectedServerId = ref<string>("");
  const loaded = ref(false);
  let bootstrapPromise: Promise<void> | null = null;

  function cloneJumpHost(input?: Partial<JumpHostProfile> | null): JumpHostProfile {
    return {
      ...DEFAULT_JUMP_HOST,
      ...(input ?? {}),
      enabled: input?.enabled === true,
      host: String(input?.host ?? "").trim(),
      port: Number(input?.port ?? DEFAULT_JUMP_HOST.port) || DEFAULT_JUMP_HOST.port,
      username: String(input?.username ?? "").trim(),
      authType:
        input?.authType === "privateKey" || input?.authType === "certificate" ? input.authType : DEFAULT_JUMP_HOST.authType
    };
  }

  function normalizeCredentialInput(
    value: Partial<ServerCredentialInput> | null | undefined,
    fallbackType: CredentialRef["type"] = "password"
  ): ServerCredentialInput {
    const type = value?.type === "privateKey" || value?.type === "certificate" || value?.type === "password" ? value.type : fallbackType;
    return {
      type,
      password: String(value?.password ?? ""),
      privateKey: String(value?.privateKey ?? ""),
      passphrase: String(value?.passphrase ?? ""),
      certificate: String(value?.certificate ?? "")
    };
  }

  /**
   * 兼容两类密文结构：
   * 1. 历史版本：直接保存单份 `ServerCredentialInput`；
   * 2. 新版本：保存 `{ target, jump }` 凭据包。
   */
  function normalizeCredentialBundle(
    value: unknown,
    fallbackType: CredentialRef["type"],
    jumpAuthType: CredentialRef["type"] | null = null
  ): ServerCredentialBundleInput {
    const source = value && typeof value === "object" ? (value as Partial<ServerCredentialBundleInput & ServerCredentialInput>) : {};
    const hasTarget = source && typeof source === "object" && "target" in source;
    const target = hasTarget
      ? normalizeCredentialInput(source.target, fallbackType)
      : normalizeCredentialInput(source as Partial<ServerCredentialInput>, fallbackType);
    const jumpRaw = hasTarget ? source.jump : null;
    return {
      target,
      jump: jumpAuthType ? normalizeCredentialInput(jumpRaw, jumpAuthType) : null
    };
  }

  function toResolvedCredential(input: ServerCredentialInput): ResolvedCredential {
    if (input.type === "password") {
      return {
        type: "password",
        password: input.password ?? ""
      };
    }

    if (input.type === "privateKey") {
      return {
        type: "privateKey",
        privateKey: input.privateKey ?? "",
        passphrase: input.passphrase
      };
    }

    return {
      type: "certificate",
      privateKey: input.privateKey ?? "",
      passphrase: input.passphrase,
      certificate: input.certificate ?? ""
    };
  }

  const selectedServer = computed(() => servers.value.find((item) => item.id === selectedServerId.value));

  /**
   * 规范化排序值：
   * - 非数字、NaN、负值都视为“缺失排序”；
   * - 仅保留非负整数，避免浮点或异常值污染排序稳定性。
   */
  function normalizeSortOrder(value: unknown): number | null {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return null;
    }
    const normalized = Math.floor(value);
    if (normalized < 0) {
      return null;
    }
    return normalized;
  }

  /**
   * 按持久化排序字段恢复列表顺序：
   * - 优先按 sortOrder 升序；
   * - 缺失 sortOrder 的历史数据保留原始读取顺序；
   * - 排序值冲突时回退到原始顺序，保证稳定排序。
   */
  function sortServersByStoredOrder(input: ServerProfile[]): ServerProfile[] {
    return input
      .map((server, index) => ({
        server,
        index,
        sortOrder: normalizeSortOrder(server.sortOrder)
      }))
      .sort((a, b) => {
        if (a.sortOrder === null && b.sortOrder === null) {
          return a.index - b.index;
        }
        if (a.sortOrder === null) {
          return 1;
        }
        if (b.sortOrder === null) {
          return -1;
        }
        if (a.sortOrder !== b.sortOrder) {
          return a.sortOrder - b.sortOrder;
        }
        return a.index - b.index;
      })
      .map((entry) => entry.server);
  }

  /**
   * 将当前数组顺序重写为连续 sortOrder，并回写到数据库。
   * 约束：
   * - 不改变入参数组的相对顺序；
   * - 所有项强制回填 sortOrder，保证刷新后顺序稳定可恢复。
   */
  async function persistServerOrder(nextServers: ServerProfile[]): Promise<void> {
    const ordered = nextServers.map((server, index) => {
      const entity = toServerEntity(server);
      return {
        ...entity,
        sortOrder: index
      };
    });
    servers.value = ordered;
    await db.servers.bulkPut(ordered.map((item) => toServerEntity(item)));
  }

  async function ensureBootstrapped(): Promise<void> {
    if (loaded.value) return;
    if (bootstrapPromise) {
      await bootstrapPromise;
      return;
    }

    bootstrapPromise = (async () => {
      const storedServers = await db.servers.toArray();
      credentialRefs.value = await db.credentialRefs.toArray();

      if (storedServers.length === 0) {
        const sample = buildDefaultServer();
        await persistServerOrder([sample]);
      } else {
        const sortedServers = sortServersByStoredOrder(storedServers);
        const needsPersist = sortedServers.some((server, index) => {
          const current = storedServers[index];
          return server.id !== current?.id || normalizeSortOrder(server.sortOrder) !== index;
        });
        if (needsPersist) {
          await persistServerOrder(sortedServers);
        } else {
          servers.value = sortedServers.map((server) => toServerEntity(server));
        }
      }

      selectedServerId.value = servers.value[0]?.id ?? "";
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

  function buildDefaultServer(): ServerProfile {
    return {
      id: `srv-${crypto.randomUUID()}`,
      name: "新服务器",
      host: "",
      port: 22,
      username: "root",
      authType: "password",
      projectPath: "~/workspace",
      projectPresets: ["~/workspace"],
      tags: [],
      timeoutSeconds: 20,
      heartbeatSeconds: 15,
      transportMode: "gateway",
      jumpHost: cloneJumpHost(),
      sortOrder: 0,
      lastConnectedAt: ""
    };
  }

  /**
   * 仅创建“新服务器草稿”快照，不写入列表与数据库。
   * 用于“新增服务器先进入配置页，保存后再落库”的流程。
   */
  function createServerDraft(): ServerProfile {
    return buildDefaultServer();
  }

  /**
   * 将服务器对象转换为可安全写入 IndexedDB 的纯数据实体。
   * 目的：避免 Vue Proxy 透传到 Dexie 触发 DataCloneError。
   */
  function toServerEntity(server: ServerProfile): ServerProfile {
    const raw = toRaw(server);
    return {
      ...raw,
      projectPresets: [...raw.projectPresets],
      tags: [...raw.tags],
      jumpHost: cloneJumpHost(raw.jumpHost)
    };
  }

  async function createServer(): Promise<void> {
    const sample = createServerDraft();
    await persistServerOrder([sample, ...servers.value]);
    selectedServerId.value = sample.id;
  }

  async function saveServer(server: ServerProfile): Promise<void> {
    const nextServers = [...servers.value];
    const index = servers.value.findIndex((item) => item.id === server.id);
    if (index >= 0) {
      nextServers[index] = server;
    } else {
      nextServers.unshift(server);
    }
    await persistServerOrder(nextServers);
  }

  async function deleteServer(serverId: string): Promise<void> {
    const nextServers = servers.value.filter((item) => item.id !== serverId);
    await db.servers.delete(serverId);
    await persistServerOrder(nextServers);
    if (selectedServerId.value === serverId) {
      selectedServerId.value = servers.value[0]?.id ?? "";
    }
  }

  /**
   * 将指定服务器上移一位。
   * 返回：
   * - true: 已成功移动并持久化；
   * - false: 不存在或已在顶部，无需移动。
   */
  async function moveServerUp(serverId: string): Promise<boolean> {
    const index = servers.value.findIndex((item) => item.id === serverId);
    if (index <= 0) {
      return false;
    }
    const nextServers = [...servers.value];
    const previous = nextServers[index - 1];
    const current = nextServers[index];
    if (!previous || !current) {
      return false;
    }
    nextServers[index - 1] = current;
    nextServers[index] = previous;
    await persistServerOrder(nextServers);
    return true;
  }

  /**
   * 将指定服务器下移一位。
   * 返回：
   * - true: 已成功移动并持久化；
   * - false: 不存在或已在底部，无需移动。
   */
  async function moveServerDown(serverId: string): Promise<boolean> {
    const index = servers.value.findIndex((item) => item.id === serverId);
    if (index < 0 || index >= servers.value.length - 1) {
      return false;
    }
    const nextServers = [...servers.value];
    const current = nextServers[index];
    const next = nextServers[index + 1];
    if (!current || !next) {
      return false;
    }
    nextServers[index] = next;
    nextServers[index + 1] = current;
    await persistServerOrder(nextServers);
    return true;
  }

  /**
   * 按传入 ID 顺序重排服务器列表并持久化。
   * 规则：
   * - `orderedIds` 中不存在/重复的项会被忽略；
   * - 未出现在 `orderedIds` 的服务器按原顺序追加到末尾；
   * - 若顺序无变化，返回 false。
   */
  async function applyServerOrder(orderedIds: string[]): Promise<boolean> {
    const byId = new Map(servers.value.map((server) => [server.id, server] as const));
    const seen = new Set<string>();
    const head: ServerProfile[] = [];

    for (const id of orderedIds) {
      if (!id || seen.has(id)) {
        continue;
      }
      const matched = byId.get(id);
      if (!matched) {
        continue;
      }
      seen.add(id);
      head.push(matched);
    }

    const tail = servers.value.filter((server) => !seen.has(server.id));
    const nextServers = [...head, ...tail];

    if (
      nextServers.length === servers.value.length &&
      nextServers.every((server, index) => server.id === servers.value[index]?.id)
    ) {
      return false;
    }

    await persistServerOrder(nextServers);
    return true;
  }

  async function saveCredential(
    refId: string,
    payload: ServerCredentialInput,
    jumpPayload?: ServerCredentialInput | null
  ): Promise<CredentialRef> {
    const exists = credentialRefs.value.find((item) => item.id === refId);
    const now = nowIso();

    const ref: CredentialRef = {
      id: refId,
      type: payload.type,
      secureStoreKey: `web:credential:${refId}`,
      createdAt: exists?.createdAt ?? now,
      updatedAt: now
    };

    await db.credentialRefs.put(ref);
    await db.credentials.where("refId").equals(refId).delete();
    const encrypted = await encryptCredential(refId, {
      target: normalizeCredentialInput(payload, payload.type),
      jump: jumpPayload ? normalizeCredentialInput(jumpPayload, jumpPayload.type) : null
    } satisfies ServerCredentialBundleInput);
    await db.credentials.put(encrypted);

    const idx = credentialRefs.value.findIndex((item) => item.id === refId);
    if (idx >= 0) {
      credentialRefs.value[idx] = ref;
    } else {
      credentialRefs.value.push(ref);
    }

    return ref;
  }

  async function resolveCredential(refId: string): Promise<ResolvedCredential> {
    const bundle = await resolveCredentialBundle(refId);
    return bundle.target;
  }

  async function resolveCredentialBundle(
    refId: string,
    jumpAuthType: CredentialRef["type"] | null = null
  ): Promise<{ target: ResolvedCredential; jump: ResolvedCredential | null }> {
    const ref = credentialRefs.value.find((item) => item.id === refId);
    if (!ref) {
      throw new Error("凭据引用不存在");
    }

    const payload = await db.credentials.where("refId").equals(refId).first();
    if (!payload) {
      throw new Error("未找到凭据内容");
    }

    const decrypted = await decryptCredential<ServerCredentialBundleInput | ServerCredentialInput>(payload);
    const bundle = normalizeCredentialBundle(decrypted, ref.type, jumpAuthType);
    return {
      target: toResolvedCredential(bundle.target),
      jump: bundle.jump ? toResolvedCredential(bundle.jump) : null
    };
  }

  async function getCredentialInput(refId: string): Promise<ServerCredentialInput | null> {
    const bundle = await getCredentialBundleInput(refId);
    return bundle?.target ?? null;
  }

  async function getCredentialBundleInput(refId: string): Promise<ServerCredentialBundleInput | null> {
    const payload = await db.credentials.where("refId").equals(refId).first();
    if (!payload) {
      return null;
    }
    const ref = credentialRefs.value.find((item) => item.id === refId);
    const fallbackType = ref?.type ?? "password";
    const decrypted = await decryptCredential<ServerCredentialBundleInput | ServerCredentialInput>(payload);
    return normalizeCredentialBundle(decrypted, fallbackType, "password");
  }

  async function markConnected(serverId: string): Promise<void> {
    const target = servers.value.find((item) => item.id === serverId);
    if (!target) return;
    target.lastConnectedAt = nowIso();
    await db.servers.put(toServerEntity(target));
  }

  return {
    servers,
    credentialRefs,
    selectedServerId,
    selectedServer,
    ensureBootstrapped,
    bootstrap,
    createServerDraft,
    createServer,
    saveServer,
    deleteServer,
    moveServerUp,
    moveServerDown,
    applyServerOrder,
    saveCredential,
    resolveCredential,
    resolveCredentialBundle,
    getCredentialInput,
    getCredentialBundleInput,
    markConnected
  };
});
