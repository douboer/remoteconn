/* global module */

/**
 * 终端播报长度配置拆成“总量”和“单段”两层：
 * 1. 总量决定一轮回答最多取多少正文；
 * 2. 单段决定每次送给 TTS 的请求大小，用来压低首段等待时延；
 * 3. 单段限制必须保守落在 gateway 当前长度校验之内；
 * 4. “分片长度”只控制单段字符窗口，实际仍会再受 UTF-8 byte 上限兜底。
 */
const DEFAULT_TTS_SPEAKABLE_MAX_CHARS = 500;
const MIN_TTS_SPEAKABLE_MAX_CHARS = 120;
const MAX_TTS_SPEAKABLE_MAX_CHARS = 1200;
const DEFAULT_TTS_SEGMENT_MAX_CHARS = 80;
const MIN_TTS_SEGMENT_MAX_CHARS = 40;
const MAX_TTS_SEGMENT_MAX_CHARS = 200;
const TTS_SEGMENT_MAX_CHARS = DEFAULT_TTS_SEGMENT_MAX_CHARS;
const TTS_SEGMENT_MAX_UTF8_BYTES = DEFAULT_TTS_SEGMENT_MAX_CHARS * 3;

function normalizeTtsSpeakableMaxChars(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_TTS_SPEAKABLE_MAX_CHARS;
  }
  const normalized = Math.round(parsed);
  if (normalized < MIN_TTS_SPEAKABLE_MAX_CHARS) {
    return MIN_TTS_SPEAKABLE_MAX_CHARS;
  }
  if (normalized > MAX_TTS_SPEAKABLE_MAX_CHARS) {
    return MAX_TTS_SPEAKABLE_MAX_CHARS;
  }
  return normalized;
}

function normalizeTtsSegmentMaxChars(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_TTS_SEGMENT_MAX_CHARS;
  }
  const normalized = Math.round(parsed);
  if (normalized < MIN_TTS_SEGMENT_MAX_CHARS) {
    return MIN_TTS_SEGMENT_MAX_CHARS;
  }
  if (normalized > MAX_TTS_SEGMENT_MAX_CHARS) {
    return MAX_TTS_SEGMENT_MAX_CHARS;
  }
  return normalized;
}

/**
 * 总量截断只负责控制“这一轮最多保留多少正文”，并不直接对应单次网关请求。
 * 对中文按 3 bytes/字估算，可让 500 字正文完整进入后续分段流程。
 */
function resolveTtsSpeakableUtf8ByteLimit(maxChars) {
  const normalized = normalizeTtsSpeakableMaxChars(maxChars);
  return Math.max(TTS_SEGMENT_MAX_UTF8_BYTES, Math.min(normalized * 3, MAX_TTS_SPEAKABLE_MAX_CHARS * 3));
}

/**
 * 单段 byte 限制始终卡在安全阈值内：
 * 1. 默认 80 字对应 240 bytes；
 * 2. 即使用户把分片长度调大，最终也不会超过 360 bytes；
 * 3. 这样可避免单段再次撞到网关 450 bytes 的校验。
 */
function resolveTtsSegmentUtf8ByteLimit(maxChars) {
  const normalized = normalizeTtsSegmentMaxChars(maxChars);
  return Math.max(TTS_SEGMENT_MAX_UTF8_BYTES, Math.min(normalized * 3, 360));
}

module.exports = {
  DEFAULT_TTS_SPEAKABLE_MAX_CHARS,
  MIN_TTS_SPEAKABLE_MAX_CHARS,
  MAX_TTS_SPEAKABLE_MAX_CHARS,
  DEFAULT_TTS_SEGMENT_MAX_CHARS,
  MIN_TTS_SEGMENT_MAX_CHARS,
  MAX_TTS_SEGMENT_MAX_CHARS,
  TTS_SEGMENT_MAX_CHARS,
  TTS_SEGMENT_MAX_UTF8_BYTES,
  normalizeTtsSpeakableMaxChars,
  normalizeTtsSegmentMaxChars,
  resolveTtsSpeakableUtf8ByteLimit,
  resolveTtsSegmentUtf8ByteLimit
};
