/* global module */

const DEFAULT_DATA_KEY = "pressedSvgButtonKey";
const DEFAULT_DATASET_KEY = "pressKey";

function buildSvgButtonPressData(dataKey = DEFAULT_DATA_KEY) {
  return {
    [dataKey]: ""
  };
}

function extractSvgButtonPressKey(event, datasetKey = DEFAULT_DATASET_KEY) {
  const source =
    (event && event.currentTarget && event.currentTarget.dataset) ||
    (event && event.target && event.target.dataset) ||
    null;
  if (!source) return "";
  return String(source[datasetKey] || "").trim();
}

/**
 * 小程序同一时刻只需要记录“当前正在按下的那个 SVG 按钮”：
 * 1. 用单个字符串足够表达，避免为每个按钮建一堆布尔字段；
 * 2. 页面和组件都复用同一个数据键，模板判断也保持统一。
 */
function setSvgButtonPressed(host, key, pressed, dataKey = DEFAULT_DATA_KEY) {
  if (!host || typeof host.setData !== "function") return;
  const current = String((host.data && host.data[dataKey]) || "").trim();
  const normalizedKey = String(key || "").trim();
  const next = pressed ? normalizedKey : current === normalizedKey ? "" : current;
  if (current === next) return;
  host.setData({
    [dataKey]: next
  });
}

function createSvgButtonPressMethods(options = {}) {
  const dataKey = String(options.dataKey || DEFAULT_DATA_KEY).trim() || DEFAULT_DATA_KEY;
  const datasetKey = String(options.datasetKey || DEFAULT_DATASET_KEY).trim() || DEFAULT_DATASET_KEY;

  return {
    setSvgButtonPressState(key, pressed) {
      setSvgButtonPressed(this, key, pressed, dataKey);
    },

    setSvgButtonPressStateFromEvent(event, pressed) {
      const key = extractSvgButtonPressKey(event, datasetKey);
      setSvgButtonPressed(this, key, pressed, dataKey);
    },

    onSvgButtonTouchStart(event) {
      const key = extractSvgButtonPressKey(event, datasetKey);
      setSvgButtonPressed(this, key, true, dataKey);
    },

    onSvgButtonTouchEnd(event) {
      const key = extractSvgButtonPressKey(event, datasetKey);
      setSvgButtonPressed(this, key, false, dataKey);
    }
  };
}

module.exports = {
  DEFAULT_SVG_BUTTON_PRESS_DATA_KEY: DEFAULT_DATA_KEY,
  buildSvgButtonPressData,
  createSvgButtonPressMethods,
  extractSvgButtonPressKey,
  setSvgButtonPressed
};
