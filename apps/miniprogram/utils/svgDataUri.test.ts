import { describe, expect, it } from "vitest";

const { toSvgDataUri } = require("./svgDataUri.js");

function decodeSvgFromDataUri(uri: string) {
  const prefix = "data:image/svg+xml;base64,";
  expect(uri.startsWith(prefix)).toBe(true);
  return Buffer.from(uri.slice(prefix.length), "base64").toString("utf8");
}

describe("svgDataUri", () => {
  it("把 SVG 编码为 base64 data URI", () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><path fill="#67D1FF" d="M0 0h10v10H0z"/></svg>';
    const uri = toSvgDataUri(svg);
    expect(decodeSvgFromDataUri(uri)).toBe(svg);
  });

  it("对非 ASCII 字符使用 UTF-8 编码，避免 data URI 损坏", () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><text>终端</text></svg>';
    const uri = toSvgDataUri(svg);
    expect(decodeSvgFromDataUri(uri)).toContain("终端");
  });
});
