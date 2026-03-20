<template>
  <section class="page-root settings-page">
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
      <h2 class="page-title">全局配置</h2>
      <div class="toolbar-right settings-save-ops">
        <span class="settings-save-status">{{ saveStatusText }}</span>
        <button class="btn primary" type="button" :disabled="manualSaving" @click="saveNow">
          {{ manualSaving ? "保存中..." : "保存设置" }}
        </button>
      </div>
    </div>

    <!-- Tab 导航 -->
    <nav class="settings-tabs">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        class="settings-tab-btn"
        :class="{ active: activeTab === tab.id }"
        @click="activeTab = tab.id"
      >{{ tab.label }}</button>
    </nav>

    <!-- 用户界面 Tab -->
    <article v-if="activeTab === 'ui'" class="surface-panel settings-card">
      <div class="settings-section-headline">
        <h4>用户界面</h4>
        <p class="settings-section-copy">应用外观与主题模式</p>
      </div>
      <div class="field-grid">
        <label class="field">
          <span>模式</span>
          <div class="field-control">
            <div class="segmented-control">
              <button
                v-for="option in THEME_MODE_OPTIONS"
                :key="`ui-theme-mode-${option.value}`"
                class="segmented-option"
                :class="{ active: draft.uiThemeMode === option.value }"
                type="button"
                @click="draft.uiThemeMode = option.value"
              >
                {{ option.label }}
              </button>
            </div>
          </div>
        </label>
        <label class="field">
          <span>主题</span>
          <div class="field-control">
            <div class="pill-scroll">
              <div class="pill-row">
                <button
                  v-for="option in THEME_PRESET_OPTIONS"
                  :key="`ui-theme-preset-${option.value}`"
                  class="pill-option"
                  :class="{ active: draft.uiThemePreset === option.value }"
                  type="button"
                  @click="draft.uiThemePreset = option.value"
                >
                  {{ option.label }}
                </button>
              </div>
            </div>
          </div>
        </label>
        <label class="field">
          <span>强调色</span>
          <div class="field-control color-control">
            <input v-model="draft.uiAccentColor" class="input color-input" type="color" />
            <span class="field-value">{{ draft.uiAccentColor }}</span>
          </div>
        </label>
        <label class="field">
          <span>背景色</span>
          <div class="field-control color-control">
            <input v-model="draft.uiBgColor" class="input color-input" type="color" />
            <span class="field-value">{{ draft.uiBgColor }}</span>
          </div>
        </label>
        <label class="field">
          <span>文本色</span>
          <div class="field-control color-control">
            <input v-model="draft.uiTextColor" class="input color-input" type="color" />
            <span class="field-value">{{ draft.uiTextColor }}</span>
          </div>
        </label>
        <label class="field">
          <span>按钮色</span>
          <div class="field-control color-control">
            <input v-model="draft.uiBtnColor" class="input color-input" type="color" />
            <span class="field-value">{{ draft.uiBtnColor }}</span>
          </div>
        </label>
      </div>
    </article>

    <!-- Shell Tab -->
    <section v-if="activeTab === 'shell'" class="settings-card-stack">
      <article class="surface-panel settings-card">
        <div class="settings-section-headline">
          <h4>显示设置</h4>
          <p class="settings-section-copy">终端显示和输入体验</p>
        </div>
        <section class="shell-style-preview" :style="shellPreviewStyle" aria-label="终端样式预览">
          <pre class="shell-style-preview-content">{{ shellPreviewDemoText }}</pre>
        </section>
        <div class="field-grid">
          <label class="field">
            <span>模式</span>
            <div class="field-control">
              <div class="segmented-control">
                <button
                  v-for="option in THEME_MODE_OPTIONS"
                  :key="`shell-theme-mode-${option.value}`"
                  class="segmented-option"
                  :class="{ active: draft.shellThemeMode === option.value }"
                  type="button"
                  @click="draft.shellThemeMode = option.value"
                >
                  {{ option.label }}
                </button>
              </div>
            </div>
          </label>
          <label class="field">
            <span>主题</span>
            <div class="field-control">
              <div class="pill-scroll">
                <div class="pill-row">
                  <button
                    v-for="option in THEME_PRESET_OPTIONS"
                    :key="`shell-theme-preset-${option.value}`"
                    class="pill-option"
                    :class="{ active: draft.shellThemePreset === option.value }"
                    type="button"
                    @click="draft.shellThemePreset = option.value"
                  >
                    {{ option.label }}
                  </button>
                </div>
              </div>
            </div>
          </label>
          <label class="field">
            <span>背景色</span>
            <div class="field-control color-control">
              <input v-model="draft.shellBgColor" class="input color-input" type="color" />
              <span class="field-value">{{ draft.shellBgColor }}</span>
            </div>
          </label>
          <label class="field">
            <span>前景色</span>
            <div class="field-control color-control">
              <input v-model="draft.shellTextColor" class="input color-input" type="color" />
              <span class="field-value">{{ draft.shellTextColor }}</span>
            </div>
          </label>
          <label class="field">
            <span>强调色/光标色</span>
            <div class="field-control color-control">
              <input v-model="draft.shellAccentColor" class="input color-input" type="color" />
              <span class="field-value">{{ draft.shellAccentColor }}</span>
            </div>
          </label>
          <label class="field">
            <span>字体</span>
            <div class="field-control field-control--stack">
              <div class="pill-scroll">
                <div class="pill-row">
                  <button
                    v-for="font in availableFonts"
                    :key="`font-${font}`"
                    class="pill-option pill-option--font"
                    :class="{ active: fontFamilySelect === font }"
                    type="button"
                    @click="selectFontFamily(font)"
                  >
                    {{ font }}
                  </button>
                  <button
                    class="pill-option pill-option--font"
                    :class="{ active: fontFamilySelect === CUSTOM_FONT_VALUE }"
                    type="button"
                    @click="selectFontFamily(CUSTOM_FONT_VALUE)"
                  >
                    自定义
                  </button>
                </div>
              </div>
              <input
                v-if="fontFamilySelect === CUSTOM_FONT_VALUE"
                v-model="draft.shellFontFamily"
                class="input"
                placeholder="输入字体名称"
              />
            </div>
          </label>
          <label class="field">
            <span>字号</span>
            <input v-model.number="draft.shellFontSize" class="input" type="number" min="12" max="22" />
          </label>
          <label class="field">
            <span>行高</span>
            <input v-model.number="draft.shellLineHeight" class="input" type="number" step="0.1" min="1" max="2" />
          </label>
          <label class="field">
            <span>宽字符支持</span>
            <div class="field-control">
              <div class="segmented-control">
                <button
                  v-for="option in UNICODE11_OPTIONS"
                  :key="`unicode11-${String(option.value)}`"
                  class="segmented-option"
                  :class="{ active: draft.unicode11 === option.value }"
                  type="button"
                  @click="draft.unicode11 = option.value"
                >
                  {{ option.label }}
                </button>
              </div>
            </div>
          </label>
        </div>
      </article>

      <article class="surface-panel settings-card">
        <div class="settings-section-headline">
          <h4>终端缓冲</h4>
          <p class="settings-section-copy">限制渲染堆积，维持长会话流畅度</p>
        </div>
        <div class="field-grid">
          <label class="field">
            <span>缓冲行数上限</span>
            <input v-model.number="draft.terminalBufferMaxEntries" class="input" type="number" step="100" min="200" />
          </label>
          <label class="field">
            <span>缓冲字节上限</span>
            <input v-model.number="draft.terminalBufferMaxBytes" class="input" type="number" step="65536" min="65536" />
          </label>
        </div>
      </article>
    </section>

    <!-- 连接策略 Tab -->
    <section v-if="activeTab === 'connection'" class="settings-card-stack">
      <article class="surface-panel settings-card">
        <div class="settings-section-headline">
          <h4>连接策略</h4>
          <p class="settings-section-copy">管理重连、安全策略和会话等待</p>
        </div>
        <div class="field-grid">
          <div class="field wide settings-toggle-field">
            <div class="settings-toggle-copy">
              <span class="settings-toggle-title">自动重连</span>
              <p class="settings-toggle-desc">SSH 非主动断开时自动尝试重连，默认开启。</p>
            </div>
            <button
              class="server-settings-switch"
              :class="{ active: draft.autoReconnect }"
              type="button"
              aria-label="自动重连"
              :aria-pressed="draft.autoReconnect"
              @click="draft.autoReconnect = !draft.autoReconnect"
            >
              <span class="server-settings-switch-knob"></span>
            </button>
          </div>
          <label class="field">
            <span>重连次数上限</span>
            <input v-model.number="draft.reconnectLimit" class="input" type="number" min="0" max="10" />
          </label>
          <label class="field">
            <span>主机指纹策略</span>
            <div class="field-control">
              <div class="pill-scroll">
                <div class="pill-row">
                  <button
                    v-for="option in HOST_KEY_POLICY_OPTIONS"
                    :key="`host-key-policy-${option.value}`"
                    class="pill-option"
                    :class="{ active: draft.hostKeyPolicy === option.value }"
                    type="button"
                    @click="draft.hostKeyPolicy = option.value"
                  >
                    {{ option.label }}
                  </button>
                </div>
              </div>
            </div>
          </label>
          <label class="field">
            <span>凭据记忆策略</span>
            <div class="field-control">
              <div class="segmented-control">
                <button
                  v-for="option in CREDENTIAL_MEMORY_POLICY_OPTIONS"
                  :key="`credential-memory-${option.value}`"
                  class="segmented-option"
                  :class="{ active: draft.credentialMemoryPolicy === option.value }"
                  type="button"
                  @click="draft.credentialMemoryPolicy = option.value"
                >
                  {{ option.label }}
                </button>
              </div>
            </div>
          </label>
          <label class="field">
            <span>连接超时（毫秒）</span>
            <input v-model.number="draft.gatewayConnectTimeoutMs" class="input" type="number" min="3000" step="1000" />
          </label>
          <label class="field">
            <span>等待就绪超时（毫秒）</span>
            <input v-model.number="draft.waitForConnectedTimeoutMs" class="input" type="number" min="3000" step="1000" />
          </label>
        </div>
      </article>

      <article class="surface-panel settings-card">
        <div class="settings-section-headline">
          <h4>服务器默认配置</h4>
          <p class="settings-section-copy">新建服务器时自动预填默认参数</p>
        </div>
        <div class="field-grid">
          <label class="field">
            <span>默认认证方式</span>
            <div class="field-control">
              <div class="segmented-control">
                <button
                  v-for="option in DEFAULT_AUTH_TYPE_OPTIONS"
                  :key="`default-auth-${option.value}`"
                  class="segmented-option"
                  :class="{ active: draft.defaultAuthType === option.value }"
                  type="button"
                  @click="draft.defaultAuthType = option.value"
                >
                  {{ option.label }}
                </button>
              </div>
            </div>
          </label>
          <label class="field">
            <span>默认 SSH 端口</span>
            <input v-model.number="draft.defaultPort" class="input" type="number" min="1" max="65535" />
          </label>
          <label class="field">
            <span>默认项目路径</span>
            <input v-model="draft.defaultProjectPath" class="input" placeholder="~/workspace" />
          </label>
          <label class="field">
            <span>默认连接超时（秒）</span>
            <input v-model.number="draft.defaultTimeoutSeconds" class="input" type="number" min="5" />
          </label>
          <label class="field">
            <span>默认心跳间隔（秒）</span>
            <input v-model.number="draft.defaultHeartbeatSeconds" class="input" type="number" min="5" />
          </label>
        </div>
      </article>
    </section>

    <!-- 记录 Tab -->
    <section v-if="activeTab === 'log'" class="settings-card-stack">
      <article class="surface-panel settings-card">
        <div class="settings-section-headline">
          <h4>记录设置</h4>
          <p class="settings-section-copy">控制保留策略与敏感信息展示</p>
        </div>
        <div class="field-grid">
          <label class="field">
            <span>日志保留天数</span>
            <input v-model.number="draft.logRetentionDays" class="input" type="number" min="1" max="365" />
          </label>
          <label class="field">
            <span>日志脱敏</span>
            <div class="field-control">
              <div class="segmented-control">
                <button
                  v-for="option in MASK_SECRETS_OPTIONS"
                  :key="`mask-secrets-${String(option.value)}`"
                  class="segmented-option"
                  :class="{ active: draft.maskSecrets === option.value }"
                  type="button"
                  @click="draft.maskSecrets = option.value"
                >
                  {{ option.label }}
                </button>
              </div>
            </div>
          </label>
        </div>
      </article>

      <article class="surface-panel settings-card">
        <div class="settings-section-headline">
          <h4>闪念分类</h4>
          <p class="settings-section-copy">维护管理闪念分类</p>
        </div>
        <div class="field-grid">
          <label class="field wide">
            <span>新增分类</span>
            <div class="field-control field-control--stack">
              <div class="settings-inline-create">
                <input
                  v-model="newVoiceRecordCategory"
                  class="input"
                  maxlength="12"
                  placeholder="输入分类名称，最多 10 个"
                  @keydown.enter.prevent="addVoiceRecordCategory"
                />
                <button class="btn" type="button" @click="addVoiceRecordCategory">新增</button>
              </div>
            </div>
          </label>

          <label class="field wide settings-field-block">
            <span class="settings-field-title">分类列表</span>
            <div class="field-control field-control--stack">
              <div class="settings-category-grid">
                <button
                  v-for="category in draft.voiceRecordCategories"
                  :key="`voice-record-category-${category}`"
                  class="settings-category-card"
                  :class="{
                    active: selectedVoiceRecordCategory === category,
                    'is-default': draft.voiceRecordDefaultCategory === category,
                    'is-dragging': draggingVoiceRecordCategory === category,
                    'is-drag-over': dragOverVoiceRecordCategory === category && draggingVoiceRecordCategory !== category
                  }"
                  type="button"
                  draggable="true"
                  @click="selectedVoiceRecordCategory = category"
                  @dragstart="onVoiceRecordCategoryDragStart(category, $event)"
                  @dragover="onVoiceRecordCategoryDragOver(category, $event)"
                  @drop="onVoiceRecordCategoryDrop(category, $event)"
                  @dragend="onVoiceRecordCategoryDragEnd"
                >
                  <span class="settings-category-card-head">
                    <span class="settings-category-card-title">{{ category }}</span>
                    <span v-if="draft.voiceRecordDefaultCategory === category" class="settings-category-card-badge">默认</span>
                  </span>
                </button>
              </div>
              <div class="settings-category-actions">
                <button
                  class="btn"
                  type="button"
                  :disabled="!selectedVoiceRecordCategory || draft.voiceRecordDefaultCategory === selectedVoiceRecordCategory"
                  @click="applySelectedVoiceRecordCategoryAsDefault"
                >
                  设为默认
                </button>
                <button
                  class="btn"
                  type="button"
                  :disabled="!selectedVoiceRecordCategory || selectedVoiceRecordCategory === DEFAULT_VOICE_RECORD_CATEGORY_FALLBACK"
                  @click="removeSelectedVoiceRecordCategory"
                >
                  删除所选
                </button>
              </div>
            </div>
          </label>
        </div>
      </article>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, nextTick, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import type { HostKeyPolicy, ThemePreset } from "@/types/app";
