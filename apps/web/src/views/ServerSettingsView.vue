<template>
  <section class="page-root server-settings-page">
    <div class="server-settings-layout">
      <div class="page-toolbar server-settings-topbar">
        <button
          class="icon-btn"
          type="button"
          title="返回上一页"
          aria-label="返回上一页"
          :disabled="!canGoBack"
          @click="goBack"
        >
          <img src="/icons/back.svg" alt="返回上一页" />
        </button>
        <div class="toolbar-spacer"></div>
        <h2 class="page-title">服务器设置</h2>
      </div>

      <article v-if="ready" class="server-settings-content surface-scroll">
        <div class="server-settings-form">
          <section class="settings-section-card">
            <div class="settings-section-headline">
              <div>
                <h3 class="server-settings-section-title">基础信息</h3>
                <p class="settings-section-copy">用于标识并定位目标服务器</p>
              </div>
            </div>
            <div class="field-grid">
              <label class="field">
                <span>名称</span>
                <input v-model="form.name" class="input" />
              </label>
              <label class="field">
                <span>主机</span>
                <input v-model="form.host" class="input" />
              </label>
              <label class="field">
                <span>端口</span>
                <input v-model="portInput" class="input" type="text" inputmode="numeric" />
              </label>
              <label class="field">
                <span>用户名</span>
                <input v-model="form.username" class="input" />
              </label>
              <label class="field">
                <span>认证方式</span>
                <div class="field-control">
                  <div class="pill-scroll">
                    <div class="pill-row">
                      <button
                        v-for="option in SERVER_AUTH_TYPE_OPTIONS"
                        :key="`server-auth-${option.value}`"
                        class="pill-option"
                        :class="{ active: form.authType === option.value }"
                        type="button"
                        @click="form.authType = option.value"
                      >
                        {{ option.label }}
                      </button>
                    </div>
                  </div>
                </div>
              </label>
              <label class="field wide">
                <span>标签（逗号分隔）</span>
                <div class="field-control field-control--stack">
                  <input
                    v-model="tagText"
                    class="input"
                    placeholder="prod,beijing"
                    autocomplete="off"
                    autocorrect="off"
                    autocapitalize="off"
                    spellcheck="false"
                    data-lpignore="true"
                    data-1p-ignore="true"
                    @blur="syncTags"
                  />
                  <div v-if="orderedTags.length > 0" class="server-tag-order-list">
                    <div v-for="(tag, index) in orderedTags" :key="`tag-order-${tag}-${index}`" class="server-tag-order-item">
                      <span class="server-tag-order-text">{{ tag }}</span>
                      <div class="server-tag-order-actions">
                        <button
                          class="server-tag-order-btn"
                          type="button"
                          :disabled="index === 0"
                          title="标签上移"
                          aria-label="标签上移"
                          @click.prevent="moveTagUp(index)"
                        >
                          上移
                        </button>
                        <button
                          class="server-tag-order-btn"
                          type="button"
                          :disabled="index === orderedTags.length - 1"
                          title="标签下移"
                          aria-label="标签下移"
                          @click.prevent="moveTagDown(index)"
                        >
                          下移
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </label>
            </div>
          </section>

          <section class="settings-section-card">
            <div class="settings-section-headline">
              <div>
                <h3 class="server-settings-section-title">认证参数</h3>
                <p class="settings-section-copy">按认证方式填写密码或密钥材料</p>
              </div>
            </div>
            <div class="field-grid">
              <label v-if="form.authType === 'password'" class="field wide">
                <span>密码</span>
                <input v-model="credential.password" class="input" type="password" autocomplete="new-password" />
              </label>
              <template v-else>
                <label class="field wide">
                  <span>私钥内容</span>
                  <div class="field-control field-control--stack">
                    <textarea
                      v-model="credential.privateKey"
                      class="textarea"
                      rows="5"
                      :placeholder="hasPersistedPrivateKey ? '' : '粘贴 OpenSSH 私钥'"
                    />
                    <p v-if="isPrivateKeyMaskedInput" class="item-sub">
                      已保存私钥，当前为掩码回显。直接粘贴新私钥可覆盖当前值。
                    </p>
                  </div>
                </label>
                <label class="field">
                  <span>passphrase</span>
                  <input v-model="credential.passphrase" class="input" type="password" autocomplete="new-password" />
                </label>
                <label v-if="form.authType === 'certificate'" class="field">
                  <span>证书内容</span>
                  <div class="field-control field-control--stack">
                    <textarea v-model="credential.certificate" class="textarea" rows="3" />
                    <p v-if="hasPersistedCertificate && !(credential.certificate ?? '').trim()" class="item-sub">
                      已保存证书内容。出于安全原因不回显明文，留空将沿用，填写新证书将覆盖。
                    </p>
                  </div>
                </label>
              </template>
            </div>
          </section>

          <section class="settings-section-card">
            <div class="settings-section-headline">
              <div>
                <h3 class="server-settings-section-title">连接参数</h3>
                <p class="settings-section-copy">定义连接路径与工作目录</p>
              </div>
            </div>
            <div class="field-grid">
              <label class="field">
                <span>传输方式</span>
                <div class="field-control">
                  <div class="segmented-control">
                    <button
                      v-for="option in TRANSPORT_MODE_OPTIONS"
                      :key="`transport-mode-${option.value}`"
                      class="segmented-option"
                      :class="{ active: form.transportMode === option.value }"
                      type="button"
                      @click="form.transportMode = option.value"
                    >
                      {{ option.label }}
                    </button>
                  </div>
                </div>
              </label>
              <label class="field wide">
                <span>codex工作目录</span>
                <input v-model="form.projectPath" class="input" placeholder="~/workspace/project" />
              </label>
            </div>
          </section>

          <section class="settings-section-card">
            <div class="settings-section-headline">
              <div>
                <h3 class="server-settings-section-title">跳转主机</h3>
                <p class="settings-section-copy">从基础信息中配置的服务器跳转至该服务器</p>
              </div>
              <button
                class="server-settings-switch"
                :class="{ active: form.jumpHost?.enabled === true }"
                type="button"
                @click="
                  form.jumpHost = normalizeJumpHost({
                    ...(form.jumpHost || { ...DEFAULT_JUMP_HOST }),
                    enabled: form.jumpHost?.enabled !== true
                  })
                "
              >
                <span class="server-settings-switch-knob"></span>
              </button>
            </div>
            <div v-if="form.jumpHost?.enabled" class="field-grid">
              <label class="field">
                <span>跳转主机</span>
                <input v-model="form.jumpHost.host" class="input" placeholder="bastion.example.com" />
              </label>
              <label class="field">
                <span>跳转端口</span>
                <input v-model="jumpPortInput" class="input" type="text" inputmode="numeric" />
              </label>
              <label class="field">
                <span>跳转用户名</span>
                <input v-model="form.jumpHost.username" class="input" />
              </label>
              <label class="field">
                <span>认证方式</span>
                <div class="field-control">
                  <div class="pill-scroll">
                    <div class="pill-row">
                      <button
                        v-for="option in SERVER_AUTH_TYPE_OPTIONS"
                        :key="`jump-auth-${option.value}`"
                        class="pill-option"
                        :class="{ active: form.jumpHost.authType === option.value }"
                        type="button"
                        @click="form.jumpHost = normalizeJumpHost({ ...form.jumpHost, authType: option.value })"
                      >
                        {{ option.label }}
                      </button>
                    </div>
                  </div>
                </div>
              </label>
              <label v-if="form.jumpHost.authType === 'password'" class="field wide">
                <span>密码</span>
                <input v-model="jumpCredential.password" class="input" type="password" autocomplete="new-password" />
              </label>
              <template v-else>
                <label class="field wide">
                  <span>私钥内容</span>
                  <div class="field-control field-control--stack">
                    <textarea
                      v-model="jumpCredential.privateKey"
                      class="textarea"
                      rows="5"
                      :placeholder="hasPersistedJumpPrivateKey ? '' : '粘贴跳转主机 OpenSSH 私钥'"
                    />
                    <p v-if="isJumpPrivateKeyMaskedInput" class="item-sub">
                      已保存跳转主机私钥，当前为掩码回显。直接粘贴新私钥可覆盖当前值。
                    </p>
                  </div>
                </label>
                <label class="field">
                  <span>passphrase</span>
                  <input
                    v-model="jumpCredential.passphrase"
                    class="input"
                    type="password"
                    autocomplete="new-password"
                  />
                </label>
                <label v-if="form.jumpHost.authType === 'certificate'" class="field">
                  <span>证书内容</span>
                  <div class="field-control field-control--stack">
                    <textarea v-model="jumpCredential.certificate" class="textarea" rows="3" />
                    <p v-if="hasPersistedJumpCertificate && !(jumpCredential.certificate ?? '').trim()" class="item-sub">
                      已保存跳转主机证书内容。留空将沿用，填写新证书将覆盖。
                    </p>
                  </div>
                </label>
              </template>
            </div>
          </section>
        </div>
      </article>

      <article v-else class="server-settings-content surface-scroll">
        <p class="item-sub">未找到服务器，请返回上一页或使用右下角导航按钮重新选择。</p>
      </article>

      <div class="server-settings-bottom bottom-bar">
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
        <div class="bottom-right-actions">
          <button
            class="icon-btn"
            type="button"
            :disabled="isConnecting"
            title="使用当前配置连接"
            aria-label="使用当前配置连接"
            @click="connect"
          >
            <span class="icon-mask" style="--icon: url('/icons/connect.svg')" aria-hidden="true"></span>
          </button>
          <button
            class="icon-btn"
            type="button"
            :disabled="isConnecting"
            title="保存服务器配置"
            aria-label="保存服务器配置"
            @click="saveWithFeedback"
          >
            <span class="icon-mask" style="--icon: url('/icons/save.svg')" aria-hidden="true"></span>
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, toRaw, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { DEFAULT_JUMP_HOST } from "@remoteconn/shared";
import type { ServerProfile } from "@/types/app";
import { useServerStore } from "@/stores/serverStore";
import { useSessionStore } from "@/stores/sessionStore";
import { useAppStore } from "@/stores/appStore";
import { formatActionError, toFriendlyError } from "@/utils/feedback";

