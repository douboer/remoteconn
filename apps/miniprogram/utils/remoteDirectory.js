/* global console, module, require, clearTimeout, setTimeout */
/* eslint-disable no-control-regex */

const { createGatewayClient } = require("./gateway");
const { validateServerForConnect } = require("./serverValidation");
const { resolveSocketDomainHint } = require("./socketDomain");

/**
 * 认证参数与 terminal 页保持一致，避免多处行为分叉。
 */
function normalizeAuthType(value) {
  const authType = String(value || "").trim();
  if (authType === "privateKey" || authType === "certificate") return authType;
  return "password";
}

function resolveCredential(server, prefix) {
  const source = server && typeof server === "object" ? server : {};
  const fieldPrefix = String(prefix || "");
  const authType = normalizeAuthType(
    fieldPrefix ? source.jumpHost && source.jumpHost.authType : source.authType
  );
  const passwordKey = fieldPrefix ? `${fieldPrefix}Password` : "password";
  const privateKeyKey = fieldPrefix ? `${fieldPrefix}PrivateKey` : "privateKey";
  const passphraseKey = fieldPrefix ? `${fieldPrefix}Passphrase` : "passphrase";
  const certificateKey = fieldPrefix ? `${fieldPrefix}Certificate` : "certificate";
  if (authType === "privateKey") {
    return {
      type: "privateKey",
      privateKey: String(source[privateKeyKey] || ""),
      passphrase: String(source[passphraseKey] || "")
    };
  }
  if (authType === "certificate") {
    return {
      type: "certificate",
      privateKey: String(source[privateKeyKey] || ""),
      passphrase: String(source[passphraseKey] || ""),
      certificate: String(source[certificateKey] || "")
    };
  }
  return {
    type: "password",
    password: String(source[passwordKey] || "")
  };
}

function normalizeHomePath(input) {
  const value = String(input || "").trim();
  if (!value || value === "~") return "~";
  if (!value.startsWith("~/")) return "~";
  const body = value
    .slice(2)
    .split("/")
    .map((part) => part.trim())
    .filter((part) => part && part !== "." && part !== "..")
    .join("/");
  return body ? `~/${body}` : "~";
}

function quoteForShellSingle(value) {
  return `'${String(value || "").replace(/'/g, `'"'"'`)}'`;
}

function buildListCommand(path, beginMarker, endMarker) {
  const normalized = normalizeHomePath(path);
  const relative = normalized === "~" ? "" : normalized.slice(2);
  const relQuoted = quoteForShellSingle(relative);
  const beginQuoted = quoteForShellSingle(beginMarker);
  const endQuoted = quoteForShellSingle(endMarker);
  // 外层仅执行 `sh -lc '...'`，避免依赖远端默认 shell 对 `A=B cmd` 前缀赋值语法的支持。
  // 目录列举优先 command ls -1tp（按修改时间从新到旧，且绕过 alias），再回退 find。
  const script = [
    `__RC_BEGIN=${beginQuoted}`,
    `__RC_END=${endQuoted}`,
    `__RC_REL=${relQuoted}`,
    'if [ -z "$__RC_REL" ]; then __RC_DIR="$HOME"; else __RC_DIR="$HOME/$__RC_REL"; fi',
    'printf "%s\\n" "$__RC_BEGIN"',
    'if ! cd "$__RC_DIR" 2>/dev/null; then printf "__RCERR__CD__\\n"; printf "%s\\n" "$__RC_END"; exit 0; fi',
    "if command -v ls >/dev/null 2>&1; then command ls -1tp 2>/dev/null | sed -n '/\\/$/s#/$##p' | sed '/^\\./d'; elif command -v find >/dev/null 2>&1; then find . -mindepth 1 -maxdepth 1 -type d ! -name '.*' -print 2>/dev/null | sed 's#^\\./##'; fi",
    'printf "%s\\n" "$__RC_END"'
  ].join("; ");
  const scriptQuoted = quoteForShellSingle(script);
  return `sh -lc ${scriptQuoted}\n`;
}

function createStdoutCollector(beginMarker, endMarker) {
  let buffer = "";
  let done = false;
  let collecting = false;
  const extractedLines = [];
  let beginSignalSeen = false;

  function sanitizeChunk(input) {
    return sanitizeTerminalChunk(input);
  }

  function consume(rawChunk) {
    if (done) return;
    buffer += sanitizeChunk(rawChunk);
    if (!beginSignalSeen && buffer.includes(beginMarker)) {
      beginSignalSeen = true;
    }
    // 必须按“整行”识别 begin/end 标记，避免命令回显折行时把标记误判成目录项。
    while (!done) {
      const newlineAt = buffer.indexOf("\n");
      if (newlineAt < 0) break;
      const rawLine = buffer.slice(0, newlineAt);
      buffer = buffer.slice(newlineAt + 1);
      const line = rawLine.replace(/\r/g, "");
      const trimmed = line.trim();
      if (!collecting) {
        if (trimmed === beginMarker) {
          collecting = true;
          beginSignalSeen = true;
        }
        continue;
      }
      if (trimmed === endMarker) {
        done = true;
        break;
      }
      extractedLines.push(line);
    }
  }

  function isDone() {
    return done;
  }

  function hasBeginMarker() {
    return collecting || done;
  }

  function hasBeginSignal() {
    return beginSignalSeen || collecting || done;
  }

  function getLines() {
    return extractedLines.map((line) => line.trim()).filter((line) => !!line);
  }

  return { consume, isDone, hasBeginMarker, hasBeginSignal, getLines };
}

