const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/**
 * 把 SVG 文本编码成 UTF-8 字节。
 * 说明：
 * 1. 小程序运行时没有稳定可用的 Buffer，因此这里使用纯 JS 编码；
 * 2. 需要显式处理代理对，避免非 ASCII 字符在 data URI 中损坏；
 * 3. 非法代理项统一替换成 U+FFFD，保证输出始终可编码。
 */
function encodeUtf8Bytes(input) {
  const source = String(input || "");
  const bytes = [];
  for (let index = 0; index < source.length; index += 1) {
    const first = source.charCodeAt(index);
    if (first < 0x80) {
      bytes.push(first);
      continue;
    }
    if (first < 0x800) {
      bytes.push(0xc0 | (first >> 6), 0x80 | (first & 0x3f));
      continue;
    }

    let codePoint = first;
    if (first >= 0xd800 && first <= 0xdbff) {
      const second = source.charCodeAt(index + 1);
      if (second >= 0xdc00 && second <= 0xdfff) {
        codePoint = ((first - 0xd800) << 10) + (second - 0xdc00) + 0x10000;
        index += 1;
      } else {
        codePoint = 0xfffd;
      }
    } else if (first >= 0xdc00 && first <= 0xdfff) {
      codePoint = 0xfffd;
    }

    if (codePoint < 0x10000) {
      bytes.push(0xe0 | (codePoint >> 12), 0x80 | ((codePoint >> 6) & 0x3f), 0x80 | (codePoint & 0x3f));
      continue;
    }

    bytes.push(
      0xf0 | (codePoint >> 18),
      0x80 | ((codePoint >> 12) & 0x3f),
      0x80 | ((codePoint >> 6) & 0x3f),
      0x80 | (codePoint & 0x3f)
    );
  }
  return bytes;
}

/**
 * 把 UTF-8 字节数组转成 base64。
 * 这样生成的 data URI 可以避开开发者工具对 `utf8,...` 形式 SVG URI 的兼容问题。
 */
function encodeBase64FromBytes(bytes) {
  const output = [];
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index];
    const second = index + 1 < bytes.length ? bytes[index + 1] : null;
    const third = index + 2 < bytes.length ? bytes[index + 2] : null;
    const triplet = (first << 16) | ((second || 0) << 8) | (third || 0);
    output.push(
      BASE64_ALPHABET[(triplet >> 18) & 0x3f],
      BASE64_ALPHABET[(triplet >> 12) & 0x3f],
      second === null ? "=" : BASE64_ALPHABET[(triplet >> 6) & 0x3f],
      third === null ? "=" : BASE64_ALPHABET[triplet & 0x3f]
    );
  }
  return output.join("");
}

function toSvgDataUri(svg) {
  const base64 = encodeBase64FromBytes(encodeUtf8Bytes(svg));
  return `data:image/svg+xml;base64,${base64}`;
}

module.exports = {
  toSvgDataUri
};
