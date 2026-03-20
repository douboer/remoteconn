import { describe, expect, it } from "vitest";

const { resolveVoiceGatewayErrorState } = require("./voiceGatewayError.js");

describe("voiceGatewayError", () => {
  it("仅在域名白名单错误时提示 socket 合法域名", () => {
    expect(resolveVoiceGatewayErrorState("connectSocket:fail url not in domain list")).toEqual({
      message: "语音网关连接失败，请检查小程序 socket 合法域名",
      showSocketDomainModal: true
    });
  });

  it("将其他 connectSocket 失败归类为网络或网关配置问题", () => {
    expect(
      resolveVoiceGatewayErrorState("语音网关连接失败: connectSocket:fail SSL handshake failed")
    ).toEqual({
      message: "语音网关连接失败，请检查网络或网关配置",
      showSocketDomainModal: false
    });
  });

  it("保留 ready_timeout 的独立超时提示", () => {
    expect(resolveVoiceGatewayErrorState("ready_timeout")).toEqual({
      message: "语音服务连接超时，请稍后重试",
      showSocketDomainModal: false
    });
  });
});
