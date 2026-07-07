import type { Storage } from "batuta";
import { describe, expect, it } from "vitest";

import {
  blockersForCost,
  DemoConfigurationError,
  type DemoScopeKey,
  deriveActorUsage,
} from "./demo-usage";

function result(
  key: DemoScopeKey,
  value: string,
  consumed: number,
  limit: number,
): Storage.Usage.Result<"credits", DemoScopeKey> {
  return {
    scope: { key, value },
    consumed,
    quota: {
      metric: "credits",
      scope: key,
      limit,
      window: { amount: 1, unit: "minute" },
    },
  };
}

describe("demo usage derivation", () => {
  it("maps user and team quotas independent of response ordering", () => {
    const usage = deriveActorUsage(
      [result("team", "lumen", 20, 30), result("user", "maya", 4, 12)],
      { user: "maya", team: "lumen" },
    );
    expect(usage.user.quotas[0].remaining).toBe(8);
    expect(usage.team.quotas[0].remaining).toBe(10);
  });

  it("clamps remaining credits and rendered percentages", () => {
    const usage = deriveActorUsage(
      [result("user", "maya", 14, 12), result("team", "lumen", 35, 30)],
      { user: "maya", team: "lumen" },
    );
    expect(usage.user.quotas[0]).toMatchObject({
      remaining: 0,
      percentage: 100,
    });
    expect(usage.team.quotas[0]).toMatchObject({
      remaining: 0,
      percentage: 100,
    });
  });

  it("allows equality and reports independent or combined blockers", () => {
    const usage = deriveActorUsage(
      [result("user", "maya", 9, 12), result("team", "lumen", 27, 30)],
      { user: "maya", team: "lumen" },
    );
    expect(blockersForCost(usage, 3)).toEqual([]);
    expect(blockersForCost(usage, 4)).toEqual(["user", "team"]);

    usage.team.quotas[0].consumed = 20;
    expect(blockersForCost(usage, 4)).toEqual(["user"]);
    usage.user.quotas[0].consumed = 2;
    usage.team.quotas[0].consumed = 28;
    expect(blockersForCost(usage, 3)).toEqual(["team"]);
  });

  it("rejects missing expected quota data", () => {
    expect(() =>
      deriveActorUsage([result("user", "maya", 0, 12)], {
        user: "maya",
        team: "lumen",
      }),
    ).toThrow(DemoConfigurationError);
  });
});
