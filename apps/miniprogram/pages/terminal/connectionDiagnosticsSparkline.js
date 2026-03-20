/* global module, require */

const { toSvgDataUri } = require("../../utils/svgDataUri");

const DEFAULT_WIDTH = 640;
const DEFAULT_HEIGHT = 212;
const DEFAULT_PADDING = 0;
const AXIS_GUTTER = 32;
const TOP_INSET = 6;
const BOTTOM_INSET = 6;

function normalizeSampleValue(value) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 0) {
    return null;
  }
  return Math.round(numberValue);
}

/**
 * 所有诊断曲线都只保留固定窗口内的最近采样点，
 * 这样卡片高度稳定，也避免历史峰值把当前波动压扁。
 */
function appendDiagnosticSample(samplesInput, value, maxPoints) {
  const normalizedValue = normalizeSampleValue(value);
  const next = Array.isArray(samplesInput) ? samplesInput.slice() : [];
  const sampleLimit = Math.max(1, Math.round(Number(maxPoints) || 30));
  if (normalizedValue == null) {
    return next.slice(-sampleLimit);
  }
  next.push(normalizedValue);
  return next.slice(-sampleLimit);
}

function normalizeSeries(samplesInput) {
  return Array.isArray(samplesInput)
    ? samplesInput.map((sample) => normalizeSampleValue(sample)).filter((sample) => sample != null)
    : [];
}

function escapeXmlText(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * 双轴图需要给左右刻度预留固定留白，
 * 否则数字标签会压到曲线和端点高亮。
 */
function buildPlotFrame(width, height, padding) {
  const left = padding + AXIS_GUTTER;
  const right = width - padding - AXIS_GUTTER;
  const top = padding + TOP_INSET;
  const bottom = height - padding - BOTTOM_INSET;
  return {
    left,
    right,
    top,
    bottom,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top)
  };
}

/**
 * 两条曲线共用横轴，但保留各自真实量纲：
 * 左轴给“网关响应”，右轴给“网络时延”。
 */
function buildSeriesScale(samples) {
  if (samples.length === 0) {
    return null;
  }
  const rawMin = Math.min(...samples);
  const rawMax = Math.max(...samples);
  const rawSpan = rawMax - rawMin;
  const padding = Math.max(4, rawSpan * 0.16, rawMax * 0.08, 1);
  const min = Math.max(0, rawMin - padding);
  const max = Math.max(min + 1, rawMax + padding);
  return {
    min,
    max
  };
}

function buildAxisTicks(scale, plotFrame) {
  if (!scale) {
    return [];
  }
  const values = [scale.max, (scale.max + scale.min) / 2, scale.min];
  return values.map((value, index) => {
    const ratio = values.length <= 1 ? 0 : index / (values.length - 1);
    return {
      value,
      y: plotFrame.top + plotFrame.height * ratio
    };
  });
}

function formatAxisTickLabel(value) {
  return `${Math.round(value)}ms`;
}

function buildChartPoints(samples, plotFrame, totalSlots, scale) {
  if (samples.length === 0 || !scale) {
    return [];
  }
  const safeRange = Math.max(1, scale.max - scale.min);
  const safeSlots = Math.max(samples.length, Math.round(Number(totalSlots) || samples.length), 2);
  const slotOffset = Math.max(0, safeSlots - samples.length);
  return samples.map((sample, index) => {
    const ratio = safeSlots <= 1 ? 0 : (slotOffset + index) / (safeSlots - 1);
    const x = plotFrame.left + plotFrame.width * ratio;
    const y = plotFrame.bottom - plotFrame.height * ((sample - scale.min) / safeRange);
    return { x, y };
  });
}

/**
 * 使用 Catmull-Rom 转三次贝塞尔，让时延曲线保持圆润，
 * 避免折线在采样点较少时显得生硬。
 */
function buildSmoothLinePath(points) {
  if (points.length === 0) return "";
  if (points.length === 1) {
    const point = points[0];
    return `M ${point.x.toFixed(2)} ${point.y.toFixed(2)} L ${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
  }
  let path = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[index - 1] || points[index];
    const p1 = points[index];
    const p2 = points[index + 1];
    const p3 = points[index + 2] || p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    path += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)} ${cp2x.toFixed(2)} ${cp2y.toFixed(
      2
    )} ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return path;
}

function buildSmoothAreaPath(points, baselineY) {
  if (points.length === 0) return "";
  const first = points[0];
  const last = points[points.length - 1];
  return `${buildSmoothLinePath(points)} L ${last.x.toFixed(2)} ${baselineY.toFixed(2)} L ${first.x.toFixed(
    2
  )} ${baselineY.toFixed(2)} Z`;
}

function buildGridLines(plotFrame, strokeColor) {
  const lines = [];
  for (let index = 0; index < 4; index += 1) {
    const y = plotFrame.top + (plotFrame.height / 3) * index;
    lines.push(
      `<line x1="${plotFrame.left.toFixed(2)}" y1="${y.toFixed(2)}" x2="${plotFrame.right.toFixed(
        2
      )}" y2="${y.toFixed(2)}" stroke="${strokeColor}" stroke-width="1" stroke-dasharray="6 10"/>`
    );
  }
  return lines.join("");
}

