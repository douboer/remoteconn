/* global App, console, require */

const { ensureSyncBootstrap } = require("./utils/syncService");

/**
 * 微信小程序应用入口。
 * 说明：
 * 1. 当前对外版本口径统一为 v3.0.0；
 * 2. 服务器、设置与闪念采用“本地 storage + Gateway 同步”双层持久化；
 * 3. 日志、插件运行记录与终端运行态仍仅保留本地。
 */
App({
  globalData: {
    appVersion: "3.0.0",
    platform: "wechat-miniprogram"
  },

  onLaunch() {
    // 启动阶段仅记录版本，用于后续灰度/埋点标记。
    console.info("[RemoteConn MiniProgram] launch", this.globalData);
    ensureSyncBootstrap();
  }
});
