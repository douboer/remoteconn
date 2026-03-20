<template>
  <section class="page-root records-page">
    <div class="page-toolbar records-toolbar">
      <div class="toolbar-left">
        <button
          class="icon-btn"
          type="button"
          title="返回上一页"
          aria-label="返回上一页"
          :disabled="!canGoBack"
          @click="goBack"
        >
          <span class="icon-mask" style="--icon: url(&quot;/icons/back.svg&quot;)" aria-hidden="true"></span>
        </button>
      </div>
      <div class="toolbar-spacer"></div>
      <h2 class="page-title">闪念清单</h2>
    </div>

    <article class="surface-panel records-panel">
      <div ref="filterMenuWrapRef" class="server-search-wrap records-search-wrap">
        <div class="server-search-shell records-search-shell">
          <input v-model="searchKeyword" class="server-search-input" type="search" placeholder="搜索闪念" />
          <button
            class="server-search-btn records-filter-btn"
            type="button"
            :title="selectedCategoryFilter ? `按分类过滤：${selectedCategoryFilter}` : '按分类过滤：全部分类'"
            :aria-label="
              selectedCategoryFilter ? `按分类过滤：${selectedCategoryFilter}` : '按分类过滤：全部分类'
            "
            :class="{ active: filterDialogOpen }"
            @click="toggleFilterDialog"
          >
            <span class="records-filter-arrow" aria-hidden="true"></span>
          </button>
        </div>
        <div v-if="filterDialogOpen" class="records-filter-menu">
          <button
            class="records-filter-item"
            :class="{ active: !selectedCategoryFilter }"
            type="button"
            :style="resolveFilterCategoryStyle(DEFAULT_VOICE_RECORD_CATEGORY_FALLBACK, 0.2)"
            @click="applyCategoryFilter('')"
          >
            全部分类
          </button>
          <button
            v-for="category in availableCategories"
            :key="`records-filter-category-${category}`"
            class="records-filter-item"
            :class="{ active: selectedCategoryFilter === category }"
            type="button"
            :style="resolveFilterCategoryStyle(category, 0.2)"
            @click="applyCategoryFilter(category)"
          >
            {{ category }}
          </button>
        </div>
      </div>

      <div class="surface-scroll records-list-scroll" @pointerdown="closeSwipedRecord">
        <ul v-if="pagedRecords.length > 0" class="records-list">
          <li
            v-for="item in pagedRecords"
            :key="item.id"
            class="records-item-shell"
            :class="{ 'records-item-shell-delete-visible': isDeleteVisible(item.id) }"
          >
            <button
              class="records-item-category"
              type="button"
              :title="`修改分类：${resolveDisplayCategory(item.category)}`"
              :style="resolveConfiguredTextCategoryStyle(item.category, 0.6)"
              @click.stop="openQuickCategoryDialog(item.id, $event)"
            >
              {{ resolveDisplayCategory(item.category) }}
            </button>
            <div class="records-item-actions-mobile">
              <button
                class="records-item-action-mobile records-item-action-mobile-copy"
                type="button"
                title="复制闪念"
                aria-label="复制闪念"
                @pointerdown.stop
                @click.stop="copyRecord(item.id)"
              >
                复制
              </button>
              <button
                class="records-item-action-mobile records-item-action-mobile-delete"
                type="button"
                title="删除闪念"
                aria-label="删除闪念"
                @pointerdown.stop
                @click.stop="removeRecord(item.id)"
              >
                删除
              </button>
            </div>
            <article
              class="records-item"
              :style="swipeItemStyle(item.id)"
              @pointerdown="onRecordPointerDown(item.id, $event)"
              @pointermove="onRecordPointerMove(item.id, $event)"
              @pointerup="onRecordPointerUp(item.id, $event)"
              @pointercancel="onRecordPointerCancel(item.id, $event)"
              @lostpointercapture="onRecordLostPointerCapture(item.id, $event)"
            >
              <div class="records-item-main">
                <header class="records-item-header">
                  <time class="records-item-time">{{ formatRecordTime(item.createdAt) }}</time>
                  <span v-if="item.contextLabel" class="records-item-context">{{ item.contextLabel }}</span>
                </header>
                <button class="records-item-content-btn" type="button" @click.stop="openEditDialog(item.id)">
                  <p class="records-item-content">{{ item.content }}</p>
                </button>
              </div>
            </article>
          </li>
        </ul>
        <p v-else class="records-empty-tip">
          {{ searchKeyword.trim() ? "没有匹配的闪念记录" : "暂无闪念记录" }}
        </p>
      </div>

      <div class="records-bottom-bar">
        <div class="records-pagination">
          <button class="btn" type="button" :disabled="currentPage <= 1" @click="currentPage -= 1">
            上一页
          </button>
          <span class="records-pagination-text">第 {{ currentPage }} / {{ totalPages }} 页</span>
          <button class="btn" type="button" :disabled="currentPage >= totalPages" @click="currentPage += 1">
            下一页
          </button>
        </div>
        <button class="btn" type="button" @click="download">导出闪念</button>
      </div>
    </article>

    <div v-if="editingRecord" class="codex-dialog-mask" @click.self="closeEditDialog">
      <div class="codex-dialog records-dialog" role="dialog" aria-modal="true" aria-label="编辑闪念">
        <div class="field records-dialog-field records-dialog-field--category">
          <div class="field-control field-control--stack">
            <div class="pill-scroll">
              <div class="pill-row">
                <button
                  v-for="category in availableCategories"
                  :key="`records-edit-category-${category}`"
                  class="pill-option pill-option--compact"
                  :class="{ active: editDraft.category === category }"
                  type="button"
                  @click="editDraft.category = category"
                >
                  {{ category }}
                </button>
              </div>
            </div>
          </div>
        </div>
        <label class="field records-dialog-field records-dialog-field--textarea">
          <textarea
            v-model="editDraft.content"
            class="textarea"
            rows="6"
            maxlength="2000"
            placeholder="输入闪念内容"
          ></textarea>
        </label>
        <div class="records-dialog-meta">
          <p class="settings-field-hint">最近更新：{{ formatRecordTime(editingRecord.updatedAt) }}</p>
        </div>
        <button
          class="icon-btn records-dialog-cancel-btn"
          type="button"
          title="关闭编辑窗口"
          aria-label="关闭编辑窗口"
          @click="closeEditDialog"
        >
          <span
            class="icon-mask"
            style="--icon: url(&quot;/icons/cancel.svg&quot;)"
            aria-hidden="true"
          ></span>
        </button>
      </div>
    </div>

    <div
      v-if="quickCategoryRecord"
      class="codex-dialog-mask records-dialog-mask--quick-category"
      @click.self="closeQuickCategoryDialog"
    >
      <div
        class="codex-dialog records-dialog records-dialog--compact records-dialog--quick-category"
        role="dialog"
        aria-modal="true"
        aria-label="快速改分类"
        :style="quickCategoryDialogStyle"
      >
        <div class="records-quick-category-list" :style="quickCategoryBubbleLayout.containerStyle">
          <div class="records-quick-category-cloud">
            <button
              v-for="bubble in quickCategoryBubbleLayout.items"
              :key="`records-quick-category-${bubble.category}`"
              class="records-quick-category-pill"
              :class="{ active: bubble.active }"
              type="button"
              :style="[resolveCategoryStyle(bubble.category), bubble.style]"
              @click="applyQuickCategory(bubble.category)"
            >
              {{ bubble.category }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch, type CSSProperties } from "vue";
