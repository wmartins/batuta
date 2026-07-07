import type { Storage } from "batuta";
import { beforeAll, describe, expect, it, vi } from "vitest";

import type { DemoUsageDependencies } from "./demo-usage.server";

process.env.BATUTA_URL = "http://localhost:5173";
process.env.BATUTA_API_KEY =
  "batuta_live_00000000-0000-4000-8000-000000000000_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

let createDemoUsageService: typeof import("./demo-usage.server")["createDemoUsageService"];

beforeAll(async () => {
  ({ createDemoUsageService } = await import("./demo-usage.server"));
});

function quotaResult(
  key: "user" | "team",
  value: string,
  consumed = 0,
): Storage.Usage.Result<"credits", "user" | "team"> {
  return {
    scope: { key, value },
    consumed,
    quota: {
      metric: "credits",
      scope: key,
      limit: key === "user" ? 12 : 30,
      window: { amount: 1, unit: "minute" },
    },
  };
}

function dependencies(consumed = { user: 0, team: 0 }) {
  const check = vi.fn(async () => ({ exceeded: false }));
  const record = vi.fn(async () => undefined);
  const queryUsage = vi.fn(async () => ({
    evaluatedAt: "2026-07-07T12:00:00.000Z",
    results: [
      quotaResult("team", "lumen-studio", consumed.team),
      quotaResult("user", "lumen-studio:maya-chen", consumed.user),
    ],
  }));
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
  it("checks both scopes and records the operation cost to both", async () => {
    const deps = dependencies();
    const service = createDemoUsageService(deps.collaborators);
    const result = await service.attemptOperation({
      teamId: "lumen-studio",
      userId: "maya-chen",
      operationId: "storyboard-launch",
    });

    expect(result.status).toBe("success");
    expect(deps.check).toHaveBeenCalledWith({
      metric: "credits",
      scopes: [
        { key: "user", value: "lumen-studio:maya-chen" },
        { key: "team", value: "lumen-studio" },
      ],
    });
    expect(deps.record).toHaveBeenCalledWith(
      expect.objectContaining({ consumed: 3 }),
    );
  });

  it("does not record when check reports an exceeded quota", async () => {
    const deps = dependencies({ user: 12, team: 12 });
    deps.check.mockResolvedValue({ exceeded: true });
    const result = await createDemoUsageService(
      deps.collaborators,
    ).attemptOperation({
      teamId: "lumen-studio",
      userId: "maya-chen",
      operationId: "tune-tagline",
    });
    expect(result).toMatchObject({ status: "blocked", blockers: ["user"] });
    expect(deps.record).not.toHaveBeenCalled();
  });

  it("applies the prospective guard to either scope", async () => {
    const deps = dependencies({ user: 3, team: 29 });
    const result = await createDemoUsageService(
      deps.collaborators,
    ).attemptOperation({
      teamId: "lumen-studio",
      userId: "maya-chen",
      operationId: "storyboard-launch",
    });
    expect(result).toMatchObject({ status: "blocked", blockers: ["team"] });
    expect(deps.record).not.toHaveBeenCalled();
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
    expect(deps.queryUsage).not.toHaveBeenCalled();
  });

  it("maps transport failures to a safe result", async () => {
    const deps = dependencies();
    deps.check.mockRejectedValue(
      new Error("batuta_live_secret-that-must-not-be-returned"),
    );
    const result = await createDemoUsageService(
      deps.collaborators,
    ).attemptOperation({
      teamId: "lumen-studio",
      userId: "maya-chen",
      operationId: "tune-tagline",
    });
    expect(result).toEqual({
      status: "error",
      message: "The demo could not reach the managed API. Try again shortly.",
    });
    expect(JSON.stringify(result)).not.toContain("batuta_live_secret");
  });
});