import { useSettingsStore } from "@/stores/settingsStore";
import { useRememberedEnumRef } from "@/utils/useRememberedEnumRef";
import {
  DEFAULT_VOICE_RECORD_CATEGORIES,
  DEFAULT_VOICE_RECORD_CATEGORY_FALLBACK,
  DEFAULT_VOICE_RECORD_DEFAULT_CATEGORY
} from "@/utils/defaults";
import { buildThemePresetOptions } from "@/utils/themePresetLabels";
import { getThemeVariant, getShellVariant, pickBtnColor } from "@remoteconn/shared";

const settingsStore = useSettingsStore();
const router = useRouter();
const canGoBack = ref(false);

const tabs = [
  { id: "ui", label: "界面" },
  { id: "shell", label: "终端" },
  { id: "connection", label: "连接" },
  { id: "log", label: "记录" }
] as const;
type TabId = (typeof tabs)[number]["id"];
type ChoiceOption<T extends string | boolean> = { label: string; value: T };

const THEME_MODE_OPTIONS: Array<ChoiceOption<"dark" | "light">> = [
  { label: "深色", value: "dark" },
  { label: "浅色", value: "light" }
];

const THEME_PRESET_OPTIONS: Array<ChoiceOption<ThemePreset>> = buildThemePresetOptions();