const NEW_SERVER_ROUTE_ID = "new";

type CredentialInput = {
  password: string;
  privateKey: string;
  passphrase: string;
  certificate: string;
};
type CredentialBundleInput = {
  target: CredentialInput;
  jump: CredentialInput;
};
type ChoiceOption<T extends string> = { label: string; value: T };

const SERVER_AUTH_TYPE_OPTIONS: Array<ChoiceOption<"password" | "privateKey" | "certificate">> = [
  { label: "密码", value: "password" },
  { label: "私钥", value: "privateKey" },
  { label: "证书", value: "certificate" }
];

const TRANSPORT_MODE_OPTIONS: Array<ChoiceOption<"gateway" | "ios-native">> = [
  { label: "网关", value: "gateway" },
  { label: "iOS 原生", value: "ios-native" }
];

const serverStore = useServerStore();
const sessionStore = useSessionStore();
const appStore = useAppStore();
const route = useRoute();
const router = useRouter();

const ready = ref(false);
const tagText = ref("");
const portInput = ref("22");
const jumpPortInput = ref("22");
const isConnecting = ref(false);
const canGoBack = ref(false);
const initialServerSnapshot = ref<ServerProfile | null>(null);
const initialCredentialSnapshot = ref<CredentialBundleInput | null>(null);
const persistedCredentialSnapshot = ref<CredentialBundleInput | null>(null);
const PRIVATE_KEY_MASK = "●●●●●●●●●●●●●●●●";

