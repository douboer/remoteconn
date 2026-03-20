<template>
  <section class="page-root server-manager-page">
    <div class="page-toolbar server-manager-toolbar">
      <div class="toolbar-left">
        <button class="icon-btn" type="button" title="新增服务器" aria-label="新增服务器" @click="create">
          <span
            class="icon-mask"
            style="--icon: url(&quot;/icons/create.svg&quot;)"
            aria-hidden="true"
          ></span>
        </button>
        <button
          class="icon-btn"
          type="button"
          title="删除已选服务器"
          aria-label="删除已选服务器"
          :disabled="selectedServerIds.length === 0"
          @click="remove"
        >
          <span
            class="icon-mask"
            style="--icon: url(&quot;/icons/delete.svg&quot;)"
            aria-hidden="true"
          ></span>
        </button>
        <button
          class="icon-btn"
          type="button"
          :title="isAllSelected ? '取消全选服务器' : '全选服务器'"
          :aria-label="isAllSelected ? '取消全选服务器' : '全选服务器'"
          :disabled="!serverStore.servers.length"
          @click="toggleSelectAllServers"
        >
          <span
            class="icon-mask"
            style="--icon: url(&quot;/icons/selectall.svg&quot;)"
            aria-hidden="true"
          ></span>
        </button>
      </div>
      <div class="toolbar-spacer"></div>
      <h2 class="page-title">我的服务器</h2>
    </div>

    <div class="server-manager-content">
      <div class="server-search-wrap">
        <div class="server-search-shell">
          <input v-model="searchKeyword" class="server-search-input" type="search" placeholder="搜索服务器" />
          <button class="server-search-btn" type="button" title="搜索服务器" aria-label="搜索服务器">
            <span
              class="icon-mask"
              style="--icon: url(&quot;/icons/search.svg&quot;)"
              aria-hidden="true"
            ></span>
          </button>
        </div>
      </div>

      <div class="server-list-scroll surface-scroll">
        <div class="server-list-stack">
          <article
            v-for="item in filteredServers"
            :key="item.id"
            class="server-list-row"
            :class="{
              active: item.id === serverStore.selectedServerId,
              'is-dragging': draggingServerId === item.id,
              'is-drag-over': dragOverServerId === item.id
            }"
            :data-server-id="item.id"
            :style="dragRowStyle(item.id)"
          >
            <div class="server-row-check" @click.stop>
              <input
                :id="`server-check-${item.id}`"
                class="server-check-input"
                type="checkbox"
                :checked="selectedServerIds.includes(item.id)"
                @change="onServerCheckChanged(item.id, $event)"
              />
            </div>

            <div class="server-info server-info-clickable" @click="openServerSettings(item.id)">
              <div class="server-info-top">
                <p class="server-name">{{ item.name }}</p>
                <div class="server-row-actions" @click.stop>
                  <button
                    class="server-copy-btn"
                    type="button"
                    title="复制服务器配置"
                    aria-label="复制服务器配置"
                    @click.stop="copyServer(item)"
                  >
                    <span
                      class="icon-mask"
                      style="--icon: url(&quot;/icons/copy.svg&quot;)"
                      aria-hidden="true"
                    ></span>
                  </button>
                  <button
                    class="server-ai-btn"
                    :class="{ 'is-connected': isServerAiActive(item.id) }"
                    type="button"
                    :disabled="isConnectActionBlocked(item.id)"
                    title="AI 快速启动"
                    aria-label="AI 快速启动"
                    @click.stop="openCodexForServer(item)"
                  >
                    <span
                      class="icon-mask server-ai-icon"
                      :style="{ '--icon': `url(${aiIcon})` }"
                      aria-hidden="true"
                    ></span>
                  </button>
                  <button
                    class="connect-icon-btn"
                    :class="{
                      'is-connected': isServerConnected(item.id) || isServerResumable(item.id),
                      'is-connecting': isServerConnecting(item.id)
                    }"
                    type="button"
                    :disabled="isConnectActionBlocked(item.id)"
                    :title="connectButtonTitle(item.id)"
                    :aria-label="connectButtonTitle(item.id)"
                    @click.stop="quickConnect(item)"
                  >
                    <span
                      class="icon-mask"
                      style="--icon: url(&quot;/icons/connect.svg&quot;)"
                      aria-hidden="true"
                    ></span>
                  </button>
                  <button
                    class="server-move-btn"
                    type="button"
                    :disabled="!canDragReorder(item.id)"
                    title="拖拽手柄调整顺序"
                    aria-label="拖拽调整顺序"
                    @pointerdown.stop="onMoveHandlePointerDown(item.id, $event)"
                  >
                    <span
                      class="icon-mask server-move-icon"
                      :style="{ '--icon': `url(${moveIcon})` }"
                      aria-hidden="true"
                    ></span>
                  </button>
                </div>
              </div>

              <div class="server-info-meta">
                <p class="server-main">{{ item.username }}@{{ item.host }}:{{ item.port }}</p>
                <p class="server-auth">{{ item.authType }}</p>
              </div>

              <p class="server-recent">最近连接: {{ formatLastConnected(item.lastConnectedAt) }}</p>

              <div v-if="resolvedDisplayTags(item).length > 0" class="server-tags">
                <span
                  v-for="tag in resolvedDisplayTags(item)"
                  :key="`${item.id}-${tag.type}-${tag.label}`"
                  class="server-tag"
                  :class="{ 'server-tag-project': tag.type === 'project' }"
                >
                  {{ tag.label }}
                </span>
              </div>
            </div>
          </article>

          <p v-if="filteredServers.length === 0" class="server-empty-tip">暂无匹配服务器</p>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import type { ServerProfile } from "@/types/app";
