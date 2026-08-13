import { and, count, eq, inArray, isNull, sql } from "drizzle-orm";

import type { Database } from "../db.server";
import {
  metrics,
  quotas,
  scopes,
  usageBatches,
  usageEvents,
  workspaces,
} from "../schema.server";

export type UsageEventInsert = {
  metricId: string;
  scopeId: string;
  scopeValue: string;
  amount: number;
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
    amount: number;
  }[];
};

export class InactiveUsageRegistryError extends Error {}
export class InvalidUsageEventError extends Error {
  constructor(
    message: string,
    readonly eventIndex: number,
    readonly code: string,
  ) {
    super(message);
  }
}

type UsageAggregationRow = {
  metricFound: boolean;
  scopesFound: boolean;
  quotaMetric: string | null;
  quotaScope: string | null;
  quotaScopeValue: string | null;
  quotaType: "direct" | "balance" | "rolling" | null;
  quotaLimit: number | null;
  windowAmount: number | null;
  windowUnit: "minute" | "hour" | "day" | "week" | null;
  scopeValue: string | null;
  used: number | null;
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
        effective_quotas AS (
          SELECT
            quota.id,
            metric.key AS quota_metric,
            scope.scope_key AS quota_scope,
            quota.scope_value AS quota_scope_value,
            quota.quota_type,
            quota.quota_limit,
            quota.window_amount,
            quota.window_unit,
            scope.scope_value
          FROM active_metric metric
          JOIN resolved_scopes scope ON scope.id IS NOT NULL
          JOIN quotas quota
            ON quota.workspace_id = ${workspaceId}
            AND quota.metric_id = metric.id
            AND quota.scope_id = scope.id
            AND quota.deleted_at IS NULL
            AND (quota.scope_value = scope.scope_value OR quota.scope_value IS NULL)
          WHERE quota.scope_value = scope.scope_value OR NOT EXISTS (
            SELECT 1 FROM quotas concrete
            WHERE concrete.workspace_id = quota.workspace_id
              AND concrete.metric_id = quota.metric_id
              AND concrete.scope_id = quota.scope_id
              AND concrete.scope_value = scope.scope_value
              AND concrete.deleted_at IS NULL
          )
        ),
        aggregated AS (
          SELECT quota.*,
            CASE quota.quota_type
              WHEN 'direct' THEN NULL
              WHEN 'balance' THEN COALESCE((
                SELECT SUM(event.amount) FROM usage_events event
                JOIN active_metric metric ON event.metric_id = metric.id
                JOIN resolved_scopes resolved ON event.scope_id = resolved.id
                  AND resolved.scope_key = quota.quota_scope
                  AND resolved.scope_value = quota.scope_value
                WHERE event.workspace_id = ${workspaceId}
                  AND event.scope_value = quota.scope_value
                  AND event.occurred_at <= ${evaluatedAt}::timestamptz
              ), 0)::double precision
              WHEN 'rolling' THEN COALESCE((
                SELECT SUM(event.amount) FROM usage_events event
                JOIN active_metric metric ON event.metric_id = metric.id
                JOIN resolved_scopes resolved ON event.scope_id = resolved.id
                  AND resolved.scope_key = quota.quota_scope
                  AND resolved.scope_value = quota.scope_value
                WHERE event.workspace_id = ${workspaceId}
                  AND event.scope_value = quota.scope_value
                  AND event.occurred_at > ${evaluatedAt}::timestamptz -
                    quota.window_amount * CASE quota.window_unit
                      WHEN 'minute' THEN 60 WHEN 'hour' THEN 3600
                      WHEN 'day' THEN 86400 WHEN 'week' THEN 604800
                    END * INTERVAL '1 second'
                  AND event.occurred_at <= ${evaluatedAt}::timestamptz
              ), 0)::double precision
            END AS used
          FROM effective_quotas quota
        )
        SELECT
          validity.metric_found AS "metricFound",
          validity.scopes_found AS "scopesFound",
          aggregated.quota_metric AS "quotaMetric",
          aggregated.quota_scope AS "quotaScope",
          aggregated.quota_scope_value AS "quotaScopeValue",
          aggregated.quota_type AS "quotaType",
          aggregated.quota_limit AS "quotaLimit",
          aggregated.window_amount AS "windowAmount",
          aggregated.window_unit AS "windowUnit",
          aggregated.scope_value AS "scopeValue",
          aggregated.used
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
            amount: event.amount,
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

        const identities = [
          ...new Set(
            input.events.map((event) =>
              JSON.stringify([
                input.workspaceId,
                metricIds.get(event.metric),
                scopeIds.get(event.scope.key),
                event.scope.value,
              ]),
            ),
          ),
        ].sort();
        for (const identity of identities) {
          await transaction.execute(
            sql`SELECT pg_advisory_xact_lock(hashtextextended(${identity}, 1))`,
          );
        }

        const pendingBalances = new Map<string, number>();
        for (const [index, event] of input.events.entries()) {
          const metricId = metricIds.get(event.metric) as string;
          const scopeId = scopeIds.get(event.scope.key) as string;
          const selector = and(
            eq(quotas.workspaceId, input.workspaceId),
            eq(quotas.metricId, metricId),
            eq(quotas.scopeId, scopeId),
            isNull(quotas.deletedAt),
          );
          const concrete = await transaction
            .select({ type: quotas.type })
            .from(quotas)
            .where(and(selector, eq(quotas.scopeValue, event.scope.value)))
            .for("share");
          const effective = concrete.length
            ? concrete
            : await transaction
                .select({ type: quotas.type })
                .from(quotas)
                .where(and(selector, isNull(quotas.scopeValue)))
                .for("share");
          if (effective.length === 0) {
            throw new InvalidUsageEventError(
              "Recording requires an effective quota.",
              index,
              "missing_quota",
            );
          }
          const type = effective[0]?.type;
          if (effective.some((quota) => quota.type !== type)) {
            throw new InvalidUsageEventError(
              "The effective quota configuration mixes quota kinds.",
              index,
              "invalid_quota_configuration",
            );
          }
          if (type === "direct") {
            throw new InvalidUsageEventError(
              "Direct quotas do not accept usage events.",
              index,
              "stateless_quota",
            );
          }
          if (type === "rolling" && event.amount <= 0) {
            throw new InvalidUsageEventError(
              "Rolling usage amounts must be greater than zero.",
              index,
              "invalid_amount",
            );
          }
          if (type === "balance") {
            const identity = JSON.stringify([
              input.workspaceId,
              metricId,
              scopeId,
              event.scope.value,
            ]);
            let current = pendingBalances.get(identity);
            if (current === undefined) {
              const result = await transaction.execute<{ used: number }>(sql`
                SELECT COALESCE(SUM(${usageEvents.amount}), 0)::double precision AS used
                FROM ${usageEvents}
                WHERE ${usageEvents.workspaceId} = ${input.workspaceId}
                  AND ${usageEvents.metricId} = ${metricId}
                  AND ${usageEvents.scopeId} = ${scopeId}
                  AND ${usageEvents.scopeValue} = ${event.scope.value}
                  AND ${usageEvents.occurredAt} <= ${input.occurredAt}
              `);
              current = result.rows[0]?.used ?? 0;
            }
            const projected = current + event.amount;
            if (projected < 0) {
              throw new InvalidUsageEventError(
                "The balance change would produce a negative balance.",
                index,
                "balance_underflow",
              );
            }
            pendingBalances.set(identity, projected);
          }
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
            amount: event.amount,
            occurredAt: input.occurredAt,
          })),
        );
        return batch;
      });
    },
  };
}
