/* global module */

/**
 * 轻量 VT 解析层：
 * 1. 只负责把原始字节流样式文本切成 `CSI / OSC / DCS / ESC / 文本`；
 * 2. 不直接修改 buffer，也不参与页面几何/渲染；
 * 3. 当前目标是先把 Codex 已经用到的 prefix / intermediates / OSC / DCS 收口到统一入口，
 *    避免继续在 `terminalBufferState` 里散落正则补丁。
 */

const ESC_CHAR = "\u001b";

function shouldStripTerminalControlChar(codePoint) {
  return (
    (codePoint >= 0x00 && codePoint <= 0x06) ||
    codePoint === 0x0b ||
    codePoint === 0x0c ||
    (codePoint >= 0x0e && codePoint <= 0x1a) ||
    (codePoint >= 0x1c && codePoint <= 0x1f) ||
    codePoint === 0x7f
  );
}

/**
 * 微信小程序的 eslint 开了 `no-control-regex`，因此这里不用控制字符正则，
 * 改为显式扫描 `ESC ( X` / `ESC ) X` 这种 charset designator。
 */
function stripCharsetDesignators(text) {
  let result = "";
  let index = 0;
  while (index < text.length) {
    const current = text[index];
    const marker = text[index + 1];
    const final = text[index + 2];
    if (
      current === ESC_CHAR &&
      (marker === "(" || marker === ")") &&
      final &&
      /[0-9A-Za-z]/.test(final)
    ) {
      index += 3;
      continue;
    }
    result += current;
    index += 1;
  }
  return result;
}

/**
 * replay 文本里会混入一批不参与终端渲染的控制字符。
 * 这里逐字符过滤，既能避开 lint 规则，也更容易精确保留其余可见文本。
 */
function stripDisallowedControlChars(text) {
  let result = "";
  for (let index = 0; index < text.length; index += 1) {
    const codePoint = text.codePointAt(index);
    if (!Number.isFinite(codePoint)) {
      continue;
    }
    const ch = String.fromCodePoint(codePoint);
    if (!shouldStripTerminalControlChar(codePoint)) {
      result += ch;
    }
    if (ch.length === 2) {
      index += 1;
    }
  }
  return result;
}

function normalizeTerminalReplayText(input) {
  const raw = String(input || "");
  if (!raw) return "";
  return stripDisallowedControlChars(
    stripCharsetDesignators(raw)
      .replace(/［\??[0-9;]*[mKJHfABCDsuhl]/g, "")
      .replace(/\r\n/g, "\n")
  );
}

function createTerminalSyncUpdateState() {
  return {
    depth: 0,
    carryText: "",
    bufferedText: ""
  };
}

function isTerminalSyncUpdateCsi(privateMarker, final, values) {
  if (String(privateMarker || "") !== "?") return false;
  if (!["h", "l"].includes(String(final || ""))) return false;
  return Math.round(Number(values && values[0]) || 0) === 2026;
}

/**
 * web 端已经显式清洗 `DCS = 1 s / = 2 s`。
 * 小程序这里保持同口径，把它们也视为同步刷新窗口边界。
 */
function resolveTerminalSyncUpdateDcsAction(header, final, data) {
  if (String(final || "") !== "s") return "";
  if (String(data || "")) return "";
  const parsed = parseDcsHeader(header);
  if (parsed.privateMarker !== "=") return "";
  const mode = Math.round(Number(parsed.values && parsed.values[0]) || 0);
  if (mode === 1) return "start";
  if (mode === 2) return "end";
  return "";
}

/**
 * 将 Codex 这类 TUI 的“同步刷新窗口”从原始 stdout 中收口出来：
 * 1. 窗口外文本立即可见；
 * 2. 窗口内文本暂存，等结束标记到达后再一次性交给上层渲染；
 * 3. 若控制序列在 chunk 边界被截断，则把尾巴 carry 到下一帧继续拼。
 *
 * 这里的目标不是完整实现协议，而是避免把一整批重绘中间态逐帧暴露给用户。
 */
