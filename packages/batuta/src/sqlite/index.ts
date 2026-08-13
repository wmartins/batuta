import { DatabaseSync } from "node:sqlite";
import {
  type Limit,
  type Metric,
  Quota,
  Scope,
  type Storage,
  Usage,
} from "../domain/index.js";

export type SQLite3StorageOptions =
  | { database: DatabaseSync }
  | { filename: string };

type QuotaType = Quota.Synthetic<string, string>["type"];
type UsageRow = {
  quotaMetric: string;
  quotaScopeKey: string;
  quotaScopeValue: string | null;
  quotaType: QuotaType;
  quotaLimit: number | null;
  windowAmount: number | null;
  windowUnit: "minute" | "hour" | "day" | "week" | null;
  scopeValue: string;
  used: number | null;
};

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS quotas (
    id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
    metric TEXT NOT NULL CHECK (length(metric) > 0),
    scope_key TEXT NOT NULL CHECK (length(scope_key) > 0),
    scope_value TEXT CHECK (scope_value IS NULL OR length(scope_value) > 0),
    quota_type TEXT NOT NULL CHECK (quota_type IN ('direct', 'balance', 'rolling')),
    quota_limit REAL CHECK (
      quota_limit IS NULL OR
      (quota_limit >= 0 AND quota_limit <= 1.7976931348623157e308)
    ),
    window_amount INTEGER,
    window_unit TEXT,
    CHECK (
      (quota_type = 'rolling' AND window_amount > 0
        AND window_unit IN ('minute', 'hour', 'day', 'week'))
      OR
      (quota_type IN ('direct', 'balance')
        AND window_amount IS NULL AND window_unit IS NULL)
    )
  ) STRICT;

  CREATE TABLE IF NOT EXISTS usage (
    id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
    metric TEXT NOT NULL CHECK (length(metric) > 0),
    scope_key TEXT NOT NULL CHECK (length(scope_key) > 0),
    scope_value TEXT NOT NULL CHECK (length(scope_value) > 0),
    amount REAL NOT NULL CHECK (
      amount != 0 AND abs(amount) <= 1.7976931348623157e308
    ),
    occurred_at INTEGER NOT NULL
  ) STRICT;

  CREATE UNIQUE INDEX IF NOT EXISTS quotas_rolling_unique_idx
  ON quotas (
    metric, scope_key, ifnull(scope_value, ''), window_amount, window_unit
  ) WHERE quota_type = 'rolling';

  CREATE UNIQUE INDEX IF NOT EXISTS quotas_single_kind_unique_idx
  ON quotas (metric, scope_key, ifnull(scope_value, ''))
  WHERE quota_type IN ('direct', 'balance');

  CREATE TRIGGER IF NOT EXISTS quotas_no_mixed_kinds_insert
  BEFORE INSERT ON quotas
  WHEN EXISTS (
    SELECT 1 FROM quotas existing
    WHERE existing.metric = NEW.metric
      AND existing.scope_key = NEW.scope_key
      AND existing.scope_value IS NEW.scope_value
      AND existing.quota_type != NEW.quota_type
  )
  BEGIN
    SELECT RAISE(ABORT, 'quota selector cannot mix quota kinds');
  END;

  CREATE TRIGGER IF NOT EXISTS quotas_no_mixed_kinds_update
  BEFORE UPDATE ON quotas
  WHEN EXISTS (
    SELECT 1 FROM quotas existing
    WHERE existing.id != NEW.id
      AND existing.metric = NEW.metric
      AND existing.scope_key = NEW.scope_key
      AND existing.scope_value IS NEW.scope_value
      AND existing.quota_type != NEW.quota_type
  )
  BEGIN
    SELECT RAISE(ABORT, 'quota selector cannot mix quota kinds');
  END;

  CREATE INDEX IF NOT EXISTS quotas_generic_lookup_idx
  ON quotas (metric, scope_key) WHERE scope_value IS NULL;

  CREATE INDEX IF NOT EXISTS quotas_concrete_lookup_idx
  ON quotas (metric, scope_key, scope_value) WHERE scope_value IS NOT NULL;

  CREATE INDEX IF NOT EXISTS usage_lookup_idx
  ON usage (metric, scope_key, scope_value, occurred_at);