const UNICODE11_OPTIONS: Array<ChoiceOption<boolean>> = [
  { label: "启用", value: true },
  { label: "禁用", value: false }
];

const HOST_KEY_POLICY_OPTIONS: Array<ChoiceOption<HostKeyPolicy>> = [
  { label: "strict（严格确认）", value: "strict" },
  { label: "trustFirstUse（首次信任）", value: "trustFirstUse" },
  { label: "manualEachTime（每次确认）", value: "manualEachTime" }
];

const CREDENTIAL_MEMORY_POLICY_OPTIONS: Array<ChoiceOption<"remember" | "forget">> = [
  { label: "remember", value: "remember" },
  { label: "forget", value: "forget" }
];

const DEFAULT_AUTH_TYPE_OPTIONS: Array<ChoiceOption<"password" | "key">> = [
  { label: "密码", value: "password" },
  { label: "密钥", value: "key" }
];

const MASK_SECRETS_OPTIONS: Array<ChoiceOption<boolean>> = [
  { label: "开启（推荐）", value: true },
  { label: "关闭", value: false }
];
const MAX_VOICE_RECORD_CATEGORIES = 10;

const activeTab = ref<TabId>("ui");
const SETTINGS_ACTIVE_TAB_KEY = "remoteconn.settings.activeTab";
const TAB_IDS = tabs.map((tab) => tab.id) as TabId[];
useRememberedEnumRef({
  storageKey: SETTINGS_ACTIVE_TAB_KEY,
  allowedValues: TAB_IDS,
  target: activeTab
});

