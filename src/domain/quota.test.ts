import { describe, expect, it } from "vitest";
import { Quota } from "./quota.js";

describe("Quota.validate", () => {
  it("returns a valid quota", () => {
    const quota = {
      metric: "credits",
      scope: "user",
      limit: 10,
      window: { amount: 1, unit: "week" },
    } as const;
    expect(Quota.validate(quota)).toBe(quota);
  });

  it("rejects a negative limit", () => {
    expect(() =>
      Quota.validate({
        metric: "credits",
        scope: "user",
        limit: -1,
        window: { amount: 1, unit: "week" },
      }),
    ).toThrow(TypeError);
  });
});