import { useRouter } from "vue-router";
import { useVoiceRecordStore } from "@/stores/voiceRecordStore";
import { useAppStore } from "@/stores/appStore";
import { useSettingsStore } from "@/stores/settingsStore";
import {
  DEFAULT_VOICE_RECORD_CATEGORIES,
  DEFAULT_VOICE_RECORD_CATEGORY_FALLBACK,
  DEFAULT_VOICE_RECORD_DEFAULT_CATEGORY
} from "@/utils/defaults";
import { contrastRatio } from "@remoteconn/shared";

const voiceRecordStore = useVoiceRecordStore();
const appStore = useAppStore();
const settingsStore = useSettingsStore();
const router = useRouter();
const canGoBack = ref(false);
const searchKeyword = ref("");
const selectedCategoryFilter = ref("");
const filterDialogOpen = ref(false);
const filterMenuWrapRef = ref<HTMLDivElement | null>(null);

const pageSize = 15;
const currentPage = ref(1);
const editRecordId = ref("");
const quickCategoryRecordId = ref("");
const quickCategoryAnchorRect = ref<DOMRect | null>(null);
const RECORD_EDIT_AUTOSAVE_DELAY_MS = 400;
const editDraft = reactive({
  category: DEFAULT_VOICE_RECORD_DEFAULT_CATEGORY,
  content: ""
});
let editAutoSaveTimer: ReturnType<typeof setTimeout> | null = null;

