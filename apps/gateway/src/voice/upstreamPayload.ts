const JSON_FALLBACK_MAX_SCAN_CHARS = 512 * 1024;

function isTruthyFlag(value: unknown): boolean {
  if (value === true) {
    return true;
  }
  if (typeof value === "number") {
    return value === 1;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return ["1", "true", "yes", "on", "final", "finished", "done", "end", "completed"].includes(normalized);
  }
  return false;
}

/**
 * 兼容上游偶发“非标准文本帧”：
 * 1) 标准 JSON；
 * 2) NDJSON（一行一个 JSON）；
 * 3) 多个 JSON 粘包（{"a":1}{"b":2}）。
 *
 * 额外约束：
 * - 对超大文本直接放弃兼容扫描，避免 CPU 被异常帧拖垮；
 * - 仅从首个 `{` / `[` 开始扫描，跳过前缀噪音（例如日志前缀）。
 */
export function parseLooseJsonPayloads(rawText: string): unknown[] {
  const trimmed = rawText.trim();
  if (!trimmed || trimmed.length > JSON_FALLBACK_MAX_SCAN_CHARS) {
    return [];
  }

  const firstJsonTokenIndex = trimmed.search(/[{[]/);
  if (firstJsonTokenIndex < 0) {
    return [];
  }
  const text = trimmed.slice(firstJsonTokenIndex);
  if (!text) {
    return [];
  }

  try {
    return [JSON.parse(text)];
  } catch {
    // 继续尝试 line-delimited / 拼接 JSON 形态。
  }

  const linePayloads: unknown[] = [];
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length > 1) {
    for (const line of lines) {
      if (!line.startsWith("{") && !line.startsWith("[")) {
        continue;
      }
      try {
        linePayloads.push(JSON.parse(line));
      } catch {
        // 某一行不是 JSON 时忽略，继续尝试其他行。
      }
    }
    if (linePayloads.length > 0) {
      return linePayloads;
    }
  }

  const chunkPayloads: unknown[] = [];
  let start = -1;
  let depth = 0;
  let quote: '"' | "'" | null = null;
  let escaped = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i] ?? "";

    if (start < 0) {
      if (ch === "{" || ch === "[") {
        start = i;
        depth = 1;
        quote = null;
        escaped = false;
      }
      continue;
    }

    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === quote) {
        quote = null;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      quote = ch as '"' | "'";
      continue;
    }
    if (ch === "{" || ch === "[") {
      depth += 1;
      continue;
    }
    if (ch === "}" || ch === "]") {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        const segment = text.slice(start, i + 1);
        start = -1;
        try {
          chunkPayloads.push(JSON.parse(segment));
        } catch {
          // 片段不是有效 JSON 时忽略。
        }
      }
    }
  }

  return chunkPayloads;
}

export function inferAsrJsonFinal(payload: unknown): boolean {
  const queue: unknown[] = [payload];
  const visited = new Set<object>();
  const finalKeys = ["is_final", "isFinal", "final", "finished", "end", "is_end", "isEnd", "complete", "completed"];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== "object") {
      continue;
    }
    if (visited.has(current)) {
      continue;
    }
    visited.add(current);

    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }

    const record = current as Record<string, unknown>;
    for (const key of finalKeys) {
      if (isTruthyFlag(record[key])) {
        return true;
      }
    }

    if (typeof record.status === "string" && isTruthyFlag(record.status)) {
      return true;
    }
    if (typeof record.type === "string" && isTruthyFlag(record.type)) {
      return true;
    }

    queue.push(
      record.result,
      record.payload_msg,
      record.data,
      record.payload,
      record.message,
      record.messages,
      record.utterances,
      record.alternatives
    );
  }

  return false;
}
