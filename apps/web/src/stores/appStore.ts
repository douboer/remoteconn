import { defineStore } from "pinia";
import { ref } from "vue";
import type { AppToast } from "@/types/app";

/**
 * 全局消息中心。
 */
export const useAppStore = defineStore("app", () => {
  const toasts = ref<AppToast[]>([]);

  function notify(level: AppToast["level"], message: string): void {
    const item: AppToast = {
      id: crypto.randomUUID(),
      level,
      message
    };
    toasts.value.push(item);
    window.setTimeout(() => {
      toasts.value = toasts.value.filter((x) => x.id !== item.id);
    }, level === "error" ? 5000 : 3000);
  }

  return {
    toasts,
    notify
  };
});
