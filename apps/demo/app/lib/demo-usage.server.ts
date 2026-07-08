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
  blockersForCost,
  type DemoScopeKey,
  deriveActorUsage,
  metric,
  type UsageResult,
} from "./demo-usage";
import { env } from "./env.server";

export type OperationResult =
  | { status: "success"; message: string }
  | {
      status: "blocked";
      message: string;
      blockers: DemoScopeKey[];
    }
  | { status: "error"; message: string; requestId?: string };

type BatutaLike = {
  check(input: {
    metric: typeof metric;
    scopes: { key: DemoScopeKey; value: string }[];
  }): Promise<{ exceeded: boolean }>;
  record(input: {
    metric: typeof metric;
    scopes: { key: DemoScopeKey; value: string }[];
    consumed: number;
  }): Promise<void>;
};

type ClientLike = Pick<BatutaClient, "queryUsage">;

export type DemoUsageDependencies = {
  batuta: BatutaLike;
  client: ClientLike;
};

function actorScopes(team: DemoTeam, user: DemoUser) {
  return [
    { key: "user" as const, value: user.scopeValue },
    { key: "team" as const, value: team.scopeValue },
  ];
}

function safeFailure(error: unknown): OperationResult {
  if (error instanceof BatutaApiError) {
    return {
      status: "error",
      message:
        "The managed API rejected the request. Rerun the server seed and demo credential setup, then try again.",
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

function blockedResult(blockers: DemoScopeKey[]): OperationResult {
  const label = blockers.length === 2 ? "user and team" : blockers[0];
  return {
    status: "blocked",
    blockers,
    message: `This operation would exceed the ${label} quota.`,
  };
}

export function createDemoUsageService(dependencies: DemoUsageDependencies) {
  async function queryActorUsage(team: DemoTeam, user: DemoUser) {
    const response = await dependencies.client.queryUsage({
      metric,
      scopes: actorScopes(team, user),
    });
    return {
      evaluatedAt: response.evaluatedAt,
      usage: deriveActorUsage(response.results as UsageResult[], {
        user: user.scopeValue,
        team: team.scopeValue,
      }),
    };
  }

  return {
    async getActorUsage(
      team: DemoTeam,
      user: DemoUser,
    ): Promise<{
      evaluatedAt: string;
      usage: ActorUsage;
    }> {
      return queryActorUsage(team, user);
    },

    async attemptOperation(input: {
      teamId: string;
      userId: string;
      operationId: string;
    }): Promise<OperationResult> {
      const team = findTeam(input.teamId);
      const user = team && findUserForTeam(team, input.userId);
      const operation: DemoOperation | undefined = findOperation(
        input.operationId,
      );
      if (!team || !user || !operation) {
        return {
          status: "error",
          message: "Choose a valid team, user, and operation.",
        };
      }

      const scopes = actorScopes(team, user);
      try {
        const check = await dependencies.batuta.check({ metric, scopes });
        const snapshot = await queryActorUsage(team, user);
        const prospectiveBlockers = blockersForCost(
          snapshot.usage,
          operation.cost,
        );
        if (check.exceeded || prospectiveBlockers.length > 0) {
          const blockers = prospectiveBlockers.length
            ? prospectiveBlockers
            : (["user", "team"] as DemoScopeKey[]);
          return blockedResult(blockers);
        }

        await dependencies.batuta.record({
          metric,
          scopes,
          consumed: operation.cost,
        });
        return {
          status: "success",
          message: `${operation.name} spent ${operation.cost} ${operation.cost === 1 ? "credit" : "credits"}.`,
        };
      } catch (error) {
        return safeFailure(error);
      }
    },
  };
}

const storage = new BatutaStorage<typeof metric, DemoScopeKey>({
  baseUrl: env.BATUTA_URL,
  apiKey: env.BATUTA_API_KEY,
});
const batuta = new Batuta({ storage });

export const demoUsage = createDemoUsageService({
  batuta,
  client: storage.client,
});