const form = reactive<ServerProfile>({
  id: "",
  name: "",
  host: "",
  port: 22,
  username: "root",
  authType: "password",
  projectPath: "~/workspace",
  projectPresets: [],
  tags: [],
  timeoutSeconds: 20,
  heartbeatSeconds: 15,
  transportMode: "gateway",
  jumpHost: { ...DEFAULT_JUMP_HOST }
});

const credential = reactive<CredentialInput>({
  password: "",
  privateKey: "",
  passphrase: "",
  certificate: ""
});

const jumpCredential = reactive<CredentialInput>({
  password: "",
  privateKey: "",
  passphrase: "",
  certificate: ""
});

/**
 * Vue Router 已对 path param 做过解码，这里不能再次 decodeURIComponent，
 * 否则含 `%` 的历史服务器 ID 会被二次解码，导致匹配不到服务器。
 */
const serverId = computed(() => {
  const raw = route.params.id;
  if (Array.isArray(raw)) {
    return String(raw[0] ?? "");
  }
  return String(raw ?? "");
});

const isCreateMode = computed(() => serverId.value === NEW_SERVER_ROUTE_ID);
const serverWatchKey = computed(() => (isCreateMode.value ? "" : serverStore.servers.map((item) => item.id).join(",")));

const hasCreateDraftChanges = computed(() => {
  if (!ready.value || !isCreateMode.value) return false;
  if (!initialServerSnapshot.value || !initialCredentialSnapshot.value) return false;

  const currentServer = buildServerSnapshot();
  const currentCredential = buildCredentialSnapshot();
  return (
    createServerSignature(currentServer) !== createServerSignature(initialServerSnapshot.value) ||
    createCredentialSignature(currentCredential) !== createCredentialSignature(initialCredentialSnapshot.value)
  );
});

