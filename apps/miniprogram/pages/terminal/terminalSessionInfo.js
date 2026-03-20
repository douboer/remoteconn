/* global module */

/**
 * 会话信息浮层只展示当前终端会话已经拥有的静态配置。
 * 这里保持纯函数，避免点击工具栏时再触发额外网络请求或依赖页面实例状态。
 */
function normalizeDisplayText(value) {
  const normalized = String(value || "").trim();
  return normalized;
}

function buildTerminalServerAddress(serverInput) {
  const server = serverInput && typeof serverInput === "object" ? serverInput : {};
  const username = normalizeDisplayText(server.username);
  const host = normalizeDisplayText(server.host);
  const port = normalizeDisplayText(server.port);
  if (!host) {
    return "";
  }
  const authority = username ? `${username}@${host}` : host;
  return port ? `${authority}:${port}` : authority;
}

function resolveSessionConnectionValue(sessionInfoCopy, connected) {
  const onValue = normalizeDisplayText(sessionInfoCopy.connectedValue) || "连接";
  const offValue = normalizeDisplayText(sessionInfoCopy.disconnectedValue) || "断开";
  return connected ? onValue : offValue;
}

function resolveAiProviderLabel(activeAiProvider) {
  const normalized = normalizeDisplayText(activeAiProvider).toLowerCase();
  if (normalized === "copilot") return "Copilot";
  if (normalized === "codex") return "Codex";
  return "";
}

/**
 * 工具栏浮层需要稳定输出静态会话信息：
 * 1. 顶部 hero 区聚焦“当前是哪台机器、通过哪条链路进入”；
 * 2. SSH / AI 连接态拆成两枚并排胶囊，便于一眼判断双通道状态；
 * 3. hero 已承载入口 / 跳转链路后，下方信息卡只保留不重复的目录信息；
 * 4. 缺省值统一在这里兜底，页面层只负责展示。
 */
function buildTerminalSessionInfoModel(input) {
  const source = input && typeof input === "object" ? input : {};
  const copy = source.copy && typeof source.copy === "object" ? source.copy : {};
  const sessionInfoCopy = copy.sessionInfo && typeof copy.sessionInfo === "object" ? copy.sessionInfo : {};
  const fallbackCopy = copy.fallback && typeof copy.fallback === "object" ? copy.fallback : {};
  const server = source.server && typeof source.server === "object" ? source.server : {};
  const jumpHost = server.jumpHost && typeof server.jumpHost === "object" ? server.jumpHost : null;
  const hasJumpHost = !!(jumpHost && jumpHost.enabled);
  const serverLabel = normalizeDisplayText(source.serverLabel);
  const statusText = normalizeDisplayText(source.statusText);
  const activeAiProvider = normalizeDisplayText(source.activeAiProvider);
  const emptyValue = normalizeDisplayText(sessionInfoCopy.emptyValue) || "-";
  const serverName =
    normalizeDisplayText(server.name) ||
    serverLabel ||
    normalizeDisplayText(fallbackCopy.unnamedServer) ||
    emptyValue;
  const projectPath =
    normalizeDisplayText(server.projectPath) || normalizeDisplayText(fallbackCopy.noProject) || emptyValue;
  const address =
    (hasJumpHost ? buildTerminalServerAddress(jumpHost) : buildTerminalServerAddress(server)) || emptyValue;
  const jumpTarget = hasJumpHost ? buildTerminalServerAddress(server) || emptyValue : "";
  const sshConnected = statusText === "connected";
  const aiConnected = !!activeAiProvider;
  const sshConnection = resolveSessionConnectionValue(sessionInfoCopy, statusText === "connected");
  const aiConnection = resolveSessionConnectionValue(sessionInfoCopy, aiConnected);
  const aiProviderLabel = resolveAiProviderLabel(activeAiProvider);
  const hero = {
    eyebrow: hasJumpHost ? "双跳通道" : "直连通道",
    name: serverName,
    subtitle: address,
    routeLabel: normalizeDisplayText(sessionInfoCopy.jumpTargetLabel) || "跳至服务器",
    route: hasJumpHost ? jumpTarget : ""
  };
  const statusChips = [
    {
      key: "sshConnection",
      label: normalizeDisplayText(sessionInfoCopy.sshConnectionLabel) || "SSH连接",
      value: sshConnection,
      badge: sshConnected ? "LIVE" : "IDLE",
      note: sshConnected ? "终端链路已就绪" : "等待重新建立",
      connected: sshConnected
    },
    {
      key: "aiConnection",
      label: normalizeDisplayText(sessionInfoCopy.aiConnectionLabel) || "AI连接",
      value: aiConnection,
      badge: aiConnected ? aiProviderLabel : "STANDBY",
      note: aiConnected ? `${aiProviderLabel} 正在前台` : "尚未接管终端",
      connected: aiConnected
    }
  ];
  /**
   * 链路信息已经在 hero 区完整展示：
   * 1. 直连时 subtitle 就是目标服务器；
   * 2. 跳板时 subtitle + route 已同时覆盖入口与目标；
   * 3. 同一弹层里不再重复渲染“入口 / 目标”卡片，只留下工作目录。
   */
  const detailItems = [
    {
      key: "project",
      accent: "目录",
      label: normalizeDisplayText(sessionInfoCopy.projectLabel) || "工作目录",
      value: projectPath,
      wide: true
    }
  ];

  return {
    title: normalizeDisplayText(sessionInfoCopy.title) || "会话信息",
    hero,
    statusChips,
    detailItems,
    items: detailItems
      .map((item) => ({
        key: item.key,
        label: item.label,
        value: item.value
      }))
      .concat(
        statusChips.map((item) => ({
          key: item.key,
          label: item.label,
          value: item.value
        }))
      )
  };
}

module.exports = {
  buildTerminalServerAddress,
  buildTerminalSessionInfoModel
};
