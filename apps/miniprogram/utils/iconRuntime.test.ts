import { afterEach, describe, expect, it } from "vitest";

function loadModule(modulePath: string) {
  const resolved = require.resolve(modulePath);
  delete require.cache[resolved];
  return require(modulePath);
}

function mockWxPlatform(platform: string) {
  (
    global as typeof globalThis & {
      wx?: { getAppBaseInfo: () => { platform: string } };
    }
  ).wx = {
    getAppBaseInfo() {
      return { platform };
    }
  };
}

function decodeSvgDataUri(uri: string) {
  const prefix = "data:image/svg+xml;base64,";
  if (!uri.startsWith(prefix)) {
    throw new Error(`unexpected uri: ${uri.slice(0, 32)}`);
  }
  return Buffer.from(uri.slice(prefix.length), "base64").toString("utf8");
}

describe("miniprogram icon runtime policy", () => {
  afterEach(() => {
    delete (global as typeof globalThis & { wx?: unknown }).wx;
  });

  it("在 devtools 中也会生成带主题色的按钮图标", () => {
    mockWxPlatform("devtools");
    const { buildAccentButtonIconMap, buildActiveButtonIconMap, buildButtonIconMap, resolveButtonIcon } =
      loadModule("./themedIcons.js");
    const { buildTerminalToolActiveIconMap, buildTerminalToolIconMap } = loadModule("./terminalIcons.js");

    const buttonIcons = buildButtonIconMap({ uiBtnColor: "#ABCDEF" });
    const activeButtonIcons = buildActiveButtonIconMap({ uiTextColor: "#102030" });
    const accentButtonIcons = buildAccentButtonIconMap({ uiAccentColor: "#3366FF" });
    const terminalIcons = buildTerminalToolIconMap({
      shellAccentColor: "#123456",
      uiAccentColor: "#3366FF"
    });
    const terminalActiveIcons = buildTerminalToolActiveIconMap({
      uiBgColor: "#FFFFFF",
      uiAccentColor: "#AABBCC",
      shellTextColor: "#102030"
    });

    expect(buttonIcons.about).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(resolveButtonIcon("/assets/icons/about.svg", buttonIcons)).toBe(buttonIcons.about);
    expect(resolveButtonIcon("/assets/icons/add.svg", buttonIcons)).toBe(buttonIcons.add);
    expect(resolveButtonIcon("/assets/icons/right.svg", buttonIcons)).toBe(buttonIcons.right);
    expect(resolveButtonIcon("/assets/icons/share.svg", buttonIcons)).toBe("/assets/icons/share.svg");
    expect(resolveButtonIcon("/assets/icons/shell.svg", buttonIcons)).toBe(buttonIcons.shell);
    expect(decodeSvgDataUri(buttonIcons.about)).toContain('fill="#ABCDEF"');
    expect(decodeSvgDataUri(buttonIcons.add)).toContain('fill="#ABCDEF"');
    expect(decodeSvgDataUri(buttonIcons.right)).toContain('fill="#ABCDEF"');
    expect(decodeSvgDataUri(buttonIcons.shell)).toContain('fill="#ABCDEF"');
    expect(decodeSvgDataUri(activeButtonIcons.connect)).toContain('fill="#102030"');
    expect(decodeSvgDataUri(accentButtonIcons.codex)).toContain('fill="#3366FF"');
    expect(decodeSvgDataUri(accentButtonIcons.clear)).toContain('fill="#3366FF"');
    expect(terminalIcons.keyboard).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(decodeSvgDataUri(terminalIcons.keyboard)).toContain('fill="#123456"');
    expect(decodeSvgDataUri(terminalIcons.enter)).toContain('stroke="#123456"');
    expect(decodeSvgDataUri(terminalIcons.home)).toContain('fill="#123456"');
    expect(decodeSvgDataUri(terminalIcons.reading)).toContain('fill="#123456"');
    expect(decodeSvgDataUri(terminalIcons.ctrlc)).toContain('fill="#123456"');
    expect(decodeSvgDataUri(terminalIcons.ctrlc)).toContain('fill="#3366FF"');
    expect(decodeSvgDataUri(terminalActiveIcons.keyboard)).toContain('fill="#102030"');
    expect(decodeSvgDataUri(terminalIcons.stopreading)).toContain('fill="#123456"');
    expect(decodeSvgDataUri(terminalActiveIcons.reading)).toContain('fill="#102030"');
    expect(decodeSvgDataUri(terminalActiveIcons.ctrlc)).toContain('fill="#102030"');
    expect(decodeSvgDataUri(terminalActiveIcons.ctrlc)).toContain('fill="#AABBCC"');
  });

  it("在非 devtools 运行环境中同样使用主题化 svg", () => {
    mockWxPlatform("ios");
    const { buildButtonIconMap } = loadModule("./themedIcons.js");
    const { buildTerminalToolActiveIconMap, buildTerminalToolIconMap } = loadModule("./terminalIcons.js");

    const buttonIcons = buildButtonIconMap({ uiBtnColor: "#445566" });
    const terminalIcons = buildTerminalToolIconMap({ shellAccentColor: "#778899" });
    const terminalActiveIcons = buildTerminalToolActiveIconMap({
      uiBgColor: "#FFFFFF",
      uiAccentColor: "#FEFEFE",
      shellTextColor: "#224466"
    });

    expect(decodeSvgDataUri(buttonIcons.cancel)).toContain('fill="#445566"');
    expect(decodeSvgDataUri(terminalIcons.voice)).toContain('fill="#778899"');
    expect(decodeSvgDataUri(terminalIcons.home)).toContain('fill="#778899"');
    expect(decodeSvgDataUri(terminalIcons.reading)).toContain('fill="#778899"');
    expect(decodeSvgDataUri(terminalActiveIcons.reading)).toContain('fill="#224466"');
  });
});