const availableCategories = computed(() => {
  const source = settingsStore.settings.voiceRecordCategories;
  if (Array.isArray(source) && source.length > 0) {
    const normalized = source
      .map((item) => String(item ?? "").trim())
      .filter((item, index, array) => item && array.indexOf(item) === index);
    if (normalized.length > 0) {
      return normalized.includes(DEFAULT_VOICE_RECORD_CATEGORY_FALLBACK)
        ? normalized
        : [DEFAULT_VOICE_RECORD_CATEGORY_FALLBACK, ...normalized];
    }
  }
  return [...DEFAULT_VOICE_RECORD_CATEGORIES];
});

const filteredRecords = computed(() =>
  voiceRecordStore.search({
    keyword: searchKeyword.value,
    category: selectedCategoryFilter.value || undefined
  })
);
const totalPages = computed(() => Math.max(1, Math.ceil(filteredRecords.value.length / pageSize)));
const pagedRecords = computed(() => {
  const start = (currentPage.value - 1) * pageSize;
  const end = start + pageSize;
  return filteredRecords.value.slice(start, end);
});
const editingRecord = computed(
  () => voiceRecordStore.records.find((item) => item.id === editRecordId.value) ?? null
);
const quickCategoryRecord = computed(
  () => voiceRecordStore.records.find((item) => item.id === quickCategoryRecordId.value) ?? null
);

const QUICK_CATEGORY_DIALOG_MIN_WIDTH_PX = 120;
const QUICK_CATEGORY_DIALOG_MAX_WIDTH_PX = 280;
const QUICK_CATEGORY_DIALOG_MIN_HEIGHT_PX = Math.round((QUICK_CATEGORY_DIALOG_MIN_WIDTH_PX * 3) / 4);
const QUICK_CATEGORY_DIALOG_PADDING_PX = 8;
const QUICK_CATEGORY_DIALOG_OFFSET_PX = 10;
const QUICK_CATEGORY_VIEWPORT_MARGIN_PX = 12;
// 气泡之间额外留白，调大后云图会更疏朗。
const QUICK_CATEGORY_BUBBLE_GAP_PX = 8;
// 中心向外扩散的起始半径与增长速度，控制“辐射感”和密度。
const QUICK_CATEGORY_BUBBLE_RADIUS_BASE_PX = 12;
const QUICK_CATEGORY_BUBBLE_RADIUS_STEP_PX = 7.6;

type QuickCategoryBubble = {
  active: boolean;
  category: string;
  style: CSSProperties;
};

// 删除按钮可见宽度（像素）。
const MOBILE_ACTION_WIDTH_PX = 72;
const MOBILE_ACTION_GAP_PX = 1;
const MOBILE_SWIPE_OFFSET_PX = MOBILE_ACTION_WIDTH_PX + MOBILE_ACTION_GAP_PX;
const MOBILE_OPEN_THRESHOLD_PX = 36;
const swipedRecordId = ref("");
const draggingRecordId = ref("");
let dragPointerId: number | null = null;
let dragStartX = 0;
let dragBaseX = 0;
const dragTranslateX = ref(0);
const CATEGORY_COLOR_PALETTE = [
  "#5bd2ff",
  "#ff8f6b",
  "#8dd87b",
  "#ffbf69",
  "#c792ea",
  "#ff6f91",
  "#63d2ff",
  "#4ecdc4",
  "#ffd166",
  "#90be6d"
];

/**
 * 展示态分类需要对“已被配置删除的旧分类”做回退，避免历史脏值直接漏到 UI。
 */
function resolveDisplayCategory(category: string): string {
  const normalized = String(category ?? "").trim();
  return availableCategories.value.includes(normalized) ? normalized : DEFAULT_VOICE_RECORD_CATEGORY_FALLBACK;
}

function hashCategory(value: string): number {
  let hash = 0;
  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash;
}

