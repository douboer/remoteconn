import { describe, expect, it } from "vitest";

const { buildTerminalServerAddress, buildTerminalSessionInfoModel } = require("./terminalSessionInfo.js");

describe("terminalSessionInfo", () => {
  it("启用跳转主机后会把链路信息收敛到 hero 区并保留连接状态", () => {
    const model = buildTerminalSessionInfoModel({
      serverLabel: "prod-shell",
      statusText: "connected",
      activeAiProvider: "codex",
      server: {
        name: "生产环境",
        username: "deploy",
        host: "10.0.0.8",
        port: 22,
        projectPath: "/srv/apps/remoteconn",
        jumpHost: {
          enabled: true,
          username: "bastion",
          host: "10.0.0.2",
          port: 2222
        }
      },
      copy: {
        sessionInfo: {
          title: "会话信息",
          nameLabel: "服务器名称",
          projectLabel: "工作目录",
          addressLabel: "服务器地址",
          jumpTargetLabel: "跳至服务器",
          sshConnectionLabel: "SSH连接",
          aiConnectionLabel: "AI连接",
          connectedValue: "连接",
          disconnectedValue: "断开"
        },
        fallback: {
          noProject: "未设置项目",
          unnamedServer: "未命名服务器"
        }
      }
    });

    expect(model.title).toBe("会话信息");
    expect(model.hero).toEqual({
      eyebrow: "双跳通道",
      name: "生产环境",
      subtitle: "bastion@10.0.0.2:2222",
      routeLabel: "跳至服务器",
      route: "deploy@10.0.0.8:22"
    });
    expect(model.statusChips).toEqual([
      {
        key: "sshConnection",
        label: "SSH连接",
        value: "连接",
        badge: "LIVE",
        note: "终端链路已就绪",
        connected: true
      },
      {
        key: "aiConnection",
        label: "AI连接",
        value: "连接",
        badge: "Codex",
        note: "Codex 正在前台",
        connected: true
      }
    ]);
    expect(model.detailItems).toEqual([
      { key: "project", accent: "目录", label: "工作目录", value: "/srv/apps/remoteconn", wide: true }
    ]);
  });

  it("缺失配置时会回退到本地文案和断开状态", () => {
    const model = buildTerminalSessionInfoModel({
      serverLabel: "",
      statusText: "disconnected",
      activeAiProvider: "",
      server: {
        username: "",
        host: "",
        port: "",
        projectPath: ""
      },
      copy: {
        sessionInfo: {
          sshConnectionLabel: "SSH连接",
          aiConnectionLabel: "AI连接",
          connectedValue: "连接",
          disconnectedValue: "断开",
          emptyValue: "--"
        },
        fallback: {
          noProject: "未设置项目",
          unnamedServer: "未命名服务器"
        }
      }
    });

    expect(model.hero).toEqual({
      eyebrow: "直连通道",
      name: "未命名服务器",
      subtitle: "--",
      routeLabel: "跳至服务器",
      route: ""
    });
    expect(model.statusChips).toEqual([
      {
        key: "sshConnection",
        label: "SSH连接",
        value: "断开",
        badge: "IDLE",
        note: "等待重新建立",
        connected: false
      },
      {
        key: "aiConnection",
        label: "AI连接",
        value: "断开",
        badge: "STANDBY",
        note: "尚未接管终端",
        connected: false
      }
    ]);
    expect(model.detailItems).toEqual([
      { key: "project", accent: "目录", label: "工作目录", value: "未设置项目", wide: true }
    ]);
    expect(buildTerminalServerAddress({ host: "srv.example.com", port: 2200 })).toBe("srv.example.com:2200");
  });
});
