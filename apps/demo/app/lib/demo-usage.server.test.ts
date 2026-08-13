import { beforeAll, describe, expect, it, vi } from "vitest";

import { teams } from "./demo-fixtures";
import type { DemoUsageDependencies } from "./demo-usage.server";

process.env.BATUTA_URL = "http://localhost:5173";
process.env.BATUTA_API_KEY =
  "batuta_live_00000000-0000-4000-8000-000000000000_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

let createDemoUsageService: typeof import("./demo-usage.server")["createDemoUsageService"];

beforeAll(async () => {
  ({ createDemoUsageService } = await import("./demo-usage.server"));
});

function dependencies() {
  const check = vi.fn<DemoUsageDependencies["batuta"]["check"]>(async () => ({
    exceeded: false,
  }));
  const record = vi.fn<DemoUsageDependencies["batuta"]["record"]>(
    async () => undefined,
  );
  const queryUsage = vi.fn<DemoUsageDependencies["client"]["queryUsage"]>(
    async (input) => ({
      evaluatedAt: "2026-07-07T12:00:00.000Z",
      results:
        input.metric === "credits"
          ? [
              {
                scope: { key: "user", value: "lumen-studio:maya-chen" },
                used: 0,
                quota: {
                  type: "rolling",
                  metric: "credits",
                  scope: "user",
                  limit: 12,
                  window: { amount: 1, unit: "minute" },
                },
              },
              {
                scope: { key: "team", value: "lumen-studio" },
                used: 0,
                quota: {
                  type: "rolling",
                  metric: "credits",
                  scope: "team",
                  limit: 30,
                  window: { amount: 1, unit: "minute" },
                },
              },
            ]
          : input.metric === "campaigns.active"
            ? [
                {
                  scope: { key: "user", value: "lumen-studio:maya-chen" },
                  used: 0,
                  quota: {
                    type: "balance",
                    metric: "campaigns.active",
                    scope: "user",
                    limit: 2,
                  },
                },
              ]
            : [
                {
                  scope: { key: "user", value: "lumen-studio:maya-chen" },
                  quota: {
                    type: "direct",
                    metric: "brief.characters",
                    scope: {
                      key: "user",
                      value: "lumen-studio:maya-chen",
                    },
                    limit: 8_000,
                  },
                },
              ],
    }),
  );
  return {
    collaborators: {
      batuta: { check, record },
      client: { queryUsage },
    } satisfies DemoUsageDependencies,
    check,
    record,
    queryUsage,
  };
}

describe("demo usage service", () => {
  it("queries rolling, balance, and direct quota snapshots", async () => {
    const deps = dependencies();
    const snapshot = await createDemoUsageService(
      deps.collaborators,
    ).getActorUsage(teams[0], teams[0].users[0]);
    expect(deps.queryUsage).toHaveBeenCalledTimes(3);
    expect(snapshot.usage.brief).toEqual({
      limit: 8_000,
      isConcreteOverride: true,
    });
  });

  it("checks and records every rule required by a campaign launch", async () => {
    const deps = dependencies();
    const result = await createDemoUsageService(
      deps.collaborators,
    ).attemptOperation({
      teamId: "lumen-studio",
      userId: "maya-chen",
      operationId: "storyboard-launch",
    });
    expect(result.status).toBe("success");
    expect(deps.check.mock.calls.map(([input]) => input.metric)).toEqual([
      "credits",
      "brief.characters",
      "campaigns.active",
    ]);
    expect(
      deps.record.mock.calls.map(([input]) => [input.metric, input.amount]),
    ).toEqual([
      ["credits", 3],
      ["campaigns.active", 1],
    ]);
  });

  it("reports the independent rule that blocked an operation", async () => {
    const deps = dependencies();
    deps.check.mockImplementation(async (input) => ({
      exceeded: input.metric === "brief.characters",
    }));
    const result = await createDemoUsageService(
      deps.collaborators,
    ).attemptOperation({
      teamId: "lumen-studio",
      userId: "theo-brooks",
      operationId: "render-campaign-film",
    });
    expect(result).toMatchObject({
      status: "blocked",
      rules: ["creative brief size"],
    });
    expect(deps.record).not.toHaveBeenCalled();
  });

  it("archives by recording a negative balance without direct or rolling events", async () => {
    const deps = dependencies();
    const result = await createDemoUsageService(
      deps.collaborators,
    ).attemptOperation({
      teamId: "lumen-studio",
      userId: "maya-chen",
      operationId: "archive-campaign",
    });
    expect(result.status).toBe("success");
    expect(deps.check).not.toHaveBeenCalled();
    expect(deps.record).toHaveBeenCalledWith({
      metric: "campaigns.active",
      scopes: [{ key: "user", value: "lumen-studio:maya-chen" }],
      amount: -1,
    });
  });

  it("rejects fixture mismatches before network access", async () => {
    const deps = dependencies();
    const result = await createDemoUsageService(
      deps.collaborators,
    ).attemptOperation({
      teamId: "paper-plane-labs",
      userId: "maya-chen",
      operationId: "tune-tagline",
    });
    expect(result.status).toBe("error");
    expect(deps.check).not.toHaveBeenCalled();
  });
});
