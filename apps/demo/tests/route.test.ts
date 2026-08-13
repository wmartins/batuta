import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getActorUsage: vi.fn(async () => ({
    evaluatedAt: "2026-07-07T12:00:00.000Z",
    usage: {
      credits: {
        user: {
          limit: 12,
          used: 0,
          window: { amount: 1, unit: "minute" as const },
        },
        team: {
          limit: 30,
          used: 0,
          window: { amount: 1, unit: "minute" as const },
        },
      },
      campaigns: { limit: 2, used: 0 },
      brief: { limit: 4_000, isConcreteOverride: false },
    },
  })),
}));

vi.mock("~/lib/demo-usage.server", () => ({
  demoUsage: {
    getActorUsage: mocks.getActorUsage,
    attemptOperation: vi.fn(),
  },
}));

import { loader } from "../app/routes/_index";

describe("demo index loader", () => {
  it("falls back to a user belonging to the selected valid team", async () => {
    const args = {
      request: new Request(
        "http://localhost/?team=paper-plane-labs&user=maya-chen",
      ),
    } as Parameters<typeof loader>[0];
    const data = await loader(args);

    expect(data.team.id).toBe("paper-plane-labs");
    expect(data.user.id).toBe("ina-costa");
    expect(mocks.getActorUsage).toHaveBeenCalledWith(data.team, data.user);
  });

  it("returns no API credentials to the browser contract", async () => {
    const data = await loader({
      request: new Request("http://localhost/"),
    } as Parameters<typeof loader>[0]);

    expect(JSON.stringify(data)).not.toContain("BATUTA_API_KEY");
    expect(JSON.stringify(data)).not.toContain("batuta_live_");
  });
});
