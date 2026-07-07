import { and, count, eq, inArray, isNull, sql } from "drizzle-orm";

import type { Database } from "../db.server";
import {
  metrics,
  scopes,
  usageBatches,
  usageEvents,
  workspaces,
} from "../schema.server";

export type UsageEventInsert = {
  metricId: string;
  scopeId: string;
  scopeValue: string;
  consumed: number;
};

export type UsageBatchInsert = {
  id: string;
  workspaceId: string;
  apiKeyId: string;
  idempotencyKey: string;
  requestHash: Buffer;
  occurredAt: Date;
  events: readonly UsageEventInsert[];
};

export type ActiveUsageBatchInsert = Omit<UsageBatchInsert, "events"> & {
  events: readonly {
    metric: string;
    scope: { key: string; value: string };
    consumed: number;
  }[];
};

export class InactiveUsageRegistryError extends Error {}

type UsageAggregationRow = {
  metricFound: boolean;
  scopesFound: boolean;
  quotaMetric: string | null;
  quotaScope: string | null;
  quotaLimit: number | null;
  windowAmount: number | null;
  windowUnit: "minute" | "hour" | "day" | "week" | null;
  scopeValue: string | null;
  consumed: number | null;
};

export function createUsageRepository(database: Database) {
  return {
    async queryUsage(
      workspaceId: string,
      metric: string,
      scopes: readonly { key: string; value: string }[],
      evaluatedAt: Date,
    ) {
      const requestedScopes = JSON.stringify(scopes);
      const result = await database.execute<UsageAggregationRow>(sql`
        WITH requested_scopes AS (
          SELECT key AS scope_key, value AS scope_value
          FROM jsonb_to_recordset(${requestedScopes}::jsonb)
            AS requested(key text, value text)
        ),
        active_metric AS (
          SELECT id, key
          FROM metrics
          WHERE workspace_id = ${workspaceId}
            AND key = ${metric}
            AND deleted_at IS NULL
        ),
        resolved_scopes AS (
          SELECT requested.scope_key, requested.scope_value, scope.id
          FROM requested_scopes requested
          LEFT JOIN scopes scope
            ON scope.workspace_id = ${workspaceId}
            AND scope.key = requested.scope_key
            AND scope.deleted_at IS NULL
        ),
        validity AS (
          SELECT
            EXISTS(SELECT 1 FROM active_metric) AS metric_found,
            NOT EXISTS(SELECT 1 FROM resolved_scopes WHERE id IS NULL)
              AS scopes_found
        ),
        aggregated AS (
          SELECT
            metric.key AS quota_metric,
            scope.scope_key AS quota_scope,
            quota.quota_limit,
            quota.window_amount,
            quota.window_unit,
            scope.scope_value,
            COALESCE(SUM(event.consumed), 0)::double precision AS consumed
          FROM active_metric metric
          JOIN resolved_scopes scope ON scope.id IS NOT NULL
          JOIN quotas quota
            ON quota.workspace_id = ${workspaceId}
            AND quota.metric_id = metric.id
            AND quota.scope_id = scope.id
            AND quota.deleted_at IS NULL
          LEFT JOIN usage_events event
            ON event.workspace_id = ${workspaceId}
            AND event.metric_id = metric.id
            AND event.scope_id = scope.id
            AND event.scope_value = scope.scope_value
            AND event.occurred_at > ${evaluatedAt}::timestamptz -
              quota.window_amount * CASE quota.window_unit
                WHEN 'minute' THEN 60
                WHEN 'hour' THEN 3600
                WHEN 'day' THEN 86400
                WHEN 'week' THEN 604800
              END * INTERVAL '1 second'
            AND event.occurred_at <= ${evaluatedAt}::timestamptz
          GROUP BY quota.id, metric.key, scope.scope_key, scope.scope_value
        )
        SELECT
          validity.metric_found AS "metricFound",
          validity.scopes_found AS "scopesFound",
          aggregated.quota_metric AS "quotaMetric",
          aggregated.quota_scope AS "quotaScope",
          aggregated.quota_limit AS "quotaLimit",
          aggregated.window_amount AS "windowAmount",
          aggregated.window_unit AS "windowUnit",
          aggregated.scope_value AS "scopeValue",
          aggregated.consumed
        FROM validity
        LEFT JOIN aggregated ON true
      `);
      return result.rows;
    },

    async findBatchByIdempotencyKey(
      workspaceId: string,
      idempotencyKey: string,
    ) {
      const [batch] = await database
        .select()
        .from(usageBatches)
        .where(
          and(
            eq(usageBatches.workspaceId, workspaceId),
            eq(usageBatches.idempotencyKey, idempotencyKey),
          ),
        )
        .limit(1);
      if (!batch) return undefined;
      const [eventCount] = await database
        .select({ value: count() })
        .from(usageEvents)
        .where(
          and(
            eq(usageEvents.workspaceId, workspaceId),
            eq(usageEvents.batchId, batch.id),
          ),
        );
      return { ...batch, recorded: eventCount.value };
    },

    async insertBatch(input: UsageBatchInsert) {
      return database.transaction(async (transaction) => {
        const [batch] = await transaction
          .insert(usageBatches)
          .values({
            id: input.id,
            workspaceId: input.workspaceId,
            apiKeyId: input.apiKeyId,
            idempotencyKey: input.idempotencyKey,
            requestHash: input.requestHash,
            occurredAt: input.occurredAt,
          })
          .returning();

        await transaction.insert(usageEvents).values(
          input.events.map((event) => ({
            workspaceId: input.workspaceId,
            batchId: input.id,
            metricId: event.metricId,
            scopeId: event.scopeId,
            scopeValue: event.scopeValue,
            consumed: event.consumed,
            occurredAt: input.occurredAt,
          })),
        );

        return batch;
      });
    },

    async insertActiveBatch(input: ActiveUsageBatchInsert) {
      return database.transaction(async (transaction) => {
        const [workspace] = await transaction
          .select({ id: workspaces.id })
          .from(workspaces)
          .where(
            and(
              eq(workspaces.id, input.workspaceId),
              isNull(workspaces.deletedAt),
            ),
          )
          .for("share");
        if (!workspace) throw new InactiveUsageRegistryError();

        const metricKeys = [
          ...new Set(input.events.map((event) => event.metric)),
        ];
        const scopeKeys = [
          ...new Set(input.events.map((event) => event.scope.key)),
        ];
        const activeMetrics = await transaction
          .select({ id: metrics.id, key: metrics.key })
          .from(metrics)
          .where(
            and(
              eq(metrics.workspaceId, input.workspaceId),
              inArray(metrics.key, metricKeys),
              isNull(metrics.deletedAt),
            ),
          )
          .for("share");
        const activeScopes = await transaction
          .select({ id: scopes.id, key: scopes.key })
          .from(scopes)
          .where(
            and(
              eq(scopes.workspaceId, input.workspaceId),
              inArray(scopes.key, scopeKeys),
              isNull(scopes.deletedAt),
            ),
          )
          .for("share");
        const metricIds = new Map(
          activeMetrics.map((row) => [row.key, row.id]),
        );
        const scopeIds = new Map(activeScopes.map((row) => [row.key, row.id]));
        if (
          metricIds.size !== metricKeys.length ||
          scopeIds.size !== scopeKeys.length
        ) {
          throw new InactiveUsageRegistryError();
        }

        const [batch] = await transaction
          .insert(usageBatches)
          .values({
            id: input.id,
            workspaceId: input.workspaceId,
            apiKeyId: input.apiKeyId,
            idempotencyKey: input.idempotencyKey,
            requestHash: input.requestHash,
            occurredAt: input.occurredAt,
          })
          .returning();
        await transaction.insert(usageEvents).values(
          input.events.map((event) => ({
            workspaceId: input.workspaceId,
            batchId: input.id,
            metricId: metricIds.get(event.metric) as string,
            scopeId: scopeIds.get(event.scope.key) as string,
            scopeValue: event.scope.value,
            consumed: event.consumed,
            occurredAt: input.occurredAt,
          })),
        );
        return batch;
      });
    },
  };
}
