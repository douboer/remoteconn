import type { RouteRecordRaw } from "vue-router";

const pluginRuntimeEnabled = import.meta.env.VITE_ENABLE_PLUGIN_RUNTIME !== "false";

export const routes: RouteRecordRaw[] = [
  {
    path: "/",
    redirect: "/connect"
  },
  {
    path: "/connect",
    component: () => import("./views/ConnectView.vue")
  },
  {
    path: "/server/:id/settings",
    component: () => import("./views/ServerSettingsView.vue")
  },
  {
    path: "/terminal",
    component: () => import("./views/TerminalView.vue")
  },
  {
    path: "/logs",
    component: () => import("./views/LogsView.vue")
  },
  {
    path: "/records",
    component: () => import("./views/RecordsView.vue")
  },
  {
    path: "/settings",
    component: () => import("./views/SettingsView.vue")
  },
  {
    path: "/about/:section?",
    component: () => import("./views/AboutView.vue")
  },
  ...(pluginRuntimeEnabled
    ? [
        {
          path: "/plugins",
          component: () => import("./views/PluginsView.vue")
        }
      ]
    : [])
];
