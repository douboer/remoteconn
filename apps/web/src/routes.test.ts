import { describe, expect, it } from "vitest";
import { routes } from "./routes";

describe("routes", () => {
  it("包含关于页路由", () => {
    expect(routes.some((route) => route.path === "/about/:section?")).toBe(true);
  });
});
