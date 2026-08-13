import { describe, expect, expectTypeOf, it } from "vitest";
import { Quota } from "./quota.js";

describe("Quota", () => {
  it("validates all three kinds with generic and concrete scopes", () => {
    expect(
      Quota.validate({
        type: "direct",
        metric: "prompt",
        scope: "user",
        limit: 100,
      }),
    ).toEqual({ type: "direct", metric: "prompt", scope: "user", limit: 100 });
    expect(
      Quota.validate({
        type: "balance",
        metric: "lessons",
        scope: { key: "user", value: "user-1" },
        limit: "unlimited",
      }),
    ).toMatchObject({ type: "balance", limit: "unlimited" });
    const rolling = Quota.validate({
      type: "rolling",
      metric: "credits",
      scope: "user",
      limit: 10,
      window: { amount: 1, unit: "week" },
    });
    expectTypeOf(rolling.type).toEqualTypeOf<"rolling">();
  });

  it.each([
    -1,
    Number.NaN,
    Number.POSITIVE_INFINITY,
  ])("rejects invalid limit %s", (limit) => {
    expect(() =>
      Quota.validate({
        type: "direct",
        metric: "credits",
        scope: "user",
        limit,
      }),
    ).toThrow(TypeError);
  });

  it("validates plain discriminated objects", () => {
    const quota = {
      type: "rolling",
      metric: "credits",
      scope: "user",
      limit: 10,
      window: { amount: 1, unit: "week" },
    } as const;
    expect(Quota.validate(quota)).toBe(quota);
  });
});
