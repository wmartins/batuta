import type { Limit, Quota, Scope, Storage, Window } from "batuta";

export const metrics = {
  credits: "credits",
  campaigns: "campaigns.active",
  briefCharacters: "brief.characters",
} as const;
export type DemoMetric = (typeof metrics)[keyof typeof metrics];
export type DemoScopeKey = "user" | "team";
export type UsageResult = Storage.Usage.Result<DemoMetric, DemoScopeKey>;

export type RollingUsage = {
  limit: Limit;
  used: number;
  window: Window.Value;
};

export type ActorUsage = {
  credits: {
    user: RollingUsage;
    team: RollingUsage;
  };
  campaigns: {
    limit: Limit;
    used: number;
  };
  brief: {
    limit: Limit;
    isConcreteOverride: boolean;
  };
};

export class DemoConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DemoConfigurationError";
  }
}

function one(
  results: readonly UsageResult[],
  predicate: (result: UsageResult) => boolean,
  description: string,
) {
  const result = results.find(predicate);
  if (!result) {
    throw new DemoConfigurationError(`Missing ${description} quota.`);
  }
  return result;
}

function rolling(result: UsageResult, description: string): RollingUsage {
  if (result.quota.type !== "rolling" || !("used" in result)) {
    throw new DemoConfigurationError(`${description} must be rolling.`);
  }
  return {
    limit: result.quota.limit,
    used: result.used,
    window: result.quota.window,
  };
}

export function deriveActorUsage(
  results: readonly UsageResult[],
  expected: { user: string; team: string },
): ActorUsage {
  const userCredits = one(
    results,
    (result) =>
      result.quota.metric === metrics.credits &&
      result.scope.key === "user" &&
      result.scope.value === expected.user,
    "user credits",
  );
  const teamCredits = one(
    results,
    (result) =>
      result.quota.metric === metrics.credits &&
      result.scope.key === "team" &&
      result.scope.value === expected.team,
    "team credits",
  );
  const campaigns = one(
    results,
    (result) =>
      result.quota.metric === metrics.campaigns &&
      result.scope.key === "user" &&
      result.scope.value === expected.user,
    "active campaigns",
  );
  const brief = one(
    results,
    (result) =>
      result.quota.metric === metrics.briefCharacters &&
      result.scope.key === "user" &&
      result.scope.value === expected.user,
    "brief characters",
  );
  if (campaigns.quota.type !== "balance" || !("used" in campaigns)) {
    throw new DemoConfigurationError("Active campaigns must be a balance.");
  }
  if (brief.quota.type !== "direct" || "used" in brief) {
    throw new DemoConfigurationError(
      "Brief characters must be a direct quota.",
    );
  }
  return {
    credits: {
      user: rolling(userCredits, "User credits"),
      team: rolling(teamCredits, "Team credits"),
    },
    campaigns: {
      limit: campaigns.quota.limit,
      used: campaigns.used,
    },
    brief: {
      limit: brief.quota.limit,
      isConcreteOverride: typeof brief.quota.scope === "object",
    },
  };
}

export type DemoQuota = Quota.Synthetic<DemoMetric, DemoScopeKey>;
export type DemoScope = Scope<DemoScopeKey>;
