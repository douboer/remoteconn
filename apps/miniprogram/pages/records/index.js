/* global Page, wx, require, clearTimeout, setTimeout */

const {
  addRecord,
  searchRecords,
  removeRecord,
  updateRecord,
  getSettings,
  DEFAULT_VOICE_RECORD_CATEGORY_FALLBACK,
  normalizeVoiceRecordCategories
} = require("../../utils/storage");
const { pageOf } = require("../../utils/pagination");
const { buildThemeStyle, applyNavigationBarTheme } = require("../../utils/themeStyle");
const { buildButtonIconThemeMaps } = require("../../utils/themedIcons");
const { getWindowMetrics } = require("../../utils/systemInfoCompat");
const { buildPageCopy, formatTemplate, normalizeUiLanguage, t } = require("../../utils/i18n");
const { buildSvgButtonPressData, createSvgButtonPressMethods } = require("../../utils/svgButtonFeedback");

const PAGE_SIZE = 15;
/**
 * 左滑动作区固定为 2x2 四键：左列“废弃 / 已处理”，右列“复制 / 删除”。
 * 这里提供一个总宽度兜底，实际交互仍优先读取真实节点宽度。
 */
const SWIPE_ACTION_WIDTH_RPX = 240;
const DEFAULT_WINDOW_WIDTH_PX = 375;
const SWIPE_AXIS_LOCK_THRESHOLD_PX = 6;
const RECORD_EDIT_AUTOSAVE_DELAY_MS = 400;
const QUICK_CATEGORY_DIALOG_MIN_WIDTH_PX = 120;
const QUICK_CATEGORY_DIALOG_MAX_WIDTH_PX = 240;
const QUICK_CATEGORY_DIALOG_MIN_HEIGHT_PX = Math.round((QUICK_CATEGORY_DIALOG_MIN_WIDTH_PX * 3) / 4);
const QUICK_CATEGORY_BUBBLE_GAP_PX = 8;
const QUICK_CATEGORY_BUBBLE_RADIUS_BASE_PX = 12;
const QUICK_CATEGORY_BUBBLE_RADIUS_STEP_PX = 7.6;
const CATEGORY_COLOR_PALETTE = [
  { background: "rgba(91, 210, 255, 0.18)", border: "rgba(91, 210, 255, 0.36)" },
  { background: "rgba(255, 143, 107, 0.18)", border: "rgba(255, 143, 107, 0.36)" },
  { background: "rgba(141, 216, 123, 0.18)", border: "rgba(141, 216, 123, 0.36)" },
  { background: "rgba(255, 191, 105, 0.18)", border: "rgba(255, 191, 105, 0.36)" },
  { background: "rgba(199, 146, 234, 0.18)", border: "rgba(199, 146, 234, 0.36)" },
  { background: "rgba(255, 111, 145, 0.18)", border: "rgba(255, 111, 145, 0.36)" },
  { background: "rgba(99, 210, 255, 0.18)", border: "rgba(99, 210, 255, 0.36)" },
  { background: "rgba(78, 205, 196, 0.18)", border: "rgba(78, 205, 196, 0.36)" },
  { background: "rgba(255, 209, 102, 0.18)", border: "rgba(255, 209, 102, 0.36)" },
  { background: "rgba(144, 190, 109, 0.18)", border: "rgba(144, 190, 109, 0.36)" }
];

function resolveRecordCategories(settings) {
  const source = settings && typeof settings === "object" ? settings : {};
  const categories = normalizeVoiceRecordCategories(source.voiceRecordCategories);
  return categories.length > 0 ? categories : [DEFAULT_VOICE_RECORD_CATEGORY_FALLBACK];
}

function resolveVisibleCategory(rawCategory, categories) {
  const normalized = String(rawCategory || "").trim();
  if (normalized && categories.includes(normalized)) return normalized;
  return DEFAULT_VOICE_RECORD_CATEGORY_FALLBACK;
}

function resolveDefaultCategory(settings, categories) {
  const source = settings && typeof settings === "object" ? settings : {};
  const options = Array.isArray(categories) && categories.length > 0 ? categories : resolveRecordCategories(source);
  const normalized = String(source.voiceRecordDefaultCategory || "").trim();
  if (normalized && options.includes(normalized)) return normalized;
  return options[0] || DEFAULT_VOICE_RECORD_CATEGORY_FALLBACK;
}

