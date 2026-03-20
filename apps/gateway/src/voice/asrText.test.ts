import { describe, expect, it } from "vitest";
import { extractAsrText } from "./asrText";

describe("extractAsrText", () => {
  it("支持 result.text 结构", () => {
    expect(
      extractAsrText({
        result: { text: "你好世界" }
      })
    ).toBe("你好世界");
  });

  it("支持 result 数组结构", () => {
    expect(
      extractAsrText({
        result: [{ text: "数组文本" }]
      })
    ).toBe("数组文本");
  });

  it("支持 utterances 结构", () => {
    expect(
      extractAsrText({
        result: { utterances: [{ text: "分句一" }, { text: "分句二" }] }
      })
    ).toBe("分句一");
  });

  it("支持 payload_msg.result 结构", () => {
    expect(
      extractAsrText({
        payload_msg: {
          result: [{ text: "包装字段文本" }]
        }
      })
    ).toBe("包装字段文本");
  });

  it("支持 alternatives.transcript 结构", () => {
    expect(
      extractAsrText({
        result: {
          alternatives: [{ transcript: "候选转写文本" }]
        }
      })
    ).toBe("候选转写文本");
  });

  it("支持嵌套 data.result.sentence 结构", () => {
    expect(
      extractAsrText({
        data: {
          result: {
            sentence: "嵌套句子文本"
          }
        }
      })
    ).toBe("嵌套句子文本");
  });

  it("无可识别文本时返回空串", () => {
    expect(extractAsrText({ result: [{ start_time: 1 }] })).toBe("");
  });
});
