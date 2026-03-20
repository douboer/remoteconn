const PREVIEW_CHARS = 48;
const PREVIEW_BYTES = 64;

function toHexBytes(input: Uint8Array): string {
  return Array.from(input)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join(" ");
}

function toHexCodeUnits(input: string, limit = PREVIEW_CHARS): string {
  const parts: string[] = [];
  const max = Math.min(input.length, limit);
  for (let i = 0; i < max; i += 1) {
    parts.push(input.charCodeAt(i).toString(16).padStart(4, "0"));
  }
  return parts.join(" ");
}

function toHexLatin1Bytes(input: string, limit = PREVIEW_CHARS): string {
  const parts: string[] = [];
  const max = Math.min(input.length, limit);
  for (let i = 0; i < max; i += 1) {
    const code = input.charCodeAt(i);
    if (code <= 0xff) {
      parts.push(code.toString(16).padStart(2, "0"));
    } else {
      parts.push("..");
    }
  }
  return parts.join(" ");
}

/**
 * 生成字符串的十六进制调试快照，定位“哪一段链路改坏了字节”。
 * - utf8Hex: 按 UTF-8 编码后的字节；
 * - latin1Hex: 将每个 code unit 视作单字节（仅 0x00-0xFF 有效）；
 * - codeUnitHex: 原始 JS code unit（16 进制）。
 */
export function inspectStringHex(data: string): Record<string, string | number> {
  const utf8Bytes = Buffer.from(data, "utf8");
  return {
    charLen: data.length,
    utf8ByteLen: utf8Bytes.length,
    preview: JSON.stringify(data.slice(0, PREVIEW_CHARS)),
    codeUnitHex: toHexCodeUnits(data),
    latin1Hex: toHexLatin1Bytes(data),
    utf8Hex: toHexBytes(utf8Bytes.subarray(0, PREVIEW_BYTES))
  };
}

/**
 * 生成二进制缓冲区的十六进制快照，用于原始字节层排障。
 */
export function inspectBufferHex(data: Buffer | Uint8Array): Record<string, string | number> {
  const bytes = Buffer.from(data);
  return {
    byteLen: bytes.length,
    utf8Preview: JSON.stringify(bytes.toString("utf8").slice(0, PREVIEW_CHARS)),
    hex: toHexBytes(bytes.subarray(0, PREVIEW_BYTES))
  };
}
