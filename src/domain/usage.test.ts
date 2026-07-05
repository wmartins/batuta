import { describe, expect, it } from "vitest";
import { Usage } from "./usage.js";

describe("Usage.validate", () => {
  it("returns valid synthetic usage", () => {
    const usage = {
      metric: "credits",
      scope: { key: "user", value: "user-1" },
      consumed: 1,
      occurredAt: new Date(),
    };
    expect(Usage.validate(usage)).toBe(usage);
  });

  it("rejects non-positive consumption", () => {
    const usage = {
      metric: "credits",
      scope: { key: "user", value: "user-1" },
      consumed: 0,
      occurredAt: new Date(),
    };
    expect(() => Usage.validate(usage)).toThrow(TypeError);
  });
});
