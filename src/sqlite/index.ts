import { DatabaseSync } from "node:sqlite";
import {
  type Metric,
  Quota,
  Scope,
  type Storage,
  type Usage,
} from "../domain/index.js";

export type SQLite3StorageOptions =
  | { database: DatabaseSync }
  | { filename: string };

type UsageRow = {
  quotaMetric: string;
  quotaScope: string;
  quotaLimit: number;
  windowAmount: number;
  windowUnit: Quota.Synthetic<string, string>["window"]["unit"];
  scopeValue: string;
  consumed: number;
};

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS quotas (
    id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
    metric TEXT NOT NULL CHECK (length(metric) > 0),
    scope_key TEXT NOT NULL CHECK (length(scope_key) > 0),
    quota_limit REAL NOT NULL CHECK (
      quota_limit >= 0 AND quota_limit <= 1.7976931348623157e308
    ),
    window_amount INTEGER NOT NULL CHECK (window_amount > 0),
    window_unit TEXT NOT NULL CHECK (
      window_unit IN ('minute', 'hour', 'day', 'week')
    )
  ) STRICT;

  CREATE TABLE IF NOT EXISTS usage (
    id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
    metric TEXT NOT NULL CHECK (length(metric) > 0),
    scope_key TEXT NOT NULL CHECK (length(scope_key) > 0),
    scope_value TEXT NOT NULL CHECK (length(scope_value) > 0),
    consumed REAL NOT NULL CHECK (
      consumed > 0 AND consumed <= 1.7976931348623157e308
    ),
    occurred_at INTEGER NOT NULL
  ) STRICT;

  CREATE INDEX IF NOT EXISTS usage_lookup_idx
  ON usage (metric, scope_key, scope_value, occurred_at);
`;

export class SQLite3Storage<
  MetricName extends Metric<string>,
  ScopeKey extends Scope<string>["key"],
> implements Storage<MetricName, ScopeKey>
{
  readonly database: DatabaseSync;

  constructor(options: SQLite3StorageOptions) {
    this.database =
      "database" in options
        ? options.database
        : new DatabaseSync(options.filename);
  }

  async initialize(): Promise<void> {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.database.exec(SCHEMA);
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  async usage(
    input: Storage.Usage.Input<MetricName, ScopeKey>,
  ): Promise<Storage.Usage.Result<MetricName, ScopeKey>[]> {
    const values = input.scopes
      .map((_, index) => `(:scope_key_${index}, :scope_value_${index})`)
      .join(", ");
    const at = input.at.getTime();
    const parameters: Record<string, string | number> = {
      ":metric": input.metric,
      ":at": at,
    };
    for (const [index, scope] of input.scopes.entries()) {
      parameters[`:scope_key_${index}`] = scope.key;
      parameters[`:scope_value_${index}`] = scope.value;
    }

    const rows = this.database
      .prepare(`
        WITH requested_scopes(scope_key, scope_value) AS (VALUES ${values})
        SELECT
          quota.metric AS quotaMetric,
          quota.scope_key AS quotaScope,
          quota.quota_limit AS quotaLimit,
          quota.window_amount AS windowAmount,
          quota.window_unit AS windowUnit,
          requested.scope_value AS scopeValue,
          COALESCE(SUM(event.consumed), 0) AS consumed
        FROM quotas AS quota
        JOIN requested_scopes AS requested
          ON requested.scope_key = quota.scope_key
        LEFT JOIN usage AS event
          ON event.metric = quota.metric
          AND event.scope_key = requested.scope_key
          AND event.scope_value = requested.scope_value
          AND event.occurred_at > :at
            - quota.window_amount
            * CASE quota.window_unit
                WHEN 'minute' THEN 60000
                WHEN 'hour' THEN 3600000
                WHEN 'day' THEN 86400000
                WHEN 'week' THEN 604800000
              END
          AND event.occurred_at <= :at
        WHERE quota.metric = :metric
        GROUP BY quota.id, requested.scope_key, requested.scope_value
      `)
      .all(parameters) as UsageRow[];

    return rows.map((row) => {
      const quota = Quota.validate({
        metric: row.quotaMetric as MetricName,
        scope: row.quotaScope as ScopeKey,
        limit: row.quotaLimit,
        window: { amount: row.windowAmount, unit: row.windowUnit },
      });
      return {
        quota,
        scope: Scope.validate(
          {
            key: row.quotaScope as ScopeKey,
            value: row.scopeValue,
          },
          "scope",
        ),
        consumed: row.consumed,
      };
    });
  }

  async record(
    usages: readonly Usage.Synthetic<MetricName, ScopeKey>[],
  ): Promise<void> {
    if (usages.length === 0) {
      return;
    }

    const statement = this.database.prepare(`
      INSERT INTO usage
        (metric, scope_key, scope_value, consumed, occurred_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    this.database.exec("BEGIN IMMEDIATE");
    try {
      for (const usage of usages) {
        statement.run(
          usage.metric,
          usage.scope.key,
          usage.scope.value,
          usage.consumed,
          usage.occurredAt.getTime(),
        );
      }
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
}