function resolveCategoryBgColor(category: string): string {
  const normalized = resolveDisplayCategory(category);
  const index = hashCategory(normalized) % CATEGORY_COLOR_PALETTE.length;
  return CATEGORY_COLOR_PALETTE[index] ?? CATEGORY_COLOR_PALETTE[0] ?? "#5bd2ff";
}

function resolveCategoryTextColor(bgColor: string): string {
  const dark = "#081220";
  const light = "#f8fbff";
  return contrastRatio(bgColor, dark) >= contrastRatio(bgColor, light) ? dark : light;
}

function applyColorOpacity(color: string, opacity: number): string {
  const normalized = color.trim();
  if (!normalized.startsWith("#")) {
    return color;
  }
  let hex = normalized.slice(1);
  if (hex.length === 3) {
    hex = hex
      .split("")
      .map((char) => `${char}${char}`)
      .join("");
  }
  if (hex.length !== 6) {
    return color;
  }
  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${opacity})`;
}

function parseHexColor(color: string): { blue: number; green: number; red: number } | null {
  const normalized = color.trim();
  if (!normalized.startsWith("#")) {
    return null;
  }
  let hex = normalized.slice(1);
  if (hex.length === 3) {
    hex = hex
      .split("")
      .map((char) => `${char}${char}`)
      .join("");
  }
  if (hex.length !== 6) {
    return null;
  }
  return {
    red: Number.parseInt(hex.slice(0, 2), 16),
    green: Number.parseInt(hex.slice(2, 4), 16),
    blue: Number.parseInt(hex.slice(4, 6), 16)
  };
}

function blendHexColors(foreground: string, background: string, alpha: number): string {
  const fg = parseHexColor(foreground);
  const bg = parseHexColor(background);
  if (!fg || !bg) {
    return foreground;
  }
  const mixChannel = (fgValue: number, bgValue: number) =>
    Math.round(fgValue * alpha + bgValue * (1 - alpha))
      .toString(16)
      .padStart(2, "0");
  return `#${mixChannel(fg.red, bg.red)}${mixChannel(fg.green, bg.green)}${mixChannel(fg.blue, bg.blue)}`;
}

function resolveCategoryStyle(category: string): CSSProperties {
  const bgColor = resolveCategoryBgColor(category);
  const textColor = resolveCategoryTextColor(bgColor);
  return {
    backgroundColor: applyColorOpacity(bgColor, 0.6),
    color: textColor,
    borderColor: bgColor
  };
}

function resolveConfiguredTextCategoryStyle(category: string, opacity: number): CSSProperties {
  const bgColor = resolveCategoryBgColor(category);
  const configuredTextColor = String(settingsStore.settings.uiTextColor ?? "").trim() || "var(--text)";
  return {
    backgroundColor: applyColorOpacity(bgColor, opacity),
    color: configuredTextColor,
    borderColor: bgColor
  };
}

/**
 * 下拉菜单处于深色浮层中，需要按“分类色叠加到深色底”后的实际底色取反差色。
 */
function resolveFilterCategoryStyle(category: string, opacity: number): CSSProperties {
  const bgColor = resolveCategoryBgColor(category);
  const menuCompositeColor = blendHexColors(bgColor, "#081220", opacity);
  return {
    backgroundColor: applyColorOpacity(bgColor, opacity),
    color: resolveCategoryTextColor(menuCompositeColor),
    borderColor: bgColor
  };
}

function resolveQuickCategoryBubbleSize(category: string): number {
  const textLength = Array.from(resolveDisplayCategory(category)).length;
  return Math.min(52, Math.max(34, 24 + textLength * 7));
}

function intersectsPlacedBubble(
  left: number,
  top: number,
  size: number,
  placedBubbles: Array<{ left: number; size: number; top: number }>
): boolean {
  const centerX = left + size / 2;
  const centerY = top + size / 2;
  return placedBubbles.some((bubble) => {
    const otherCenterX = bubble.left + bubble.size / 2;
    const otherCenterY = bubble.top + bubble.size / 2;
    const minDistance = size / 2 + bubble.size / 2 + QUICK_CATEGORY_BUBBLE_GAP_PX;
    return Math.hypot(centerX - otherCenterX, centerY - otherCenterY) < minDistance;
  });
}

