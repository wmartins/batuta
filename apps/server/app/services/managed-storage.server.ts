import { randomUUID } from "node:crypto";
import { Metric, Quota, Scope, Usage } from "batuta";

import type { Database } from "../data/db.server";
import {
  createUsageRepository,
  InactiveUsageRegistryError,
} from "../data/repositories/usage.repository.server";

const REGISTRY_KEY = /^[a-z][a-z0-9._-]*$/;

export class ManagedStorageValidationError extends Error {
  constructor(
    message: string,
    readonly path: string,
    readonly code: string,
  ) {
    super(message);
  }
}

export class IdempotencyConflictError extends Error {}

function hasPostgresCode(error: unknown, code: string) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "cause" in error &&
      error.cause &&
      typeof error.cause === "object" &&
      "code" in error.cause &&
      error.cause.code === code,
  );
}

function validateRegistryKey(value: string, path: string) {
  if (value.length < 1 || value.length > 63 || !REGISTRY_KEY.test(value)) {
    throw new ManagedStorageValidationError(
      "Must be a registered key of 1 to 63 characters.",
      path,
      "invalid_registry_key",
    );
  }
  Metric.validate(value);
}

export function createManagedStorageService(database: Database) {
  const usage = createUsageRepository(database);
  return {
    async replay(input: {
      workspaceId: string;
      idempotencyKey: string;
      requestHash: Buffer;
    }) {
      const existing = await usage.findBatchByIdempotencyKey(
        input.workspaceId,
        input.idempotencyKey,
      );
      if (!existing) return undefined;
      if (!existing.requestHash.equals(input.requestHash)) {
        throw new IdempotencyConflictError();
      }
      return {
        batchId: existing.id,
        recorded: existing.recorded,
        occurredAt: existing.occurredAt,
        replayed: true as const,
      };
    },

    async query(input: {
      workspaceId: string;
      metric: string;
      scopes: readonly { key: string; value: string }[];
      evaluatedAt: Date;
    }) {
      validateRegistryKey(input.metric, "/metric");
      if (input.scopes.length < 1 || input.scopes.length > 100) {
        throw new ManagedStorageValidationError(
          "Scopes must contain between 1 and 100 items.",
          "/scopes",
          "invalid_array_size",
        );
      }
      const seen = new Set<string>();
      for (const [index, scope] of input.scopes.entries()) {
        validateRegistryKey(scope.key, `/scopes/${index}/key`);
        Scope.validate(scope, `scopes[${index}]`);
        if (scope.value.length > 512) {
          throw new ManagedStorageValidationError(
            "Scope values must contain at most 512 characters.",
            `/scopes/${index}/value`,
            "too_big",
          );
        }
        const identity = JSON.stringify([scope.key, scope.value]);
        if (seen.has(identity)) {
          throw new ManagedStorageValidationError(
            "Duplicate scope key/value pairs are not allowed.",
            `/scopes/${index}`,
            "duplicate",
          );
        }
        seen.add(identity);
      }

      const rows = await usage.queryUsage(
        input.workspaceId,
        input.metric,
        input.scopes,
        input.evaluatedAt,
      );
      const validity = rows[0];
      if (!validity?.metricFound) {
        throw new ManagedStorageValidationError(
          "The metric is not active in this workspace.",
          "/metric",
          "unknown_registry_key",
        );
      }
      if (!validity.scopesFound) {
        throw new ManagedStorageValidationError(
          "One or more scopes are not active in this workspace.",
          "/scopes",
          "unknown_registry_key",
        );
      }

      return rows.flatMap((row) => {
        if (
          row.quotaMetric === null ||
          row.quotaScope === null ||
          row.quotaLimit === null ||
          row.windowAmount === null ||
          row.windowUnit === null ||
          row.scopeValue === null ||
          row.consumed === null
        ) {
          return [];
        }
        return [
          {
            quota: Quota.validate({
              metric: row.quotaMetric,
              scope: row.quotaScope,
              limit: row.quotaLimit,
              window: { amount: row.windowAmount, unit: row.windowUnit },
            }),
            scope: Scope.validate(
              { key: row.quotaScope, value: row.scopeValue },
              "scope",
            ),
            consumed: row.consumed,
          },
        ];
      });
    },

    async record(input: {
      workspaceId: string;
      apiKeyId: string;
      idempotencyKey: string;
      requestHash: Buffer;
      events: readonly {
        metric: string;
        scope: { key: string; value: string };
        consumed: number;
      }[];
      occurredAt: Date;
    }) {
      const replay = await this.replay(input);
      if (replay) return replay;
      if (input.events.length < 1 || input.events.length > 100) {
        throw new ManagedStorageValidationError(
          "Events must contain between 1 and 100 items.",
          "/events",
          "invalid_array_size",
        );
      }
      for (const [index, event] of input.events.entries()) {
        validateRegistryKey(event.metric, `/events/${index}/metric`);
        validateRegistryKey(event.scope.key, `/events/${index}/scope/key`);
        if (event.scope.value.length > 512) {
          throw new ManagedStorageValidationError(
            "Scope values must contain at most 512 characters.",
            `/events/${index}/scope/value`,
            "too_big",
          );
        }
        try {
          Usage.validate({ ...event, occurredAt: input.occurredAt });
        } catch {
          throw new ManagedStorageValidationError(
            "The usage event is invalid.",
            `/events/${index}`,
            "invalid_usage",
          );
        }
      }

      const id = randomUUID();
      try {
        const batch = await usage.insertActiveBatch({ ...input, id });
        return {
          batchId: batch.id,
          recorded: input.events.length,
          occurredAt: batch.occurredAt,
          replayed: false,
        };
      } catch (error) {
        if (error instanceof InactiveUsageRegistryError) {
          throw new ManagedStorageValidationError(
            "One or more metrics or scopes are not active in this workspace.",
            "/events",
            "unknown_registry_key",
          );
        }
        if (hasPostgresCode(error, "23505")) {
          const winner = await usage.findBatchByIdempotencyKey(
            input.workspaceId,
            input.idempotencyKey,
          );
          if (winner?.requestHash.equals(input.requestHash)) {
            return {
              batchId: winner.id,
              recorded: winner.recorded,
              occurredAt: winner.occurredAt,
              replayed: true,
            };
          }
          throw new IdempotencyConflictError();
        }
        throw error;
      }
    },
  };
}
