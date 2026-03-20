<template>
  <section class="page-root logs-page">
    <div class="page-toolbar">
      <div class="toolbar-left">
        <button
          class="icon-btn"
          type="button"
          title="返回上一页"
          aria-label="返回上一页"
          :disabled="!canGoBack"
          @click="goBack"
        >
          <span class="icon-mask" style="--icon: url('/icons/back.svg')" aria-hidden="true"></span>
        </button>
      </div>
      <div class="toolbar-spacer"></div>
      <h2 class="page-title">日志</h2>
    </div>

    <article class="surface-panel">
      <div class="actions">
        <button class="btn" @click="download">导出脱敏日志</button>
        <span class="settings-save-status">共 {{ totalLogs }} 条</span>
      </div>
      <div class="surface-scroll list-stack">
        <article v-for="item in pagedLogs" :key="item.sessionId" class="log-item">
          <div class="item-title">{{ item.sessionId }} · {{ item.status }}</div>
          <div class="item-sub">server: {{ item.serverId }}</div>
          <div class="item-sub">{{ item.startAt }} -> {{ item.endAt ?? '--' }}</div>
          <div class="item-sub">commands: {{ item.commandMarkers.length }} · error: {{ item.error ?? '-' }}</div>
        </article>
        <p v-if="pagedLogs.length === 0" class="server-empty-tip">暂无日志</p>
      </div>
      <div class="records-pagination">
        <button class="btn" type="button" :disabled="currentPage <= 1" @click="currentPage -= 1">上一页</button>
        <span class="records-pagination-text">第 {{ currentPage }} / {{ totalPages }} 页</span>
        <button class="btn" type="button" :disabled="currentPage >= totalPages" @click="currentPage += 1">下一页</button>
      </div>
    </article>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useLogStore } from "@/stores/logStore";

const logStore = useLogStore();
const router = useRouter();
const canGoBack = ref(false);
const pageSize = 15;
const currentPage = ref(1);
const sortedLogs = computed(() => [...logStore.logs].sort((a, b) => +new Date(b.startAt) - +new Date(a.startAt)));
const totalLogs = computed(() => sortedLogs.value.length);
const totalPages = computed(() => Math.max(1, Math.ceil(totalLogs.value / pageSize)));
const pagedLogs = computed(() => {
  const start = (currentPage.value - 1) * pageSize;
  const end = start + pageSize;
  return sortedLogs.value.slice(start, end);
});

/**
 * 统一“返回”语义：仅允许返回历史上一页。
 */
function syncCanGoBack(): void {
  if (typeof window === "undefined") {
    canGoBack.value = false;
    return;
  }
  canGoBack.value = window.history.length > 1;
}

onMounted(async () => {
  syncCanGoBack();
  window.addEventListener("popstate", syncCanGoBack);
  await logStore.ensureBootstrapped();
});

onBeforeUnmount(() => {
  window.removeEventListener("popstate", syncCanGoBack);
});

watch(totalPages, (nextPages) => {
  if (currentPage.value > nextPages) {
    currentPage.value = nextPages;
  }
});

function download(): void {
  const content = logStore.exportLogs(true);
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `remoteconn-logs-${Date.now()}.txt`;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function goBack(): Promise<void> {
  if (!canGoBack.value) {
    return;
  }
  router.back();
}
</script>