function buildBubbleCloudForBox(
  orderedCategories: string[],
  currentCategory: string,
  width: number,
  height: number
): { collisionCount: number; items: QuickCategoryBubble[] } {
  const centerX = width / 2;
  const centerY = height / 2;
  const placedBubbles: Array<{ left: number; size: number; top: number }> = [];
  let collisionCount = 0;
  const items = orderedCategories.map((category, index) => {
    const size = resolveQuickCategoryBubbleSize(category);
    if (index === 0) {
      const left = Math.max(0, Math.min(width - size, centerX - size / 2));
      const top = Math.max(0, Math.min(height - size, centerY - size / 2));
      placedBubbles.push({ left, size, top });
      return {
        active: category === currentCategory,
        category,
        style: {
          width: `${size}px`,
          height: `${size}px`,
          left: `${left}px`,
          top: `${top}px`
        }
      };
    }
    let fallbackLeft = Math.max(0, Math.min(width - size, centerX - size / 2));
    let fallbackTop = Math.max(0, Math.min(height - size, centerY - size / 2));
    let placed = false;
    for (let step = 1; step <= 320; step += 1) {
      const angle = step * 0.72;
      const radius =
        QUICK_CATEGORY_BUBBLE_RADIUS_BASE_PX + Math.sqrt(step) * QUICK_CATEGORY_BUBBLE_RADIUS_STEP_PX;
      const candidateLeft = centerX + Math.cos(angle) * radius - size / 2;
      const candidateTop = centerY + Math.sin(angle) * radius * 1.08 - size / 2;
      const isWithinWidth = candidateLeft >= 0 && candidateLeft + size <= width;
      const isWithinHeight = candidateTop >= 0 && candidateTop + size <= height;
      if (!isWithinWidth || !isWithinHeight) {
        continue;
      }
      if (intersectsPlacedBubble(candidateLeft, candidateTop, size, placedBubbles)) {
        continue;
      }
      fallbackLeft = candidateLeft;
      fallbackTop = candidateTop;
      placed = true;
      break;
    }
    if (!placed) {
      collisionCount += 1;
    }
    placedBubbles.push({ left: fallbackLeft, size, top: fallbackTop });
    return {
      active: category === currentCategory,
      category,
      style: {
        width: `${size}px`,
        height: `${size}px`,
        left: `${fallbackLeft}px`,
        top: `${fallbackTop}px`
      }
    };
  });
  return { collisionCount, items };
}

function buildQuickCategoryBubbleLayout(
  categories: string[],
  currentCategory: string
): { containerStyle: CSSProperties; items: QuickCategoryBubble[] } {
  const orderedCategories = [...categories].sort((left, right) => {
    if (left === currentCategory) {
      return -1;
    }
    if (right === currentCategory) {
      return 1;
    }
    return categories.indexOf(left) - categories.indexOf(right);
  });
  const longestCategoryLength = orderedCategories.reduce(
    (max, category) => Math.max(max, Array.from(resolveDisplayCategory(category)).length),
    0
  );
  const estimatedWidth =
    QUICK_CATEGORY_DIALOG_MIN_WIDTH_PX +
    Math.max(0, orderedCategories.length - 3) * 22 +
    Math.max(0, longestCategoryLength - 2) * 8;
  let bestWidth = clampNumber(
    estimatedWidth,
    QUICK_CATEGORY_DIALOG_MIN_WIDTH_PX,
    QUICK_CATEGORY_DIALOG_MAX_WIDTH_PX
  );
  let bestLayout = buildBubbleCloudForBox(
    orderedCategories,
    currentCategory,
    bestWidth,
    Math.max(QUICK_CATEGORY_DIALOG_MIN_HEIGHT_PX, Math.round((bestWidth * 3) / 4))
  );

  for (
    let width = QUICK_CATEGORY_DIALOG_MIN_WIDTH_PX;
    width <= QUICK_CATEGORY_DIALOG_MAX_WIDTH_PX;
    width += 20
  ) {
    const height = Math.max(QUICK_CATEGORY_DIALOG_MIN_HEIGHT_PX, Math.round((width * 3) / 4));
    const candidateLayout = buildBubbleCloudForBox(orderedCategories, currentCategory, width, height);
    if (candidateLayout.collisionCount < bestLayout.collisionCount) {
      bestWidth = width;
      bestLayout = candidateLayout;
    }
    if (candidateLayout.collisionCount === 0 && width >= bestWidth) {
      bestWidth = width;
      bestLayout = candidateLayout;
      break;
    }
  }

  const bestHeight = Math.max(QUICK_CATEGORY_DIALOG_MIN_HEIGHT_PX, Math.round((bestWidth * 3) / 4));
  return {
    containerStyle: {
      width: `${bestWidth}px`,
      height: `${bestHeight}px`
    },
    items: bestLayout.items
  };
}