function buildAxisLayer(side, ticks, plotFrame, lineColor, labelColor) {
  if (!Array.isArray(ticks) || ticks.length === 0) {
    return "";
  }
  const isLeft = side === "left";
  const axisX = isLeft ? plotFrame.left : plotFrame.right;
  const tickOuterX = isLeft ? axisX - 4 : axisX + 4;
  const labelX = isLeft ? axisX - 6 : axisX + 6;
  const anchor = isLeft ? "end" : "start";
  const tickMarks = ticks
    .map(
      (tick) => `
        <line x1="${axisX.toFixed(2)}" y1="${tick.y.toFixed(2)}" x2="${tickOuterX.toFixed(
          2
        )}" y2="${tick.y.toFixed(2)}" stroke="${lineColor}" stroke-opacity="0.38" stroke-width="1"/>
        <text x="${labelX.toFixed(2)}" y="${(tick.y + 4).toFixed(
          2
        )}" text-anchor="${anchor}" font-size="10" fill="${labelColor}" fill-opacity="0.88">${escapeXmlText(
          formatAxisTickLabel(tick.value)
        )}</text>
      `
    )
    .join("");
  return `
    <line x1="${axisX.toFixed(2)}" y1="${plotFrame.top.toFixed(2)}" x2="${axisX.toFixed(
      2
    )}" y2="${plotFrame.bottom.toFixed(2)}" stroke="${lineColor}" stroke-opacity="0.22" stroke-width="1"/>
    ${tickMarks}
  `;
}

function buildEmptySparklineSvg(width, height, plotFrame, colors) {
  const midY = (plotFrame.top + plotFrame.bottom) * 0.5;
  const leftY = midY - 18;
  const rightY = midY + 18;
  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" fill="none">
      <defs>
        <linearGradient id="emptyBg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${colors.cardGlow}" stop-opacity="0.22"/>
          <stop offset="100%" stop-color="${colors.cardGlow}" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="${width}" height="${height}" fill="url(#emptyBg)"/>
      ${buildGridLines(plotFrame, colors.grid)}
      <line x1="${plotFrame.left.toFixed(2)}" y1="${plotFrame.top.toFixed(2)}" x2="${plotFrame.left.toFixed(
        2
      )}" y2="${plotFrame.bottom.toFixed(2)}" stroke="${colors.responseLine}" stroke-opacity="0.18" stroke-width="1"/>
      <line x1="${plotFrame.right.toFixed(2)}" y1="${plotFrame.top.toFixed(2)}" x2="${plotFrame.right.toFixed(
        2
      )}" y2="${plotFrame.bottom.toFixed(2)}" stroke="${colors.networkLine}" stroke-opacity="0.18" stroke-width="1"/>
      <line x1="${plotFrame.left.toFixed(2)}" y1="${midY.toFixed(2)}" x2="${plotFrame.right.toFixed(
        2
      )}" y2="${midY.toFixed(2)}" stroke="${colors.grid}" stroke-width="1" stroke-dasharray="8 12"/>
      <line x1="${plotFrame.left.toFixed(2)}" y1="${leftY.toFixed(2)}" x2="${plotFrame.right.toFixed(
        2
      )}" y2="${leftY.toFixed(2)}" stroke="${colors.responseLine}" stroke-width="1.25" stroke-linecap="round" opacity="0.38"/>
      <line x1="${plotFrame.left.toFixed(2)}" y1="${rightY.toFixed(2)}" x2="${plotFrame.right.toFixed(
        2
      )}" y2="${rightY.toFixed(2)}" stroke="${colors.networkLine}" stroke-width="1.25" stroke-linecap="round" opacity="0.38"/>
    </svg>
  `;
}

function buildSeriesDefs(prefix, colors) {
  return `
    <linearGradient id="${prefix}AreaFill" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${colors.fill}" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="${colors.fill}" stop-opacity="0"/>
    </linearGradient>
    <filter id="${prefix}LineGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="1.2" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  `;
}

