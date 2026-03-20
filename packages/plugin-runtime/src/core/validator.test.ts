import { describe, expect, it } from "vitest";
import { validatePluginPackage } from "./validator";

describe("plugin validator", () => {
  it("通过最小合法插件", () => {
    expect(() =>
      validatePluginPackage({
        manifest: {
          id: "codex-shortcuts",
          name: "Codex Shortcuts",
          version: "0.1.0",
          minAppVersion: "0.1.0",
          description: "test",
          entry: "main.js",
          style: "styles.css",
          permissions: ["commands.register"]
        },
        mainJs: "module.exports = {};",
        stylesCss: ".x { color: red; }"
      })
    ).not.toThrow();
  });
});
