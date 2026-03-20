<template>
  <div class="app-shell" :class="{ 'keyboard-open': keyboardOpen }">
    <section
      class="app-canvas"
      :class="{ 'without-bottom-bar': hideBottomFrame, 'bottom-frame-hidden': hideBottomFrame }"
      :style="{ gridTemplateRows: hideBottomFrame ? 'minmax(0, 1fr)' : 'minmax(0, 1fr) 52px' }"
    >
      <main class="screen-content">
        <RouterView />
      </main>

      <footer v-if="!hideBottomFrame" class="bottom-bar" :class="{ 'terminal-bottom-bar': isTerminalRoute }">
        <button
          class="icon-btn bottom-nav-btn"
          type="button"
          title="返回上一页"
          aria-label="返回上一页"
          :disabled="!canGoBack"
          @click="goBack"
        >
          <span class="icon-mask" style="--icon: url(&quot;/icons/back.svg&quot;)" aria-hidden="true"></span>
        </button>
        <div class="bottom-right-actions">
          <button
            v-for="item in rightNavItems"
            :key="item.path"
            class="icon-btn bottom-nav-btn"
            type="button"
            :class="{ active: isActive(item.path) }"
            :title="item.label"
            :aria-label="item.label"
            @click="goTo(item.path)"
          >
            <span class="icon-mask" :style="`--icon: url(${item.icon})`" aria-hidden="true"></span>
          </button>
        </div>
      </footer>
    </section>

    <section class="toast-stack" :class="{ 'terminal-toast': isTerminalRoute }" aria-live="polite">
      <article
        v-for="toast in appStore.toasts"
        :key="toast.id"
        class="toast-item"
        :class="`toast-${toast.level}`"
      >
        <header class="toast-title">{{ toToastTitle(toast.level) }}</header>
        <p class="toast-message">{{ toast.message }}</p>
      </article>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { RouterView, useRoute, useRouter } from "vue-router";
import { useSettingsStore } from "@/stores/settingsStore";
import { useAppStore } from "@/stores/appStore";
import { toToastTitle } from "@/utils/feedback";
import {
  applyThemeChromeColor,
  resolveThemeChromeColor,
  type ThemeChromeDocument
} from "@/utils/themeChrome";

const settingsStore = useSettingsStore();
const appStore = useAppStore();
const route = useRoute();
const router = useRouter();
const keyboardOpen = ref(false);
const formFieldFocused = ref(false);
const touchLikeDevice = ref(false);
const canGoBack = ref(false);
const inputFocusSessionActive = ref(false);
type FocusViewportSession = {
  target: HTMLElement;
  scrollContainer: HTMLElement | null;
};
const focusViewportSession = ref<FocusViewportSession | null>(null);
let ensureVisibleRafId: number | null = null;
let ensureVisibleRetryTimer: number | null = null;
let baselineViewportHeight = 0;
const hideGlobalBottomBar = computed(() => /^\/server\/.+\/settings$/.test(route.path));
/**
 * 临时隐藏底栏策略（面向移动端）：
 * - 触屏设备上，只要输入控件聚焦就隐藏底栏（不强依赖 keyboardOpen 判定）；
 * - 兜底保留 keyboardOpen 条件，兼容部分设备触摸特征识别异常。
 */
const hideBottomBarForKeyboard = computed(
  () =>
    inputFocusSessionActive.value && (touchLikeDevice.value || keyboardOpen.value || formFieldFocused.value)
);
/**
 * 底部框架层总开关：
 * - 页面语义要求隐藏（如 server settings）；
 * - 输入态临时隐藏（软键盘场景）。
 * 命中任一条件时，直接移除整块底部框架与占位行。
 */
const hideBottomFrame = computed(() => hideGlobalBottomBar.value || hideBottomBarForKeyboard.value);
const pluginRuntimeEnabled = import.meta.env.VITE_ENABLE_PLUGIN_RUNTIME !== "false";
const isTerminalRoute = computed(() => route.path === "/terminal");
type BottomNavItem = { path: string; label: string; icon: string };
const recordsNavItem: BottomNavItem = {
  path: "/records",
  label: "闪念清单",
  icon: "/assets/icons/recordmanager.svg?v=2026022701"
};
const aboutNavItem: BottomNavItem = {
  path: "/about",
  label: "关于",
  icon: "/icons/about.svg"
};

function appendRecordsNavItem(items: BottomNavItem[]): BottomNavItem[] {
  if (route.path === "/records") {
    return items;
  }
  if (items.some((item) => item.path === recordsNavItem.path)) {
    return items;
  }
  return [...items, recordsNavItem];
}

