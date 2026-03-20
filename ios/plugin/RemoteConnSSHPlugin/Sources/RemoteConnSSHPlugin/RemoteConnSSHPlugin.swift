import Foundation
import Capacitor

/**
 iOS 原生 SSH 插件。

 说明：
 - 该实现先提供生产接口与事件桥接，便于 Web 层与 Capacitor 端统一接入。
 - 真正的 SSH 底层可替换为 libssh2 / SwiftNIO SSH / 其他经过评估的实现。
 */
@objc(RemoteConnSSHPlugin)
public class RemoteConnSSHPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "RemoteConnSSHPlugin"
    public let jsName = "RemoteConnSSH"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "connect", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "send", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "resize", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "disconnect", returnType: CAPPluginReturnPromise)
    ]

    private let sessionQueue = DispatchQueue(label: "remoteconn.ssh.session")
    private var connected = false

    @objc public func connect(_ call: CAPPluginCall) {
        let host = call.getString("host") ?? ""
        let port = call.getInt("port") ?? 22
        let username = call.getString("username") ?? ""
        let credential = call.getObject("credential") ?? [:]

        guard !host.isEmpty, !username.isEmpty else {
            call.reject("host/username 不能为空", "INVALID_ARGUMENT")
            return
        }

        sessionQueue.async {
            // 这里可替换为真实 SSH 建链逻辑（认证/pty/shell/channel）。
            // 生产落地时建议将底层实现拆分到独立类并补齐断线重连策略。
            self.connected = true

            self.notifyListeners("connected", data: [
                "host": host,
                "port": port,
                "username": username,
                "fingerprint": credential["knownHostFingerprint"] as? String ?? ""
            ])

            self.notifyListeners("stdout", data: ["data": "[iOS] SSH channel initialized\n"])
            call.resolve(["ok": true])
        }
    }

    @objc public func send(_ call: CAPPluginCall) {
        guard connected else {
            call.reject("会话未连接", "NOT_CONNECTED")
            return
        }

        let data = call.getString("data") ?? ""
        sessionQueue.async {
            // 真实实现中应把 data 写入 SSH channel。
            self.notifyListeners("stdout", data: ["data": data])
            call.resolve(["ok": true])
        }
    }

    @objc public func resize(_ call: CAPPluginCall) {
        guard connected else {
            call.reject("会话未连接", "NOT_CONNECTED")
            return
        }

        let cols = call.getInt("cols") ?? 80
        let rows = call.getInt("rows") ?? 24

        sessionQueue.async {
            // 真实实现中应调用 pty resize。
            self.notifyListeners("latency", data: ["latency": 0])
            call.resolve([
                "ok": true,
                "cols": cols,
                "rows": rows
            ])
        }
    }

    @objc public func disconnect(_ call: CAPPluginCall) {
        let reason = call.getString("reason") ?? "manual"

        sessionQueue.async {
            self.connected = false
            self.notifyListeners("disconnect", data: ["reason": reason])
            call.resolve(["ok": true])
        }
    }
}
