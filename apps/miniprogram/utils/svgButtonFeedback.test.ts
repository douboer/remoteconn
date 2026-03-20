import { describe, expect, it, vi } from "vitest";

function loadModule() {
  const resolved = require.resolve("./svgButtonFeedback.js");
  delete require.cache[resolved];
  return require("./svgButtonFeedback.js");
}

describe("svg button feedback helper", () => {
  it("生成默认按压态数据键", () => {
    const { buildSvgButtonPressData } = loadModule();
    expect(buildSvgButtonPressData()).toEqual({
      pressedSvgButtonKey: ""
    });
    expect(buildSvgButtonPressData("customPressedKey")).toEqual({
      customPressedKey: ""
    });
  });

  it("从事件里提取 press key", () => {
    const { extractSvgButtonPressKey } = loadModule();
    expect(
      extractSvgButtonPressKey({
        currentTarget: {
          dataset: {
            pressKey: "toolbar-ai"
          }
        }
      })
    ).toBe("toolbar-ai");
    expect(
      extractSvgButtonPressKey({
        target: {
          dataset: {
            customKey: "voice-main"
          }
        }
      }, "customKey")
    ).toBe("voice-main");
  });

  it("只在状态变化时写入 setData", () => {
    const { createSvgButtonPressMethods } = loadModule();
    const host = {
      data: {
        pressedSvgButtonKey: ""
      },
      setData: vi.fn(function setData(patch: Record<string, string>) {
        this.data = {
          ...this.data,
          ...patch
        };
      })
    };
    const methods = createSvgButtonPressMethods();

    methods.setSvgButtonPressState.call(host, "records-close", true);
    expect(host.data.pressedSvgButtonKey).toBe("records-close");
    expect(host.setData).toHaveBeenCalledTimes(1);

    methods.setSvgButtonPressState.call(host, "records-close", true);
    expect(host.setData).toHaveBeenCalledTimes(1);

    methods.onSvgButtonTouchEnd.call(host, {
      currentTarget: {
        dataset: {
          pressKey: "records-close"
        }
      }
    });
    expect(host.data.pressedSvgButtonKey).toBe("");
    expect(host.setData).toHaveBeenCalledTimes(2);
  });
});