function consumeTerminalSyncUpdateFrames(input, previousState) {
  const source =
    previousState && typeof previousState === "object"
      ? previousState
      : createTerminalSyncUpdateState();
  const text = `${String(source.carryText || "")}${String(input || "")}`;
  let depth = Math.max(0, Math.round(Number(source.depth) || 0));
  let currentText = depth > 0 ? String(source.bufferedText || "") : "";
  let readyText = "";
  let carryText = "";
  let index = 0;

  const flushCurrentText = () => {
    if (!currentText) {
      return;
    }
    readyText += currentText;
    currentText = "";
  };

  while (index < text.length) {
    if (text[index] === "\u001b") {
      const next = text[index + 1];
      if (next === "[") {
        const csi = extractAnsiCsi(text, index);
        if (!csi) {
          carryText = text.slice(index);
          break;
        }
        const parsed = parseCsiParams(csi.paramsRaw);
        if (isTerminalSyncUpdateCsi(parsed.privateMarker, csi.final, parsed.values)) {
          if (csi.final === "h") {
            if (depth === 0) {
              flushCurrentText();
            }
            depth += 1;
          } else if (depth > 0) {
            depth -= 1;
            if (depth === 0) {
              flushCurrentText();
            }
          }
          index = csi.end + 1;
          continue;
        }
        currentText += text.slice(index, csi.end + 1);
        index = csi.end + 1;
        continue;
      }
      if (next === "]") {
        const osc = extractOscSequence(text, index);
        if (!osc) {
          carryText = text.slice(index);
          break;
        }
        currentText += text.slice(index, osc.end + 1);
        index = osc.end + 1;
        continue;
      }
      if (next === "P") {
        const dcs = extractDcsSequence(text, index);
        if (!dcs) {
          carryText = text.slice(index);
          break;
        }
        const action = resolveTerminalSyncUpdateDcsAction(dcs.header, dcs.final, dcs.data);
        if (action === "start") {
          if (depth === 0) {
            flushCurrentText();
          }
          depth += 1;
          index = dcs.end + 1;
          continue;
        }
        if (action === "end") {
          if (depth > 0) {
            depth -= 1;
            if (depth === 0) {
              flushCurrentText();
            }
          }
          index = dcs.end + 1;
          continue;
        }
        currentText += text.slice(index, dcs.end + 1);
        index = dcs.end + 1;
        continue;
      }
      if (!next) {
        carryText = text.slice(index);
        break;
      }
      currentText += text.slice(index, index + 2);
      index += 2;
      continue;
    }

    const codePoint = text.codePointAt(index);
    if (!Number.isFinite(codePoint)) {
      break;
    }
    const ch = String.fromCodePoint(codePoint);
    currentText += ch;
    index += ch.length;
  }

  let bufferedText = "";
  if (depth > 0) {
    bufferedText = currentText;
  } else {
    flushCurrentText();
  }

  return {
    text: readyText,
    state: {
      depth,
      carryText,
      bufferedText
    }
  };
}

/**
 * 将一段原始终端输出切成“可安全独立解析”的前缀：
 * 1. 不在 CSI / OSC / DCS / 两字符 ESC 序列中间截断；
 * 2. 不把 `\r\n` 从中间拆开，避免分片后被归一化成双重换行；
 * 3. 默认按 code point 推进，避免把代理对字符从中间截断。
 *
 * 说明：
 * - 如果上限恰好落在控制序列中间，且前面已经存在安全边界，则返回此前缀；
 * - 如果文本开头就是一个完整但较长的控制序列，则允许这一整个序列越过上限，保证最小前进。
 * - 如果文本前缀本身是不完整控制序列，则返回空 slice，由调用方把这段尾巴缓存到下一轮。
 */
function takeTerminalReplaySlice(input, maxChars) {
  const text = String(input || "");
  if (!text) {
    return { slice: "", rest: "" };
  }
  const limit = Math.max(1, Math.round(Number(maxChars) || 0));

  let index = 0;
  let safeEnd = 0;
  while (index < text.length && index < limit) {
    if (text[index] === "\r" && text[index + 1] === "\n") {
      const nextIndex = index + 2;
      if (nextIndex > limit && safeEnd > 0) {
        break;
      }
      safeEnd = nextIndex;
      index = nextIndex;
      continue;
    }
    if (text[index] === "\u001b") {
      const next = text[index + 1];
      let nextIndex = 0;
      if (next === "[") {
        const csi = extractAnsiCsi(text, index);
        if (!csi) break;
        nextIndex = csi.end + 1;
      } else if (next === "]") {
        const osc = extractOscSequence(text, index);
        if (!osc) break;
        nextIndex = osc.end + 1;
      } else if (next === "P") {
        const dcs = extractDcsSequence(text, index);
        if (!dcs) break;
        nextIndex = dcs.end + 1;
      } else if (next) {
        nextIndex = index + 2;
      } else {
        break;
      }
      if (nextIndex > limit && safeEnd > 0) {
        break;
      }
      safeEnd = nextIndex;
      index = nextIndex;
      continue;
    }
    const codePoint = text.codePointAt(index);
    if (!Number.isFinite(codePoint)) {
      break;
    }
    const ch = String.fromCodePoint(codePoint);
    const nextIndex = index + ch.length;
    if (nextIndex > limit && safeEnd > 0) {
      break;
    }
    safeEnd = nextIndex;
    index = nextIndex;
  }

  if (safeEnd <= 0) {
    return { slice: "", rest: text };
  }
  return {
    slice: text.slice(0, safeEnd),
    rest: text.slice(safeEnd)
  };
}

function extractAnsiCsi(text, startIndex) {
  if (text[startIndex] !== "\u001b" || text[startIndex + 1] !== "[") return null;
  let index = startIndex + 2;
  let buffer = "";
  while (index < text.length) {
    const ch = text[index];
    if (ch >= "@" && ch <= "~") {
      return {
        end: index,
        final: ch,
        paramsRaw: buffer
      };
    }
    buffer += ch;
    index += 1;
  }
  return null;
}

