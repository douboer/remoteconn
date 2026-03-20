import { describe, expect, it } from "vitest";

const { resolveVoicePrivacyErrorMessage } = require("./voicePrivacy.js");

describe("voicePrivacy", () => {
  it("将平台回收权限错误翻译为后台配置提示", () => {
    expect(resolveVoicePrivacyErrorMessage("operateRecorder:fail appid privacy api banned")).toContain(
      "录音接口已被微信平台禁用"
    );
  });

  it("将未声明隐私范围错误翻译为补充指引提示", () => {
    expect(
      resolveVoicePrivacyErrorMessage(
        "getRecorderManager:fail api scope is not declared in the privacy agreement"
      )
    ).toContain("补充麦克风采集说明");
  });

  it("保留非隐私错误原文，避免误伤其他录音异常", () => {
    expect(resolveVoicePrivacyErrorMessage("录音采集失败")).toBe("录音采集失败");
  });
});