const draft = reactive({ ...settingsStore.settings });
const newVoiceRecordCategory = ref("");
const selectedVoiceRecordCategory = ref(DEFAULT_VOICE_RECORD_DEFAULT_CATEGORY);
const draggingVoiceRecordCategory = ref("");
const dragOverVoiceRecordCategory = ref("");

// ── 初始化完成标志：防止 bootstrap 前的 draft 变动触发自动保存或预设联动 ──
const initialized = ref(false);

// ── 主题预设/模式联动：选择预设或切换明暗后自动覆写对应颜色字段（仅初始化后生效） ──
function applyUiPreset(): void {
  const v = getThemeVariant(draft.uiThemePreset, draft.uiThemeMode);
  draft.uiBgColor = v.bg;
  draft.uiTextColor = v.text;
  draft.uiAccentColor = v.accent;
  draft.uiBtnColor = pickBtnColor(v.bg, v.text);
}

watch(
  () => draft.uiThemePreset,
  () => {
    if (!initialized.value) return;
    applyUiPreset();
  }
);

watch(
  () => draft.uiThemeMode,
  () => {
    if (!initialized.value) return;
    applyUiPreset();
  }
);

watch(
  () => draft.shellThemePreset,
  (preset) => {
    if (!initialized.value) return;
    const v = getShellVariant(preset, draft.shellThemeMode);
    draft.shellBgColor = v.bg;
    draft.shellTextColor = v.text;
    draft.shellAccentColor = v.cursor;
  }
);