function parseCsiParams(paramsRaw) {
  const raw = String(paramsRaw || "");
  const privateMarker = raw && /^[?<>=!]/.test(raw) ? raw[0] : "";
  const body = privateMarker ? raw.slice(1) : raw;
  const intermediateMatch = /[\u0020-\u002f]+$/.exec(body);
  const intermediates = intermediateMatch ? intermediateMatch[0] : "";
  const paramsBody = intermediates ? body.slice(0, -intermediates.length) : body;
  const values = paramsBody.length
    ? paramsBody.split(";").map((part) => {
        if (!part) return NaN;
        const parsed = Number(part);
        return Number.isFinite(parsed) ? parsed : NaN;
      })
    : [];
  return {
    privateMarker,
    intermediates,
    values
  };
}

function extractOscSequence(text, startIndex) {
  if (text[startIndex] !== "\u001b" || text[startIndex + 1] !== "]") return null;
  let index = startIndex + 2;
  while (index < text.length) {
    const ch = text[index];
    if (ch === "\u0007") {
      return {
        content: text.slice(startIndex + 2, index),
        end: index
      };
    }
    if (ch === "\u001b" && text[index + 1] === "\\") {
      return {
        content: text.slice(startIndex + 2, index),
        end: index + 1
      };
    }
    index += 1;
  }
  return null;
}

function parseOscContent(content) {
  const raw = String(content || "");
  const separator = raw.indexOf(";");
  if (separator < 0) {
    return {
      ident: Number.NaN,
      data: raw
    };
  }
  const ident = Number(raw.slice(0, separator));
  return {
    ident: Number.isFinite(ident) ? ident : Number.NaN,
    data: raw.slice(separator + 1)
  };
}

function extractDcsSequence(text, startIndex) {
  if (text[startIndex] !== "\u001b" || text[startIndex + 1] !== "P") return null;
  let index = startIndex + 2;
  let header = "";
  while (index < text.length) {
    const ch = text[index];
    if (ch >= "@" && ch <= "~") {
      const final = ch;
      const contentStart = index + 1;
      let cursor = contentStart;
      while (cursor < text.length) {
        if (text[cursor] === "\u001b" && text[cursor + 1] === "\\") {
          return {
            header,
            final,
            data: text.slice(contentStart, cursor),
            end: cursor + 1
          };
        }
        cursor += 1;
      }
      return null;
    }
    header += ch;
    index += 1;
  }
  return null;
}

function parseDcsHeader(header) {
  const parsed = parseCsiParams(header);
  return {
    privateMarker: parsed.privateMarker,
    intermediates: parsed.intermediates,
    values: parsed.values
  };
}

function isLikelySgrCode(code) {
  const value = Number(code);
  if (!Number.isFinite(value)) return false;
  if (
    value === 0 ||
    value === 1 ||
    value === 4 ||
    value === 22 ||
    value === 24 ||
    value === 39 ||
    value === 49
  ) {
    return true;
  }
  if (value === 38 || value === 48) return true;
  if (value >= 30 && value <= 37) return true;
  if (value >= 40 && value <= 47) return true;
  if (value >= 90 && value <= 97) return true;
  if (value >= 100 && value <= 107) return true;
  return false;
}

/**
 * 某些录屏/replay 文本会把 `ESC[` 吃掉，只留下裸的 `31m` / `[31m` 片段。
 * 这里保留一个“松散 SGR”兜底解析，但仍限制在可信 SGR 编码集合内，避免把普通文本误吞成样式。
 */
function extractLooseAnsiSgr(text, startIndex) {
  let index = startIndex;
  let tokenCount = 0;
  let sawBracket = false;
  const allCodes = [];

  while (index < text.length) {
    const tokenStart = index;
    if (text[index] === "[" || text[index] === "［") {
      sawBracket = true;
      index += 1;
    }
    let body = "";
    while (index < text.length) {
      const ch = text[index];
      if ((ch >= "0" && ch <= "9") || ch === ";") {
        body += ch;
        index += 1;
        continue;
      }
      break;
    }
    if (body.length === 0 || text[index] !== "m") {
      index = tokenStart;
      break;
    }
    const codes = body
      .split(";")
      .filter((part) => part.length > 0)
      .map((part) => {
        const parsed = Number(part);
        return Number.isFinite(parsed) ? parsed : 0;
      });
    if (codes.length === 0) {
      codes.push(0);
    }
    allCodes.push(...codes);
    tokenCount += 1;
    index += 1;
  }

  if (tokenCount === 0) return null;
  if (!allCodes.some((code) => isLikelySgrCode(code))) return null;
  if (tokenCount === 1 && !sawBracket) {
    const single = allCodes.length === 1 ? allCodes[0] : Number.NaN;
    if (!Number.isFinite(single) || ![0, 22, 24, 39, 49].includes(single)) {
      return null;
    }
  }
  return {
    end: index - 1,
    codes: allCodes
  };
}

module.exports = {
  consumeTerminalSyncUpdateFrames,
  createTerminalSyncUpdateState,
  extractAnsiCsi,
  extractDcsSequence,
  extractLooseAnsiSgr,
  extractOscSequence,
  normalizeTerminalReplayText,
  takeTerminalReplaySlice,
  parseCsiParams,
  parseDcsHeader,
  parseOscContent
};
