/* global module */

/**
 * 终端 cell / 光标 / 视觉行的纯函数模型。
 *
 * 顶级约束（后续扩展 VT / DEC private mode 时不得回退）：
 * 1. 逻辑光标始终按“列”推进，而不是按字符串长度推进。
 * 2. 宽字符占 2 列，并在缓冲区中留下一个 continuation 占位格。
 * 3. 组合字符只附着到前一个 owner cell，不额外推进列。
 * 4. 视觉行由 JS 统一切分，避免输出展示和光标锚点使用两套换行系统。
 * 5. 后续若补 alternate screen、scroll region 或更多 CSI/DECSET，也必须继续复用同一套
 *    cell 契约，不能把“私有模式支持”做成字符串级补丁。
 */

function isWideCodePoint(codePoint) {
  if (!Number.isFinite(codePoint) || codePoint <= 0) return false;
  return (
    (codePoint >= 0x1100 && codePoint <= 0x115f) ||
    (codePoint >= 0x2e80 && codePoint <= 0xa4cf) ||
    (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0xfe10 && codePoint <= 0xfe6f) ||
    (codePoint >= 0xff00 && codePoint <= 0xff60) ||
    (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
    (codePoint >= 0x1f300 && codePoint <= 0x1faff) ||
    (codePoint >= 0x20000 && codePoint <= 0x3fffd)
  );
}

function isZeroWidthCodePoint(codePoint) {
  if (!Number.isFinite(codePoint) || codePoint <= 0) return false;
  return (
    (codePoint >= 0x0300 && codePoint <= 0x036f) ||
    (codePoint >= 0x0483 && codePoint <= 0x0489) ||
    (codePoint >= 0x0591 && codePoint <= 0x05bd) ||
    codePoint === 0x05bf ||
    (codePoint >= 0x05c1 && codePoint <= 0x05c2) ||
    (codePoint >= 0x05c4 && codePoint <= 0x05c5) ||
    codePoint === 0x05c7 ||
    (codePoint >= 0x0610 && codePoint <= 0x061a) ||
    (codePoint >= 0x064b && codePoint <= 0x065f) ||
    codePoint === 0x0670 ||
    (codePoint >= 0x06d6 && codePoint <= 0x06dc) ||
    (codePoint >= 0x06df && codePoint <= 0x06e4) ||
    (codePoint >= 0x06e7 && codePoint <= 0x06e8) ||
    (codePoint >= 0x06ea && codePoint <= 0x06ed) ||
    (codePoint >= 0x0711 && codePoint <= 0x0711) ||
    (codePoint >= 0x0730 && codePoint <= 0x074a) ||
    (codePoint >= 0x07a6 && codePoint <= 0x07b0) ||
    (codePoint >= 0x07eb && codePoint <= 0x07f3) ||
    (codePoint >= 0x0816 && codePoint <= 0x0819) ||
    (codePoint >= 0x081b && codePoint <= 0x0823) ||
    (codePoint >= 0x0825 && codePoint <= 0x0827) ||
    (codePoint >= 0x0829 && codePoint <= 0x082d) ||
    (codePoint >= 0x0859 && codePoint <= 0x085b) ||
    (codePoint >= 0x08d3 && codePoint <= 0x08e1) ||
    (codePoint >= 0x08e3 && codePoint <= 0x0903) ||
    (codePoint >= 0x093a && codePoint <= 0x093c) ||
    codePoint === 0x0941 ||
    codePoint === 0x0942 ||
    (codePoint >= 0x094d && codePoint <= 0x094d) ||
    (codePoint >= 0x0951 && codePoint <= 0x0957) ||
    (codePoint >= 0x0962 && codePoint <= 0x0963) ||
    (codePoint >= 0x0981 && codePoint <= 0x0981) ||
    (codePoint >= 0x09bc && codePoint <= 0x09bc) ||
    codePoint === 0x09cd ||
    (codePoint >= 0x09e2 && codePoint <= 0x09e3) ||
    codePoint === 0x0a01 ||
    codePoint === 0x0a02 ||
    codePoint === 0x0a3c ||
    codePoint === 0x0a41 ||
    codePoint === 0x0a42 ||
    codePoint === 0x0a47 ||
    codePoint === 0x0a48 ||
    codePoint === 0x0a4b ||
    codePoint === 0x0a4c ||
    codePoint === 0x0a4d ||
    (codePoint >= 0x0a51 && codePoint <= 0x0a51) ||
    (codePoint >= 0x0a70 && codePoint <= 0x0a71) ||
    (codePoint >= 0x0a75 && codePoint <= 0x0a75) ||
    codePoint === 0x0abc ||
    codePoint === 0x0ac1 ||
    codePoint === 0x0ac2 ||
    codePoint === 0x0acd ||
    (codePoint >= 0x0ae2 && codePoint <= 0x0ae3) ||
    (codePoint >= 0x0b01 && codePoint <= 0x0b01) ||
    codePoint === 0x0b3c ||
    codePoint === 0x0b3f ||
    codePoint === 0x0b41 ||
    codePoint === 0x0b42 ||
    codePoint === 0x0b4d ||
    (codePoint >= 0x0b56 && codePoint <= 0x0b56) ||
    (codePoint >= 0x0b62 && codePoint <= 0x0b63) ||
    (codePoint >= 0x0b82 && codePoint <= 0x0b82) ||
    codePoint === 0x0bc0 ||
    codePoint === 0x0bcd ||
    codePoint === 0x0c00 ||
    codePoint === 0x0c04 ||
    (codePoint >= 0x0c3e && codePoint <= 0x0c40) ||
    codePoint === 0x0c46 ||
    codePoint === 0x0c47 ||
    codePoint === 0x0c4a ||
    codePoint === 0x0c4b ||
    codePoint === 0x0c4d ||
    (codePoint >= 0x0c55 && codePoint <= 0x0c56) ||
    (codePoint >= 0x0c62 && codePoint <= 0x0c63) ||
    (codePoint >= 0x0c81 && codePoint <= 0x0c81) ||
    codePoint === 0x0cbc ||
    codePoint === 0x0cbf ||
    codePoint === 0x0cc6 ||
    codePoint === 0x0ccc ||
    codePoint === 0x0ccd ||
    (codePoint >= 0x0ce2 && codePoint <= 0x0ce3) ||
    codePoint === 0x0d00 ||
    codePoint === 0x0d01 ||
    codePoint === 0x0d3b ||
    codePoint === 0x0d3c ||
    codePoint === 0x0d41 ||
    codePoint === 0x0d42 ||
    codePoint === 0x0d4d ||
    (codePoint >= 0x0d62 && codePoint <= 0x0d63) ||
    codePoint === 0x0dca ||
    (codePoint >= 0x0dd2 && codePoint <= 0x0dd4) ||
    codePoint === 0x0dd6 ||
    codePoint === 0x0e31 ||
    (codePoint >= 0x0e34 && codePoint <= 0x0e3a) ||
    (codePoint >= 0x0e47 && codePoint <= 0x0e4e) ||
    codePoint === 0x0eb1 ||
    (codePoint >= 0x0eb4 && codePoint <= 0x0ebc) ||
    (codePoint >= 0x0ec8 && codePoint <= 0x0ece) ||
    codePoint === 0x0f18 ||
    codePoint === 0x0f19 ||
    codePoint === 0x0f35 ||
    codePoint === 0x0f37 ||
    codePoint === 0x0f39 ||
    (codePoint >= 0x0f71 && codePoint <= 0x0f7e) ||
    (codePoint >= 0x0f80 && codePoint <= 0x0f84) ||
    (codePoint >= 0x0f86 && codePoint <= 0x0f87) ||
    (codePoint >= 0x0f8d && codePoint <= 0x0f97) ||
    (codePoint >= 0x0f99 && codePoint <= 0x0fbc) ||
    codePoint === 0x0fc6 ||
    (codePoint >= 0x102d && codePoint <= 0x1030) ||
    codePoint === 0x1032 ||
    (codePoint >= 0x1036 && codePoint <= 0x1037) ||
    codePoint === 0x1039 ||
    codePoint === 0x103a ||
    (codePoint >= 0x103d && codePoint <= 0x103e) ||
    (codePoint >= 0x1058 && codePoint <= 0x1059) ||
    (codePoint >= 0x105e && codePoint <= 0x1060) ||
    (codePoint >= 0x1071 && codePoint <= 0x1074) ||
    codePoint === 0x1082 ||
    (codePoint >= 0x1085 && codePoint <= 0x1086) ||
    codePoint === 0x108d ||
    codePoint === 0x109d ||
    (codePoint >= 0x135d && codePoint <= 0x135f) ||
    (codePoint >= 0x1712 && codePoint <= 0x1714) ||
    (codePoint >= 0x1732 && codePoint <= 0x1734) ||
    (codePoint >= 0x1752 && codePoint <= 0x1753) ||
    (codePoint >= 0x1772 && codePoint <= 0x1773) ||
    (codePoint >= 0x17b4 && codePoint <= 0x17b5) ||
    (codePoint >= 0x17b7 && codePoint <= 0x17bd) ||
    codePoint === 0x17c6 ||
    (codePoint >= 0x17c9 && codePoint <= 0x17d3) ||
    codePoint === 0x17dd ||
    (codePoint >= 0x180b && codePoint <= 0x180f) ||
    (codePoint >= 0x1885 && codePoint <= 0x1886) ||
    codePoint === 0x18a9 ||
    (codePoint >= 0x1920 && codePoint <= 0x1922) ||
    (codePoint >= 0x1927 && codePoint <= 0x1928) ||
    codePoint === 0x1932 ||
    (codePoint >= 0x1939 && codePoint <= 0x193b) ||
    (codePoint >= 0x1a17 && codePoint <= 0x1a18) ||
    codePoint === 0x1a1b ||
    codePoint === 0x1a56 ||
    (codePoint >= 0x1a58 && codePoint <= 0x1a5e) ||
    codePoint === 0x1a60 ||
    codePoint === 0x1a62 ||
    (codePoint >= 0x1a65 && codePoint <= 0x1a6c) ||
    (codePoint >= 0x1a73 && codePoint <= 0x1a7c) ||
    codePoint === 0x1a7f ||
    (codePoint >= 0x1ab0 && codePoint <= 0x1aff) ||
    (codePoint >= 0x1b00 && codePoint <= 0x1b03) ||
    codePoint === 0x1b34 ||
    codePoint === 0x1b36 ||
    codePoint === 0x1b37 ||
    codePoint === 0x1b3c ||
    codePoint === 0x1b42 ||
    (codePoint >= 0x1b6b && codePoint <= 0x1b73) ||
    (codePoint >= 0x1b80 && codePoint <= 0x1b81) ||
    codePoint === 0x1ba2 ||
    codePoint === 0x1ba5 ||
    codePoint === 0x1ba8 ||
    codePoint === 0x1ba9 ||
    (codePoint >= 0x1bab && codePoint <= 0x1bad) ||
    codePoint === 0x1be6 ||
    codePoint === 0x1be8 ||
    codePoint === 0x1be9 ||
    codePoint === 0x1bed ||
    (codePoint >= 0x1bef && codePoint <= 0x1bf1) ||
    (codePoint >= 0x1c2c && codePoint <= 0x1c33) ||
    codePoint === 0x1c36 ||
    codePoint === 0x1c37 ||
    (codePoint >= 0x1cd0 && codePoint <= 0x1cd2) ||
    (codePoint >= 0x1cd4 && codePoint <= 0x1ce0) ||
    (codePoint >= 0x1ce2 && codePoint <= 0x1ce8) ||
    codePoint === 0x1ced ||
    codePoint === 0x1cf4 ||
    codePoint === 0x1cf8 ||
    codePoint === 0x1cf9 ||
    (codePoint >= 0x1dc0 && codePoint <= 0x1dff) ||
    (codePoint >= 0x200b && codePoint <= 0x200f) ||
    codePoint === 0x202a ||
    codePoint === 0x202b ||
    codePoint === 0x202c ||
    codePoint === 0x202d ||
    codePoint === 0x202e ||
    codePoint === 0x2060 ||
    (codePoint >= 0x2066 && codePoint <= 0x206f) ||
    codePoint === 0x200c ||
    codePoint === 0x200d ||
    (codePoint >= 0x20d0 && codePoint <= 0x20ff) ||
    (codePoint >= 0x2cef && codePoint <= 0x2cf1) ||
    codePoint === 0x2d7f ||
    (codePoint >= 0x2de0 && codePoint <= 0x2dff) ||
    (codePoint >= 0x302a && codePoint <= 0x302f) ||
    codePoint === 0x3099 ||
    codePoint === 0x309a ||
    (codePoint >= 0xa66f && codePoint <= 0xa672) ||
    codePoint === 0xa674 ||
    codePoint === 0xa67d ||
    codePoint === 0xa69e ||
    codePoint === 0xa69f ||
    (codePoint >= 0xa6f0 && codePoint <= 0xa6f1) ||
    codePoint === 0xa802 ||
    codePoint === 0xa806 ||
    codePoint === 0xa80b ||
    (codePoint >= 0xa825 && codePoint <= 0xa826) ||
    codePoint === 0xa82c ||
    (codePoint >= 0xa8c4 && codePoint <= 0xa8c5) ||
    (codePoint >= 0xa8e0 && codePoint <= 0xa8f1) ||
    codePoint === 0xa8ff ||
    (codePoint >= 0xa926 && codePoint <= 0xa92d) ||
    (codePoint >= 0xa947 && codePoint <= 0xa951) ||
    (codePoint >= 0xa980 && codePoint <= 0xa982) ||
    codePoint === 0xa9b3 ||
    (codePoint >= 0xa9b6 && codePoint <= 0xa9b9) ||
    codePoint === 0xa9bc ||
    codePoint === 0xa9e5 ||
    (codePoint >= 0xaa29 && codePoint <= 0xaa2e) ||
    (codePoint >= 0xaa31 && codePoint <= 0xaa32) ||
    (codePoint >= 0xaa35 && codePoint <= 0xaa36) ||
    codePoint === 0xaa43 ||
    codePoint === 0xaa4c ||
    codePoint === 0xaa7c ||
    codePoint === 0xaab0 ||
    (codePoint >= 0xaab2 && codePoint <= 0xaab4) ||
    (codePoint >= 0xaab7 && codePoint <= 0xaab8) ||
    codePoint === 0xaabe ||
    codePoint === 0xaabf ||
    codePoint === 0xaac1 ||
    (codePoint >= 0xaaec && codePoint <= 0xaaed) ||
    codePoint === 0xaaf6 ||
    (codePoint >= 0xabe5 && codePoint <= 0xabe5) ||
    codePoint === 0xabe8 ||
    codePoint === 0xabed ||
    codePoint === 0xfb1e ||
    (codePoint >= 0xfe00 && codePoint <= 0xfe0f) ||
    (codePoint >= 0xfe20 && codePoint <= 0xfe2f) ||
    (codePoint >= 0xfeff && codePoint <= 0xfeff) ||
    (codePoint >= 0xfff9 && codePoint <= 0xfffb) ||
    (codePoint >= 0x101fd && codePoint <= 0x101fd) ||
    (codePoint >= 0x102e0 && codePoint <= 0x102e0) ||
    (codePoint >= 0x10376 && codePoint <= 0x1037a) ||
    (codePoint >= 0x10a01 && codePoint <= 0x10a03) ||
    (codePoint >= 0x10a05 && codePoint <= 0x10a06) ||
    (codePoint >= 0x10a0c && codePoint <= 0x10a0f) ||
    (codePoint >= 0x10a38 && codePoint <= 0x10a3a) ||
    codePoint === 0x10a3f ||
    (codePoint >= 0x10ae5 && codePoint <= 0x10ae6) ||
    (codePoint >= 0x11001 && codePoint <= 0x11001) ||
    (codePoint >= 0x11038 && codePoint <= 0x11046) ||
    (codePoint >= 0x1107f && codePoint <= 0x11081) ||
    (codePoint >= 0x110b3 && codePoint <= 0x110b6) ||
    (codePoint >= 0x110b9 && codePoint <= 0x110ba) ||
    (codePoint >= 0x11100 && codePoint <= 0x11102) ||
    (codePoint >= 0x11127 && codePoint <= 0x1112b) ||
    (codePoint >= 0x1112d && codePoint <= 0x11134) ||
    codePoint === 0x11173 ||
    (codePoint >= 0x11180 && codePoint <= 0x11181) ||
    (codePoint >= 0x111b6 && codePoint <= 0x111be) ||
    codePoint === 0x111c9 ||
    (codePoint >= 0x1122f && codePoint <= 0x11231) ||
    codePoint === 0x11234 ||
    (codePoint >= 0x11236 && codePoint <= 0x11237) ||
    codePoint === 0x112df ||
    (codePoint >= 0x112e3 && codePoint <= 0x112ea) ||
    (codePoint >= 0x11300 && codePoint <= 0x11301) ||
    codePoint === 0x1133c ||
    (codePoint >= 0x11340 && codePoint <= 0x11340) ||
    codePoint === 0x11366 ||
    codePoint === 0x11367 ||
    codePoint === 0x1136c ||
    codePoint === 0x11370 ||
    (codePoint >= 0x11438 && codePoint <= 0x1143f) ||
    (codePoint >= 0x11442 && codePoint <= 0x11444) ||
    codePoint === 0x11446 ||
    codePoint === 0x1145e ||
    (codePoint >= 0x114b3 && codePoint <= 0x114b8) ||
    codePoint === 0x114ba ||
    (codePoint >= 0x114bf && codePoint <= 0x114c0) ||
    codePoint === 0x114c2 ||
    (codePoint >= 0x115b2 && codePoint <= 0x115b5) ||
    (codePoint >= 0x115bc && codePoint <= 0x115bd) ||
    codePoint === 0x115bf ||
    codePoint === 0x115c0 ||
    (codePoint >= 0x11633 && codePoint <= 0x1163a) ||
    codePoint === 0x1163d ||
    codePoint === 0x1163f ||
    codePoint === 0x11640 ||
    (codePoint >= 0x116ab && codePoint <= 0x116ab) ||
    codePoint === 0x116ad ||
    (codePoint >= 0x116b0 && codePoint <= 0x116b5) ||
    codePoint === 0x116b7 ||
    (codePoint >= 0x1171d && codePoint <= 0x1171f) ||
    (codePoint >= 0x11722 && codePoint <= 0x11725) ||
    (codePoint >= 0x11727 && codePoint <= 0x1172b) ||
    (codePoint >= 0x1182f && codePoint <= 0x11837) ||
    codePoint === 0x11839 ||
    codePoint === 0x11a01 ||
    (codePoint >= 0x11a33 && codePoint <= 0x11a38) ||
    (codePoint >= 0x11a3b && codePoint <= 0x11a3e) ||
    codePoint === 0x11a47 ||
    (codePoint >= 0x11a51 && codePoint <= 0x11a56) ||
    codePoint === 0x11a59 ||
    codePoint === 0x11a5b ||
    codePoint === 0x11a8a ||
    (codePoint >= 0x11a91 && codePoint <= 0x11a96) ||
    codePoint === 0x11a98 ||
    codePoint === 0x11c30 ||
    (codePoint >= 0x11c38 && codePoint <= 0x11c3d) ||
    codePoint === 0x11c3f ||
    (codePoint >= 0x11c92 && codePoint <= 0x11ca7) ||
    codePoint === 0x11caa ||
    codePoint === 0x11cb0 ||
    codePoint === 0x11cb2 ||
    codePoint === 0x11cb3 ||
    codePoint === 0x11cb5 ||
    codePoint === 0x11cb6 ||
    (codePoint >= 0x11d31 && codePoint <= 0x11d36) ||
    codePoint === 0x11d3a ||
    codePoint === 0x11d3c ||
    codePoint === 0x11d3d ||
    codePoint === 0x11d3f ||
    codePoint === 0x11d40 ||
    codePoint === 0x11d42 ||
    (codePoint >= 0x11d44 && codePoint <= 0x11d45) ||
    codePoint === 0x11d47 ||
    (codePoint >= 0x16af0 && codePoint <= 0x16af4) ||
    (codePoint >= 0x16b30 && codePoint <= 0x16b36) ||
    (codePoint >= 0x16f8f && codePoint <= 0x16f92) ||
    (codePoint >= 0x1bc9d && codePoint <= 0x1bc9e) ||
    codePoint === 0x1d167 ||
    codePoint === 0x1d168 ||
    codePoint === 0x1d169 ||
    (codePoint >= 0x1d17b && codePoint <= 0x1d182) ||
    (codePoint >= 0x1d185 && codePoint <= 0x1d18b) ||
    (codePoint >= 0x1d1aa && codePoint <= 0x1d1ad) ||
    (codePoint >= 0x1d242 && codePoint <= 0x1d244) ||
    (codePoint >= 0x1da00 && codePoint <= 0x1da36) ||
    (codePoint >= 0x1da3b && codePoint <= 0x1da6c) ||
    codePoint === 0x1da75 ||
    codePoint === 0x1da84 ||
    (codePoint >= 0x1da9b && codePoint <= 0x1da9f) ||
    (codePoint >= 0x1daa1 && codePoint <= 0x1daaf) ||
    (codePoint >= 0x1e000 && codePoint <= 0x1e006) ||
    (codePoint >= 0x1e008 && codePoint <= 0x1e018) ||
    (codePoint >= 0x1e01b && codePoint <= 0x1e021) ||
    (codePoint >= 0x1e023 && codePoint <= 0x1e024) ||
    (codePoint >= 0x1e026 && codePoint <= 0x1e02a) ||
    (codePoint >= 0x1e130 && codePoint <= 0x1e136) ||
    (codePoint >= 0x1e2ae && codePoint <= 0x1e2ae) ||
    (codePoint >= 0x1e2ec && codePoint <= 0x1e2ef) ||
    (codePoint >= 0x1e8d0 && codePoint <= 0x1e8d6) ||
    (codePoint >= 0x1e944 && codePoint <= 0x1e94a) ||
    (codePoint >= 0xe0100 && codePoint <= 0xe01ef)
  );
}

function measureCharDisplayColumns(ch) {
  const text = String(ch || "");
  if (!text) return 0;
  if (text === "\t") return 4;
  const codePoint = text.codePointAt(0);
  if (!Number.isFinite(codePoint)) return 1;
  if (codePoint <= 0x1f || codePoint === 0x7f) return 0;
  if (isZeroWidthCodePoint(codePoint)) return 0;
  return isWideCodePoint(codePoint) ? 2 : 1;
}

function createTerminalCell(text, style, width) {
  return {
    text: String(text || ""),
    style: style || null,
    width: Math.max(0, Math.min(2, Math.round(Number(width) || 0))),
    continuation: false,
    placeholder: false
  };
}

/**
 * 擦除/补位产生的“空白单元”需要占据一列，但不应在文本快照里永久变成尾随空格。
 * 因此这里单独打上 placeholder 标记，供渲染层保留宽度，文本层按需裁剪。
 */
function createBlankCell(style) {
  return {
    text: "",
    style: style || null,
    width: 1,
    continuation: false,
    placeholder: true
  };
}

function createContinuationCell(style) {
  return {
    text: "",
    style: style || null,
    width: 0,
    continuation: true,
    placeholder: false
  };
}

function cloneTerminalCell(cell) {
  return {
    text: String((cell && cell.text) || ""),
    style: cell && cell.style ? { ...cell.style } : null,
    width: Math.max(0, Math.min(2, Math.round(Number(cell && cell.width) || 0))),
    continuation: !!(cell && cell.continuation),
    placeholder: !!(cell && cell.placeholder)
  };
}

function lineCellsToText(lineCells) {
  const cells = Array.isArray(lineCells) ? lineCells : [];
  if (cells.length === 0) return "";
  let lastMeaningfulIndex = -1;
  for (let index = cells.length - 1; index >= 0; index -= 1) {
    const cell = cells[index];
    const width = Math.max(0, Math.min(2, Math.round(Number(cell && cell.width) || 0)));
    if (width <= 0 || (cell && cell.continuation)) {
      continue;
    }
    if (cell && cell.placeholder) {
      continue;
    }
    lastMeaningfulIndex = index;
    break;
  }
  if (lastMeaningfulIndex < 0) {
    return "";
  }
  let result = "";
  for (let index = 0; index <= lastMeaningfulIndex; index += 1) {
    const cell = cells[index];
    const width = Math.max(0, Math.min(2, Math.round(Number(cell && cell.width) || 0)));
    if (width <= 0 || (cell && cell.continuation)) {
      continue;
    }
    if (cell && cell.placeholder) {
      result += " ";
      continue;
    }
    result += String((cell && cell.text) || "");
  }
  return result;
}

function measureLineCellsDisplayColumns(lineCells) {
  const cells = Array.isArray(lineCells) ? lineCells : [];
  if (cells.length === 0) return 0;
  let columns = 0;
  for (let i = 0; i < cells.length; i += 1) {
    const cell = cells[i];
    const width = Math.max(0, Math.round(Number(cell && cell.width) || 0));
    if (width > 0) {
      columns += width;
    }
  }
  return Math.max(0, columns);
}

function buildTerminalStyleSignature(style) {
  const source = style || null;
  if (!source) return "||0|0";
  return `${source.fg || ""}|${source.bg || ""}|${source.bold ? 1 : 0}|${source.underline ? 1 : 0}`;
}

/**
 * 若一整行的所有 render run 都共享同一个非空背景色，
 * 则允许把背景提升到 line 容器层绘制，避免 text 行盒之间露出底色细缝。
 *
 * 约束：
 * 1. 只在“整行统一背景”时返回颜色；
 * 2. 一旦某个 run 没有背景或背景不同，立即回退为空串，保持旧语义。
 */
function resolveUniformLineBackground(runs) {
  const source = Array.isArray(runs) ? runs : [];
  let background = "";
  let hasBackground = false;
  for (let index = 0; index < source.length; index += 1) {
    const run = source[index];
    if (!run || Math.max(0, Math.round(Number(run.columns) || 0)) <= 0) {
      continue;
    }
    const runBackground = String((run.style && run.style.bg) || "");
    if (!runBackground) {
      return "";
    }
    if (!hasBackground) {
      background = runBackground;
      hasBackground = true;
      continue;
    }
    if (runBackground !== background) {
      return "";
    }
  }
  return hasBackground ? background : "";
}

/**
 * 把一行固定列缓冲区转换成更适合 UI 渲染的 run：
 * 1. continuation 占位格不再直接落回自然文本流；
 * 2. 宽字符 owner 独立成 fixed run，供视图层按 2 列宽渲染；
 * 3. 连续的窄字符仍按样式合并，避免节点数量爆炸。
 */
function buildLineCellRenderRuns(lineCells) {
  const cells = Array.isArray(lineCells) ? lineCells : [];
  if (cells.length === 0) return [];

  const runs = [];
  let pendingTextRun = null;
  let pendingBlankRun = null;

  const flushPendingTextRun = () => {
    if (!pendingTextRun) return;
    runs.push({
      text: pendingTextRun.text,
      style: pendingTextRun.style ? { ...pendingTextRun.style } : null,
      columns: pendingTextRun.columns,
      fixed: false
    });
    pendingTextRun = null;
  };

  const flushPendingBlankRun = () => {
    if (!pendingBlankRun) return;
    runs.push({
      text: "",
      style: pendingBlankRun.style ? { ...pendingBlankRun.style } : null,
      columns: pendingBlankRun.columns,
      fixed: true
    });
    pendingBlankRun = null;
  };

  for (let i = 0; i < cells.length; i += 1) {
    const cell = cells[i];
    const width = Math.max(0, Math.min(2, Math.round(Number(cell && cell.width) || 0)));
    if (width <= 0 || (cell && cell.continuation)) {
      continue;
    }

    const text = String((cell && cell.text) || "");
    const style = cell && cell.style ? cell.style : null;
    const styleKey = buildTerminalStyleSignature(style);
    const isPlaceholder = !!(cell && cell.placeholder);

    if (isPlaceholder) {
      flushPendingTextRun();
      if (!pendingBlankRun || pendingBlankRun.styleKey !== styleKey) {
        flushPendingBlankRun();
        pendingBlankRun = {
          style,
          styleKey,
          columns: width
        };
        continue;
      }
      pendingBlankRun.columns += width;
      continue;
    }

    flushPendingBlankRun();

    if (width > 1) {
      flushPendingTextRun();
      runs.push({
        text,
        style: style ? { ...style } : null,
        columns: width,
        fixed: true
      });
      continue;
    }

    if (!pendingTextRun || pendingTextRun.styleKey !== styleKey) {
      flushPendingTextRun();
      pendingTextRun = {
        text,
        style,
        styleKey,
        columns: 1
      };
      continue;
    }

    pendingTextRun.text += text;
    pendingTextRun.columns += 1;
  }

  flushPendingTextRun();
  flushPendingBlankRun();
  return runs;
}

module.exports = {
  buildLineCellRenderRuns,
  createBlankCell,
  cloneTerminalCell,
  createContinuationCell,
  createTerminalCell,
  lineCellsToText,
  measureCharDisplayColumns,
  measureLineCellsDisplayColumns,
  resolveUniformLineBackground
};
