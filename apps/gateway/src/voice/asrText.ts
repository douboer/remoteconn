function asRecord(input: unknown): Record<string, unknown> | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }
  return input as Record<string, unknown>;
}

function firstNonEmpty(items: unknown[]): string {
  for (const item of items) {
    const text = pickText(item);
    if (text) {
      return text;
    }
  }
  return "";
}

/**
 * 从未知结构中提取识别文本：
 * 兼容 result.text / result[] / utterances[] / payload_msg 等常见形态。
 */
function pickText(input: unknown): string {
  if (typeof input === "string") {
    return input.trim() ? input : "";
  }

  if (Array.isArray(input)) {
    return firstNonEmpty(input);
  }

  const record = asRecord(input);
  if (!record) {
    return "";
  }

  const directText = record.text;
  if (typeof directText === "string" && directText.trim()) {
    return directText;
  }

  const aliasTextKeys = ["transcript", "sentence", "content", "utterance", "final_text", "display_text"];
  for (const key of aliasTextKeys) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate;
    }
  }

  const utterances = record.utterances;
  if (Array.isArray(utterances)) {
    const utterText = firstNonEmpty(utterances);
    if (utterText) {
      return utterText;
    }
  }

  const arrayLikeKeys = ["alternatives", "results", "hypotheses", "nbest", "sentences", "segments", "list"];
  for (const key of arrayLikeKeys) {
    const candidateList = record[key];
    if (Array.isArray(candidateList)) {
      const text = firstNonEmpty(candidateList);
      if (text) {
        return text;
      }
    }
  }

  const nestedKeys = ["result", "payload_msg", "data", "value"];
  for (const key of nestedKeys) {
    const nested = record[key];
    const text = pickText(nested);
    if (text) {
      return text;
    }
  }

  return "";
}

export function extractAsrText(payload: unknown): string {
  if (!payload) {
    return "";
  }

  if (Buffer.isBuffer(payload)) {
    const text = payload.toString("utf8");
    return text.trim() ? text : "";
  }

  const root = asRecord(payload);
  if (!root) {
    return pickText(payload);
  }

  // 按优先级尝试常见字段，命中即返回。
  const candidates: unknown[] = [
    root.result,
    asRecord(root.result)?.result,
    root.payload_msg,
    asRecord(root.payload_msg)?.result,
    root.data,
    asRecord(root.data)?.result,
    root
  ];

  for (const candidate of candidates) {
    const text = pickText(candidate);
    if (text) {
      return text;
    }
  }

  return "";
}
