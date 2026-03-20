import { describe, expect, it } from "vitest";

const { appendDiagnosticSample, buildCombinedDiagnosticSparkline } = require("./connectionDiagnosticsSparkline.js");

function decodeSvgDataUri(uri: string) {
  const base64 = uri.replace(/^data:image\/svg\+xml;base64,/, "");
  return Buffer.from(base64, "base64").toString("utf8");
}

describe("connectionDiagnosticsSparkline", () => {
  it("限制最近 30 个采样点", () => {
    let samples: number[] = [];
    for (let index = 1; index <= 35; index += 1) {
      samples = appendDiagnosticSample(samples, index, 30);
    }
    expect(samples).toHaveLength(30);
    expect(samples[0]).toBe(6);
    expect(samples[29]).toBe(35);
  });

  it("为双序列生成带平滑曲线与左右双轴的 SVG data URI", () => {
    const uri = buildCombinedDiagnosticSparkline(
      {
        responseSamples: [12, 22, 18, 30],
        networkSamples: [88, 76, 90, 94]
      },
      {
        responseLineColor: "#67D1FF",
        responseFillColor: "#67D1FF",
        networkLineColor: "#FFB35C",
        networkFillColor: "#FFB35C"
      }
    );
    const svg = decodeSvgDataUri(uri);

    expect(uri.startsWith("data:image/svg+xml;base64,")).toBe(true);
    expect(svg).not.toContain("网关响应");
    expect(svg).not.toContain("网络时延");
    expect(svg).toContain('text-anchor="end"');
    expect(svg).toContain(" C ");
    expect(svg).not.toContain("<polyline");
    expect(svg).toContain('stroke-width="1.25"');
    expect(svg).toContain('stroke="#67D1FF"');
    expect(svg).toContain('stroke="#FFB35C"');
    expect(svg).not.toContain("clipPath");
  });

  it("空数据时仍返回不带标题文字的占位图", () => {
    const uri = buildCombinedDiagnosticSparkline({
      responseSamples: [],
      networkSamples: []
    });
    const svg = decodeSvgDataUri(uri);

    expect(uri.startsWith("data:image/svg+xml;base64,")).toBe(true);
    expect(svg).not.toContain("网关响应");
    expect(svg).not.toContain("网络时延");
    expect(svg).toContain("stroke-dasharray");
  });
});
