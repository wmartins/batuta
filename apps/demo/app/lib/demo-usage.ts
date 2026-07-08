import type { Storage } from "batuta";

export const metric = "credits" as const;
export type DemoScopeKey = "user" | "team";
export type UsageResult = Storage.Usage.Result<typeof metric, DemoScopeKey>;

export type QuotaUsage = {
  limit: number;
  consumed: number;
  remaining: number;
  percentage: number;
  window: UsageResult["quota"]["window"];
};

export type ScopeUsage = {
  key: DemoScopeKey;
  value: string;
  quotas: QuotaUsage[];
};

export type ActorUsage = {
  user: ScopeUsage;
  team: ScopeUsage;
};

export class DemoConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DemoConfigurationError";
  }
}

function mapQuota(result: UsageResult): QuotaUsage {
  const remaining = Math.max(result.quota.limit - result.consumed, 0);
  const percentage =
    result.quota.limit === 0
      ? 100
      : Math.min(
          Math.max((result.consumed / result.quota.limit) * 100, 0),
          100,
        );
  return {
    limit: result.quota.limit,
    consumed: result.consumed,
    remaining,
    percentage,
    window: result.quota.window,
  };
}

export function deriveActorUsage(
  results: readonly UsageResult[],
  expected: { user: string; team: string },
): ActorUsage {
  const userResults = results.filter(
    (result) =>
      result.scope.key === "user" && result.scope.value === expected.user,
  );
  const teamResults = results.filter(
    (result) =>
      result.scope.key === "team" && result.scope.value === expected.team,
  );

  if (userResults.length === 0 || teamResults.length === 0) {
    throw new DemoConfigurationError(
      "The managed demo requires active user and team quotas. Run the server database seed.",
    );
  }

  return {
    user: {
      key: "user",
      value: expected.user,
      quotas: userResults.map(mapQuota),
    },
    team: {
      key: "team",
      value: expected.team,
      quotas: teamResults.map(mapQuota),
    },
  };
}

export function blockersForCost(
  usage: ActorUsage,
  cost: number,
): DemoScopeKey[] {
  return (["user", "team"] as const).filter((scope) =>
    usage[scope].quotas.some((quota) => quota.consumed + cost > quota.limit),
  );
}