`;

function durationSql(alias: string) {
  return `${alias}.window_amount * CASE ${alias}.window_unit
    WHEN 'minute' THEN 60000
    WHEN 'hour' THEN 3600000
    WHEN 'day' THEN 86400000
    WHEN 'week' THEN 604800000
  END`;
}

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
    if (input.scopes.length === 0) return [];
    const values = input.scopes
      .map((_, index) => `(:scope_key_${index}, :scope_value_${index})`)
      .join(", ");
    const parameters: Record<string, string | number> = {
      ":metric": input.metric,
      ":at": input.at.getTime(),
    };
    for (const [index, scope] of input.scopes.entries()) {
      parameters[`:scope_key_${index}`] = scope.key;
      parameters[`:scope_value_${index}`] = scope.value;
    }

    const rows = this.database
      .prepare(`
        WITH requested_scopes(scope_key, scope_value) AS (VALUES ${values}),
        effective_quotas AS (
          SELECT quota.*, requested.scope_value AS requested_scope_value
          FROM requested_scopes requested
          JOIN quotas quota
            ON quota.metric = :metric
            AND quota.scope_key = requested.scope_key
            AND (quota.scope_value = requested.scope_value OR quota.scope_value IS NULL)
          WHERE quota.scope_value = requested.scope_value
            OR NOT EXISTS (
              SELECT 1 FROM quotas concrete
              WHERE concrete.metric = quota.metric
                AND concrete.scope_key = quota.scope_key
                AND concrete.scope_value = requested.scope_value
            )
        )
        SELECT
          quota.metric AS quotaMetric,
          quota.scope_key AS quotaScopeKey,
          quota.scope_value AS quotaScopeValue,
          quota.quota_type AS quotaType,
          quota.quota_limit AS quotaLimit,
          quota.window_amount AS windowAmount,
          quota.window_unit AS windowUnit,
          quota.requested_scope_value AS scopeValue,
          CASE quota.quota_type
            WHEN 'direct' THEN NULL
            WHEN 'balance' THEN COALESCE((
              SELECT SUM(event.amount) FROM usage event
              WHERE event.metric = quota.metric
                AND event.scope_key = quota.scope_key
                AND event.scope_value = quota.requested_scope_value
                AND event.occurred_at <= :at
            ), 0)
            WHEN 'rolling' THEN COALESCE((
              SELECT SUM(event.amount) FROM usage event
              WHERE event.metric = quota.metric
                AND event.scope_key = quota.scope_key
                AND event.scope_value = quota.requested_scope_value
                AND event.occurred_at > :at - ${durationSql("quota")}
                AND event.occurred_at <= :at
            ), 0)
          END AS used
        FROM effective_quotas quota
      `)
      .all(parameters) as UsageRow[];

    return rows.map((row): Storage.Usage.Result<MetricName, ScopeKey> => {
      const base: {
        metric: MetricName;
        scope: ScopeKey | Scope<ScopeKey>;
        limit: Limit;
      } = {
        metric: row.quotaMetric as MetricName,
        scope: (row.quotaScopeValue === null
          ? row.quotaScopeKey
          : { key: row.quotaScopeKey, value: row.quotaScopeValue }) as
          | ScopeKey
          | Scope<ScopeKey>,
        limit: row.quotaLimit ?? "unlimited",
      };
      const scope = Scope.validate(
        { key: row.quotaScopeKey as ScopeKey, value: row.scopeValue },
        "scope",
      );
      if (row.quotaType === "direct") {
        return {
          quota: Quota.validate({ type: "direct", ...base }),
          scope,
        };
      }
      if (row.used === null) {
        throw new TypeError("accumulating quotas must return numeric usage");
      }
      if (row.quotaType === "balance") {
        return {
          quota: Quota.validate({ type: "balance", ...base }),
          scope,
          used: row.used,
        };
      }
      if (row.windowAmount === null || row.windowUnit === null) {
        throw new TypeError("rolling quotas must return a window");
      }
      return {
        quota: Quota.validate({
          type: "rolling",
          ...base,
          window: {
            amount: row.windowAmount,
            unit: row.windowUnit,
          },
        }),
        scope,
        used: row.used,
      };
    });
  }

  async record(
    usages: readonly Usage.Synthetic<MetricName, ScopeKey>[],
  ): Promise<void> {
    if (usages.length === 0) return;
    for (const usage of usages) Usage.validate(usage);

    const resolve = this.database.prepare(`
      SELECT quota_type AS quotaType
      FROM quotas
      WHERE metric = ? AND scope_key = ?
        AND scope_value = ?
      UNION ALL
      SELECT quota_type AS quotaType
      FROM quotas
      WHERE metric = ? AND scope_key = ? AND scope_value IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM quotas
          WHERE metric = ? AND scope_key = ? AND scope_value = ?
        )
    `);
    const balance = this.database.prepare(`
      SELECT COALESCE(SUM(amount), 0) AS used FROM usage
      WHERE metric = ? AND scope_key = ? AND scope_value = ?
        AND occurred_at <= ?
    `);
    const insert = this.database.prepare(`
      INSERT INTO usage (metric, scope_key, scope_value, amount, occurred_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    this.database.exec("BEGIN IMMEDIATE");
    try {
      const pendingBalances = new Map<string, number>();
      for (const usage of usages) {
        const args = [
          usage.metric,
          usage.scope.key,
          usage.scope.value,
        ] as const;
        const quotas = resolve.all(
          ...args,
          usage.metric,
          usage.scope.key,
          ...args,
        ) as {
          quotaType: QuotaType;
        }[];
        if (quotas.length === 0) {
          throw new TypeError("recording requires an effective quota");
        }
        const type = quotas[0]?.quotaType;
        if (quotas.some((quota) => quota.quotaType !== type)) {
          throw new TypeError(
            "effective quota configuration mixes quota kinds",
          );
        }
        if (type === "direct") {
          throw new TypeError("direct quotas do not accept usage events");
        }
        if (type === "rolling" && usage.amount <= 0) {
          throw new TypeError("rolling usage amount must be greater than zero");
        }
        if (type === "balance") {
          const identity = JSON.stringify(args);
          const persisted = balance.get(...args, usage.occurredAt.getTime()) as
            | { used: number }
            | undefined;
          if (!persisted) {
            throw new TypeError("could not read the current balance");
          }
          const current = pendingBalances.get(identity) ?? persisted.used;
          const projected = current + usage.amount;
          if (projected < 0) {
            throw new TypeError(
              "balance usage cannot produce a negative balance",
            );
          }
          pendingBalances.set(identity, projected);
        }
      }
      for (const usage of usages) {
        insert.run(
          usage.metric,
          usage.scope.key,
          usage.scope.value,
          usage.amount,
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
