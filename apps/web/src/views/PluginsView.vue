<template>
  <section class="page-root plugins-page">
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
      <h2 class="page-title">插件管理</h2>
    </div>

    <article class="surface-panel surface-scroll">
      <h3>插件列表</h3>
      <div class="list-stack">
        <article v-for="item in pluginStore.records" :key="item.id" class="plugin-item">
          <div class="item-title">{{ item.id }} · {{ item.status }}</div>
          <div class="item-sub">errorCount: {{ item.errorCount }} · {{ item.lastError || '-' }}</div>
          <div class="actions">
            <button class="btn" @click="pluginStore.enable(item.id)">启用</button>
            <button class="btn" @click="pluginStore.disable(item.id)">禁用</button>
            <button class="btn" @click="pluginStore.reload(item.id)">重载</button>
            <button class="btn danger" @click="pluginStore.remove(item.id)">移除</button>
          </div>
        </article>
      </div>

      <h3>导入插件 JSON</h3>
      <textarea v-model="pluginJson" class="textarea" rows="8" placeholder='[{"manifest":...,"mainJs":"...","stylesCss":"..."}]' />
      <div class="actions">
        <button class="btn" @click="importPlugin">导入</button>
        <button class="btn" @click="exportPlugin">导出全部</button>
      </div>

      <h3>运行时日志</h3>
      <pre class="log-box">{{ pluginStore.runtimeLogs.join('\n') }}</pre>
    </article>
  </section>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { usePluginStore } from "@/stores/pluginStore";
import { useAppStore } from "@/stores/appStore";
import { formatActionError } from "@/utils/feedback";

const pluginStore = usePluginStore();
const appStore = useAppStore();
const router = useRouter();
const canGoBack = ref(false);

const pluginJson = ref("");

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
  await pluginStore.ensureBootstrapped();
});

onBeforeUnmount(() => {
  window.removeEventListener("popstate", syncCanGoBack);
});

async function importPlugin(): Promise<void> {
  if (!pluginJson.value.trim()) return;
  try {
    await pluginStore.importJson(pluginJson.value);
    pluginJson.value = "";
    appStore.notify("info", "插件导入成功");
  } catch (error) {
    appStore.notify("error", formatActionError("导入失败", error));
  }
}

async function exportPlugin(): Promise<void> {
  const raw = await pluginStore.exportJson();
  const blob = new Blob([raw], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `remoteconn-plugins-${Date.now()}.json`;
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
