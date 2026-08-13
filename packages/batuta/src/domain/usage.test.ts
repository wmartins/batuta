import { describe, expect, it } from "vitest";
import { Usage } from "./usage.js";

describe("Usage.validate", () => {
  it.each([1, -1])("returns valid signed usage %s", (amount) => {
    const usage = {
      metric: "credits",
      scope: { key: "user", value: "user-1" },
      amount,
      occurredAt: new Date(),
    };
    expect(Usage.validate(usage)).toBe(usage);
  });

  it.each([
    0,
    Number.NaN,
    Number.POSITIVE_INFINITY,
  ])("rejects invalid amount %s", (amount) => {
    expect(() =>
      Usage.validate({
        metric: "credits",
        scope: { key: "user", value: "user-1" },
        amount,
        occurredAt: new Date(),
      }),
    ).toThrow(TypeError);
  });
});
