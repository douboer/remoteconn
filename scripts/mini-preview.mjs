import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const APP_ID = "wxa0e7e5a27599cf6c";
const PROJECT_PATH = path.join(ROOT, "apps/miniprogram");
const PRIVATE_KEY_PATH = path.join(ROOT, "private.wxa0e7e5a27599cf6c.key");
const DEFAULT_REDRAW_RETRY_COUNT = 1;
const DEFAULT_REDRAW_WAIT_MS = 300;

function wait(ms) {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });
}

export function normalizeRetryCount(raw, fallback = DEFAULT_REDRAW_RETRY_COUNT) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < 0) return 0;
  return Math.floor(parsed);
}

export async function renderTerminalQrcodeWithRetry({
  qrcodeBase64,
  generateTerminalQrcode,
  maxRetries = DEFAULT_REDRAW_RETRY_COUNT,
  waitMs = DEFAULT_REDRAW_WAIT_MS,
  onRetry,
  onRecovered
}) {
  let lastError = null;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const terminalQrcode = await generateTerminalQrcode(qrcodeBase64);
      if (attempt > 0 && typeof onRecovered === "function") {
        onRecovered({ attempt, maxRetries });
      }
      return terminalQrcode;
    } catch (error) {
      lastError = error;
      if (attempt >= maxRetries) break;
      if (typeof onRetry === "function") {
        onRetry({ attempt: attempt + 1, maxRetries, error });
      }
      if (waitMs > 0) {
        await wait(waitMs);
      }
    }
  }
  throw lastError;
}

async function runNodeScript(scriptPath) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath], {
      cwd: ROOT,
      stdio: "inherit"
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`脚本执行失败：${scriptPath}（退出码 ${code ?? "unknown"}）`));
    });
  });
}

function loadMiniProgramCiModules() {
  const require = createRequire(import.meta.url);
  return {
    ci: require("miniprogram-ci"),
    terminalQrcodeModule: require("miniprogram-ci/dist/ci/utils/terminalQrcode"),
    miniprogramLog: require("miniprogram-ci/dist/utils/log")
  };
}

function patchTerminalQrcodeRedraw({ terminalQrcodeModule, miniprogramLog, maxRetries, waitMs }) {
  const originalGenerate = terminalQrcodeModule.generateTerminalQrcode;
  terminalQrcodeModule.generateTerminalQrcode = async (qrcodeBase64) =>
    renderTerminalQrcodeWithRetry({
      qrcodeBase64,
      maxRetries,
      waitMs,
      generateTerminalQrcode: originalGenerate,
      onRetry: ({ attempt, maxRetries: totalRetries }) => {
        miniprogramLog.warn(`终端二维码首次渲染失败，正在自动重画（${attempt}/${totalRetries}）...`);
      },
      onRecovered: ({ attempt, maxRetries: totalRetries }) => {
        miniprogramLog.log(`终端二维码已自动重画成功（第 ${attempt} 次重画，共 ${totalRetries} 次机会）。`);
      }
    });
  return () => {
    terminalQrcodeModule.generateTerminalQrcode = originalGenerate;
  };
}

async function main() {
  process.env.COLUMNS = process.env.COLUMNS || "120";
  await runNodeScript(path.join(ROOT, "scripts/sync-miniprogram-env.mjs"));

  const redrawRetries = normalizeRetryCount(process.env.MINI_TERMINAL_QRCODE_RETRIES);
  const redrawWaitMs = normalizeRetryCount(process.env.MINI_TERMINAL_QRCODE_WAIT_MS, DEFAULT_REDRAW_WAIT_MS);
  const { ci, terminalQrcodeModule, miniprogramLog } = loadMiniProgramCiModules();
  const restorePatchedQrcode = patchTerminalQrcodeRedraw({
    terminalQrcodeModule,
    miniprogramLog,
    maxRetries: redrawRetries,
    waitMs: redrawWaitMs
  });

  try {
    const project = new ci.Project({
      appid: APP_ID,
      type: "miniProgram",
      projectPath: PROJECT_PATH,
      privateKeyPath: PRIVATE_KEY_PATH
    });

    await ci.preview({
      project,
      robot: 1,
      setting: {
        useProjectConfig: true
      },
      qrcodeFormat: "terminal",
      onProgressUpdate: (progress) => {
        miniprogramLog.log(progress);
      }
    });
    miniprogramLog.log("done");
  } finally {
    restorePatchedQrcode();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    globalThis.console.error(error);
    process.exit(1);
  });
}
