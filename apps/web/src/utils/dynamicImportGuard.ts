import type { Router } from "vue-router";

const RETRY_MARK_KEY = "remoteconn:dynamic-import-retry-at";
const RETRY_WINDOW_MS = 15_000;

interface SessionStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * 判断是否属于“动态模块脚本加载失败”：
 * - Safari 常见文案：Importing a module script failed；
 * - Chromium 常见文案：Failed to fetch dynamically imported module；
 * - Firefox 常见文案：error loading dynamically imported module。
 */
export function isDynamicImportFailure(error: unknown): boolean {
  const message = extractErrorMessage(error).toLowerCase();
  if (!message) {
    return false;
  }

  const patterns = [
    "importing a module script failed",
    "failed to fetch dynamically imported module",
    "error loading dynamically imported module"
  ];

  return patterns.some((pattern) => message.includes(pattern));
}

/**
 * 决定是否允许本次自动刷新：
 * - 15 秒窗口内仅允许一次，避免 chunk 持续不可用时陷入刷新循环；
 * - 超过窗口后允许再次尝试，适配短时发布抖动场景。
 */
export function shouldRetryDynamicImportReload(
  storage: SessionStorageLike,
  now = Date.now(),
  retryWindowMs = RETRY_WINDOW_MS
): boolean {
  const raw = storage.getItem(RETRY_MARK_KEY);
  const lastRetryAt = Number(raw);
  if (Number.isFinite(lastRetryAt) && now - lastRetryAt < retryWindowMs) {
    return false;
  }
  storage.setItem(RETRY_MARK_KEY, String(now));
  return true;
}

/**
 * 在路由成功就绪后清理重试标记：
 * - 让后续真实的新一轮发布故障仍可触发一次自动恢复；
 * - 避免旧标记长期驻留导致后续无法自动恢复。
 */
export function clearDynamicImportRetryMark(storage: SessionStorageLike): void {
  storage.removeItem(RETRY_MARK_KEY);
}

/**
 * 安装动态导入失败恢复逻辑：
 * - 监听 router.onError；
 * - 命中动态模块加载失败时自动刷新当前目标路由；
 * - sessionStorage 不可用时降级为仅输出错误，不抛出二次异常。
 */
export function installDynamicImportRecovery(router: Router): void {
  router.onError((error, to) => {
    if (!isDynamicImportFailure(error)) {
      return;
    }

    const storage = safeSessionStorage();
    if (!storage) {
      console.error("[router] 动态模块加载失败，且 sessionStorage 不可用", error);
      return;
    }

    if (!shouldRetryDynamicImportReload(storage)) {
      clearDynamicImportRetryMark(storage);
      console.error("[router] 动态模块加载失败，已达单次自动恢复上限", error);
      return;
    }

    const fallbackUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const target = typeof to.fullPath === "string" && to.fullPath.length > 0 ? to.fullPath : fallbackUrl;
    window.location.assign(target);
  });

  void router.isReady().then(() => {
    const storage = safeSessionStorage();
    if (storage) {
      clearDynamicImportRetryMark(storage);
    }
  });
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message ?? "";
  }
  if (typeof error === "string") {
    return error;
  }
  if (error && typeof error === "object" && "message" in error) {
    const maybeMessage = (error as { message?: unknown }).message;
    return typeof maybeMessage === "string" ? maybeMessage : "";
  }
  return "";
}

function safeSessionStorage(): SessionStorageLike | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}