const quickCategoryBubbleLayout = computed(() =>
  buildQuickCategoryBubbleLayout(
    availableCategories.value,
    quickCategoryRecord.value ? resolveDisplayCategory(quickCategoryRecord.value.category) : ""
  )
);

const quickCategoryDialogStyle = computed<CSSProperties>(() => {
  const anchorRect = quickCategoryAnchorRect.value;
  if (!anchorRect || typeof window === "undefined") {
    return {};
  }
  const innerWidth =
    Number.parseFloat(String(quickCategoryBubbleLayout.value.containerStyle.width ?? "0")) ||
    QUICK_CATEGORY_DIALOG_MIN_WIDTH_PX;
  const innerHeight =
    Number.parseFloat(String(quickCategoryBubbleLayout.value.containerStyle.height ?? "0")) || 0;
  const dialogWidth = innerWidth + QUICK_CATEGORY_DIALOG_PADDING_PX * 2;
  const dialogHeight = innerHeight + QUICK_CATEGORY_DIALOG_PADDING_PX * 2;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const preferredLeft = anchorRect.right + QUICK_CATEGORY_DIALOG_OFFSET_PX;
  const preferredTop = anchorRect.top + anchorRect.height / 2 - dialogHeight / 2;
  const maxLeft = Math.max(
    QUICK_CATEGORY_VIEWPORT_MARGIN_PX,
    viewportWidth - dialogWidth - QUICK_CATEGORY_VIEWPORT_MARGIN_PX
  );
  const maxTop = Math.max(
    QUICK_CATEGORY_VIEWPORT_MARGIN_PX,
    viewportHeight - dialogHeight - QUICK_CATEGORY_VIEWPORT_MARGIN_PX
  );
  const left = Math.min(Math.max(QUICK_CATEGORY_VIEWPORT_MARGIN_PX, preferredLeft), maxLeft);
  const top = Math.min(Math.max(QUICK_CATEGORY_VIEWPORT_MARGIN_PX, preferredTop), maxTop);
  return {
    left: `${left}px`,
    top: `${top}px`,
    width: `${dialogWidth}px`
  };
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

function closeSwipedRecord(): void {
  if (!draggingRecordId.value) {
    swipedRecordId.value = "";
  }
}

function swipeItemStyle(recordId: string): { transform: string } {
  if (draggingRecordId.value === recordId) {
    return { transform: `translateX(${dragTranslateX.value}px)` };
  }
  if (swipedRecordId.value === recordId) {
    return { transform: `translateX(-${MOBILE_SWIPE_OFFSET_PX}px)` };
  }
  return { transform: "translateX(0px)" };
}

/**
 * 删除按钮仅在滑动过程中或已滑开状态下可见，避免默认态透出。
 */
function isDeleteVisible(recordId: string): boolean {
  if (swipedRecordId.value === recordId) {
    return true;
  }
  if (draggingRecordId.value !== recordId) {
    return false;
  }
  return dragTranslateX.value < 0;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function onRecordPointerDown(recordId: string, event: PointerEvent): void {
  if (event.button !== 0) {
    return;
  }
  dragPointerId = event.pointerId;
  draggingRecordId.value = recordId;
  dragStartX = event.clientX;
  dragBaseX = swipedRecordId.value === recordId ? -MOBILE_SWIPE_OFFSET_PX : 0;
  dragTranslateX.value = dragBaseX;
  if (swipedRecordId.value && swipedRecordId.value !== recordId) {
    swipedRecordId.value = "";
  }
  const target = event.currentTarget;
  if (target instanceof HTMLElement) {
    try {
      target.setPointerCapture(event.pointerId);
    } catch {
      // iOS 某些版本 pointer capture 可能失败，失败时由 pointerup/cancel 兜底收尾。
    }
  }
}

function onRecordPointerMove(recordId: string, event: PointerEvent): void {
  if (dragPointerId !== event.pointerId || draggingRecordId.value !== recordId) {
    return;
  }
  const deltaX = event.clientX - dragStartX;
  dragTranslateX.value = clampNumber(dragBaseX + deltaX, -MOBILE_SWIPE_OFFSET_PX, 0);
}

function finishSwipeGesture(recordId: string, event: PointerEvent): void {
  if (dragPointerId !== event.pointerId || draggingRecordId.value !== recordId) {
    return;
  }
  const shouldOpen = dragTranslateX.value <= -MOBILE_OPEN_THRESHOLD_PX;
  swipedRecordId.value = shouldOpen ? recordId : "";
  draggingRecordId.value = "";
  dragPointerId = null;
  dragTranslateX.value = 0;
}

function onRecordPointerUp(recordId: string, event: PointerEvent): void {
  finishSwipeGesture(recordId, event);
}

function onRecordPointerCancel(recordId: string, event: PointerEvent): void {
  finishSwipeGesture(recordId, event);
}

function onRecordLostPointerCapture(recordId: string, event: PointerEvent): void {
  finishSwipeGesture(recordId, event);
}

async function removeRecord(recordId: string): Promise<void> {
  await voiceRecordStore.removeRecord(recordId);
  if (editRecordId.value === recordId) {
    closeEditDialog();
  }
  if (quickCategoryRecordId.value === recordId) {
    closeQuickCategoryDialog();
  }
  swipedRecordId.value = "";
  appStore.notify("info", "已删除闪念记录");
}

async function writeClipboardText(text: string): Promise<boolean> {
  const payload = String(text ?? "");
  if (!payload || !navigator.clipboard?.writeText) {
    return false;
  }
  try {
    await navigator.clipboard.writeText(payload);
    return true;
  } catch {
    return false;
  }
}

async function copyRecord(recordId: string): Promise<void> {
  const record = voiceRecordStore.records.find((item) => item.id === recordId);
  if (!record) {
    return;
  }
  const copied = await writeClipboardText(record.content);
  if (!copied) {
    appStore.notify("warn", "复制失败，请检查浏览器剪贴板权限");
    return;
  }
  swipedRecordId.value = "";
  appStore.notify("info", "已复制闪念内容");
}

function formatRecordTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("zh-CN", { hour12: false });
}

function download(): void {
  const content = voiceRecordStore.exportRecords();
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `remoteconn-records-${Date.now()}.txt`;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function openEditDialog(recordId: string): void {
  const record = voiceRecordStore.records.find((item) => item.id === recordId);
  if (!record) {
    return;
  }
  clearEditAutoSaveTimer();
  editRecordId.value = recordId;
  editDraft.category = resolveDisplayCategory(record.category);
  editDraft.content = record.content;
}

function clearEditAutoSaveTimer(): void {
  if (!editAutoSaveTimer) {
    return;
  }
  clearTimeout(editAutoSaveTimer);
  editAutoSaveTimer = null;
}

function resetEditDialog(): void {
  clearEditAutoSaveTimer();
  editRecordId.value = "";
  editDraft.category = DEFAULT_VOICE_RECORD_DEFAULT_CATEGORY;
  editDraft.content = "";
}

/**
 * 编辑弹窗改为自动保存：
 * 1. 内容或分类变化后走防抖写入；
 * 2. 关闭弹窗、页面隐藏或组件卸载时强制 flush，避免最后一次输入丢失；
 * 3. 空内容保持“不落库”约束，但不再依赖显式保存按钮。
 */
async function persistEditingRecord(): Promise<void> {
  const record = editingRecord.value;
  if (!record) {
    return;
  }
  const normalizedContent = String(editDraft.content ?? "").trim();
  const normalizedCategory = resolveDisplayCategory(editDraft.category);
  if (!normalizedContent) {
    return;
  }
  if (
    normalizedContent === record.content &&
    normalizedCategory === resolveDisplayCategory(record.category)
  ) {
    return;
  }
  await voiceRecordStore.updateRecord({
    id: record.id,
    content: normalizedContent,
    category: normalizedCategory
  });
}

function scheduleEditAutoSave(): void {
  if (!editingRecord.value) {
    return;
  }
  clearEditAutoSaveTimer();
  editAutoSaveTimer = setTimeout(() => {
    editAutoSaveTimer = null;
    void persistEditingRecord();
  }, RECORD_EDIT_AUTOSAVE_DELAY_MS);
}

async function closeEditDialog(): Promise<void> {
  await flushEditingRecordBeforeLeave();
  resetEditDialog();
}

async function flushEditingRecordBeforeLeave(): Promise<void> {
  clearEditAutoSaveTimer();
  await persistEditingRecord();
}

function openQuickCategoryDialog(recordId: string, event: MouseEvent): void {
  const target = event.currentTarget;
  quickCategoryAnchorRect.value = target instanceof HTMLElement ? target.getBoundingClientRect() : null;
  quickCategoryRecordId.value = recordId;
}

function closeQuickCategoryDialog(): void {
  quickCategoryRecordId.value = "";
  quickCategoryAnchorRect.value = null;
}

function closeFilterDialog(): void {
  filterDialogOpen.value = false;
}

function toggleFilterDialog(): void {
  filterDialogOpen.value = !filterDialogOpen.value;
}

function applyCategoryFilter(category: string): void {
  selectedCategoryFilter.value = String(category || "").trim();
  currentPage.value = 1;
  closeFilterDialog();
}

function onGlobalPointerDown(event: PointerEvent): void {
  const wrap = filterMenuWrapRef.value;
  if (!wrap) {
    closeFilterDialog();
    return;
  }
  const target = event.target;
  if (target instanceof Node && wrap.contains(target)) {
    return;
  }
  closeFilterDialog();
}

async function applyQuickCategory(category: string): Promise<void> {
  const record = quickCategoryRecord.value;
  if (!record) {
    return;
  }
  await voiceRecordStore.updateRecord({
    id: record.id,
    content: record.content,
    category: resolveDisplayCategory(category)
  });
  appStore.notify("info", "已更新闪念分类");
  closeQuickCategoryDialog();
}

async function goBack(): Promise<void> {
  if (!canGoBack.value) {
    return;
  }
  router.back();
}

onMounted(async () => {
  syncCanGoBack();
  window.addEventListener("popstate", syncCanGoBack);
  window.addEventListener("pagehide", flushEditingRecordBeforeLeave);
  document.addEventListener("visibilitychange", onDocumentVisibilityChange);
  document.addEventListener("pointerdown", onGlobalPointerDown);
  await Promise.all([voiceRecordStore.ensureBootstrapped(), settingsStore.ensureBootstrapped()]);
});

onBeforeUnmount(() => {
  window.removeEventListener("popstate", syncCanGoBack);
  window.removeEventListener("pagehide", flushEditingRecordBeforeLeave);
  document.removeEventListener("visibilitychange", onDocumentVisibilityChange);
  document.removeEventListener("pointerdown", onGlobalPointerDown);
  void flushEditingRecordBeforeLeave();
});

function onDocumentVisibilityChange(): void {
  if (document.visibilityState === "hidden") {
    void flushEditingRecordBeforeLeave();
  }
}

watch(totalPages, (nextPages) => {
  if (currentPage.value > nextPages) {
    currentPage.value = nextPages;
  }
});

watch(searchKeyword, () => {
  currentPage.value = 1;
});

watch(
  () => availableCategories.value.join("|"),
  () => {
    if (editingRecord.value) {
      editDraft.category = resolveDisplayCategory(editDraft.category);
    }
    if (selectedCategoryFilter.value && !availableCategories.value.includes(selectedCategoryFilter.value)) {
      selectedCategoryFilter.value = "";
    }
  }
);

watch(
  () => editRecordId.value,
  (recordId) => {
    if (!recordId) {
      return;
    }
    const record = voiceRecordStore.records.find((item) => item.id === recordId);
    if (!record) {
      closeEditDialog();
    }
  }
);

watch(
  () => [editRecordId.value, editDraft.category, editDraft.content],
  ([recordId]) => {
    if (!recordId) {
      clearEditAutoSaveTimer();
      return;
    }
    scheduleEditAutoSave();
  }
);

watch(
  () => quickCategoryRecordId.value,
  (recordId) => {
    if (!recordId) {
      return;
    }
    const record = voiceRecordStore.records.find((item) => item.id === recordId);
    if (!record) {
      closeQuickCategoryDialog();
    }
  }
);
</script>
