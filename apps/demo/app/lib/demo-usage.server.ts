import {
  BatutaApiError,
  type BatutaClient,
  BatutaStorage,
  BatutaTimeoutError,
} from "@batuta/remote";
import { Batuta } from "batuta";

import {
  type DemoOperation,
  type DemoTeam,
  type DemoUser,
  findOperation,
  findTeam,
  findUserForTeam,
} from "./demo-fixtures";
import {
  type ActorUsage,
  type DemoMetric,
  type DemoScope,
  deriveActorUsage,
  metrics,
  type UsageResult,
} from "./demo-usage";
import { env } from "./env.server";

export type OperationResult =
  | { status: "success"; message: string }
  | { status: "blocked"; message: string; rules: string[] }
  | { status: "error"; message: string; requestId?: string };

type BatutaLike = {
  check(input: {
    metric: DemoMetric;
    scopes: DemoScope[];
    amount: number;
  }): Promise<{ exceeded: boolean }>;
  record(input: {
    metric: DemoMetric;
    scopes: DemoScope[];
    amount: number;
  }): Promise<void>;
};

type ClientLike = Pick<BatutaClient, "queryUsage">;

export type DemoUsageDependencies = {
  batuta: BatutaLike;
  client: ClientLike;
};

function userScope(user: DemoUser): DemoScope {
  return { key: "user", value: user.scopeValue };
}

function actorScopes(team: DemoTeam, user: DemoUser): DemoScope[] {
  return [userScope(user), { key: "team", value: team.scopeValue }];
}

function safeFailure(error: unknown): OperationResult {
  if (error instanceof BatutaApiError) {
    const underflow = error.problem?.errors?.some(
      (item) => item.code === "balance_underflow",
    );
    if (underflow) {
      return {
        status: "blocked",
        rules: ["active campaigns"],
        message: "There is no active campaign to archive.",
      };
    }
    return {
      status: "error",
      message:
        "The managed API rejected the request. Rerun the server seed and demo setup, then try again.",
      ...(error.requestId ? { requestId: error.requestId } : {}),
    };
  }
  if (error instanceof BatutaTimeoutError) {
    return {
      status: "error",
      message: "The managed API did not respond in time. Try again shortly.",
    };
  }
  return {
    status: "error",
    message: "The demo could not reach the managed API. Try again shortly.",
  };
}

function checksFor(operation: DemoOperation, team: DemoTeam, user: DemoUser) {
  const checks: {
    rule: string;
    metric: DemoMetric;
    scopes: DemoScope[];
    amount: number;
  }[] = [];
  if (operation.credits > 0) {
    checks.push({
      rule: "rolling creative credits",
      metric: metrics.credits,
      scopes: actorScopes(team, user),
      amount: operation.credits,
    });
  }
  if (operation.briefCharacters > 0) {
    checks.push({
      rule: "creative brief size",
      metric: metrics.briefCharacters,
      scopes: [userScope(user)],
      amount: operation.briefCharacters,
    });
  }
  if (operation.campaignChange > 0) {
    checks.push({
      rule: "active campaigns",
      metric: metrics.campaigns,
      scopes: [userScope(user)],
      amount: operation.campaignChange,
    });
  }
  return checks;
}

export function createDemoUsageService(dependencies: DemoUsageDependencies) {
  async function queryActorUsage(team: DemoTeam, user: DemoUser) {
    const scopes = actorScopes(team, user);
    const responses = await Promise.all([
      dependencies.client.queryUsage({ metric: metrics.credits, scopes }),
      dependencies.client.queryUsage({
        metric: metrics.campaigns,
        scopes: [userScope(user)],
      }),
      dependencies.client.queryUsage({
        metric: metrics.briefCharacters,
        scopes: [userScope(user)],
      }),
    ]);
    return {
      evaluatedAt: responses[0].evaluatedAt,
      usage: deriveActorUsage(
        responses.flatMap((response) => response.results) as UsageResult[],
        { user: user.scopeValue, team: team.scopeValue },
      ),
    };
  }

  return {
    async getActorUsage(
      team: DemoTeam,
      user: DemoUser,
    ): Promise<{ evaluatedAt: string; usage: ActorUsage }> {
      return queryActorUsage(team, user);
    },

    async attemptOperation(input: {
      teamId: string;
      userId: string;
      operationId: string;
    }): Promise<OperationResult> {
      const team = findTeam(input.teamId);
      const user = team && findUserForTeam(team, input.userId);
      const operation = findOperation(input.operationId);
      if (!team || !user || !operation) {
        return {
          status: "error",
          message: "Choose a valid team, user, and operation.",
        };
      }

      try {
        const checks = checksFor(operation, team, user);
        const decisions = await Promise.all(
          checks.map((check) => dependencies.batuta.check(check)),
        );
        const rules = checks.flatMap((check, index) =>
          decisions[index]?.exceeded ? [check.rule] : [],
        );
        if (rules.length > 0) {
          return {
            status: "blocked",
            rules,
            message: `This operation would exceed ${rules.join(" and ")}.`,
          };
        }

        const recordings: Promise<void>[] = [];
        if (operation.credits > 0) {
          recordings.push(
            dependencies.batuta.record({
              metric: metrics.credits,
              scopes: actorScopes(team, user),
              amount: operation.credits,
            }),
          );
        }
        if (operation.campaignChange !== 0) {
          recordings.push(
            dependencies.batuta.record({
              metric: metrics.campaigns,
              scopes: [userScope(user)],
              amount: operation.campaignChange,
            }),
          );
        }
        await Promise.all(recordings);
        return {
          status: "success",
          message:
            operation.campaignChange < 0
              ? "One campaign was archived and its balance released."
              : `${operation.name} completed through Batuta's quota checks.`,
        };
      } catch (error) {
        return safeFailure(error);
      }
    },
  };
}

const storage = new BatutaStorage<DemoMetric, DemoScope["key"]>({
  baseUrl: env.BATUTA_URL,
  apiKey: env.BATUTA_API_KEY,
});
const batuta = new Batuta({ storage });

export const demoUsage = createDemoUsageService({
  batuta,
  client: storage.client,
});
