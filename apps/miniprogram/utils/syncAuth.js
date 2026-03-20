/* global wx, console, require, module */

const { getOpsConfig } = require("./opsConfig");

const SYNC_AUTH_STORAGE_KEY = "remoteconn.sync.auth.v1";

function logSyncAuth(level, message, extra) {
  if (level === "info") return;
  const payload = extra && typeof extra === "object" ? extra : {};
  const writer = level === "warn" ? console.warn : level === "error" ? console.error : console.info;
  writer("[sync.auth]", message, payload);
}

function readAuthCache() {
  try {
    const raw = wx.getStorageSync(SYNC_AUTH_STORAGE_KEY);
    return raw && typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
}

function writeAuthCache(value) {
  try {
    wx.setStorageSync(SYNC_AUTH_STORAGE_KEY, value && typeof value === "object" ? value : {});
  } catch {
    // ignore
  }
}

function resolveSyncBaseUrl() {
  const ops = getOpsConfig();
  const raw = String(ops.gatewayUrl || "").trim();
  if (!raw) {
    logSyncAuth("warn", "未配置 gatewayUrl，无法发起同步请求");
    return "";
  }
  let normalized = raw;
  if (normalized.startsWith("ws://")) normalized = `http://${normalized.slice(5)}`;
  if (normalized.startsWith("wss://")) normalized = `https://${normalized.slice(6)}`;
  if (!normalized.startsWith("http://") && !normalized.startsWith("https://")) {
    normalized = `https://${normalized}`;
  }
  normalized = normalized.replace(/[?#].*$/, "").replace(/\/+$/, "");
  const matched = normalized.match(/^(https?):\/\/([^/]+)(?:\/.*)?$/i);
  if (!matched) {
    logSyncAuth("warn", "gatewayUrl 非法，无法推导同步基地址", { raw });
    return "";
  }
  const baseUrl = `${matched[1].toLowerCase()}://${matched[2]}`;
  logSyncAuth("info", "同步基地址推导成功", { baseUrl });
  return baseUrl;
}

function requestJson(url, options) {
  logSyncAuth("info", "发起同步请求", {
    method: (options && options.method) || "GET",
    url
  });
  return new Promise((resolve, reject) => {
    wx.request({
      url,
      method: (options && options.method) || "GET",
      data: options && options.data,
      header: (options && options.header) || {},
      ...(Number.isFinite(Number(options && options.timeoutMs)) && Number(options && options.timeoutMs) >= 1000
        ? { timeout: Math.round(Number(options && options.timeoutMs)) }
        : {}),
      success(res) {
        const ok = res && res.statusCode >= 200 && res.statusCode < 300;
        if (!ok) {
          const message =
            res && res.data && typeof res.data === "object" && res.data.message
              ? String(res.data.message)
              : `sync request failed: ${res.statusCode}`;
          logSyncAuth("warn", "同步请求返回非 2xx", {
            method: (options && options.method) || "GET",
            url,
            statusCode: res && res.statusCode,
            message
          });
          reject(new Error(message));
          return;
        }
        logSyncAuth("info", "同步请求成功", {
          method: (options && options.method) || "GET",
          url,
          statusCode: res.statusCode
        });
        resolve(res.data || {});
      },
      fail(error) {
        logSyncAuth("error", "同步请求失败", {
          method: (options && options.method) || "GET",
          url,
          error: error && error.errMsg ? error.errMsg : String(error || "")
        });
        reject(error);
      }
    });
  });
}

async function loginAndFetchToken() {
  const baseUrl = resolveSyncBaseUrl();
  const ops = getOpsConfig();
  if (!baseUrl || !ops.gatewayToken) {
    logSyncAuth("warn", "同步鉴权配置不完整", {
      hasBaseUrl: Boolean(baseUrl),
      hasGatewayToken: Boolean(ops.gatewayToken)
    });
    throw new Error("sync config incomplete");
  }
  logSyncAuth("info", "准备执行 wx.login 获取同步令牌", { baseUrl });
  const loginResult = await new Promise((resolve, reject) => {
    wx.login({
      success(res) {
        if (!res.code) {
          logSyncAuth("warn", "wx.login 成功但未返回 code");
          reject(new Error("wx.login missing code"));
          return;
        }
        logSyncAuth("info", "wx.login 成功，已拿到 code");
        resolve(res);
      },
      fail(error) {
        logSyncAuth("error", "wx.login 失败", {
          error: error && error.errMsg ? error.errMsg : String(error || "")
        });
        reject(error);
      }
    });
  });
  const payload = await requestJson(`${baseUrl}/api/miniprogram/auth/login`, {
    method: "POST",
    data: { code: loginResult.code },
    header: {
      "content-type": "application/json",
      "x-gateway-token": ops.gatewayToken
    }
  });
  if (!payload || payload.ok !== true || !payload.token) {
    throw new Error((payload && payload.message) || "sync login failed");
  }
  const session = {
    token: String(payload.token || ""),
    expiresAt: String(payload.expiresAt || "")
  };
  writeAuthCache(session);
  logSyncAuth("info", "同步令牌获取成功", {
    expiresAt: session.expiresAt
  });
  return session;
}

async function ensureSyncAuthToken() {
  const cached = readAuthCache();
  const expiresAt = +new Date(cached.expiresAt || 0);
  if (cached.token && Number.isFinite(expiresAt) && expiresAt - Date.now() > 60 * 1000) {
    logSyncAuth("info", "复用本地缓存的同步令牌", {
      expiresAt: cached.expiresAt
    });
    return String(cached.token);
  }
  logSyncAuth("info", "本地无可用同步令牌，准备重新登录");
  const session = await loginAndFetchToken();
  return session.token;
}

module.exports = {
  ensureSyncAuthToken,
  resolveSyncBaseUrl,
  requestJson
};
