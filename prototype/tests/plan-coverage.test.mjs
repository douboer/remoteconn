import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync("prototype/liquid-console.html", "utf8");
const js = readFileSync("prototype/liquid-console.js", "utf8");

test("页面包含四个主 screen", () => {
  const screens = [...html.matchAll(/data-screen="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(screens.sort(), ["config", "console", "log", "servermanager"].sort());
});

test("会话状态机定义完整", () => {
  assert.match(js, /SESSION_STATES\s*=\s*\[/);
  ["idle", "connecting", "auth_pending", "connected", "reconnecting", "disconnected", "error"].forEach((state) => {
    assert.ok(js.includes(`"${state}"`));
  });
});

test("Codex 编排关键命令存在", () => {
  assert.ok(js.includes("command -v codex"));
  assert.ok(js.includes("codex --sandbox"));
});

test("插件系统关键结构存在", () => {
  assert.ok(js.includes("class PluginManager"));
  assert.ok(js.includes("PERMISSION_WHITELIST"));
  assert.ok(js.includes("installPackage"));
  assert.ok(js.includes("runPluginCommand"));
});

test("日志导出能力存在", () => {
  assert.ok(js.includes("exportSessionLogs"));
  assert.ok(js.includes("maskSensitive"));
});