function sanitizeTerminalChunk(input) {
  return String(input || "")
    .replace(/\r/g, "")
    .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, "")
    .replace(/\u001bP[\s\S]*?\u001b\\/g, "")
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\u001b[@-~]/g, "");
}

function toErrorMessage(error, fallback) {
  if (!error) return fallback;
  if (typeof error === "string") return error;
  if (typeof error.message === "string" && error.message.trim()) return error.message.trim();
  if (typeof error.errMsg === "string" && error.errMsg.trim()) return error.errMsg.trim();
  return fallback;
}

function isLikelyErrorLine(line) {
  const text = String(line || "");
  if (!text) return false;
  return /^(?:ls|find|sh):|not found|no such file|permission denied/i.test(text);
}

function isInternalMarkerLine(line) {
  const text = String(line || "");
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (/__RC_/i.test(trimmed)) return true;
  if (/~\/__RC_/i.test(trimmed)) return true;
  if (/(?:^|\s)gavin\b.*\b(?:%|#|\$)\b.*__RC_/i.test(trimmed)) return true;
  const normalized = trimmed
    .replace(/[\u001b\u009b][[()\]#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, "")
    .replace(/[^a-zA-Z0-9_]/g, "")
    .toUpperCase();
  if (!normalized) return false;
  if (normalized.includes("RCDIRBEGIN")) return true;
  if (normalized.includes("RCDIREND")) return true;
  if (normalized.includes("RCBEGIN")) return true;
  if (normalized.includes("RCEND")) return true;
  if (normalized.includes("RCREL")) return true;
  if (normalized.includes("RCERR")) return true;
  if (normalized.includes("LIST_REMOTEDIRECTORIES_DONE".replace(/[^A-Z0-9_]/g, ""))) return true;
  if (!text) return false;
  return false;
}

/**
 * 通过一次短连接从远端目录读取子目录列表。
 * 返回值仅包含“目录名”，不包含完整路径。
 */
function listRemoteDirectories(options) {
  const params = options && typeof options === "object" ? options : {};
  const server = params.server || {};
  const opsConfig = params.opsConfig || {};
  const targetPath = normalizeHomePath(params.path || "~");
  const requestId = `dir_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const requestStartedAt = Date.now();
  const connectTimeoutMs = Number(opsConfig.gatewayConnectTimeoutMs);
  const timeoutMs = Number(params.timeoutMs);
  const maxWaitMs =
    Number.isFinite(timeoutMs) && timeoutMs >= 1000
      ? timeoutMs
      : Number.isFinite(connectTimeoutMs) && connectTimeoutMs >= 1000
        ? connectTimeoutMs + 10000
        : 22000;

  const beginMarker = `__RC_DIR_BEGIN_${Date.now()}_${Math.random().toString(36).slice(2, 8)}__`;
  const endMarker = `__RC_DIR_END_${Date.now()}_${Math.random().toString(36).slice(2, 8)}__`;
  const collector = createStdoutCollector(beginMarker, endMarker);
  const command = buildListCommand(targetPath, beginMarker, endMarker);

  console.info(
    `[目录请求] 开始 id=${requestId} host=${String(server.host || "").trim() || "-"} ` +
      `port=${Number(server.port) || 22} user=${String(server.username || "").trim() || "-"} path=${targetPath}`
  );

  return new Promise((resolve, reject) => {
    let settled = false;
    let connected = false;
    let timer = null;
    let commandAttempts = 0;
    // 目录读取改为单次发送，避免重试导致重复 ls 拉长耗时。
    const maxCommandAttempts = 1;
    let sawFirstOutput = false;
    const diagnosticLines = [];

    function rememberDiagnostics(rawChunk) {
      const lines = sanitizeTerminalChunk(rawChunk)
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => !!line)
        .filter((line) => !isInternalMarkerLine(line));
      lines.forEach((line) => {
        if (diagnosticLines.includes(line)) return;
        diagnosticLines.push(line);
      });
      if (diagnosticLines.length > 6) {
        diagnosticLines.splice(0, diagnosticLines.length - 6);
      }
    }

    function sendCommandAttempt(trigger) {
      if (settled) return;
      if (!connected) return;
      if (collector.isDone()) return;
      if (commandAttempts >= maxCommandAttempts) return;
      commandAttempts += 1;
      console.info(
        `[目录请求] 发送命令 id=${requestId} attempt=${commandAttempts}/${maxCommandAttempts} ` +
          `trigger=${String(trigger || "unknown")} elapsed=${Date.now() - requestStartedAt}ms`
      );
      try {
        client.sendStdin(command);
      } catch {
        finishReject(new Error("目录命令发送失败"));
        return;
      }
    }

    const client = createGatewayClient({
      gatewayUrl: opsConfig.gatewayUrl,
      gatewayToken: opsConfig.gatewayToken,
      connectTimeoutMs: opsConfig.gatewayConnectTimeoutMs,
      onFrame: (frame) => {
        if (settled) return;
        if (
          frame.type === "control" &&
          frame.payload?.action === "connected" &&
          !frame.payload?.fingerprint
        ) {
          connected = true;
          console.info(`[目录请求] 已连接 id=${requestId} elapsed=${Date.now() - requestStartedAt}ms`);
          // connected 事件里立即首发，避免定时器抖动导致额外等待。
          sendCommandAttempt("connected");
          return;
        }
        if (frame.type === "control" && frame.payload?.action === "connected" && frame.payload?.fingerprint) {
          return;
        }
        if (frame.type === "stdout" || frame.type === "stderr") {
          const chunkText = frame.payload?.data || "";
          if (!collector.hasBeginSignal()) {
            rememberDiagnostics(chunkText);
          }
          if (!sawFirstOutput && String(chunkText || "").trim()) {
            sawFirstOutput = true;
            console.info(`[目录请求] 首包输出 id=${requestId} elapsed=${Date.now() - requestStartedAt}ms`);
            // 若连接后尚未发出目录命令，首包输出到达时立即触发一次发送。
            if (connected && commandAttempts === 0 && !collector.isDone()) {
              sendCommandAttempt("first_output");
            }
          }
          const beforeDone = collector.isDone();
          collector.consume(chunkText);
          const afterDone = collector.isDone();
          if (beforeDone || !afterDone) return;
          if (!collector.isDone()) return;
          const rawLines = collector.getLines();
          const hasCdError = rawLines.some((line) => line.trim() === "__RCERR__CD__");
          if (hasCdError) {
            finishReject(new Error(`目录不存在或无权限：${targetPath}`));
            return;
          }
          const names = rawLines
            .map((line) => line.trim())
            .filter((line) => line && line !== "." && line !== "..")
            .filter((line) => !isInternalMarkerLine(line))
            .filter((line) => !line.startsWith("."))
            .filter((line) => !isLikelyErrorLine(line))
            .filter((line, index, arr) => arr.indexOf(line) === index);
          console.info(
            `[目录请求] 完成 id=${requestId} path=${targetPath} count=${names.length} ` +
              `attempts=${commandAttempts} elapsed=${Date.now() - requestStartedAt}ms`
          );
          finishResolve(names);
          return;
        }
        if (frame.type === "error") {
          finishReject(new Error(frame.payload?.message || "网关错误"));
          return;
        }
        if (frame.type === "control" && frame.payload?.action === "disconnect") {
          const reason = String(frame.payload?.reason || "").trim();
          if (!collector.isDone()) {
            finishReject(new Error(reason ? `连接已断开: ${reason}` : "连接已断开"));
          }
        }
      },
      onClose: () => {
        if (settled || collector.isDone()) return;
        finishReject(new Error(connected ? "连接中断" : "网关连接失败"));
      },
      onError: (error) => {
        if (settled) return;
        finishReject(new Error(toErrorMessage(error, "网关连接失败")));
      }
    });

    function cleanup() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      try {
        client.disconnect("list_remote_directories_done");
      } catch {
        // ignore
      }
    }

    function finishResolve(payload) {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(payload);
    }

    function finishReject(error) {
      if (settled) return;
      settled = true;
      console.warn(
        `[目录请求] 失败 id=${requestId} path=${targetPath} attempts=${commandAttempts} ` +
          `elapsed=${Date.now() - requestStartedAt}ms reason=${toErrorMessage(error, "unknown")}`
      );
      cleanup();
      reject(error);
    }

    timer = setTimeout(() => {
      const diagnostic = diagnosticLines.find((line) => !isLikelyErrorLine(line)) || diagnosticLines[0] || "";
      if (diagnostic) {
        finishReject(new Error(`目录读取超时，远端返回：${diagnostic}`));
        return;
      }
      finishReject(new Error("目录读取超时，请稍后重试"));
    }, maxWaitMs);

    client
      .connect({
        host: server.jumpHost && server.jumpHost.enabled ? server.jumpHost.host : server.host,
        port: server.jumpHost && server.jumpHost.enabled ? Number(server.jumpHost.port) || 22 : server.port,
        username: server.jumpHost && server.jumpHost.enabled ? server.jumpHost.username : server.username,
        credential:
          server.jumpHost && server.jumpHost.enabled
            ? resolveCredential(server, "jump")
            : resolveCredential(server),
        ...(server.jumpHost && server.jumpHost.enabled
          ? {
              jumpHost: {
                host: server.host,
                port: server.port,
                username: server.username,
                credential: resolveCredential(server)
              }
            }
          : {}),
        cols: 80,
        rows: 24
      })
      .catch((error) => {
        finishReject(new Error(toErrorMessage(error, "网关连接失败")));
      });
  });
}

module.exports = {
  listRemoteDirectories,
  normalizeHomePath,
  validateServerForConnect,
  resolveSocketDomainHint
};