function appendAboutNavItem(items: BottomNavItem[]): BottomNavItem[] {
  if (route.path.startsWith("/about")) {
    return items;
  }
  if (items.some((item) => item.path === aboutNavItem.path)) {
    return items;
  }
  return [...items, aboutNavItem];
}

/**
 * 底部工具条统一约束：关于入口（about.svg）始终排在最后。
 * 仅调整顺序，不改变各页面实际可见按钮集合。
 */
function ensureAboutNavItemLast(items: BottomNavItem[]): BottomNavItem[] {
  const index = items.findIndex((item) => item.path === aboutNavItem.path);
  if (index < 0 || index === items.length - 1) {
    return items;
  }
  const next = items.slice();
  const [aboutItem] = next.splice(index, 1);
  if (!aboutItem) {
    return items;
  }
  next.push(aboutItem);
  return next;
}

const rightNavItems = computed<BottomNavItem[]>(() => {
  let items: BottomNavItem[];

  if (route.path === "/connect") {
    items = appendAboutNavItem(
      appendRecordsNavItem([
        { path: "/settings", label: "全局配置", icon: "/icons/config.svg" },
        { path: "/logs", label: "日志", icon: "/icons/log.svg?v=20260227" }
      ])
    );
    return ensureAboutNavItemLast(items);
  }

  if (route.path === "/settings") {
    const items = [
      { path: "/connect", label: "服务器管理", icon: "/icons/serverlist.svg" },
      { path: "/logs", label: "日志", icon: "/icons/log.svg?v=20260227" }
    ];

    if (pluginRuntimeEnabled) {
      items.push({ path: "/plugins", label: "插件管理", icon: "/icons/plugins.svg" });
    }

    return ensureAboutNavItemLast(appendAboutNavItem(appendRecordsNavItem(items)));
  }

  if (route.path === "/plugins") {
    items = appendAboutNavItem(
      appendRecordsNavItem([
        { path: "/connect", label: "服务器管理", icon: "/icons/serverlist.svg" },
        { path: "/settings", label: "全局配置", icon: "/icons/config.svg" }
      ])
    );
    return ensureAboutNavItemLast(items);
  }

  if (route.path === "/terminal") {
    items = appendAboutNavItem(
      appendRecordsNavItem([
        { path: "/connect", label: "服务器管理", icon: "/icons/serverlist.svg" },
        { path: "/settings", label: "全局配置", icon: "/icons/config.svg" },
        { path: "/logs", label: "日志", icon: "/icons/log.svg?v=20260227" }
      ])
    );
    return ensureAboutNavItemLast(items);
  }

  if (route.path === "/records") {
    items = appendAboutNavItem([
      { path: "/connect", label: "服务器管理", icon: "/icons/serverlist.svg" },
      { path: "/settings", label: "全局配置", icon: "/icons/config.svg" },
      { path: "/logs", label: "日志", icon: "/icons/log.svg?v=20260227" }
    ]);
    return ensureAboutNavItemLast(items);
  }

  if (route.path.startsWith("/about")) {
    items = appendRecordsNavItem([
      { path: "/connect", label: "服务器管理", icon: "/icons/serverlist.svg" },
      { path: "/settings", label: "全局配置", icon: "/icons/config.svg" },
      { path: "/logs", label: "日志", icon: "/icons/log.svg?v=20260227" }
    ]);
    return ensureAboutNavItemLast(items);
  }

  items = appendAboutNavItem(
    appendRecordsNavItem([
      { path: "/connect", label: "服务器管理", icon: "/icons/serverlist.svg" },
      { path: "/settings", label: "全局配置", icon: "/icons/config.svg" }
    ])
  );
  return ensureAboutNavItemLast(items);
});