/**
 * 分类色按当前分类顺序稳定分配，优先保证当前页面里的分类彼此不同。
 * 历史脏值已在外层先回退到可见分类，这里直接按展示分类映射即可。
 */
function buildCategoryStyle(category, orderedCategories) {
  const label =
    String(category || DEFAULT_VOICE_RECORD_CATEGORY_FALLBACK).trim() ||
    DEFAULT_VOICE_RECORD_CATEGORY_FALLBACK;
  const categories = Array.isArray(orderedCategories) ? orderedCategories : [];
  const paletteIndex = Math.max(0, categories.indexOf(label));
  const palette =
    CATEGORY_COLOR_PALETTE[paletteIndex % CATEGORY_COLOR_PALETTE.length] || CATEGORY_COLOR_PALETTE[0];
  return `background:${palette.background};border-color:${palette.border};`;
}

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function resolveQuickCategoryBubbleSize(category) {
  const length = Array.from(String(category || DEFAULT_VOICE_RECORD_CATEGORY_FALLBACK)).length;
  return Math.min(52, Math.max(34, 24 + length * 7));
}

function intersectsPlacedBubble(left, top, size, placedBubbles) {
  const centerX = left + size / 2;
  const centerY = top + size / 2;
  return placedBubbles.some((bubble) => {
    const otherCenterX = bubble.left + bubble.size / 2;
    const otherCenterY = bubble.top + bubble.size / 2;
    const minDistance = size / 2 + bubble.size / 2 + QUICK_CATEGORY_BUBBLE_GAP_PX;
    return Math.hypot(centerX - otherCenterX, centerY - otherCenterY) < minDistance;
  });
}

