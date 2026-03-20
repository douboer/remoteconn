/* global module, require */

const {
  DEFAULT_TTS_SPEAKABLE_MAX_CHARS,
  TTS_SEGMENT_MAX_CHARS,
  TTS_SEGMENT_MAX_UTF8_BYTES,
  normalizeTtsSpeakableMaxChars,
  normalizeTtsSegmentMaxChars,
  resolveTtsSpeakableUtf8ByteLimit,
  resolveTtsSegmentUtf8ByteLimit
} = require("../../utils/ttsSettings");

const ANSI_ESCAPE_PATTERN = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;
const BOX_DRAWING_PATTERN = /[┌┐└┘├┤┬┴┼│─╭╮╯╰═║╔╗╚╝]/;
const COMMAND_PREFIX_PATTERN =
  /^\s*(?:[$#>]|>>>\s|(?:cd|ls|pwd|git|npm|pnpm|yarn|bun|node|npx|cat|grep|sed|awk|ssh|scp|rm|mv|cp|mkdir|touch|python|pip|cargo|go|java|docker|kubectl)\b)/i;
const CODE_TOKEN_PATTERN = /(?:=>|::|===|!==|&&|\|\||\{|\}|\[|\]|<\/?|\/>|;)/g;
const PATH_LINE_PATTERN =
  /^\s*(?:~?\/\S+|\.{1,2}\/\S+|[A-Za-z]:\\\S+|(?:[A-Za-z0-9._-]+\/){2,}[A-Za-z0-9._-]+|[A-Za-z0-9._-]+@[A-Za-z0-9.-]+:[^\s]+)\s*$/;
const URL_LINE_PATTERN = /^\s*https?:\/\/\S+\s*$/i;
const PROGRESS_LINE_PATTERN = /(?:\b\d{1,3}%\b|\[[=>.\- ]{3,}\]|\bETA\b|\b\d+\/\d+\b|spinner|loading)/i;
const CODEX_INPUT_LINE_PATTERN = /^\s*[›»❯➜]\s+/;
const CODEX_FOOTER_LINE_PATTERN =
  /\b(?:gpt-\d(?:\.\d+)?|claude(?:-[a-z0-9.-]+)?|gemini(?:-[a-z0-9.-]+)?|deepseek(?:-[a-z0-9.-]+)?|o\d(?:-[a-z0-9.-]+)?|sonnet|haiku|opus)\b.*(?:\b\d{1,3}%\s+(?:left|context left)\b|~\/\S*)/i;
const CODEX_FOOTER_FRAGMENT_PATTERN =
  /(?:\b\d{1,3}%\s+(?:left|context left)\b.*~\/\S*|~\/\S*.*\b\d{1,3}%\s+(?:left|context left)\b)/i;
const CODEX_STATUS_LINE_PATTERN =
  /^\s*(?:[!！⚠■●•]\s*)?(?:Working(?:\s|\(|$)|Tip:|Tips?:|Heads up\b|Conversation interrupted\b|Something went wrong\b|Hit\s+`?\/feedback`?\b|Booting MCP server:|MCP server:)/i;
const CHINESE_STATUS_LINE_PATTERN =
  /^\s*(?:正在(?:分析|处理|读取|扫描|生成|检查|加载|连接|收集|整理|搜索)|(?:分析|处理|读取|加载|连接|生成)(?:中|中\.\.\.|中…+))[^。！？!?]{0,80}(?:\.\.\.|…+)?\s*$/;
const NATURAL_TEXT_PATTERN = /[\u3400-\u9fff]|[A-Za-z]{3,}/;
const SYMBOL_CHAR_PATTERN = /[\\\/[\]{}()<>_=+*`|#@$%^~]/g;
const MAX_SPEAKABLE_CHARS = DEFAULT_TTS_SPEAKABLE_MAX_CHARS;
const MAX_SPEAKABLE_UTF8_BYTES = resolveTtsSpeakableUtf8ByteLimit(DEFAULT_TTS_SPEAKABLE_MAX_CHARS);

function stripTerminalAnsi(text) {
  return String(text || "")
    .replace(/\r/g, "")
    .replace(ANSI_ESCAPE_PATTERN, "");
}

function normalizeSpeakableLine(line) {
  return stripTerminalAnsi(line)
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\u00a0/g, " ")
    .trim();
}

function cleanSpeakableLine(line) {
  return String(line || "")
    .replace(/^\s*(?:(?:[-*+]\s+|[•●○◦▪■·]\s*|\d+[.)、]\s+))/, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function isCommandLikeLine(line) {
  return COMMAND_PREFIX_PATTERN.test(line);
}

function isCodeLikeLine(line) {
  if (!line) return false;
  if (/^\s*```/.test(line)) return true;
  if (/^\s*(?:const|let|var|function|class|import|export|return|if|for|while)\b/.test(line)) return true;
  const codeTokenCount = (line.match(CODE_TOKEN_PATTERN) || []).length;
  return codeTokenCount >= 3;
}

function hasHighSymbolDensity(line) {
  const visible = String(line || "").replace(/\s/g, "");
  if (!visible) return false;
  const symbols = (visible.match(SYMBOL_CHAR_PATTERN) || []).length;
  return symbols / visible.length >= 0.22;
}

function isSpeakableLine(line) {
  if (!line) return false;
  if (!NATURAL_TEXT_PATTERN.test(line)) return false;
  if (BOX_DRAWING_PATTERN.test(line)) return false;
  if (/^[-=_*]{4,}$/.test(line)) return false;
  if (PROGRESS_LINE_PATTERN.test(line)) return false;
  if (CODEX_INPUT_LINE_PATTERN.test(line)) return false;
  if (CODEX_FOOTER_LINE_PATTERN.test(line)) return false;
  if (CODEX_FOOTER_FRAGMENT_PATTERN.test(line)) return false;
  if (CODEX_STATUS_LINE_PATTERN.test(line)) return false;
  if (CHINESE_STATUS_LINE_PATTERN.test(line)) return false;
  if (PATH_LINE_PATTERN.test(line) || URL_LINE_PATTERN.test(line)) return false;
  if (isCommandLikeLine(line) || isCodeLikeLine(line)) return false;
  if (hasHighSymbolDensity(line)) return false;
  return true;
}

function collapseSpeakableText(text) {
  return String(text || "")
    .replace(/\s*\n\s*/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/([，。！？；：,.!?;:])\1{1,}/g, "$1")
    .replace(/([，。！？；：,.!?;:])\s+([A-Za-z\u3400-\u9fff])/g, "$1$2")
    .replace(/([\u3400-\u9fff])\s+([\u3400-\u9fff])/g, "$1$2")
    .trim();
}

function utf8ByteLength(text) {
  let total = 0;
  const source = String(text || "");
  for (const char of source) {
    const codePoint = char.codePointAt(0) || 0;
    if (codePoint <= 0x7f) {
      total += 1;
    } else if (codePoint <= 0x7ff) {
      total += 2;
    } else if (codePoint <= 0xffff) {
      total += 3;
    } else {
      total += 4;
    }
  }
  return total;
}

function trimSpeakableText(text, maxChars, maxUtf8Bytes) {
  const source = String(text || "");
  const charLimit = normalizeTtsSpeakableMaxChars(maxChars);
  const utf8Limit = Math.max(1, Math.round(Number(maxUtf8Bytes) || resolveTtsSpeakableUtf8ByteLimit(charLimit)));
  if (source.length <= charLimit && utf8ByteLength(source) <= utf8Limit) {
    return source;
  }
  let result = "";
  let usedBytes = 0;
  for (const char of source) {
    if (result.length >= charLimit) {
      break;
    }
    const nextBytes = utf8ByteLength(char);
    if (usedBytes + nextBytes > utf8Limit) {
      break;
    }
    result += char;
    usedBytes += nextBytes;
  }
  return result
    .replace(/[，、；：,.!?;:\s]+$/g, "")
    .trim();
}

function splitSpeakableTextForTts(text, options) {
  const config = options && typeof options === "object" ? options : {};
  const source = collapseSpeakableText(text);
  if (!source) {
    return [];
  }
  const maxChars = normalizeTtsSegmentMaxChars(config.maxChars || TTS_SEGMENT_MAX_CHARS);
  const maxUtf8Bytes = Math.max(
    1,
    Math.round(Number(config.maxUtf8Bytes) || resolveTtsSegmentUtf8ByteLimit(maxChars))
  );
  const chars = Array.from(source);
  const segments = [];
  let cursor = 0;

  /**
   * 分段策略优先找句号/问号/分号等强断点；
   * 如果当前窗口里没有完整句子，再退回逗号或空白，避免整段都卡到硬切。
   */
  while (cursor < chars.length) {
    while (cursor < chars.length && /[\s，、；：,.!?;:]/.test(chars[cursor])) {
      cursor += 1;
    }
    if (cursor >= chars.length) {
      break;
    }
    let usedBytes = 0;
    let end = cursor;
    let lastStrongBreak = -1;
    let lastSoftBreak = -1;
    while (end < chars.length) {
      const char = chars[end];
      const nextBytes = utf8ByteLength(char);
      if (end - cursor >= maxChars || usedBytes + nextBytes > maxUtf8Bytes) {
        break;
      }
      usedBytes += nextBytes;
      end += 1;
      if (/[。！？!?；;：:]/.test(char)) {
        lastStrongBreak = end;
      } else if (/[，、,.]/.test(char) || /\s/.test(char)) {
        lastSoftBreak = end;
      }
    }

    let nextEnd = end;
    const consumedChars = end - cursor;
    const strongBreakFloor = Math.max(12, Math.floor(maxChars * 0.55));
    const softBreakFloor = Math.max(12, Math.floor(maxChars * 0.45));

    if (end < chars.length) {
      if (lastStrongBreak >= cursor + strongBreakFloor) {
        nextEnd = lastStrongBreak;
      } else if (lastSoftBreak >= cursor + softBreakFloor) {
        nextEnd = lastSoftBreak;
      }
    }

    if (nextEnd <= cursor) {
      nextEnd = Math.max(cursor + 1, end);
    }

    const segment = chars.slice(cursor, nextEnd).join("").trim();
    if (!segment && consumedChars > 0) {
      segments.push(chars.slice(cursor, end).join("").trim());
      cursor = end;
      continue;
    }
    if (segment) {
      segments.push(segment);
    }
    cursor = nextEnd;
  }

  return segments.filter((segment) => !!segment);
}

/**
 * 从一轮终端可见输出中抽取“最近一批适合朗读的自然语言”：
 * 1. 仍然优先保留轮次尾部最近内容，但不再要求必须是单个连续段；
 * 2. 中间若夹杂代码、路径、状态行，直接跳过并继续向上回溯；
 * 3. 收口逻辑保持在短文本范围内，避免把整轮历史都送进 TTS。
 */
function buildSpeakableTerminalText(source, options) {
  const config = options && typeof options === "object" ? options : {};
  const maxChars = normalizeTtsSpeakableMaxChars(config.maxChars);
  const maxUtf8Bytes = Math.max(
    1,
    Math.round(Number(config.maxUtf8Bytes) || resolveTtsSpeakableUtf8ByteLimit(maxChars))
  );
  const text = Array.isArray(source) ? source.join("\n") : String(source || "");
  const normalized = stripTerminalAnsi(text);
  if (!normalized.trim()) {
    return "";
  }
  const lines = normalized.split(/\n+/).map(normalizeSpeakableLine);
  const collected = [];
  let collectedChars = 0;
  let collectedBytes = 0;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (!line) {
      continue;
    }
    if (!isSpeakableLine(line)) {
      continue;
    }
    const cleaned = cleanSpeakableLine(line);
    if (!cleaned) {
      continue;
    }
    const separatorChars = collected.length > 0 ? 1 : 0;
    const nextChars = cleaned.length + separatorChars;
    const nextBytes = utf8ByteLength(cleaned) + separatorChars;
    if (collected.length > 0 && (collectedChars + nextChars > maxChars || collectedBytes + nextBytes > maxUtf8Bytes)) {
      break;
    }
    if (collected.length === 0 && (cleaned.length > maxChars || utf8ByteLength(cleaned) > maxUtf8Bytes)) {
      collected.unshift(trimSpeakableText(cleaned, maxChars, maxUtf8Bytes));
      break;
    }
    collected.unshift(cleaned);
    collectedChars += nextChars;
    collectedBytes += nextBytes;
  }
  return trimSpeakableText(collapseSpeakableText(collected.join("\n")), maxChars, maxUtf8Bytes);
}

function isSpeakableTextLikelyComplete(text) {
  return /(?:[。！？!?：:]|\.{1}|。{1})\s*$/.test(String(text || "").trim());
}

module.exports = {
  MAX_SPEAKABLE_CHARS,
  buildSpeakableTerminalText,
  isSpeakableTextLikelyComplete,
  splitSpeakableTextForTts,
  stripTerminalAnsi
};