const hasPersistedPrivateKey = computed(() => Boolean(persistedCredentialSnapshot.value?.target.privateKey?.trim()));
const hasPersistedCertificate = computed(() => Boolean(persistedCredentialSnapshot.value?.target.certificate?.trim()));
const isPrivateKeyMaskedInput = computed(() => {
  return hasPersistedPrivateKey.value && (credential.privateKey ?? "").trim() === PRIVATE_KEY_MASK;
});
const hasPersistedJumpPrivateKey = computed(() => Boolean(persistedCredentialSnapshot.value?.jump.privateKey?.trim()));
const hasPersistedJumpCertificate = computed(() => Boolean(persistedCredentialSnapshot.value?.jump.certificate?.trim()));
const isJumpPrivateKeyMaskedInput = computed(() => {
  return hasPersistedJumpPrivateKey.value && (jumpCredential.privateKey ?? "").trim() === PRIVATE_KEY_MASK;
});
const orderedTags = computed(() => parseTags(tagText.value));

watch(
  [() => serverId.value, () => serverWatchKey.value],
  async ([id]) => {
    await loadServer(id);
  },
  { immediate: true }
);

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

onMounted(() => {
  syncCanGoBack();
  window.addEventListener("popstate", syncCanGoBack);
});

onBeforeUnmount(() => {
  window.removeEventListener("popstate", syncCanGoBack);
});

function parseTags(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizePortInput(value: string | number | null | undefined, fallback = 22): number {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return fallback;
  }
  const digitsOnly = raw.replace(/[^\d]/g, "");
  const parsed = Number(digitsOnly);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(65535, Math.max(1, Math.round(parsed)));
}

function createEmptyCredential(): CredentialInput {
  return {
    password: "",
    privateKey: "",
    passphrase: "",
    certificate: ""
  };
}

function createEmptyCredentialBundle(): CredentialBundleInput {
  return {
    target: createEmptyCredential(),
    jump: createEmptyCredential()
  };
}

