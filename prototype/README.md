# RemoteConn 全功能原型（PLAN 落地版）

## 已实现能力
- 会话状态机：`idle / connecting / auth_pending / connected / reconnecting / disconnected / error`。
- 多服务器管理：新增、编辑、删除、全选、搜索、排序、连接测试。
- 认证管理：密码 / 私钥 / 证书三种认证动态表单，凭据以 `credentialRef` 方式管理。
- 主机指纹策略：严格校验、首次信任、每次手动确认（known_hosts）。
- 终端交互：模拟 SSH 传输层、命令发送、清屏、延迟展示、断线重连。
- Codex 模式编排：`cd <目录> -> command -v codex -> codex --sandbox ...`。
- 日志体系：
  - 会话日志 `SessionLog`（状态、耗时、命令标记、错误、延迟采样）。
  - 日志筛选（服务器/状态/日期）与脱敏导出。
- 主题引擎：字体/字号/行高、液态透明度、背景模糊、动效速度、WCAG 对比度提示与自动优化。
- 插件系统 MVP：
  - 插件包导入/导出（JSON）。
  - manifest 校验（id/semver/权限白名单）。
  - 生命周期 `onload/onunload`。
  - 插件 API（commands/session/storage/ui/logger）。
  - 插件命令渲染到终端页命令条。
  - 单插件错误隔离与熔断计数。

## 文件说明
- `liquid-console.html`：四个主窗口（连接、设置、终端、日志）与三个 dialog（Codex、快照、主机指纹）。
- `liquid-console.css`：液态视觉、弹性布局、会话状态样式、插件与日志界面样式。
- `liquid-console.js`：完整业务逻辑（状态机、主题、日志、插件运行时、传输抽象）。

## 使用方式
1. 打开页面：`/prototype/liquid-console.html`。
2. 默认首页为连接页，选择服务器后点击“连接”。
3. 连接后可在终端页执行命令或启动 Codex。
4. 设置页支持主题、安全策略和插件管理。
5. 日志页支持筛选并导出脱敏文本。

## 插件包格式
```json
{
  "manifest": {
    "id": "codex-shortcuts",
    "name": "Codex Shortcuts",
    "version": "0.1.0",
    "minAppVersion": "0.1.0",
    "description": "提供常用 Codex 快捷命令",
    "entry": "main.js",
    "style": "styles.css",
    "permissions": ["commands.register", "session.read", "session.write", "ui.notice"]
  },
  "mainJs": "module.exports = { onload(ctx) { ... } }",
  "stylesCss": ".command-chip { ... }"
}
```

## 说明
- 当前仓库是可交互原型，传输层使用 MockTransport。
- 已保留 `TerminalTransport` 抽象接口形态，后续可替换为 iOS Native SSH / WSS Gateway。