import { useServerStore } from "@/stores/serverStore";
import { useSessionStore } from "@/stores/sessionStore";
import { useAppStore } from "@/stores/appStore";
import { formatActionError } from "@/utils/feedback";

type ServerDisplayTag = {
  type: "project" | "tag";
  label: string;
};

const serverStore = useServerStore();
const sessionStore = useSessionStore();
const appStore = useAppStore();
const router = useRouter();

const selectedServerIds = ref<string[]>([]);
const searchKeyword = ref("");
const connectingServerId = ref("");
const waitingConnectStates = new Set(["connecting", "auth_pending", "reconnecting"]);
const draggingServerId = ref("");
const dragOverServerId = ref("");
const dragPointerId = ref<number | null>(null);
const dragStartClientX = ref(0);
const dragStartClientY = ref(0);
const dragOffsetX = ref(0);
const dragOffsetY = ref(0);
const aiIcon = "/assets/icons/ai.svg";
const moveIcon = "/assets/icons/move.svg";

onMounted(async () => {
  await Promise.all([serverStore.ensureBootstrapped(), sessionStore.ensureBootstrapped()]);
});

onBeforeUnmount(() => {
  teardownPointerDragListeners();
  resetDragState();
});

const filteredServers = computed(() => {
  // 服务器管理页保留搜索框，并按名称/地址/用户/标签进行过滤。
  const keyword = searchKeyword.value.trim().toLowerCase();
  if (!keyword) return serverStore.servers;
  return serverStore.servers.filter((item) => {
    const haystack = [
      item.name,
      item.host,
      item.username,
      String(item.port),
      item.authType,
      resolvedDisplayTags(item)
        .map((tag) => tag.label)
        .join(" ")
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(keyword);
  });
});

const isAllSelected = computed(
  () =>
    serverStore.servers.length > 0 &&
    selectedServerIds.value.length === serverStore.servers.length &&
    serverStore.servers.every((item) => selectedServerIds.value.includes(item.id))
);

watch(
  () => serverStore.servers.map((item) => item.id),
  (ids) => {
    selectedServerIds.value = selectedServerIds.value.filter((id) => ids.includes(id));
  },
  { immediate: true }
);

async function create(): Promise<void> {
  selectedServerIds.value = [];
  await router.push("/server/new/settings");
}

async function remove(): Promise<void> {
  const targets = [...selectedServerIds.value];
  if (targets.length === 0) return;
  if (!window.confirm(`确认删除已选服务器（${targets.length} 台）吗？`)) return;

  for (const serverId of targets) {
    await serverStore.deleteServer(serverId);
  }

  selectedServerIds.value = [];
  appStore.notify("info", `已删除 ${targets.length} 台服务器`);
}

function toggleServerChecked(serverId: string, checked: boolean): void {
  if (checked) {
    if (!selectedServerIds.value.includes(serverId)) {
      selectedServerIds.value = [...selectedServerIds.value, serverId];
    }
    return;
  }
  selectedServerIds.value = selectedServerIds.value.filter((id) => id !== serverId);
}

function onServerCheckChanged(serverId: string, event: Event): void {
  const target = event.target as HTMLInputElement | null;
  toggleServerChecked(serverId, target?.checked ?? false);
}

function toggleSelectAllServers(): void {
  if (isAllSelected.value) {
    selectedServerIds.value = [];
    return;
  }
  selectedServerIds.value = serverStore.servers.map((item) => item.id);
}

async function quickConnect(server: ServerProfile): Promise<void> {
  if (isConnectActionBlocked(server.id)) return;
  setActiveServer(server.id);

  // 已连接同一服务器：直接进入终端复用现有会话，不做断开重连。
  if (isServerConnected(server.id)) {
    await router.push("/terminal");
    return;
  }

  connectingServerId.value = server.id;
  try {
    appStore.notify("info", `正在连接: ${server.username}@${server.host}:${server.port}`);
    const connectTask = sessionStore.connect({
      ...server,
      projectPresets: [...server.projectPresets],
      tags: [...server.tags],
      jumpHost: server.jumpHost ? { ...server.jumpHost } : undefined
    });
    await router.push("/terminal");
    await connectTask;
  } catch (error) {
    appStore.notify("error", formatActionError("连接失败", error));
  } finally {
    connectingServerId.value = "";
  }
}

async function openCodexForServer(server: ServerProfile): Promise<void> {
  if (isConnectActionBlocked(server.id)) return;
  setActiveServer(server.id);

  if (isServerConnected(server.id)) {
    await router.push({ path: "/terminal", query: { openCodex: "1" } });
    return;
  }

  connectingServerId.value = server.id;
  try {
    appStore.notify("info", `正在连接: ${server.username}@${server.host}:${server.port}`);
    const connectTask = sessionStore.connect({
      ...server,
      projectPresets: [...server.projectPresets],
      tags: [...server.tags],
      jumpHost: server.jumpHost ? { ...server.jumpHost } : undefined
    });
    await router.push({ path: "/terminal", query: { openCodex: "1" } });
    await connectTask;
  } catch (error) {
    appStore.notify("error", formatActionError("连接失败", error));
  } finally {
    connectingServerId.value = "";
  }
}

/**
 * 复制服务器配置：
 * 1) 新建独立服务器 ID，避免覆盖原配置；
 * 2) 名称按“原服务器名+copy”生成；
 * 3) 同步复制凭据，确保复制项可直接用于连接。
 */
async function copyServer(server: ServerProfile): Promise<void> {
  const copiedServerId = `srv-${crypto.randomUUID()}`;
  const copiedServerName = `${String(server.name || "未命名服务器")}copy`;
  const copiedServer: ServerProfile = {
    ...server,
    id: copiedServerId,
    name: copiedServerName,
    projectPresets: [...server.projectPresets],
    tags: [...server.tags],
    jumpHost: server.jumpHost ? { ...server.jumpHost } : undefined,
    lastConnectedAt: ""
  };

  try {
    await serverStore.saveServer(copiedServer);
    const credentialSnapshot = await serverStore.getCredentialBundleInput(server.id);
    if (credentialSnapshot) {
      await serverStore.saveCredential(
        copiedServerId,
        {
          ...credentialSnapshot.target
        },
        credentialSnapshot.jump ? { ...credentialSnapshot.jump } : null
      );
    }
    setActiveServer(copiedServerId);
    appStore.notify("info", `已复制服务器: ${copiedServerName}`);
  } catch (error) {
    appStore.notify("error", formatActionError("复制服务器失败", error));
  }
}

function canDragReorder(serverId: string): boolean {
  return serverStore.servers.some((item) => item.id === serverId);
}

function resetDragState(): void {
  draggingServerId.value = "";
  dragOverServerId.value = "";
  dragPointerId.value = null;
  dragStartClientX.value = 0;
  dragStartClientY.value = 0;
  dragOffsetX.value = 0;
  dragOffsetY.value = 0;
}

/**
 * 仅在当前被拖拽的卡片上注入位移变量，用于视觉跟手。
 */
function dragRowStyle(serverId: string): Record<string, string> | undefined {
  if (draggingServerId.value !== serverId) {
    return undefined;
  }
  return {
    "--drag-x": `${dragOffsetX.value}px`,
    "--drag-y": `${dragOffsetY.value}px`
  };
}

function teardownPointerDragListeners(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.removeEventListener("pointermove", onPointerDragMove);
  window.removeEventListener("pointerup", onPointerDragUp);
  window.removeEventListener("pointercancel", onPointerDragCancel);
  if (typeof document !== "undefined") {
    document.removeEventListener("pointermove", onPointerDragMove, true);
    document.removeEventListener("pointerup", onPointerDragUp, true);
    document.removeEventListener("pointercancel", onPointerDragCancel, true);
  }
}

function setupPointerDragListeners(): void {
  if (typeof window === "undefined") {
    return;
  }
  teardownPointerDragListeners();
  // 部分 WebView/浏览器对 window 冒泡阶段的 pointer 事件投递不稳定，这里同时监听
  // window 与 document(capture) 做兼容兜底，确保拖拽过程可持续接收 move/up。
  window.addEventListener("pointermove", onPointerDragMove, { passive: false });
  window.addEventListener("pointerup", onPointerDragUp, { passive: false });
  window.addEventListener("pointercancel", onPointerDragCancel, { passive: false });
  if (typeof document !== "undefined") {
    document.addEventListener("pointermove", onPointerDragMove, { passive: false, capture: true });
    document.addEventListener("pointerup", onPointerDragUp, { passive: false, capture: true });
    document.addEventListener("pointercancel", onPointerDragCancel, { passive: false, capture: true });
  }
}

function onMoveHandlePointerDown(serverId: string, event: PointerEvent): void {
  if (!canDragReorder(serverId)) {
    return;
  }
  event.preventDefault();
  draggingServerId.value = serverId;
  dragOverServerId.value = "";
  dragPointerId.value = event.pointerId;
  dragStartClientX.value = event.clientX;
  dragStartClientY.value = event.clientY;
  dragOffsetX.value = 0;
  dragOffsetY.value = 0;
  setupPointerDragListeners();
}

function resolveCardIdByPoint(clientX: number, clientY: number): string {
  if (typeof document === "undefined") {
    return "";
  }
  const target = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
  const card = target?.closest<HTMLElement>("[data-server-id]");
  if (card?.dataset.serverId && card.dataset.serverId !== draggingServerId.value) {
    return card.dataset.serverId;
  }

  // elementFromPoint 在少数环境可能命中浮层/伪元素，兜底按 y 坐标命中行元素。
  const rows = Array.from(document.querySelectorAll<HTMLElement>(".server-list-row[data-server-id]"));
  for (const row of rows) {
    if (row.dataset.serverId === draggingServerId.value) {
      continue;
    }
    const rect = row.getBoundingClientRect();
    if (clientY >= rect.top && clientY <= rect.bottom) {
      return row.dataset.serverId ?? "";
    }
  }
  return "";
}

function onPointerDragMove(event: PointerEvent): void {
  if (!draggingServerId.value || dragPointerId.value !== event.pointerId) {
    return;
  }
  event.preventDefault();
  // 记录手势位移，让卡片产生“跟手移动”的视觉反馈。
  dragOffsetX.value = event.clientX - dragStartClientX.value;
  dragOffsetY.value = event.clientY - dragStartClientY.value;
  const targetServerId = resolveCardIdByPoint(event.clientX, event.clientY);
  if (!targetServerId || targetServerId === draggingServerId.value) {
    dragOverServerId.value = "";
    return;
  }
  dragOverServerId.value = targetServerId;
}

async function applyReorderByIds(sourceServerId: string, targetServerId: string): Promise<void> {
  const nextIds = serverStore.servers.map((item) => item.id);
  const sourceIndex = nextIds.indexOf(sourceServerId);
  const targetIndex = nextIds.indexOf(targetServerId);
  if (sourceIndex < 0 || targetIndex < 0) {
    return;
  }
  // 拖拽落到目标项时：
  // - 向下拖拽：插入到目标项后方；
  // - 向上拖拽：插入到目标项前方。
  // 这样可避免“拖到相邻下一项却无变化”的问题。
  nextIds.splice(sourceIndex, 1);
  const normalizedTargetIndex = nextIds.indexOf(targetServerId);
  if (normalizedTargetIndex < 0) {
    return;
  }
  const insertIndex = sourceIndex < targetIndex ? normalizedTargetIndex + 1 : normalizedTargetIndex;
  nextIds.splice(insertIndex, 0, sourceServerId);

  try {
    await serverStore.applyServerOrder(nextIds);
  } catch (error) {
    appStore.notify("error", formatActionError("调整服务器顺序失败", error));
  }
}

async function onPointerDragUp(event: PointerEvent): Promise<void> {
  if (dragPointerId.value !== event.pointerId) {
    return;
  }
  event.preventDefault();
  const sourceServerId = draggingServerId.value;
  const targetServerId = dragOverServerId.value || resolveCardIdByPoint(event.clientX, event.clientY);
  teardownPointerDragListeners();
  resetDragState();
  if (!sourceServerId || !targetServerId || sourceServerId === targetServerId) {
    return;
  }
  await applyReorderByIds(sourceServerId, targetServerId);
}

function onPointerDragCancel(event: PointerEvent): void {
  if (dragPointerId.value !== event.pointerId) {
    return;
  }
  event.preventDefault();
  teardownPointerDragListeners();
  resetDragState();
}

function isServerConnected(serverId: string): boolean {
  return sessionStore.state === "connected" && sessionStore.currentServerId === serverId;
}

function isServerResumable(serverId: string): boolean {
  return sessionStore.isServerResumable(serverId);
}

function isServerAiActive(serverId: string): boolean {
  return sessionStore.isServerAiActive(serverId);
}

function isServerConnecting(serverId: string): boolean {
  return waitingConnectStates.has(sessionStore.state) && sessionStore.currentServerId === serverId;
}

function isConnectActionBlocked(serverId: string): boolean {
  if (isServerConnected(serverId)) {
    return false;
  }
  if (connectingServerId.value) {
    return true;
  }
  return waitingConnectStates.has(sessionStore.state);
}

function connectButtonTitle(serverId: string): string {
  if (isServerConnected(serverId)) {
    return "进入当前会话";
  }
  if (isServerResumable(serverId)) {
    return "恢复会话";
  }
  if (isServerConnecting(serverId)) {
    return "连接中";
  }
  return "连接服务器";
}

function setActiveServer(serverId: string): void {
  serverStore.selectedServerId = serverId;
}

async function openServerSettings(serverId: string): Promise<void> {
  if (!serverId) return;
  setActiveServer(serverId);
  await router.push(`/server/${encodeURIComponent(serverId)}/settings`);
}

function formatLastConnected(lastConnectedAt?: string): string {
  return lastConnectedAt || "无连接";
}

/**
 * 提取 projectPath 的最后一级目录名：
 * 1. 先裁掉首尾空白与尾部斜杠；
 * 2. 同时兼容 / 与 \ 两类路径分隔符；
 * 3. 仅返回短目录名，避免卡片底部胶囊过长。
 */
function resolveProjectDirectoryName(projectPath?: string): string {
  const normalized = String(projectPath || "")
    .trim()
    .replace(/[\\/]+$/g, "");
  if (!normalized) {
    return "";
  }
  const segments = normalized.split(/[\\/]+/).filter(Boolean);
  if (segments.length === 0) {
    return normalized === "~" ? "~" : "";
  }
  return segments[segments.length - 1] || "";
}

function resolvedTags(server: ServerProfile): string[] {
  if (server.tags.length > 0) return server.tags;

  // 对齐原型示例：老数据未配置 tags 时，按服务器名称提供展示级回退标签。
  if (server.name.includes("生产")) return ["prod", "beijing"];
  if (server.name.includes("测试")) return ["test", "杭州"];
  return [];
}

/**
 * 服务器卡片底部展示标签：
 * 1. 项目目录胶囊固定放在最前面；
 * 2. 其后继续展示用户 tags；
 * 3. 模板依据 type 区分 project/tag 的底色。
 */
function resolvedDisplayTags(server: ServerProfile): ServerDisplayTag[] {
  const displayTags: ServerDisplayTag[] = [];
  const projectDirectoryName = resolveProjectDirectoryName(server.projectPath);
  if (projectDirectoryName) {
    displayTags.push({
      type: "project",
      label: `pro:${projectDirectoryName}`
    });
  }
  for (const tag of resolvedTags(server)) {
    displayTags.push({
      type: "tag",
      label: tag
    });
  }
  return displayTags;
}
</script>
