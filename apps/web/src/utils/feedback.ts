function asMessage(error: unknown): string {
  if (error instanceof Error) {
    return String(error.message || "");
  }
  if (typeof error === "string") {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return "";
  }
}

function normalizeText(input: string): string {
  return input.trim().toLowerCase();
}

export function toFriendlyDisconnectReason(reason: string | undefined): string {
  const raw = String(reason ?? "").trim();
  if (!raw) return "连接已关闭";

  const map: Record<string, string> = {
    manual: "你已主动断开连接",
    switch: "切换连接目标，已断开当前会话",
    host_key_rejected: "主机指纹未被信任，连接已断开",
    auth_failed: "认证失败，连接被服务器拒绝",
    rate_limit: "连接过于频繁，请稍后重试",
    shell_closed: "远端 Shell 已关闭",
    connection_closed: "服务器连接已关闭",
    ws_error: "网关连接异常",
    ws_closed: "网关连接已断开",
    ws_peer_normal_close: "客户端已关闭连接",
    unknown: "连接已关闭"
  };

  return map[raw] ?? `连接已关闭（${raw}）`;
}

export function toFriendlyConnectionError(error: unknown): string {
  const message = asMessage(error);
  const lower = normalizeText(message);

  if (lower.includes("rate_limit") || message.includes("连接过于频繁")) {
    return "连接过于频繁，请稍后重试。";
  }

  if (lower.includes("auth_failed") || message.includes("token 无效")) {
    return "网关鉴权失败，请联系管理员检查网关令牌。";
  }

  if (message.includes("SSH 认证失败")) {
    return "SSH 认证失败。请检查账号/凭据，若服务器仅允许公钥认证，请改用私钥方式。";
  }

  if (message.includes("主机指纹") && message.includes("信任")) {
    return "主机指纹校验未通过，请确认主机身份后重试。";
  }

  if (message.includes("Timed out while waiting for handshake") || message.includes("连接超时") || lower.includes("timeout")) {
    return "连接超时。请检查服务器地址、端口和网络连通性。";
  }

  if (message.includes("无法连接网关") || lower.includes("ws_closed") || lower.includes("websocket")) {
    return "无法连接网关，请检查网关地址、服务状态与网络策略。";
  }

  if (message.includes("凭据读取失败")) {
    return "凭据读取失败，请在服务器设置页重新保存后重试。";
  }

  if (!message) {
    return "连接失败，请稍后重试。";
  }

  return message;
}

export function toFriendlyError(error: unknown): string {
  const message = asMessage(error);
  const lower = normalizeText(message);

  if (!message) {
    return "操作失败，请稍后重试。";
  }

  if (
    lower.includes("ws_") ||
    lower.includes("websocket") ||
    lower.includes("auth_failed") ||
    lower.includes("rate_limit") ||
    message.includes("连接") ||
    message.includes("网关") ||
    message.includes("SSH")
  ) {
    return toFriendlyConnectionError(message);
  }

  if (message.includes("密码不能为空") || message.includes("私钥内容不能为空") || message.includes("证书模式下")) {
    return message;
  }

  if (lower.includes("json") && (lower.includes("parse") || lower.includes("unexpected token"))) {
    return "配置内容不是有效的 JSON，请检查格式后重试。";
  }

  if (message.includes("会话未连接")) {
    return "当前会话未连接，请先建立连接。";
  }

  if (message.includes("凭据读取失败")) {
    return "凭据读取失败，请在服务器设置页重新保存后重试。";
  }

  if (message.includes("未找到凭据内容") || message.includes("凭据引用不存在")) {
    return "未找到可用凭据，请在服务器设置页重新填写并保存。";
  }

  return message;
}

export function formatActionError(action: string, error: unknown): string {
  const detail = toFriendlyError(error);
  return `${action}：${detail}`;
}

export function toToastTitle(level: "info" | "warn" | "error"): string {
  if (level === "error") return "错误";
  if (level === "warn") return "注意";
  return "提示";
}
