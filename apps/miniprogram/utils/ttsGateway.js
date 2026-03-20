/* global require, module, clearTimeout, setTimeout */

const { ensureSyncAuthToken, resolveSyncBaseUrl, requestJson } = require("./syncAuth");

const TTS_REQUEST_TIMEOUT_MS = 15000;
const TTS_GENERATION_TIMEOUT_MS = 6 * 60 * 1000;
const TTS_STATUS_POLL_INTERVAL_MS = 700;
const TTS_LOCAL_CACHE_PREFIX = "tts-cache-";
const KNOWN_TTS_MESSAGES = new Set([
  "当前没有可播报内容",
  "当前内容不适合播报",
  "播报文本过长",
  "语音生成繁忙，请稍后重试",
  "语音生成超时，请稍后重试",
  "语音生成失败",
  "TTS 服务未配置"
]);
const KNOWN_TTS_MESSAGE_PREFIXES = ["TTS 上游鉴权或权限失败，请检查密钥、地域和账号权限"];

function isKnownTtsMessage(message) {
  const normalized = String(message || "").trim();
  if (!normalized) return false;
  if (KNOWN_TTS_MESSAGES.has(normalized)) return true;
  return KNOWN_TTS_MESSAGE_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

function withTimeout(task, timeoutMs, timeoutMessage) {
  const waitMs = Math.max(1000, Math.round(Number(timeoutMs) || TTS_REQUEST_TIMEOUT_MS));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(timeoutMessage || "语音生成超时，请稍后重试"));
    }, waitMs);
    Promise.resolve(task)
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

function sleep(ms) {
  const waitMs = Math.max(0, Math.round(Number(ms) || 0));
  return new Promise((resolve) => {
    setTimeout(resolve, waitMs);
  });
}

function getMiniProgramFs() {
  if (typeof wx === "undefined" || typeof wx.getFileSystemManager !== "function") {
    return null;
  }
  try {
    return wx.getFileSystemManager();
  } catch {
    return null;
  }
}

function sanitizeTtsCacheKey(cacheKey) {
  return String(cacheKey || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "");
}

/**
 * 使用小程序用户目录做确定性文件缓存：
 * 1. 以服务端 `cacheKey` 命名，天然与内容一一对应；
 * 2. 命中后可直接播放本地文件，不再重复下载；
 * 3. 不依赖 `saveFile` 的全局列表，避免额外维护 saved file 配额。
 */
function resolveTtsLocalCachePath(cacheKey) {
  const normalizedKey = sanitizeTtsCacheKey(cacheKey);
  const userDataPath =
    typeof wx !== "undefined" && wx && wx.env && typeof wx.env.USER_DATA_PATH === "string"
      ? wx.env.USER_DATA_PATH
      : "";
  if (!normalizedKey || !userDataPath) {
    return "";
  }
  return `${userDataPath}/${TTS_LOCAL_CACHE_PREFIX}${normalizedKey}.mp3`;
}

function accessLocalFile(filePath) {
  const targetPath = String(filePath || "").trim();
  const fs = getMiniProgramFs();
  if (!targetPath || !fs || typeof fs.access !== "function") {
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    fs.access({
      path: targetPath,
      success: () => resolve(true),
      fail: () => resolve(false)
    });
  });
}

function downloadTtsAudioToLocal(remoteAudioUrl, cacheKey, timeoutMs) {
  const targetUrl = String(remoteAudioUrl || "").trim();
  const filePath = resolveTtsLocalCachePath(cacheKey);
  if (!targetUrl || !filePath || typeof wx === "undefined" || typeof wx.downloadFile !== "function") {
    return Promise.resolve("");
  }
  return new Promise((resolve) => {
    wx.downloadFile({
      url: targetUrl,
      filePath,
      timeout: Math.max(1000, Math.round(Number(timeoutMs) || TTS_REQUEST_TIMEOUT_MS)),
      success(res) {
        const statusCode = Number(res && res.statusCode);
        if (statusCode >= 200 && statusCode < 300) {
          resolve(filePath);
          return;
        }
        resolve("");
      },
      fail() {
        resolve("");
      }
    });
  });
}

async function resolvePlayableAudioUrl(remoteAudioUrl, cacheKey, timeoutMs) {
  const localPath = resolveTtsLocalCachePath(cacheKey);
  if (!localPath) {
    return remoteAudioUrl;
  }
  if (await accessLocalFile(localPath)) {
    return localPath;
  }
  const downloadedPath = await downloadTtsAudioToLocal(remoteAudioUrl, cacheKey, timeoutMs);
  return downloadedPath || remoteAudioUrl;
}