function normalizeCredentialInput(next: Partial<CredentialInput> | null | undefined): CredentialInput {
  return {
    password: next?.password ?? "",
    privateKey: next?.privateKey ?? "",
    passphrase: next?.passphrase ?? "",
    certificate: next?.certificate ?? ""
  };
}

function assignCredentialState(target: CredentialInput, next: Partial<CredentialInput> | null | undefined): void {
  Object.assign(target, {
    password: next?.password ?? "",
    privateKey: next?.privateKey ?? "",
    passphrase: next?.passphrase ?? "",
    certificate: next?.certificate ?? ""
  });
}

function assignCredential(next: Partial<CredentialInput> | null | undefined): void {
  assignCredentialState(credential, next);
}

function assignJumpCredential(next: Partial<CredentialInput> | null | undefined): void {
  assignCredentialState(jumpCredential, next);
}

function normalizeJumpHost(
  input: Partial<NonNullable<ServerProfile["jumpHost"]>> | ServerProfile["jumpHost"]
): NonNullable<ServerProfile["jumpHost"]> {
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

function normalizeServerSnapshot(server: ServerProfile): ServerProfile {
  return {
    ...server,
    projectPresets: [...server.projectPresets],
    tags: [...server.tags],
    jumpHost: normalizeJumpHost(server.jumpHost)
  };
}

function createServerSignature(server: ServerProfile): string {
  return JSON.stringify({
    id: server.id,
    name: server.name,
    host: server.host,
    port: server.port,
    username: server.username,
    authType: server.authType,
    projectPath: server.projectPath,
    projectPresets: [...server.projectPresets],
    tags: [...server.tags],
    timeoutSeconds: server.timeoutSeconds,
    heartbeatSeconds: server.heartbeatSeconds,
    transportMode: server.transportMode,
    jumpHost: normalizeJumpHost(server.jumpHost),
    lastConnectedAt: server.lastConnectedAt ?? ""
  });
}

function buildCredentialSnapshot(): CredentialBundleInput {
  return {
    target: {
      password: credential.password ?? "",
      privateKey: credential.privateKey ?? "",
      passphrase: credential.passphrase ?? "",
      certificate: credential.certificate ?? ""
    },
    jump: {
      password: jumpCredential.password ?? "",
      privateKey: jumpCredential.privateKey ?? "",
      passphrase: jumpCredential.passphrase ?? "",
      certificate: jumpCredential.certificate ?? ""
    }
  };
}

function createCredentialSignature(value: CredentialBundleInput): string {
  return JSON.stringify({
    target: value.target,
    jump: value.jump
  });
}

function markPristine(server: ServerProfile, credentialSnapshot: CredentialBundleInput): void {
  initialServerSnapshot.value = normalizeServerSnapshot(server);
  initialCredentialSnapshot.value = {
    target: { ...credentialSnapshot.target },
    jump: { ...credentialSnapshot.jump }
  };
}

function fillFormFromServer(server: ServerProfile): void {
  Object.assign(form, normalizeServerSnapshot(server));
  tagText.value = server.tags.join(",");
  portInput.value = String(server.port ?? 22);
  jumpPortInput.value = String(server.jumpHost?.port ?? DEFAULT_JUMP_HOST.port);
}

async function loadServer(id: string): Promise<void> {
  ready.value = false;
  if (!id) return;
  // 兜底确保服务器列表已加载，避免首屏/直达路由时出现“未找到服务器”的误判。
  await serverStore.ensureBootstrapped();

  if (id === NEW_SERVER_ROUTE_ID) {
    const draft = serverStore.createServerDraft();
    fillFormFromServer(draft);
    const emptyCredential = createEmptyCredentialBundle();
    persistedCredentialSnapshot.value = null;
    assignCredential(emptyCredential.target);
    assignJumpCredential(emptyCredential.jump);
    markPristine(draft, emptyCredential);
    ready.value = true;
    return;
  }

  /**
   * 容错匹配：
   * 1) 主路径按服务器 id 精确匹配；
   * 2) 兼容历史链接中的编码差异（decode/encode 变体）；
   * 3) 兼容极少量旧数据把 name 用作路由参数的情况。
   */
  const idCandidates = new Set<string>([id]);
  try {
    idCandidates.add(decodeURIComponent(id));
  } catch {
    // 忽略非法编码输入，继续用原始值匹配。
  }
  try {
    idCandidates.add(encodeURIComponent(id));
  } catch {
    // encode 出错的概率极低，忽略即可。
  }

  const target =
    serverStore.servers.find((item) => idCandidates.has(item.id)) ??
    serverStore.servers.find((item) => idCandidates.has(item.name)) ??
    serverStore.servers.find((item) => item.id === serverStore.selectedServerId);

  if (!target) {
    return;
  }

  fillFormFromServer(target);
  try {
    const saved = await serverStore.getCredentialBundleInput(target.id);
    const normalizedSaved: CredentialBundleInput = {
      target: normalizeCredentialInput(saved?.target),
      jump: normalizeCredentialInput(saved?.jump)
    };
    persistedCredentialSnapshot.value = normalizedSaved;
    /**
     * 安全约束：私钥/证书内容不在表单中回显给用户，
     * 仅在用户显式输入新内容时才覆盖；留空表示沿用已保存内容。
     */
    assignCredential({
      password: normalizedSaved.target.password,
      privateKey: normalizedSaved.target.privateKey?.trim() ? PRIVATE_KEY_MASK : "",
      passphrase: normalizedSaved.target.passphrase,
      certificate: ""
    });
    assignJumpCredential({
      password: normalizedSaved.jump.password,
      privateKey: normalizedSaved.jump.privateKey?.trim() ? PRIVATE_KEY_MASK : "",
      passphrase: normalizedSaved.jump.passphrase,
      certificate: ""
    });
  } catch (error) {
    // 会话密钥丢失或密文损坏时，仍允许用户进入设置页并重新录入凭据。
    persistedCredentialSnapshot.value = null;
    assignCredential(createEmptyCredential());
    assignJumpCredential(createEmptyCredential());
    appStore.notify("warn", `凭据读取失败：${toFriendlyError(error)}`);
  }
  serverStore.selectedServerId = target.id;
  markPristine(buildServerSnapshot(), buildCredentialSnapshot());
  if (id !== target.id) {
    // 使用标准 id 回写路由，避免后续刷新再次命中异常参数。
    await router.replace(`/server/${encodeURIComponent(target.id)}/settings`);
  }
  ready.value = true;
}

function syncTags(): void {
  form.tags = parseTags(tagText.value);
}

function applyOrderedTags(tags: string[]): void {
  const normalized = tags.map((item) => item.trim()).filter(Boolean);
  tagText.value = normalized.join(",");
  form.tags = [...normalized];
}

function moveTagUp(index: number): void {
  const tags = [...orderedTags.value];
  if (index <= 0 || index >= tags.length) {
    return;
  }
  const current = tags[index];
  const previous = tags[index - 1];
  if (current === undefined || previous === undefined) {
    return;
  }
  tags[index - 1] = current;
  tags[index] = previous;
  applyOrderedTags(tags);
}

function moveTagDown(index: number): void {
  const tags = [...orderedTags.value];
  if (index < 0 || index >= tags.length - 1) {
    return;
  }
  const current = tags[index];
  const next = tags[index + 1];
  if (current === undefined || next === undefined) {
    return;
  }
  tags[index] = next;
  tags[index + 1] = current;
  applyOrderedTags(tags);
}

function validateCredentialInput(
  authType: ServerProfile["authType"],
  current: CredentialInput,
  persisted: CredentialInput,
  maskEnabled: boolean
): string | null {
  const privateKeyTrimmed = (current.privateKey ?? "").trim();
  const privateKeyMasked = maskEnabled && privateKeyTrimmed === PRIVATE_KEY_MASK;
  const hasInputPrivateKey = Boolean(privateKeyTrimmed) && !privateKeyMasked;
  const hasSavedPrivateKey = Boolean(persisted.privateKey?.trim());
  const hasInputCertificate = Boolean(current.certificate?.trim());
  const hasSavedCertificate = Boolean(persisted.certificate?.trim());
  const hasEffectivePrivateKey = hasInputPrivateKey || hasSavedPrivateKey;
  const hasEffectiveCertificate = hasInputCertificate || hasSavedCertificate;

  if (authType === "password") {
    return current.password?.trim() ? null : "密码不能为空";
  }
  if (authType === "privateKey") {
    return hasEffectivePrivateKey ? null : "私钥内容不能为空";
  }
  if (!hasEffectivePrivateKey) {
    return "证书模式下私钥内容不能为空";
  }
  if (!hasEffectiveCertificate) {
    return "证书模式下证书内容不能为空";
  }
  return null;
}

function validateCredential(): string | null {
  const targetPersisted = persistedCredentialSnapshot.value?.target ?? createEmptyCredential();
  const targetError = validateCredentialInput(form.authType, credential, targetPersisted, hasPersistedPrivateKey.value);
  if (targetError) {
    return targetError;
  }
  if (!form.jumpHost?.enabled) {
    return null;
  }
  const jumpPersisted = persistedCredentialSnapshot.value?.jump ?? createEmptyCredential();
  const jumpError = validateCredentialInput(
    form.jumpHost.authType,
    jumpCredential,
    jumpPersisted,
    hasPersistedJumpPrivateKey.value
  );
  return jumpError ? `跳板机${jumpError}` : null;
}

/**
 * 组装“最终落库凭据”：
 * - 私钥/证书输入框留空时，沿用已保存值（用于“安全不回显”场景）；
 * - 用户显式输入新内容时，优先使用新值覆盖。
 */
function buildCredentialPayloadForSave(authType: ServerProfile["authType"], draft: CredentialInput): CredentialInput {
  const persisted = persistedCredentialSnapshot.value?.target ?? createEmptyCredential();
  const merged: CredentialInput = { ...draft };
  const privateKeyTrimmed = merged.privateKey.trim();
  const privateKeyMasked = Boolean(persisted.privateKey?.trim()) && privateKeyTrimmed === PRIVATE_KEY_MASK;
  if ((authType === "privateKey" || authType === "certificate") && (!privateKeyTrimmed || privateKeyMasked)) {
    merged.privateKey = persisted.privateKey ?? "";
  }
  if (authType === "certificate" && !merged.certificate.trim()) {
    merged.certificate = persisted.certificate ?? "";
  }
  return merged;
}

function buildJumpCredentialPayloadForSave(authType: ServerProfile["authType"], draft: CredentialInput): CredentialInput {
  const persisted = persistedCredentialSnapshot.value?.jump ?? createEmptyCredential();
  const merged: CredentialInput = { ...draft };
  const privateKeyTrimmed = merged.privateKey.trim();
  const privateKeyMasked = Boolean(persisted.privateKey?.trim()) && privateKeyTrimmed === PRIVATE_KEY_MASK;
  if ((authType === "privateKey" || authType === "certificate") && (!privateKeyTrimmed || privateKeyMasked)) {
    merged.privateKey = persisted.privateKey ?? "";
  }
  if (authType === "certificate" && !merged.certificate.trim()) {
    merged.certificate = persisted.certificate ?? "";
  }
  return merged;
}

/**
 * 将响应式表单对象转换为纯数据快照，避免把 Vue Proxy 写入 IndexedDB/桥接层。
 */
function buildServerSnapshot(): ServerProfile {
  const raw = toRaw(form);
  const tags = parseTags(tagText.value);
  return {
    ...raw,
    port: normalizePortInput(portInput.value, 22),
    projectPresets: [...raw.projectPresets],
    tags,
    jumpHost: normalizeJumpHost({
      ...raw.jumpHost,
      port: normalizePortInput(jumpPortInput.value, DEFAULT_JUMP_HOST.port)
    })
  };
}

async function save(showToast = true): Promise<boolean> {
  if (!ready.value || !form.id) return false;
  if (isCreateMode.value && !hasCreateDraftChanges.value) {
    if (showToast) {
      appStore.notify("info", "配置无改动，未新增服务器");
    }
    return false;
  }

  const credentialError = validateCredential();
  if (credentialError) {
    throw new Error(`保存失败：${credentialError}`);
  }

  const serverSnapshot = buildServerSnapshot();
  const credentialSnapshot = buildCredentialSnapshot();
  const credentialPayload = buildCredentialPayloadForSave(serverSnapshot.authType, credentialSnapshot.target);
  const jumpCredentialPayload = buildJumpCredentialPayloadForSave(
    serverSnapshot.jumpHost?.authType ?? "password",
    credentialSnapshot.jump
  );
  syncTags();

  await serverStore.saveServer(serverSnapshot);
  serverStore.selectedServerId = serverSnapshot.id;
  await serverStore.saveCredential(serverSnapshot.id, {
    type: serverSnapshot.authType,
    password: credentialPayload.password,
    privateKey: credentialPayload.privateKey,
    passphrase: credentialPayload.passphrase,
    certificate: credentialPayload.certificate
  }, {
    type: serverSnapshot.jumpHost?.authType ?? "password",
    password: jumpCredentialPayload.password,
    privateKey: jumpCredentialPayload.privateKey,
    passphrase: jumpCredentialPayload.passphrase,
    certificate: jumpCredentialPayload.certificate
  });
  persistedCredentialSnapshot.value = {
    target: { ...credentialPayload },
    jump: { ...jumpCredentialPayload }
  };
  markPristine(serverSnapshot, credentialSnapshot);

  if (isCreateMode.value) {
    await router.replace(`/server/${encodeURIComponent(serverSnapshot.id)}/settings`);
  }
  if (showToast) {
    appStore.notify("info", "服务器配置已保存");
  }
  return true;
}

async function saveWithFeedback(): Promise<void> {
  try {
    await save(true);
  } catch (error) {
    appStore.notify("error", formatActionError("保存失败", error));
  }
}

async function connect(): Promise<void> {
  if (!ready.value || isConnecting.value) return;
  isConnecting.value = true;
  try {
    await sessionStore.ensureBootstrapped();
    const createModeBeforeSave = isCreateMode.value;
    const saved = await save(false);
    if (createModeBeforeSave && !saved) {
      throw new Error("新增服务器配置无改动，请先填写配置后再连接");
    }
    const serverSnapshot = buildServerSnapshot();
    appStore.notify("info", `正在连接: ${serverSnapshot.username}@${serverSnapshot.host}:${serverSnapshot.port}`);
    const connectTask = sessionStore.connect(serverSnapshot);
    await router.push("/terminal");
    await connectTask;
  } catch (error) {
    appStore.notify("error", formatActionError("连接失败", error));
  } finally {
    isConnecting.value = false;
  }
}

async function confirmLeaveForCreateDraft(): Promise<boolean> {
  if (!isCreateMode.value || !hasCreateDraftChanges.value) {
    return true;
  }
  const shouldSave = window.confirm("检测到新增服务器配置已改动，是否保存后返回？");
  if (!shouldSave) {
    return true;
  }
  try {
    await save(true);
    return true;
  } catch (error) {
    appStore.notify("error", formatActionError("保存失败", error));
    return false;
  }
}

async function goBack(): Promise<void> {
  if (!canGoBack.value) {
    return;
  }
  const canLeave = await confirmLeaveForCreateDraft();
  if (!canLeave) {
    return;
  }
  router.back();
}
</script>
