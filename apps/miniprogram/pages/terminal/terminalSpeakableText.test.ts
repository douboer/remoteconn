import { describe, expect, it } from "vitest";

const {
  buildSpeakableTerminalText,
  isSpeakableTextLikelyComplete,
  splitSpeakableTextForTts,
  stripTerminalAnsi
} = require("./terminalSpeakableText.js");

describe("terminalSpeakableText", () => {
  it("应提取最近一段自然语言并跳过命令与代码", () => {
    const source = [
      "$ codex ask",
      "正在分析项目结构...",
      "const answer = computeResult();",
      "",
      "请先检查 gateway 的环境变量配置。",
      "确认 TTS_SECRET_ID、TTS_SECRET_KEY 与 TTS_REGION 是否一致。"
    ].join("\n");

    expect(buildSpeakableTerminalText(source)).toBe(
      "请先检查 gateway 的环境变量配置。确认 TTS_SECRET_ID、TTS_SECRET_KEY 与 TTS_REGION 是否一致。"
    );
  });

  it("只有命令、路径和进度条时应返回空文本", () => {
    const source = [
      "$ npm run build",
      "/Users/demo/project/src/index.ts",
      "[======      ] 60%",
      "spinner loading"
    ].join("\n");

    expect(buildSpeakableTerminalText(source)).toBe("");
  });

  it("应跳过 Codex 输入行、状态行与底部 footer，只保留回答正文", () => {
    const source = [
      "› Summarize recent commits",
      "Working (0s · esc to interrupt)",
      "■ Conversation interrupted - tell the model what to do differently.",
      "Something went wrong? Hit `/feedback` to report the issue.",
      "本次修改主要收口了 TTS 播放链路。",
      "同时移除了小程序侧重复下载缓存文件的绕路实现。",
      "gpt-5.4 xhigh · 100% left · ~/remoteconn"
    ].join("\n");

    expect(buildSpeakableTerminalText(source)).toBe(
      "本次修改主要收口了 TTS 播放链路。同时移除了小程序侧重复下载缓存文件的绕路实现。"
    );
  });

  it("应跳过被终端换行拆开的 footer 残片", () => {
    const source = [
      "本次修改已经完成。",
      "42% left · ~/remoteconn"
    ].join("\n");

    expect(buildSpeakableTerminalText(source)).toBe("本次修改已经完成。");
  });

  it("应去掉列表项目符号，避免 TTS 在首句前卡住", () => {
    const source = [
      "• 第一条消息。",
      "  第二条消息。",
      "  第三条消息。",
      "  第四条消息。"
    ].join("\n");

    expect(buildSpeakableTerminalText(source)).toBe("第一条消息。第二条消息。第三条消息。第四条消息。");
  });

  it("应去掉紧贴正文的项目符号前缀", () => {
    const source = ["•第一条消息。", "•第二条消息。"].join("\n");

    expect(buildSpeakableTerminalText(source)).toBe("第一条消息。第二条消息。");
  });

  it("中间夹杂代码块时应继续向上回收同轮正文，而不是只读最后一小段", () => {
    const source = [
      "第一段说明，先交代修复背景。",
      "第二段说明，描述影响范围。",
      "```ts",
      "const demo = true;",
      "```",
      "第三段说明，给出处理方式。",
      "第四段说明，提醒重启服务。"
    ].join("\n");

    expect(buildSpeakableTerminalText(source, { maxChars: 200 })).toBe(
      "第一段说明，先交代修复背景。第二段说明，描述影响范围。第三段说明，给出处理方式。第四段说明，提醒重启服务。"
    );
  });

  it("长中文文本应保留到总量配置上限，并支持后续分段", () => {
    const source = "这是一个较长的测试输出。".repeat(40);
    const result = buildSpeakableTerminalText(source);
    const segments = splitSpeakableTextForTts(result);

    expect(Buffer.byteLength(result, "utf8")).toBeLessThanOrEqual(1500);
    expect(result.length).toBeLessThanOrEqual(500);
    expect(result.length).toBeGreaterThan(0);
    expect(segments.length).toBeGreaterThan(1);
    segments.forEach((segment: string) => {
      expect(Buffer.byteLength(segment, "utf8")).toBeLessThanOrEqual(240);
      expect(segment.length).toBeLessThanOrEqual(80);
    });
  });

  it("应支持按自定义总长度提取正文", () => {
    const source = "这是一个较长的测试输出。".repeat(40);
    const result = buildSpeakableTerminalText(source, { maxChars: 120 });

    expect(result.length).toBeLessThanOrEqual(120);
    expect(Buffer.byteLength(result, "utf8")).toBeLessThanOrEqual(360);
  });

  it("应支持去除 ANSI 并判断句子是否收束", () => {
    expect(stripTerminalAnsi("\u001b[32m请先检查配置。\u001b[0m")).toBe("请先检查配置。");
    expect(isSpeakableTextLikelyComplete("请先检查配置。")).toBe(true);
    expect(isSpeakableTextLikelyComplete("请先检查配置")).toBe(false);
  });
});
