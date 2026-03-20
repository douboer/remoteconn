/* global wx, getCurrentPages, module, require */

const { setPendingTerminalIntent } = require("./terminalIntent");
const { normalizeTerminalSessionSnapshot } = require("./terminalSessionState");

const ACTIVE_TERMINAL_SESSION_STATUS = new Set(["connecting", "auth_pending", "connected", "resumable"]);

/**
 * 生成终端页路由：
 * 1. 终端页必须携带 serverId，否则 onLoad 无法定位服务器；
 * 2. AI 快捷启动仍沿用历史 query `openCodex=1`，避免再维护第二套入口参数。
 */
function resolveTerminalPageUrl(serverId, options) {
  const normalizedServerId = String(serverId || "").trim();
  if (!normalizedServerId) return "";
  const nextOptions = options && typeof options === "object" ? options : {};
  const query = nextOptions.openCodex ? "&openCodex=1" : "";
  return `/pages/terminal/index?serverId=${normalizedServerId}${query}`;
}

/**
 * 若导航栈上一页已经是同一台服务器的终端页，则优先复用它：
 * 1. 避免重复压栈多个终端实例；
 * 2. 保留该终端页内部已有的连接态和缓冲区。
 */
function shouldReusePreviousTerminalPage(pages, serverId) {
  const normalizedServerId = String(serverId || "").trim();
  if (!normalizedServerId || !Array.isArray(pages) || pages.length < 2) {
    return false;
  }
  const previous = pages[pages.length - 2];
  return !!(
    previous &&
    previous.route === "pages/terminal/index" &&
    previous.data &&
    previous.data.serverId === normalizedServerId
  );
}

/**
 * 从终端会话快照中提取“当前可打开的终端服务器”：
 * 1. 仅接受连接中/已连接/可恢复的会话；
 * 2. 若服务器列表里已不存在该服务器，则视为不可打开。
 */
function resolveActiveTerminalServerId(snapshot, servers, now = Date.now()) {
  const normalizedSnapshot = normalizeTerminalSessionSnapshot(snapshot, now);
  if (!normalizedSnapshot) return "";
  if (!ACTIVE_TERMINAL_SESSION_STATUS.has(normalizedSnapshot.status)) {
    return "";
  }
  const rows = Array.isArray(servers) ? servers : [];
  return rows.some((item) => String(item && item.id ? item.id : "").trim() === normalizedSnapshot.serverId)
    ? normalizedSnapshot.serverId
    : "";
}

/**
 * 判断当前是否存在“可从 shell 按钮直接打开”的活动终端：
 * 1. 与 shell 按钮点击逻辑共用同一判定，避免“能点开但不高亮”或反过来的分叉；
 * 2. 只要会话仍处于连接中 / 已连接 / 可恢复，且服务器仍存在，即视为活动连接。
 */
function hasActiveTerminalSession(snapshot, servers, now = Date.now()) {
  return Boolean(resolveActiveTerminalServerId(snapshot, servers, now));
}

/**
 * 打开终端页：
 * 1. 连接页与底部 shell 按钮共用同一套终端导航语义；
 * 2. 若命中上一页复用，则直接返回现有终端页；
 * 3. 仅在需要时写入一次瞬时终端意图。
 */
function openTerminalPage(serverId, reuseExisting, options) {
  const normalizedServerId = String(serverId || "").trim();
  if (!normalizedServerId) return false;
  const nextOptions = options && typeof options === "object" ? options : {};
  const pages = typeof getCurrentPages === "function" ? getCurrentPages() : [];
  if (reuseExisting && shouldReusePreviousTerminalPage(pages, normalizedServerId)) {
    if (nextOptions.openCodex) {
      setPendingTerminalIntent({
        // `open_ai` 为历史命名，当前语义已是“进入终端后直接启动默认 AI”。
        action: "open_ai",
        serverId: normalizedServerId,
        createdAt: Date.now()
      });
    }
    wx.navigateBack({ delta: 1 });
    return true;
  }
  const url = resolveTerminalPageUrl(normalizedServerId, nextOptions);
  if (!url) return false;
  wx.navigateTo({ url });
  return true;
}

module.exports = {
  resolveTerminalPageUrl,
  shouldReusePreviousTerminalPage,
  resolveActiveTerminalServerId,
  hasActiveTerminalSession,
  openTerminalPage
};
