import type { Storage } from "batuta";
import { describe, expect, it } from "vitest";

import {
  DemoConfigurationError,
  type DemoMetric,
  type DemoScopeKey,
  deriveActorUsage,
} from "./demo-usage";

type Result = Storage.Usage.Result<DemoMetric, DemoScopeKey>;

function results(concreteBrief = false): Result[] {
  return [
    {
      scope: { key: "team", value: "lumen" },
      used: 20,
      quota: {
        type: "rolling",
        metric: "credits",
        scope: "team",
        limit: 30,
        window: { amount: 1, unit: "minute" },
      },
    },
    {
      scope: { key: "user", value: "maya" },
      used: 4,
      quota: {
        type: "rolling",
        metric: "credits",
        scope: "user",
        limit: 12,
        window: { amount: 1, unit: "minute" },
      },
    },
    {
      scope: { key: "user", value: "maya" },
      used: 1,
      quota: {
        type: "balance",
        metric: "campaigns.active",
        scope: "user",
        limit: 2,
      },
    },
    {
      scope: { key: "user", value: "maya" },
      quota: {
        type: "direct",
        metric: "brief.characters",
        scope: concreteBrief ? { key: "user", value: "maya" } : "user",
        limit: concreteBrief ? 8_000 : 4_000,
      },
    },
  ];
}

describe("demo usage derivation", () => {
  it("maps all three kinds independent of response ordering", () => {
    const usage = deriveActorUsage(results(true).reverse(), {
      user: "maya",
      team: "lumen",
    });
    expect(usage).toMatchObject({
      credits: { user: { used: 4 }, team: { used: 20 } },
      campaigns: { used: 1, limit: 2 },
      brief: { limit: 8_000, isConcreteOverride: true },
    });
  });

  it("distinguishes a generic direct quota", () => {
    expect(
      deriveActorUsage(results(), { user: "maya", team: "lumen" }).brief,
    ).toEqual({ limit: 4_000, isConcreteOverride: false });
  });

  it("rejects missing quota data", () => {
    expect(() =>
      deriveActorUsage(results().slice(0, 2), {
        user: "maya",
        team: "lumen",
      }),
    ).toThrow(DemoConfigurationError);
  });
});