function updateViewportLayout(): void {
  /**
   * 移动端软键盘弹出时，visualViewport.height 会变小。
   * 将根布局高度绑定到可视区域高度，确保 shell 向上收缩且光标行可见。
   */
  const vv = window.visualViewport;
  const viewportHeight = Math.round(vv?.height ?? window.innerHeight);
  /**
   * iOS 键盘弹出时，Safari 可能会把 visual viewport 向下平移（offsetTop > 0）。
   * 若仅更新高度不处理 offset，页面可视区域会“切到容器底部”，表现为底栏被顶到顶部覆盖内容。
   * 因此这里同步写入偏移量，令根容器跟随 visual viewport 对齐。
   */
  const viewportOffsetTop = Math.max(0, Math.round(vv?.offsetTop ?? 0));
  const viewportOffsetLeft = Math.max(0, Math.round(vv?.offsetLeft ?? 0));
  const viewportWidth = Math.round(vv?.width ?? window.innerWidth);
  document.documentElement.style.setProperty("--app-viewport-height", `${viewportHeight}px`);
  document.documentElement.style.setProperty("--app-viewport-width", `${viewportWidth}px`);
  document.documentElement.style.setProperty("--app-viewport-offset-top", `${viewportOffsetTop}px`);
  document.documentElement.style.setProperty("--app-viewport-offset-left", `${viewportOffsetLeft}px`);
  document.documentElement.style.setProperty(
    "--focus-scroll-margin-top",
    `${Math.round(viewportHeight * 0.25)}px`
  );

  /**
   * 键盘态判定：
   * - 首选“历史最大可视高度 - 当前可视高度”的收缩量；
   * - 同时保留 visualViewport 与 innerHeight 差值判定作兜底；
   * - 阈值取 120px，过滤地址栏收展等小幅抖动。
   *
   * 说明：部分内核在弹键盘时会同步改写 innerHeight，若只看 innerHeight-vv.height
   * 可能长期为 0，导致 keyboardOpen 假阴性（页面不触发输入态滚动）。
   */
  const candidateBaseHeight = Math.max(window.innerHeight, viewportHeight);
  if (baselineViewportHeight <= 0) {
    baselineViewportHeight = candidateBaseHeight;
  }
  if (!formFieldFocused.value) {
    baselineViewportHeight = Math.max(baselineViewportHeight, candidateBaseHeight);
  }
  const viewportShrink = Math.max(0, baselineViewportHeight - viewportHeight);
  const innerHeightDelta = vv ? Math.max(0, window.innerHeight - vv.height) : 0;
  keyboardOpen.value = viewportShrink > 120 || innerHeightDelta > 120;
  if (formFieldFocused.value) {
    scheduleEnsureFocusedFieldVisible();
  }
}

/**
 * 判断当前聚焦元素是否为会触发软键盘/编辑态的输入控件。
 * 约束：
 * - 仅把 input/textarea/select/contenteditable 视为“需要让位”的目标；
 * - terminal 页的 xterm helper textarea 由 TerminalPanel 内部状态机接管，
 *   这里必须排除，避免“全局滚动补偿”与“终端焦点控制”互相干扰；
 * - 普通按钮、链接等不触发底栏隐藏。
 */
function isEditableField(target: EventTarget | null): target is HTMLElement {
  if (!(target instanceof HTMLElement)) return false;
  if (target.classList.contains("xterm-helper-textarea") || target.closest(".terminal-wrapper, .xterm")) {
    return false;
  }
  if (target.isContentEditable) return true;
  return target.matches("input, textarea, select");
}

/**
 * 同步“是否有输入控件处于聚焦态”：
 * - focusin/focusout 在切换两个 input 时会连续触发；
 * - 使用微任务读取最终 activeElement，避免中间态闪烁。
 */
function syncFormFieldFocusState(): void {
  const active = document.activeElement;
  formFieldFocused.value = isEditableField(active);
}

/**
 * 向上查找“可纵向滚动容器”：
 * - 优先使用最近的 overflowY=auto/scroll 容器；
 * - 若找不到，后续回退到 window.scrollBy。
 */