function buildBubbleCloudForBox(orderedCategories, currentCategory, width, height, colorCategories) {
  const centerX = width / 2;
  const centerY = height / 2;
  const placedBubbles = [];
  let collisionCount = 0;
  const items = orderedCategories.map((category, index) => {
    const size = resolveQuickCategoryBubbleSize(category);
    if (index === 0) {
      const left = Math.max(0, Math.min(width - size, centerX - size / 2));
      const top = Math.max(0, Math.min(height - size, centerY - size / 2));
      placedBubbles.push({ left, top, size });
      return {
        active: category === currentCategory,
        category,
        style: `width:${size}px;height:${size}px;left:${left}px;top:${top}px;`,
        categoryStyle: buildCategoryStyle(category, colorCategories)
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
      if (!isWithinWidth || !isWithinHeight) continue;
      if (intersectsPlacedBubble(candidateLeft, candidateTop, size, placedBubbles)) continue;
      fallbackLeft = candidateLeft;
      fallbackTop = candidateTop;
      placed = true;
      break;
    }
    if (!placed) collisionCount += 1;
    placedBubbles.push({ left: fallbackLeft, top: fallbackTop, size });
    return {
      active: category === currentCategory,
      category,
      style: `width:${size}px;height:${size}px;left:${fallbackLeft}px;top:${fallbackTop}px;`,
      categoryStyle: buildCategoryStyle(category, colorCategories)
    };
  });
  return { collisionCount, items };
}

function buildQuickCategoryLayout(categories, currentCategory, maxWidthPx) {
  const colorCategories = categories.slice();
  const orderedCategories = categories.slice().sort((left, right) => {
    if (left === currentCategory) return -1;
    if (right === currentCategory) return 1;
    return categories.indexOf(left) - categories.indexOf(right);
  });
  const longestLength = orderedCategories.reduce(
    (max, category) => Math.max(max, Array.from(String(category || "")).length),
    0
  );
  const estimatedWidth =
    QUICK_CATEGORY_DIALOG_MIN_WIDTH_PX +
    Math.max(0, orderedCategories.length - 3) * 22 +
    Math.max(0, longestLength - 2) * 8;
  const maxWidth = clampNumber(
    maxWidthPx || QUICK_CATEGORY_DIALOG_MAX_WIDTH_PX,
    QUICK_CATEGORY_DIALOG_MIN_WIDTH_PX,
    QUICK_CATEGORY_DIALOG_MAX_WIDTH_PX
  );
  let bestWidth = clampNumber(estimatedWidth, QUICK_CATEGORY_DIALOG_MIN_WIDTH_PX, maxWidth);
  let bestHeight = Math.max(QUICK_CATEGORY_DIALOG_MIN_HEIGHT_PX, Math.round((bestWidth * 3) / 4));
  let bestLayout = buildBubbleCloudForBox(
    orderedCategories,
    currentCategory,
    bestWidth,
    bestHeight,
    colorCategories
  );

  for (let width = QUICK_CATEGORY_DIALOG_MIN_WIDTH_PX; width <= maxWidth; width += 20) {
    const height = Math.max(QUICK_CATEGORY_DIALOG_MIN_HEIGHT_PX, Math.round((width * 3) / 4));
    const candidateLayout = buildBubbleCloudForBox(
      orderedCategories,
      currentCategory,
      width,
      height,
      colorCategories
    );
    if (candidateLayout.collisionCount < bestLayout.collisionCount) {
      bestWidth = width;
      bestHeight = height;
      bestLayout = candidateLayout;
    }
    if (candidateLayout.collisionCount === 0 && width >= bestWidth) {
      bestWidth = width;
      bestHeight = height;
      bestLayout = candidateLayout;
      break;
    }
  }

  return {
    width: bestWidth,
    height: bestHeight,
    items: bestLayout.items
  };
}

/**
 * 闪念页（小程序对齐 Web v2.2.0）：
 * 1. 顶部提供搜索和分类过滤；
 * 2. 支持左滑废弃 / 已处理 / 复制 / 删除、点击正文编辑、点击分类快速改分类；
 * 3. 过滤后分页，底部分页与新增 / 导出分区展示。
 */
Page({
  data: {
    ...buildSvgButtonPressData(),
    themeStyle: "",
    icons: {},
    accentIcons: {},
    copy: buildPageCopy("zh-Hans", "records"),
    page: 1,
    total: 0,
    totalPages: 1,
    rows: [],
    query: "",
    selectedCategory: "",
    categoryOptions: [],
    categoryMenuVisible: false,
    quickCategoryPopupVisible: false,
    quickCategoryRecordId: "",
    quickCategoryItems: [],
    quickCategoryWidthPx: QUICK_CATEGORY_DIALOG_MIN_WIDTH_PX,
    quickCategoryHeightPx: QUICK_CATEGORY_DIALOG_MIN_HEIGHT_PX,
    quickCategoryPanelStyle: "",
    editPopupVisible: false,
    editRecordId: "",
    editContent: "",
    editCategory: "",
    editUpdatedAtText: "",
    editUpdatedAtLabel: "",
    pageIndicatorText: t("zh-Hans", "common.pageIndicator", { page: 1, total: 1 })
  },

  swipeRuntime: null,
  editAutoSaveTimer: null,

  onShow() {
    this.syncWindowMetrics();
    const settings = getSettings();
    const language = normalizeUiLanguage(settings.uiLanguage);
    const copy = buildPageCopy(language, "records");
    const { icons, accentIcons } = buildButtonIconThemeMaps(settings);
    applyNavigationBarTheme(settings);
    wx.setNavigationBarTitle({ title: copy.navTitle || "闪念" });
    this.setData({
      themeStyle: buildThemeStyle(settings),
      icons,
      accentIcons,
      copy
    });
    this.reload();
  },

  onHide() {
    this.flushEditAutoSave();
  },

  onUnload() {
    this.flushEditAutoSave();
  },

  syncWindowMetrics() {
    try {
      const info = getWindowMetrics(wx);
      const width = Number(info.windowWidth);
      const height = Number(info.windowHeight);
      this.windowWidthPx = Number.isFinite(width) && width > 0 ? width : DEFAULT_WINDOW_WIDTH_PX;
      this.windowHeightPx = Number.isFinite(height) && height > 0 ? height : 667;
    } catch {
      this.windowWidthPx = DEFAULT_WINDOW_WIDTH_PX;
      this.windowHeightPx = 667;
    }
  },

  buildQuickCategoryPanelStyle(anchorRect, layout) {
    const rect = anchorRect && typeof anchorRect === "object" ? anchorRect : {};
    const width = Number(layout && layout.width) || QUICK_CATEGORY_DIALOG_MIN_WIDTH_PX;
    const height = Number(layout && layout.height) || QUICK_CATEGORY_DIALOG_MIN_HEIGHT_PX;
    const windowWidth = Number(this.windowWidthPx) || DEFAULT_WINDOW_WIDTH_PX;
    const windowHeight = Number(this.windowHeightPx) || 667;
    const panelPadding = 12;
    const gap = 8;
    const buttonLeft = Number(rect.left) || 0;
    const buttonTop = Number(rect.top) || 0;
    const buttonWidth = Number(rect.width) || 0;
    const buttonHeight = Number(rect.height) || 0;

    let left = buttonLeft + buttonWidth + gap;
    if (left + width + panelPadding > windowWidth) {
      left = buttonLeft - width - gap;
    }
    left = clampNumber(left, panelPadding, Math.max(panelPadding, windowWidth - width - panelPadding));

    const buttonCenterY = buttonTop + buttonHeight / 2;
    let top = buttonCenterY - height / 2 - panelPadding;
    top = clampNumber(top, panelPadding, Math.max(panelPadding, windowHeight - height - panelPadding));

    return `left:${left}px;top:${top}px;`;
  },

  getSwipeRevealPx() {
    if (Number.isFinite(this.swipeRevealPx) && this.swipeRevealPx > 0) {
      return this.swipeRevealPx;
    }
    const windowWidth = Number(this.windowWidthPx) || DEFAULT_WINDOW_WIDTH_PX;
    const actionWidthPx = Math.round((windowWidth * SWIPE_ACTION_WIDTH_RPX) / 750);
    return Math.max(24, actionWidthPx);
  },

  syncSwipeRevealWidth() {
    const query = this.createSelectorQuery();
    query
      .select(".record-item-actions-wrap")
      .boundingClientRect((rect) => {
        const width = Number(rect && rect.width);
        if (!Number.isFinite(width) || width <= 0) return;
        this.swipeRevealPx = Math.max(24, Math.round(width));
      })
      .exec();
  },

  /**
   * 先按关键字过滤，再用当前有效分类做展示过滤，保持与 web 的语义一致。
   */
  reload() {
    const settings = getSettings();
    const { icons, accentIcons } = buildButtonIconThemeMaps(settings);
    const categoryOptions = resolveRecordCategories(settings);
    const selectedCategory = categoryOptions.includes(this.data.selectedCategory)
      ? this.data.selectedCategory
      : "";
    const keyword = String(this.data.query || "").trim();
    const filtered = searchRecords({ keyword }).filter(
      (item) =>
        !selectedCategory || resolveVisibleCategory(item.category, categoryOptions) === selectedCategory
    );
    const paged = pageOf(filtered, this.data.page, PAGE_SIZE);
    const language = normalizeUiLanguage(settings.uiLanguage);
    const nextOffsets = {};
    const rows = paged.rows.map((item) => {
      const displayCategory = resolveVisibleCategory(item.category, categoryOptions);
      const swipeOffsetX =
        this.swipeOffsets && Number(this.swipeOffsets[item.id]) ? this.swipeOffsets[item.id] : 0;
      nextOffsets[item.id] = swipeOffsetX;
      return {
        ...item,
        processed: item.processed === true,
        discarded: item.discarded === true,
        isMuted: false,
        displayCategory,
        categoryStyle: buildCategoryStyle(displayCategory, categoryOptions),
        timeText: this.formatTime(item.createdAt),
        updatedAtText: this.formatTime(item.updatedAt),
        contextLabelText: item.contextLabel || this.data.copy.contextFallback || "未设置上下文",
        swipeOffsetX
      };
    });
    this.swipeOffsets = nextOffsets;
    this.swipeRuntime = null;
    this.setData(
      {
        themeStyle: buildThemeStyle(settings),
        icons,
        accentIcons,
        categoryOptions,
        selectedCategory,
        categoryMenuVisible: false,
        page: paged.page,
        total: paged.total,
        totalPages: paged.totalPages,
        rows,
        pageIndicatorText: t(language, "common.pageIndicator", {
          page: paged.page,
          total: paged.totalPages
        })
      },
      () => this.syncSwipeRevealWidth()
    );
  },

  formatTime(input) {
    if (!input) return "--";
    const date = new Date(input);
    if (Number.isNaN(+date)) return "--";
    const pad = (value) => String(value).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  },

  onQueryInput(event) {
    this.setData({ query: String(event.detail.value || ""), page: 1 }, () => this.reload());
  },

  onToggleCategoryMenu() {
    this.closeAllRows();
    this.closeQuickCategoryPopup();
    this.setData({ categoryMenuVisible: !this.data.categoryMenuVisible });
  },

  onSelectFilterCategory(event) {
    const category = String(event.currentTarget.dataset.category || "");
    this.setData({ selectedCategory: category, categoryMenuVisible: false, page: 1 }, () => this.reload());
  },

  onPrev() {
    this.setData({ page: Math.max(1, this.data.page - 1) }, () => this.reload());
  },

  onNext() {
    this.setData({ page: Math.min(this.data.totalPages, this.data.page + 1) }, () => this.reload());
  },

  /**
   * 新增入口复用现有编辑弹层：
   * 1. 先以空草稿和默认分类打开；
   * 2. 首次输入非空内容后自动创建记录；
   * 3. 后续继续沿用原有编辑自动保存链路。
   */
  onOpenCreate() {
    const settings = getSettings();
    const categoryOptions = this.data.categoryOptions.length
      ? this.data.categoryOptions.slice()
      : resolveRecordCategories(settings);
    this.clearEditAutoSaveTimer();
    this.closeAllRows();
    this.closeQuickCategoryPopup();
    this.setData({
      categoryMenuVisible: false,
      editPopupVisible: true,
      editRecordId: "",
      editContent: "",
      editCategory: resolveDefaultCategory(settings, categoryOptions),
      editUpdatedAtText: "",
      editUpdatedAtLabel: this.data.copy.newRecordHint || "输入后自动保存为新闪念"
    });
  },

  resolveTouchPoint(event) {
    const point =
      (event && event.touches && event.touches[0]) ||
      (event && event.changedTouches && event.changedTouches[0]) ||
      null;
    if (!point) return null;
    const x = Number(point.clientX);
    const y = Number(point.clientY);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x, y };
  },

  clampSwipeOffset(value) {
    const revealPx = this.getSwipeRevealPx();
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    if (numeric < -revealPx) return -revealPx;
    if (numeric > 0) return 0;
    return numeric;
  },

  findRowIndexById(id) {
    return this.data.rows.findIndex((item) => item.id === id);
  },

  updateRowSwipeOffset(id, offset) {
    const index = this.findRowIndexById(id);
    if (index < 0) return;
    const normalized = this.clampSwipeOffset(offset);
    this.swipeOffsets[id] = normalized;
    this.setData({ [`rows[${index}].swipeOffsetX`]: normalized });
  },

  closeOtherRows(exceptId) {
    const updates = {};
    this.data.rows.forEach((item, index) => {
      if (item.id === exceptId) return;
      if (item.swipeOffsetX === 0) return;
      this.swipeOffsets[item.id] = 0;
      updates[`rows[${index}].swipeOffsetX`] = 0;
    });
    if (Object.keys(updates).length > 0) this.setData(updates);
  },

  closeAllRows() {
    const updates = {};
    this.data.rows.forEach((item, index) => {
      if (item.swipeOffsetX === 0) return;
      this.swipeOffsets[item.id] = 0;
      updates[`rows[${index}].swipeOffsetX`] = 0;
    });
    if (Object.keys(updates).length > 0) this.setData(updates);
  },

  onListTap() {
    this.closeAllRows();
    if (this.data.categoryMenuVisible) {
      this.setData({ categoryMenuVisible: false });
    }
    this.closeQuickCategoryPopup();
  },

  onRecordTouchStart(event) {
    const id = event.currentTarget.dataset.id;
    if (!id) return;
    const point = this.resolveTouchPoint(event);
    if (!point) return;
    this.closeOtherRows(id);
    this.swipeRuntime = {
      id,
      startX: point.x,
      startY: point.y,
      startOffsetX: this.clampSwipeOffset((this.swipeOffsets && this.swipeOffsets[id]) || 0),
      dragging: false,
      blocked: false
    };
  },

  onRecordTouchMove(event) {
    const runtime = this.swipeRuntime;
    if (!runtime || runtime.blocked) return;
    const id = event.currentTarget.dataset.id;
    if (!id || id !== runtime.id) return;
    const point = this.resolveTouchPoint(event);
    if (!point) return;

    const deltaX = point.x - runtime.startX;
    const deltaY = point.y - runtime.startY;
    if (!runtime.dragging) {
      if (
        Math.abs(deltaX) < SWIPE_AXIS_LOCK_THRESHOLD_PX &&
        Math.abs(deltaY) < SWIPE_AXIS_LOCK_THRESHOLD_PX
      ) {
        return;
      }
      if (Math.abs(deltaY) > Math.abs(deltaX)) {
        runtime.blocked = true;
        return;
      }
      runtime.dragging = true;
    }

    this.updateRowSwipeOffset(id, runtime.startOffsetX + deltaX);
  },

  onRecordTouchEnd(event) {
    const runtime = this.swipeRuntime;
    this.swipeRuntime = null;
    if (!runtime || runtime.blocked) return;
    const id = event.currentTarget.dataset.id;
    if (!id || id !== runtime.id) return;
    const revealPx = this.getSwipeRevealPx();
    const current = this.clampSwipeOffset((this.swipeOffsets && this.swipeOffsets[id]) || 0);
    const shouldOpen = current <= -revealPx * 0.45;
    this.updateRowSwipeOffset(id, shouldOpen ? -revealPx : 0);
  },

  onDelete(event) {
    const id = String(event.currentTarget.dataset.id || "");
    if (!id) return;
    removeRecord(id);
    if (this.swipeOffsets) delete this.swipeOffsets[id];
    wx.showToast({ title: this.data.copy?.toast?.deleted || "已删除", icon: "success" });
    this.reload();
  },

  onCopy(event) {
    const id = String(event.currentTarget.dataset.id || "");
    const record = this.data.rows.find((item) => item.id === id);
    if (!record) return;
    wx.setClipboardData({
      data: String(record.content || ""),
      success: () => {
        this.closeAllRows();
        wx.showToast({ title: this.data.copy?.toast?.copied || "已复制", icon: "success" });
      }
    });
  },

  /**
   * “已处理”是一次性整理动作：
   * 1. 仅把当前闪念标记为已处理；
   * 2. 已处理状态继续允许编辑，但列表会整体降到 60% opacity；
   * 3. 重复点击保持幂等，只回显同一条成功提示。
   */
  onMarkProcessed(event) {
    const id = String(event.currentTarget.dataset.id || "");
    const record = this.data.rows.find((item) => item.id === id);
    if (!record) return;
    if (record.processed && !record.discarded) {
      this.closeAllRows();
      wx.showToast({ title: this.data.copy?.toast?.processed || "已处理", icon: "success" });
      return;
    }
    const updated = updateRecord({
      id: record.id,
      content: record.content,
      category: record.category || record.displayCategory,
      processed: true,
      discarded: false
    });
    if (!updated) {
      wx.showToast({ title: this.data.copy?.toast?.updateFailed || "更新失败", icon: "none" });
      return;
    }
    this.closeAllRows();
    wx.showToast({ title: this.data.copy?.toast?.processed || "已处理", icon: "success" });
    this.reload();
  },

  /**
   * “废弃”与“已处理”同属终态：
   * 1. 写入废弃后会自动取消已处理，保证两种状态互斥；
   * 2. 当前版本仅按需求收口按钮与状态，不额外改变正文内容；
   * 3. 列表视觉同样按 60% opacity 弱化，便于后续统一筛看。
   */
  onMarkDiscarded(event) {
    const id = String(event.currentTarget.dataset.id || "");
    const record = this.data.rows.find((item) => item.id === id);
    if (!record) return;
    if (record.discarded && !record.processed) {
      this.closeAllRows();
      wx.showToast({ title: this.data.copy?.toast?.discarded || "已废弃", icon: "success" });
      return;
    }
    const updated = updateRecord({
      id: record.id,
      content: record.content,
      category: record.category || record.displayCategory,
      processed: false,
      discarded: true
    });
    if (!updated) {
      wx.showToast({ title: this.data.copy?.toast?.updateFailed || "更新失败", icon: "none" });
      return;
    }
    this.closeAllRows();
    wx.showToast({ title: this.data.copy?.toast?.discarded || "已废弃", icon: "success" });
    this.reload();
  },

  /**
   * 点击左侧分类胶囊，改为页内弹层气泡云，避免原生 action sheet 破坏当前页面语义。
   */
  onQuickCategoryTap(event) {
    const recordId = String(event.currentTarget.dataset.id || "");
    const record = this.data.rows.find((item) => item.id === recordId);
    if (!record) return;
    const categories = this.data.categoryOptions.slice();
    if (categories.length === 0) return;
    const maxWidth = Math.max(
      QUICK_CATEGORY_DIALOG_MIN_WIDTH_PX,
      Math.min(
        QUICK_CATEGORY_DIALOG_MAX_WIDTH_PX,
        (Number(this.windowWidthPx) || DEFAULT_WINDOW_WIDTH_PX) - 48
      )
    );
    const layout = buildQuickCategoryLayout(categories, record.displayCategory, maxWidth);
    const anchorId = `#quick-category-${record.id}`;
    const query = this.createSelectorQuery();
    query.select(anchorId).boundingClientRect((rect) => {
      const panelStyle = this.buildQuickCategoryPanelStyle(rect, layout);
      this.closeAllRows();
      this.setData({
        quickCategoryPopupVisible: true,
        quickCategoryRecordId: record.id,
        quickCategoryItems: layout.items,
        quickCategoryWidthPx: layout.width,
        quickCategoryHeightPx: layout.height,
        quickCategoryPanelStyle: panelStyle
      });
    });
    query.exec();
  },

  closeQuickCategoryPopup() {
    if (!this.data.quickCategoryPopupVisible) return;
    this.setData({
      quickCategoryPopupVisible: false,
      quickCategoryRecordId: "",
      quickCategoryItems: [],
      quickCategoryPanelStyle: ""
    });
  },

  onApplyQuickCategory(event) {
    const recordId = String(this.data.quickCategoryRecordId || "");
    const record = this.data.rows.find((item) => item.id === recordId);
    const nextCategory = String(event.currentTarget.dataset.category || "");
    if (!record || !nextCategory || nextCategory === record.displayCategory) {
      this.closeQuickCategoryPopup();
      return;
    }
    const updated = updateRecord({
      id: record.id,
      content: record.content,
      category: nextCategory
    });
    if (!updated) {
      wx.showToast({ title: this.data.copy?.toast?.updateFailed || "更新失败", icon: "none" });
      return;
    }
    wx.showToast({ title: this.data.copy?.toast?.categoryUpdated || "分类已更新", icon: "success" });
    this.closeQuickCategoryPopup();
    this.reload();
  },

  onOpenEdit(event) {
    const recordId = String(event.currentTarget.dataset.id || "");
    const record = this.data.rows.find((item) => item.id === recordId);
    if (!record) return;
    if (Number(record.swipeOffsetX) < 0) {
      this.updateRowSwipeOffset(recordId, 0);
      return;
    }
    this.clearEditAutoSaveTimer();
    this.setData({
      editPopupVisible: true,
      editRecordId: record.id,
      editContent: record.content || "",
      editCategory: record.displayCategory,
      editUpdatedAtText: record.updatedAtText || this.formatTime(record.updatedAt),
      editUpdatedAtLabel: formatTemplate(this.data.copy.updatedAtPrefix, {
        time: record.updatedAtText || this.formatTime(record.updatedAt)
      })
    });
  },

  resetEditState() {
    this.clearEditAutoSaveTimer();
    this.setData({
      editPopupVisible: false,
      editRecordId: "",
      editContent: "",
      editCategory: "",
      editUpdatedAtText: "",
      editUpdatedAtLabel: ""
    });
  },

  onCloseEdit() {
    this.flushEditAutoSave();
    this.resetEditState();
  },

  onEditContentInput(event) {
    this.setData({ editContent: String(event.detail.value || "") }, () => this.scheduleEditAutoSave());
  },

  onEditCategoryTap(event) {
    const category = String(event.currentTarget.dataset.category || "");
    if (!category) return;
    this.setData({ editCategory: category }, () => this.scheduleEditAutoSave());
  },

  /**
   * 编辑弹窗改为自动保存：
   * 1. 内容或分类变化后走 400ms 防抖；
   * 2. 关闭弹窗、页面隐藏、页面卸载时立即 flush；
   * 3. 空内容继续不写回存储，避免误清空历史闪念。
   */
  persistEditDraft() {
    const recordId = String(this.data.editRecordId || "").trim();
    const content = String(this.data.editContent || "").trim();
    const category = String(this.data.editCategory || "").trim();
    if (!content) return null;
    if (!recordId) {
      const created = addRecord(content, "", {
        category: category || DEFAULT_VOICE_RECORD_CATEGORY_FALLBACK
      });
      if (!created) return null;
      const updatedAtText = this.formatTime(created.updatedAt);
      this.reload();
      this.setData({
        editRecordId: created.id,
        editContent: created.content,
        editCategory: created.category,
        editUpdatedAtText: updatedAtText,
        editUpdatedAtLabel: formatTemplate(this.data.copy.updatedAtPrefix, { time: updatedAtText })
      });
      return created;
    }
    const currentRecord = searchRecords({ keyword: "" }).find((item) => item.id === recordId);
    const normalizedCategory = category || DEFAULT_VOICE_RECORD_CATEGORY_FALLBACK;
    if (
      currentRecord &&
      String(currentRecord.content || "").trim() === content &&
      String(currentRecord.category || DEFAULT_VOICE_RECORD_CATEGORY_FALLBACK).trim() === normalizedCategory
    ) {
      return currentRecord;
    }
    const updated = updateRecord({
      id: recordId,
      content,
      category: normalizedCategory
    });
    if (!updated) return null;
    this.reload();
    const updatedAtText = this.formatTime(updated.updatedAt);
    this.setData({
      editUpdatedAtText: updatedAtText,
      editUpdatedAtLabel: formatTemplate(this.data.copy.updatedAtPrefix, { time: updatedAtText })
    });
    return updated;
  },

  clearEditAutoSaveTimer() {
    if (!this.editAutoSaveTimer) return;
    clearTimeout(this.editAutoSaveTimer);
    this.editAutoSaveTimer = null;
  },

  scheduleEditAutoSave() {
    if (!this.data.editPopupVisible) return;
    this.clearEditAutoSaveTimer();
    this.editAutoSaveTimer = setTimeout(() => {
      this.editAutoSaveTimer = null;
      this.persistEditDraft();
    }, RECORD_EDIT_AUTOSAVE_DELAY_MS);
  },

  flushEditAutoSave() {
    this.clearEditAutoSaveTimer();
    this.persistEditDraft();
  },

  onExport() {
    const settings = getSettings();
    const categoryOptions = resolveRecordCategories(settings);
    const selectedCategory = categoryOptions.includes(this.data.selectedCategory)
      ? this.data.selectedCategory
      : "";
    const keyword = String(this.data.query || "").trim();
    const rows = searchRecords({ keyword }).filter(
      (item) =>
        !selectedCategory || resolveVisibleCategory(item.category, categoryOptions) === selectedCategory
    );
    const content = rows
      .map((item) => {
        const displayCategory = resolveVisibleCategory(item.category, categoryOptions);
        const exportFields = this.data.copy.exportFields || {};
        return [
          `${exportFields.createdAt || "创建时间"}：${this.formatTime(item.createdAt)}`,
          `${exportFields.updatedAt || "更新时间"}：${this.formatTime(item.updatedAt)}`,
          `${exportFields.server || "服务器"}：${item.serverId || "-"}`,
          `${exportFields.category || "分类"}：${displayCategory}`,
          `${exportFields.context || "上下文"}：${item.contextLabel || "-"}`,
          String(item.content || "")
        ].join("\n");
      })
      .join("\n\n");
    wx.setClipboardData({
      data: content || "",
      success: () => wx.showToast({ title: this.data.copy?.toast?.exported || "闪念已复制", icon: "success" })
    });
  },

  noop() {},
  ...createSvgButtonPressMethods()
});