watch(
  () => draft.shellThemeMode,
  (mode) => {
    if (!initialized.value) return;
    const v = getShellVariant(draft.shellThemePreset, mode);
    draft.shellBgColor = v.bg;
    draft.shellTextColor = v.text;
    draft.shellAccentColor = v.cursor;
  }
);

// ── 自动保存：draft 任意字段变更后防抖写入持久化（仅初始化后生效） ──────────
let saveTimer: ReturnType<typeof setTimeout> | null = null;
const manualSaving = ref(false);
const saveStatus = ref<"idle" | "saved" | "error">("idle");

const saveStatusText = computed(() => {
  if (manualSaving.value) return "正在保存";
  if (saveStatus.value === "saved") return "已保存";
  if (saveStatus.value === "error") return "保存失败";
  return "自动保存已开启";
});

/**
 * 规范化预览字体族字符串：
 * - 字体名包含空格时必须加引号（如 "PingFang SC"），否则 CSS 会拆成多个 family token；
 * - 用户可能输入逗号分隔列表（如 ui-monospace, -apple-system），此时保持原样；
 * - 始终追加一组稳定的 monospace 回退，避免“看起来没生效”但实际回落到比例字体。
 */
function resolvePreviewFontFamily(raw: string): string {
  const value = String(raw ?? "").trim();
  const fallback = '"SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", monospace';
  if (!value) {
    return fallback;
  }
  if (value.includes(",")) {
    return `${value}, ${fallback}`;
  }
  const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  if (/\s/.test(value)) {
    return `"${escaped}", ${fallback}`;
  }
  return `${escaped}, ${fallback}`;
}

/**
 * 终端样式预览：
 * - 仅做视觉回显，不引入 xterm 运行时，保持轻量；
 * - 与草稿配置实时联动，确保用户调参时立刻看到效果。
 */
const shellPreviewStyle = computed(() => ({
  width: "100%",
  // 高度采用 hug（内容自适应），不再固定 160px。
  height: "auto",
  minHeight: "unset",
  maxHeight: "unset",
  flex: "0 0 auto",
  padding: "8px 10px",
  borderRadius: "10px",
  border: "1px solid rgba(141, 187, 255, 0.38)",
  overflow: "visible",
  // 使用 backgroundColor 而非 background，避免覆盖 CSS 中的轻量纹理层。
  backgroundColor: draft.shellBgColor,
  color: draft.shellTextColor,
  fontFamily: resolvePreviewFontFamily(draft.shellFontFamily),
  // 预览层仅做 UI 展示，限制范围避免历史异常值导致内容塌缩不可见。
  fontSize: `${Math.min(22, Math.max(12, Number(draft.shellFontSize) || 15))}px`,
  lineHeight: String(Math.min(2, Math.max(1, Number(draft.shellLineHeight) || 1.4)))
}));