function buildSeriesLayers(points, colors, prefix, baselineY) {
  if (points.length === 0) {
    return "";
  }
  const linePath = buildSmoothLinePath(points);
  const areaPath = buildSmoothAreaPath(points, baselineY);
  const lastPoint = points[points.length - 1];
  return `
    <path d="${areaPath}" fill="url(#${prefix}AreaFill)"/>
    <path d="${linePath}" stroke="${colors.line}" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" filter="url(#${prefix}LineGlow)"/>
    <circle cx="${lastPoint.x.toFixed(2)}" cy="${lastPoint.y.toFixed(2)}" r="2.6" fill="${colors.line}" fill-opacity="0.12"/>
    <circle cx="${lastPoint.x.toFixed(2)}" cy="${lastPoint.y.toFixed(2)}" r="1.4" fill="${colors.glow}"/>
  `;
}

/**
 * 双序列图把“网关响应”和“网络时延”画在同一张坐标图里：
 * 1. 横轴按采样槽位右对齐，保证两个序列的最新点处在同一时间位置；
 * 2. 左轴保留“网关响应”自身量纲，右轴保留“网络时延”自身量纲；
 * 3. 两条曲线继续使用平滑贝塞尔，避免采样点少时退化成生硬折线。
 */
function buildCombinedDiagnosticSparkline(seriesInput, options) {
  const responseSamples = normalizeSeries(seriesInput && seriesInput.responseSamples);
  const networkSamples = normalizeSeries(seriesInput && seriesInput.networkSamples);
  const width = Math.max(120, Math.round(Number(options && options.width) || DEFAULT_WIDTH));
  const height = Math.max(80, Math.round(Number(options && options.height) || DEFAULT_HEIGHT));
  const padding = Math.max(0, Math.round(Number(options && options.padding) || DEFAULT_PADDING));
  const plotFrame = buildPlotFrame(width, height, padding);
  const colors = {
    responseLine: (options && options.responseLineColor) || "#67D1FF",
    responseFill: (options && options.responseFillColor) || "#67D1FF",
    responseGlow: (options && options.responseGlowColor) || "#B7F1FF",
    networkLine: (options && options.networkLineColor) || "#FFB35C",
    networkFill: (options && options.networkFillColor) || "#FFB35C",
    networkGlow: (options && options.networkGlowColor) || "#FFE0A3",
    cardGlow: (options && options.cardGlowColor) || "rgba(103, 209, 255, 0.28)",
    grid: (options && options.gridColor) || "rgba(255, 255, 255, 0.12)"
  };
  if (responseSamples.length === 0 && networkSamples.length === 0) {
    return toSvgDataUri(buildEmptySparklineSvg(width, height, plotFrame, colors));
  }

  const responseScale = buildSeriesScale(responseSamples);
  const networkScale = buildSeriesScale(networkSamples);
  const responseTicks = buildAxisTicks(responseScale, plotFrame);
  const networkTicks = buildAxisTicks(networkScale, plotFrame);
  const totalSlots = Math.max(responseSamples.length, networkSamples.length, 2);
  const responsePoints = buildChartPoints(responseSamples, plotFrame, totalSlots, responseScale);
  const networkPoints = buildChartPoints(networkSamples, plotFrame, totalSlots, networkScale);

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" fill="none">
      <defs>
        <radialGradient id="cardGlow" cx="0.5" cy="0.08" r="0.82">
          <stop offset="0%" stop-color="${colors.cardGlow}" stop-opacity="0.55"/>
          <stop offset="100%" stop-color="${colors.cardGlow}" stop-opacity="0"/>
        </radialGradient>
        ${buildSeriesDefs("response", {
          line: colors.responseLine,
          fill: colors.responseFill,
          glow: colors.responseGlow
        })}
        ${buildSeriesDefs("network", {
          line: colors.networkLine,
          fill: colors.networkFill,
          glow: colors.networkGlow
        })}
      </defs>
      <rect x="0" y="0" width="${width}" height="${height}" fill="url(#cardGlow)"/>
      ${buildGridLines(plotFrame, colors.grid)}
      ${buildAxisLayer("left", responseTicks, plotFrame, colors.responseLine, colors.responseGlow)}
      ${buildAxisLayer("right", networkTicks, plotFrame, colors.networkLine, colors.networkGlow)}
      ${buildSeriesLayers(
        responsePoints,
        {
          line: colors.responseLine,
          fill: colors.responseFill,
          glow: colors.responseGlow
        },
        "response",
        plotFrame.bottom
      )}
      ${buildSeriesLayers(
        networkPoints,
        {
          line: colors.networkLine,
          fill: colors.networkFill,
          glow: colors.networkGlow
        },
        "network",
        plotFrame.bottom
      )}
    </svg>
  `;

  return toSvgDataUri(svg);
}

module.exports = {
  appendDiagnosticSample,
  buildCombinedDiagnosticSparkline
};