/**
 * gateway 生成的 TTS 音频/状态地址本质上应与小程序当前同步基地址同源：
 * 1. 若反向代理未透传 `x-forwarded-proto/host`，后端可能回出 `http://内网主机/...`；
 * 2. 小程序 `request` 能成功，不代表 `InnerAudioContext` 也能播放这个错误 origin；
 * 3. 因此仅对 `/api/miniprogram/tts/` 路径做同源归一化，强制回到当前 `gatewayUrl`。
 */
function normalizeGatewayTtsUrl(rawUrl, baseUrl) {
  const candidate = String(rawUrl || "").trim();
  const base = String(baseUrl || "").trim();
  if (!candidate || !base) {
    return candidate;
  }
  try {
    const baseParsed = new URL(base);
    const resolved = new URL(candidate, `${baseParsed.origin}/`);
    if (!resolved.pathname.startsWith("/api/miniprogram/tts/")) {
      return resolved.toString();
    }
    return `${baseParsed.origin}${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return candidate;
  }
}

async function waitForSynthesisReady(statusUrl, timeoutMs) {
  const deadline = Date.now() + Math.max(TTS_REQUEST_TIMEOUT_MS, Math.round(Number(timeoutMs) || TTS_GENERATION_TIMEOUT_MS));
  while (Date.now() < deadline) {
    const payload = await requestJson(statusUrl, {
      method: "GET",
      timeoutMs: TTS_REQUEST_TIMEOUT_MS
    });
    const status = payload && payload.status ? String(payload.status) : "";
    if (payload && payload.ok === true && status === "ready") {
      return;
    }
    const rawMessage = payload && payload.message ? String(payload.message) : "";
    if (status === "error") {
      throw new Error(isKnownTtsMessage(rawMessage) ? rawMessage : "语音生成失败");
    }
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      break;
    }
    await sleep(Math.min(TTS_STATUS_POLL_INTERVAL_MS, remainingMs));
  }
  throw new Error("语音生成超时，请稍后重试");
}

/**
 * 小程序 TTS 请求只做两件事：
 * 1. 复用同步登录 Bearer token；
 * 2. 把短文本换成短时可播放音频 URL。
 */
async function synthesizeTerminalSpeech(options) {
  const input = options && typeof options === "object" ? options : {};
  const text = String(input.text || "").trim();
  if (!text) {
    throw new Error("当前没有可播报内容");
  }
  const baseUrl = resolveSyncBaseUrl();
  if (!baseUrl) {
    throw new Error("语音生成失败");
  }
  const token = await ensureSyncAuthToken();
  let response = null;
  try {
    response = await withTimeout(
      requestJson(`${baseUrl}/api/miniprogram/tts/synthesize`, {
        method: "POST",
        data: {
          text,
          scene: "codex_terminal",
          ...(input.voice ? { voice: String(input.voice) } : {}),
          ...(Number.isFinite(Number(input.speed)) ? { speed: Number(input.speed) } : {})
        },
        header: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`
        },
        timeoutMs: TTS_REQUEST_TIMEOUT_MS
      }),
      TTS_REQUEST_TIMEOUT_MS,
      "语音生成超时，请稍后重试"
    );
    if (response && response.status === "pending") {
      const statusUrl = normalizeGatewayTtsUrl(response.statusUrl, baseUrl);
      if (!statusUrl) {
        throw new Error("语音生成失败");
      }
      await waitForSynthesisReady(statusUrl, input.timeoutMs);
    }
  } catch (error) {
    const rawMessage = error instanceof Error && error.message ? error.message : "";
    if (/timeout/i.test(rawMessage)) {
      throw new Error("语音生成超时，请稍后重试");
    }
    if (isKnownTtsMessage(rawMessage)) {
      throw new Error(rawMessage);
    }
    throw new Error("语音生成失败");
  }
  if (!response || response.ok !== true || !response.audioUrl) {
    const rawMessage = response && response.message ? String(response.message) : "";
    throw new Error(isKnownTtsMessage(rawMessage) ? rawMessage : "语音生成失败");
  }
  const remoteAudioUrl = normalizeGatewayTtsUrl(response.audioUrl, baseUrl);
  const audioUrl = await resolvePlayableAudioUrl(
    remoteAudioUrl,
    response.cacheKey,
    TTS_REQUEST_TIMEOUT_MS
  );
  return {
    cacheKey: String(response.cacheKey || ""),
    cached: response.cached === true,
    audioUrl,
    remoteAudioUrl,
    expiresAt: String(response.expiresAt || "")
  };
}

module.exports = {
  TTS_REQUEST_TIMEOUT_MS,
  synthesizeTerminalSpeech
};
