import { createApp } from "vue";
import { createPinia } from "pinia";
import { createRouter, createWebHistory } from "vue-router";
import App from "./App.vue";
import { routes } from "./routes";
import { installDynamicImportRecovery } from "./utils/dynamicImportGuard";
import "./styles/main.css";

/**
 * 全局禁止双指缩放：
 * - iOS Safari: 拦截 gesturestart/gesturechange/gestureend；
 * - 触屏浏览器: 双触点 touchmove 时阻止默认缩放手势；
 * - 桌面触控板: Ctrl + wheel 缩放时阻止默认行为。
 */
function installPinchZoomGuard(): void {
  const options: AddEventListenerOptions = { passive: false };

  const preventDefault = (event: Event): void => {
    event.preventDefault();
  };

  const onTouchMove = (event: TouchEvent): void => {
    if (event.touches.length > 1) {
      event.preventDefault();
    }
  };

  const onWheel = (event: WheelEvent): void => {
    if (event.ctrlKey) {
      event.preventDefault();
    }
  };

  document.addEventListener("gesturestart", preventDefault, options);
  document.addEventListener("gesturechange", preventDefault, options);
  document.addEventListener("gestureend", preventDefault, options);
  document.addEventListener("touchmove", onTouchMove, options);
  document.addEventListener("wheel", onWheel, options);
}

/**
 * 全局禁止双击放大：
 * - 移动端：拦截短时间内连续 touchend（双击手势）；
 * - 桌面端：拦截 dblclick 默认缩放行为。
 */
function installDoubleTapZoomGuard(): void {
  const options: AddEventListenerOptions = { passive: false };
  let lastTouchEndAt = 0;
  const DOUBLE_TAP_WINDOW_MS = 320;

  document.addEventListener(
    "touchend",
    (event: TouchEvent): void => {
      const now = Date.now();
      if (now - lastTouchEndAt <= DOUBLE_TAP_WINDOW_MS) {
        event.preventDefault();
      }
      lastTouchEndAt = now;
    },
    options
  );

  document.addEventListener(
    "dblclick",
    (event: MouseEvent): void => {
      event.preventDefault();
    },
    options
  );
}

installPinchZoomGuard();
installDoubleTapZoomGuard();

const app = createApp(App);
const pinia = createPinia();
const router = createRouter({
  history: createWebHistory(),
  routes
});

installDynamicImportRecovery(router);

app.use(pinia);
app.use(router);

app.mount("#app");
