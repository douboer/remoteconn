import { describe, expect, it } from "vitest";
import { inferAsrJsonFinal, parseLooseJsonPayloads } from "./upstreamPayload";

describe("parseLooseJsonPayloads", () => {
  it("支持标准 JSON 文本", () => {
    expect(parseLooseJsonPayloads('{"result":{"text":"你好"}}')).toEqual([{ result: { text: "你好" } }]);
  });

  it("支持 NDJSON 文本", () => {
    expect(parseLooseJsonPayloads('{"result":{"text":"a"}}\n{"result":{"text":"b"}}')).toEqual([
      { result: { text: "a" } },
      { result: { text: "b" } }
    ]);
  });

  it("支持 JSON 粘包文本", () => {
    expect(parseLooseJsonPayloads('{"result":{"text":"a"}}{"result":{"text":"b"}}')).toEqual([
      { result: { text: "a" } },
      { result: { text: "b" } }
    ]);
  });

  it("对明显非 JSON 内容返回空数组", () => {
    expect(parseLooseJsonPayloads("not-a-json-frame")).toEqual([]);
  });
});

describe("inferAsrJsonFinal", () => {
  it("识别根节点 final 标记", () => {
    expect(inferAsrJsonFinal({ is_final: true })).toBe(true);
  });

  it("识别嵌套状态完成标记", () => {
    expect(inferAsrJsonFinal({ result: { status: "completed" } })).toBe(true);
  });

  it("无完成标记时返回 false", () => {
    expect(inferAsrJsonFinal({ result: { text: "partial" } })).toBe(false);
  });
});