/**
 * 终端预览 Demo 文本：
 * - 覆盖提示符、登录信息、常见命令、目录列表、错误信息、JSON、长路径与中英混排；
 * - 仅用于样式观感，不参与任何会话逻辑。
 */
const shellPreviewDemoText = computed(() =>
  [
    "Last Login: Wea Feb 25 13:38:27 2026 from 115.193.12.66",
    "gavin mini ~ % ls -la",
    "drwxr-xr-x  4 gavin staff 128 Feb 25 15:20 workspace",
    "gavin mini ~ % npm run test && npm run lint",
    "zsh: command not found: codexx",
    "{\"state\":\"connected\",\"latencyMs\":12,\"retry\":0,\"transport\":\"gateway\"}",
    `Unicode11: ${draft.unicode11 ? "on" : "off"} | 中文 ABC 123 |_END_`
  ].join("\n")
);

async function persistDraftNow(trackStatus = false): Promise<void> {
  if (!initialized.value) return;
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (trackStatus) {
    manualSaving.value = true;
  }
  try {
    await settingsStore.save({ ...draft });
    saveStatus.value = "saved";
  } catch {
    saveStatus.value = "error";
  } finally {
    if (trackStatus) {
      manualSaving.value = false;
    }
  }
}

function schedulePersistDraft(): void {
  if (!initialized.value) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    await persistDraftNow(false);
  }, 400);
}

watch(
  draft,
  () => {
    schedulePersistDraft();
  },
  { deep: true }
);

function onPageVisibilityChange(): void {
  if (document.visibilityState === "hidden") {
    void persistDraftNow(false);
  }
}

function onPageHide(): void {
  void persistDraftNow(false);
}

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

async function saveNow(): Promise<void> {
  await persistDraftNow(true);
}

// ── 字体候选（中英常用，固定 16 项）────────────────────────────
const CANDIDATE_FONTS = [
  "JetBrains Mono",
  "Fira Code",
  "Cascadia Mono",
  "Source Code Pro",
  "IBM Plex Mono",
  "SF Mono",
  "Menlo",
  "Monaco",
  "Consolas",
  "PingFang SC",
  "Hiragino Sans GB",
  "Microsoft YaHei",
  "Noto Sans Mono CJK SC",
  "Noto Sans CJK SC",
  "Source Han Sans SC",
  "Sarasa Mono SC",
  "WenQuanYi Micro Hei",
];

/**
 * iOS / iPadOS 字体白名单：
 * - Safari/WebView 对本地字体探测能力有限，容易把可用字体误判为不可用；
 * - 因此 iOS 上使用“稳定白名单”直接展示，减少“只有两个字体”的误判。
 */
const IOS_SAFE_FONTS = [
  "ui-monospace",
  "SF Mono",
  "Menlo",
  "Monaco",
  "Courier",
  "Courier New",
  "PingFang SC",
  "Hiragino Sans GB",
  "-apple-system",
];

const availableFonts = ref<string[]>(CANDIDATE_FONTS);
const CUSTOM_FONT_VALUE = "__custom__";
const fontFamilySelect = ref<string>(CUSTOM_FONT_VALUE);

/**
 * 判断是否 iOS / iPadOS 运行环境：
 * - iPadOS 新版可能上报为 MacIntel + 触控点；
 * - 这里统一归并到 iOS 分支，使用稳定字体白名单。
 */
function isIosLike(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }
  const ua = String(navigator.userAgent ?? "");
  const isClassicIos = /iPhone|iPad|iPod/i.test(ua);
  const isIpadOsDesktopUa = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return isClassicIos || isIpadOsDesktopUa;
}

/**
 * 基于 Canvas 文本宽度差异判断字体是否可用：
 * - 同一段探测文本在“目标字体 + 基线字体”下宽度若与基线不同，视为字体存在；
 * - 该方法无需额外依赖，兼容主流浏览器；
 * - 仅用于 UI 候选过滤，不参与终端渲染链路。
 */
