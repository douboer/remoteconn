import { describe, expect, it } from "vitest";

function loadServerValidationModule() {
  const modulePath = require.resolve("./serverValidation.js");
  delete require.cache[modulePath];
  return require("./serverValidation.js");
}

describe("miniprogram serverValidation", () => {
  it("端口超出范围时返回准确提示", () => {
    const { validateServerForConnect } = loadServerValidationModule();

    expect(
      validateServerForConnect({
        host: "10.0.0.8",
        port: 70000,
        username: "root",
        authType: "password",
        password: "secret"
      })
    ).toBe("SSH 端口需为 1-65535 的整数");
  });

  it("跳板机端口非法时优先返回跳板机端口提示", () => {
    const { validateServerForConnect } = loadServerValidationModule();

    expect(
      validateServerForConnect({
        host: "10.0.0.8",
        port: 22,
        username: "root",
        authType: "password",
        password: "secret",
        jumpHost: {
          enabled: true,
          host: "10.0.0.1",
          port: "abc",
          username: "jump",
          authType: "password"
        },
        jumpPassword: "jump-secret"
      })
    ).toBe("跳板机端口需为 1-65535 的整数");
  });

  it("缺少主机和用户名时返回更具体的提示", () => {
    const { validateServerForConnect } = loadServerValidationModule();

    expect(validateServerForConnect({ username: "root" })).toBe("主机不能为空");
    expect(validateServerForConnect({ host: "10.0.0.8" })).toBe("用户名不能为空");
  });

  it("端口留空时保留默认端口行为，不额外报错", () => {
    const { validateServerForConnect } = loadServerValidationModule();

    expect(
      validateServerForConnect({
        host: "10.0.0.8",
        port: "",
        username: "root",
        authType: "password",
        password: "secret"
      })
    ).toBe("");
  });
});