function findScrollableAncestor(node: HTMLElement | null): HTMLElement | null {
  let current = node?.parentElement ?? null;
  while (current) {
    const style = window.getComputedStyle(current);
    const overflowY = style.overflowY;
    const canScroll = /(auto|scroll|overlay)/.test(overflowY);
    /**
     * 这里不再要求“当前就可滚动”：
     * 键盘弹出前很多容器尚未 overflow，
     * 若此时返回 null，后续会错误回退到 window.scroll（页面可能不可滚）。
     */
    if (canScroll) {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

/**
 * 输入控件进入聚焦态时创建会话：
 * - 标记当前目标与可滚动容器；
 * - 供后续键盘动画阶段反复做可见性校正；
 * - 会话只跟随焦点，不再做“滚动位置回滚”。
 */
function beginFocusViewportSession(target: HTMLElement): void {
  focusViewportSession.value?.target.classList.remove("viewport-focus-target");
  const scrollContainer = findScrollableAncestor(target);
  inputFocusSessionActive.value = true;
  target.classList.add("viewport-focus-target");
  focusViewportSession.value = {
    target,
    scrollContainer
  };
}

/**
 * 若当前 activeElement 是输入控件但会话缺失/已切换目标，则重建会话。
 * 目的：兜底浏览器事件顺序差异，保证后续滚动计算有基线。
 */
function ensureFocusViewportSession(): void {
  const active = document.activeElement;
  if (!isEditableField(active)) {
    return;
  }
  if (focusViewportSession.value?.target === active) {
    const latestContainer = findScrollableAncestor(active);
    focusViewportSession.value.scrollContainer = latestContainer;
    return;
  }
  beginFocusViewportSession(active);
}

function resolveEffectiveViewportHeight(): number {
  return Math.round(window.visualViewport?.height ?? window.innerHeight);
}

/**
 * 输入会话结束：
 * - 清理会话状态与样式标记；
 * - 不回滚滚动位置，避免多输入框切换或路由切换时出现反向跳动。
 */
function endFocusViewportSession(): void {
  const session = focusViewportSession.value;
  focusViewportSession.value = null;
  inputFocusSessionActive.value = false;
  session?.target.classList.remove("viewport-focus-target");
}

/**
 * 将当前聚焦输入框滚入可视区：
 * - 基于滚动容器与 visualViewport 高度计算可见窗口；
 * - 键盘弹出场景将输入框顶部对齐到可见区“上到下 1/4”位置。
 */
function ensureFocusedFieldVisible(): void {
  ensureFocusViewportSession();
  const session = focusViewportSession.value;
  if (!session) {
    return;
  }
  if (!document.contains(session.target)) {
    endFocusViewportSession();
    return;
  }
  let container = session.scrollContainer;
  if (!container || !document.contains(container)) {
    container = findScrollableAncestor(session.target);
    session.scrollContainer = container;
  }
  /**
   * 键盘态兜底：
   * - 某些设备 keyboardOpen 判定会短暂失真，但“触屏 + 输入聚焦”基本可视为软键盘过程；
   * - 这里放宽为 likelyOpen，避免因为判定误差导致完全不滚动。
   */
  const likelyKeyboardOpen = keyboardOpen.value || (touchLikeDevice.value && formFieldFocused.value);
  /**
   * 先尝试一次原生滚动（center 比 start 更稳，能在多数浏览器直接避开键盘遮挡），
   * 然后再做几何微调，确保目标落在“上到下约 1/4”的稳定阅读区。
   */
  if (likelyKeyboardOpen) {
    session.target.scrollIntoView({ block: "center", inline: "nearest", behavior: "auto" });
  }
  const rect = session.target.getBoundingClientRect();
  const viewportHeight = resolveEffectiveViewportHeight();
  const containerRect = container?.getBoundingClientRect() ?? null;
  const visibleTop = (containerRect?.top ?? 0) + 12;
  const visibleBottom = Math.min(containerRect?.bottom ?? viewportHeight, viewportHeight) - 12;
  if (visibleBottom - visibleTop < 8) {
    return;
  }
  /**
   * 交互策略：
   * - likelyKeyboardOpen 时：输入框“顶部”对齐到可见区上到下 1/4；
   * - 非键盘态：仅在超出可见区时才滚动。
   */
  const desiredTop = visibleTop + (visibleBottom - visibleTop) * 0.25;
  const delta = rect.top - desiredTop;
  const outOfVisibleRange = rect.top < visibleTop || rect.bottom > visibleBottom;
  const needAdjust = likelyKeyboardOpen ? Math.abs(delta) > 3 : outOfVisibleRange;
  if (!needAdjust || Math.abs(delta) < 1) {
    return;
  }

  if (container && document.contains(container)) {
    const before = container.scrollTop;
    container.scrollTop += delta;
    if (Math.abs(container.scrollTop - before) > 0.5) {
      return;
    }
  }

  const beforeWindowY = window.scrollY;
  window.scrollBy({ top: delta, behavior: "auto" });
  if (Math.abs(window.scrollY - beforeWindowY) > 0.5) {
    return;
  }
  /**
   * 最终兜底：若容器/window 都未实际移动，再次触发原生 nearest 对齐。
   * 这一步主要覆盖个别 WebView 对 scrollTop 写入不生效的情况。
   */
  if (likelyKeyboardOpen) {
    session.target.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "auto" });
  }
}

/**
 * 键盘动画期会触发多次 viewport 变化，使用 RAF 合并滚动请求，
 * 避免同一帧重复改 scrollTop 引发抖动。
 */
function scheduleEnsureFocusedFieldVisible(): void {
  if (!formFieldFocused.value) {
    return;
  }
  if (ensureVisibleRafId !== null) {
    return;
  }
  ensureVisibleRafId = window.requestAnimationFrame(() => {
    ensureVisibleRafId = null;
    ensureFocusedFieldVisible();
  });
}

/**
 * 某些机型键盘展开较慢，额外做一次延迟校正，确保输入框最终可见。
 */
function scheduleEnsureFocusedFieldVisibleRetry(): void {
  if (ensureVisibleRetryTimer !== null) {
    window.clearTimeout(ensureVisibleRetryTimer);
  }
  ensureVisibleRetryTimer = window.setTimeout(() => {
    ensureVisibleRetryTimer = null;
    scheduleEnsureFocusedFieldVisible();
  }, 180);
}

/**
 * focusin 进入输入态：
 * - 同步焦点状态；
 * - 建立输入会话；
 * - 立即 + 延迟一次可见性校正。
 */
function onFocusIn(event: FocusEvent): void {
  syncFormFieldFocusState();
  if (!isEditableField(event.target)) {
    return;
  }
  beginFocusViewportSession(event.target);
  scheduleEnsureFocusedFieldVisible();
  scheduleEnsureFocusedFieldVisibleRetry();
}

/**
 * focusout 发生时，activeElement 可能还没切换完成；
 * 放到微任务里读取最终焦点，保证状态稳定。
 */
function onFocusOut(): void {
  queueMicrotask(() => {
    syncFormFieldFocusState();
    if (!formFieldFocused.value) {
      endFocusViewportSession();
    }
  });
}

/**
 * 统一“返回”语义：
 * - 仅表示“返回历史上一页”；
 * - 当历史栈不足（length<=1）时禁用返回按钮并置灰。
 */
function syncCanGoBack(): void {
  if (typeof window === "undefined") {
    canGoBack.value = false;
    return;
  }
  canGoBack.value = window.history.length > 1;
}

onMounted(async () => {
  touchLikeDevice.value = window.matchMedia?.("(pointer: coarse)")?.matches ?? "ontouchstart" in window;
  updateViewportLayout();
  syncFormFieldFocusState();
  syncCanGoBack();
  window.addEventListener("resize", updateViewportLayout, { passive: true });
  window.visualViewport?.addEventListener("resize", updateViewportLayout, { passive: true });
  window.visualViewport?.addEventListener("scroll", updateViewportLayout, { passive: true });
  document.addEventListener("focusin", onFocusIn);
  document.addEventListener("focusout", onFocusOut);
  window.addEventListener("popstate", syncCanGoBack);
  await settingsStore.ensureBootstrapped();
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", updateViewportLayout);
  window.visualViewport?.removeEventListener("resize", updateViewportLayout);
  window.visualViewport?.removeEventListener("scroll", updateViewportLayout);
  document.removeEventListener("focusin", onFocusIn);
  document.removeEventListener("focusout", onFocusOut);
  window.removeEventListener("popstate", syncCanGoBack);
  if (ensureVisibleRafId !== null) {
    window.cancelAnimationFrame(ensureVisibleRafId);
    ensureVisibleRafId = null;
  }
  if (ensureVisibleRetryTimer !== null) {
    window.clearTimeout(ensureVisibleRetryTimer);
    ensureVisibleRetryTimer = null;
  }
  endFocusViewportSession();
});

watch(
  () => settingsStore.themeVars,
  (vars) => {
    const root = document.documentElement;
    for (const [key, value] of Object.entries(vars)) {
      root.style.setProperty(key, value);
    }
    /**
     * 同步浏览器/宿主顶栏颜色，避免顶部工具栏上方区域停留在旧主题色。
     */
    applyThemeChromeColor(
      resolveThemeChromeColor(vars),
      document as unknown as ThemeChromeDocument<HTMLMetaElement>
    );
  },
  { immediate: true, deep: true }
);

watch(
  () => route.fullPath,
  () => {
    syncCanGoBack();
    endFocusViewportSession();
  },
  { immediate: true }
);

watch(keyboardOpen, (open, prev) => {
  if (open) {
    if (formFieldFocused.value) {
      inputFocusSessionActive.value = true;
    }
    scheduleEnsureFocusedFieldVisible();
    scheduleEnsureFocusedFieldVisibleRetry();
    return;
  }
  if (prev) {
    if (!formFieldFocused.value) {
      endFocusViewportSession();
    }
  }
});

function isActive(path: string): boolean {
  if (path === "/about") {
    return route.path.startsWith("/about");
  }
  return route.path === path;
}

async function goTo(path: string): Promise<void> {
  if (route.path === path) return;
  await router.push(path);
}

async function goBack(): Promise<void> {
  if (!canGoBack.value) {
    return;
  }
  router.back();
}
</script>