function isFontInstalled(fontName: string): boolean {
  if (typeof document === "undefined") {
    return false;
  }
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) {
    return false;
  }
  const probeText = "mmmmmmmmmmlliWW中文";
  const size = "72px";
  const baseFamilies = ["monospace", "sans-serif", "serif"];
  const baseWidths = new Map<string, number>();

  for (const base of baseFamilies) {
    context.font = `${size} ${base}`;
    baseWidths.set(base, context.measureText(probeText).width);
  }

  for (const base of baseFamilies) {
    context.font = `${size} "${fontName}", ${base}`;
    const width = context.measureText(probeText).width;
    const baseWidth = baseWidths.get(base);
    if (baseWidth !== undefined && Math.abs(width - baseWidth) > 0.01) {
      return true;
    }
  }
  return false;
}

/**
 * 过滤本机可用字体：
 * - 未安装字体不显示在下拉中，避免“选择后看起来无变化”的假象；
 * - 若检测结果为空，保留完整候选作为兜底（例如极端 WebView 限制场景）。
 */
function resolveAvailableFonts(): string[] {
  if (isIosLike()) {
    return IOS_SAFE_FONTS;
  }
  const installed = CANDIDATE_FONTS.filter((font) => isFontInstalled(font));
  return installed.length > 0 ? installed : CANDIDATE_FONTS;
}

function syncFontSelect(): void {
  const cur = draft.shellFontFamily;
  fontFamilySelect.value = availableFonts.value.includes(cur) ? cur : CUSTOM_FONT_VALUE;
}

function selectFontFamily(value: string): void {
  fontFamilySelect.value = value;
  if (value !== CUSTOM_FONT_VALUE) {
    draft.shellFontFamily = value;
  }
}

/**
 * 分类输入统一做 trim 和空白压缩，避免产生肉眼重复项。
 */
function normalizeVoiceRecordCategoryInput(value: string): string {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * 默认分类必须始终存在于分类列表中。
 */
function ensureVoiceRecordDefaultCategory(): void {
  if (!Array.isArray(draft.voiceRecordCategories) || draft.voiceRecordCategories.length === 0) {
    draft.voiceRecordCategories = [...DEFAULT_VOICE_RECORD_CATEGORIES];
  }
  if (!draft.voiceRecordCategories.includes(DEFAULT_VOICE_RECORD_CATEGORY_FALLBACK)) {
    draft.voiceRecordCategories = [DEFAULT_VOICE_RECORD_CATEGORY_FALLBACK, ...draft.voiceRecordCategories];
  }
  if (!draft.voiceRecordCategories.includes(draft.voiceRecordDefaultCategory)) {
    draft.voiceRecordDefaultCategory =
      draft.voiceRecordCategories.includes(DEFAULT_VOICE_RECORD_DEFAULT_CATEGORY)
        ? DEFAULT_VOICE_RECORD_DEFAULT_CATEGORY
        : draft.voiceRecordCategories[0] || DEFAULT_VOICE_RECORD_CATEGORY_FALLBACK;
  }
  if (!draft.voiceRecordCategories.includes(selectedVoiceRecordCategory.value)) {
    selectedVoiceRecordCategory.value = draft.voiceRecordDefaultCategory;
  }
}

function setVoiceRecordDefaultCategory(category: string): void {
  const normalized = normalizeVoiceRecordCategoryInput(category);
  if (!normalized) {
    return;
  }
  if (!draft.voiceRecordCategories.includes(normalized)) {
    draft.voiceRecordCategories = [...draft.voiceRecordCategories, normalized];
  }
  draft.voiceRecordDefaultCategory = normalized;
  ensureVoiceRecordDefaultCategory();
  selectedVoiceRecordCategory.value = normalized;
}

function addVoiceRecordCategory(): void {
  const normalized = normalizeVoiceRecordCategoryInput(newVoiceRecordCategory.value);
  if (!normalized) {
    return;
  }
  if (draft.voiceRecordCategories.includes(normalized)) {
    newVoiceRecordCategory.value = "";
    return;
  }
  if (draft.voiceRecordCategories.length >= MAX_VOICE_RECORD_CATEGORIES) {
    return;
  }
  draft.voiceRecordCategories = [...draft.voiceRecordCategories, normalized];
  newVoiceRecordCategory.value = "";
  ensureVoiceRecordDefaultCategory();
  selectedVoiceRecordCategory.value = normalized;
}

function removeVoiceRecordCategory(category: string): void {
  const normalized = normalizeVoiceRecordCategoryInput(category);
  if (!normalized || normalized === DEFAULT_VOICE_RECORD_CATEGORY_FALLBACK) {
    return;
  }
  draft.voiceRecordCategories = draft.voiceRecordCategories.filter((item) => item !== normalized);
  ensureVoiceRecordDefaultCategory();
  selectedVoiceRecordCategory.value = draft.voiceRecordDefaultCategory;
}

function applySelectedVoiceRecordCategoryAsDefault(): void {
  setVoiceRecordDefaultCategory(selectedVoiceRecordCategory.value);
}

function removeSelectedVoiceRecordCategory(): void {
  removeVoiceRecordCategory(selectedVoiceRecordCategory.value);
}

/**
 * 分类卡片支持桌面端拖拽换位：
 * - 仅调整当前数组顺序；
 * - 默认分类标记随分类本身移动，不改变默认值；
 * - 拖拽结束后统一清理高亮态，避免残留“目标框”样式。
 */
function moveVoiceRecordCategory(fromCategory: string, toCategory: string): void {
  const fromIndex = draft.voiceRecordCategories.indexOf(fromCategory);
  const toIndex = draft.voiceRecordCategories.indexOf(toCategory);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
    return;
  }
  const nextCategories = [...draft.voiceRecordCategories];
  const [moved] = nextCategories.splice(fromIndex, 1);
  if (!moved) {
    return;
  }
  nextCategories.splice(toIndex, 0, moved);
  draft.voiceRecordCategories = nextCategories;
  ensureVoiceRecordDefaultCategory();
}

