# RemoteConnSSHPlugin

iOS 原生插件（Capacitor）骨架，提供以下 JS 能力：

- `connect({ host, port, username, credential, cols, rows })`
- `send({ data })`
- `resize({ cols, rows })`
- `disconnect({ reason })`

监听事件：

- `connected`
- `stdout`
- `stderr`
- `latency`
- `disconnect`
- `error`

## 接入建议

1. 在 iOS App 中通过 SwiftPM 引入本插件包。
2. 替换 `RemoteConnSSHPlugin.swift` 中的占位逻辑为真实 SSH 实现（libssh2 / SwiftNIO SSH）。
3. 对齐 Web 端 `IosNativeTransport` 事件协议，确保状态机一致。
4. 完整覆盖真机回归：连接、命令发送、断线重连、后台切换。