function onVoiceRecordCategoryDragStart(category: string, event: DragEvent): void {
  draggingVoiceRecordCategory.value = category;
  dragOverVoiceRecordCategory.value = category;
  selectedVoiceRecordCategory.value = category;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", category);
  }
}

function onVoiceRecordCategoryDragOver(category: string, event: DragEvent): void {
  if (!draggingVoiceRecordCategory.value) {
    return;
  }
  event.preventDefault();
  dragOverVoiceRecordCategory.value = category;
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = "move";
  }
}

function onVoiceRecordCategoryDrop(category: string, event: DragEvent): void {
  event.preventDefault();
  const draggingCategory = draggingVoiceRecordCategory.value;
  if (!draggingCategory) {
    return;
  }
  moveVoiceRecordCategory(draggingCategory, category);
  selectedVoiceRecordCategory.value = draggingCategory;
  dragOverVoiceRecordCategory.value = category;
}

function onVoiceRecordCategoryDragEnd(): void {
  draggingVoiceRecordCategory.value = "";
  dragOverVoiceRecordCategory.value = "";
}

onMounted(async () => {
  syncCanGoBack();
  await settingsStore.ensureBootstrapped();
  Object.assign(draft, settingsStore.settings);
  if (!Array.isArray(draft.voiceRecordCategories) || draft.voiceRecordCategories.length === 0) {
    draft.voiceRecordCategories = [...DEFAULT_VOICE_RECORD_CATEGORIES];
  }
  if (!draft.voiceRecordDefaultCategory) {
    draft.voiceRecordDefaultCategory = DEFAULT_VOICE_RECORD_DEFAULT_CATEGORY;
  }
  ensureVoiceRecordDefaultCategory();
  selectedVoiceRecordCategory.value = draft.voiceRecordDefaultCategory;

  // 等待 Object.assign 触发的所有 watcher 在 initialized=false 状态下执行完毕，
  // 再开启自动保存和预设联动，避免初始化时的 uiThemePreset 变化覆盖已保存的自定义颜色。
  await nextTick();

  // 仅展示本机可用字体，减少“选择无效（实际回退）”的误解。
  availableFonts.value = resolveAvailableFonts();
  syncFontSelect();

  // 标记初始化完成，之后的 draft 变更才触发自动保存和预设联动
  initialized.value = true;

  document.addEventListener("visibilitychange", onPageVisibilityChange);
  window.addEventListener("pagehide", onPageHide);
  window.addEventListener("popstate", syncCanGoBack);
});

onBeforeUnmount(() => {
  document.removeEventListener("visibilitychange", onPageVisibilityChange);
  window.removeEventListener("pagehide", onPageHide);
  window.removeEventListener("popstate", syncCanGoBack);
  void persistDraftNow(false);
});

async function goBack(): Promise<void> {
  if (!canGoBack.value) {
    return;
  }
  router.back();
}
</script>
