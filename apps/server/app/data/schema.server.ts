import { sql } from "drizzle-orm";
import {
  check,
  customType,
  doublePrecision,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
};

export const quotaWindowUnit = pgEnum("quota_window_unit", [
  "minute",
  "hour",
  "day",
  "week",
]);

export const workspaces = pgTable(
  "workspaces",
  {
    id: uuid().defaultRandom().primaryKey(),
    slug: text().notNull(),
    name: text().notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("workspaces_active_slug_unique")
      .on(table.slug)
      .where(sql`${table.deletedAt} is null`),
  ],
);

export const metrics = pgTable(
  "metrics",
  {
    id: uuid().defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    key: text().notNull(),
    name: text().notNull(),
    description: text(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("metrics_active_workspace_key_unique")
      .on(table.workspaceId, table.key)
      .where(sql`${table.deletedAt} is null`),
    uniqueIndex("metrics_workspace_id_id_unique").on(
      table.workspaceId,
      table.id,
    ),
    index("metrics_workspace_active_idx").on(
      table.workspaceId,
      table.deletedAt,
    ),
  ],
);

export const scopes = pgTable(
  "scopes",
  {
    id: uuid().defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    key: text().notNull(),
    name: text().notNull(),
    description: text(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("scopes_active_workspace_key_unique")
      .on(table.workspaceId, table.key)
      .where(sql`${table.deletedAt} is null`),
    uniqueIndex("scopes_workspace_id_id_unique").on(
      table.workspaceId,
      table.id,
    ),
    index("scopes_workspace_active_idx").on(table.workspaceId, table.deletedAt),
  ],
);

export const quotas = pgTable(
  "quotas",
  {
    id: uuid().defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    metricId: uuid("metric_id").notNull(),
    scopeId: uuid("scope_id").notNull(),
    quotaLimit: doublePrecision("quota_limit").notNull(),
    windowAmount: integer("window_amount").notNull(),
    windowUnit: quotaWindowUnit("window_unit").notNull(),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.workspaceId, table.metricId],
      foreignColumns: [metrics.workspaceId, metrics.id],
      name: "quotas_workspace_metric_fk",
    }),
    foreignKey({
      columns: [table.workspaceId, table.scopeId],
      foreignColumns: [scopes.workspaceId, scopes.id],
      name: "quotas_workspace_scope_fk",
    }),
    check(
      "quotas_limit_non_negative_finite",
      sql`${table.quotaLimit} >= 0 and ${table.quotaLimit} < 'Infinity'::double precision`,
    ),
    check("quotas_window_amount_positive", sql`${table.windowAmount} > 0`),
    index("quotas_workspace_active_idx").on(table.workspaceId, table.deletedAt),
    index("quotas_workspace_metric_idx").on(table.workspaceId, table.metricId),
    index("quotas_workspace_scope_idx").on(table.workspaceId, table.scopeId),
  ],
);

export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid().defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    name: text().notNull(),
    secretHint: text("secret_hint").notNull(),
    secretHash: bytea("secret_hash").notNull(),
    hashVersion: smallint("hash_version").default(1).notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("api_keys_workspace_id_id_unique").on(
      table.workspaceId,
      table.id,
    ),
    check(
      "api_keys_name_valid",
      sql`length(btrim(${table.name})) between 1 and 100 and ${table.name} = btrim(${table.name})`,
    ),
    check(
      "api_keys_secret_hint_length",
      sql`octet_length(${table.secretHint}) = 4`,
    ),
    check(
      "api_keys_secret_hash_length",
      sql`octet_length(${table.secretHash}) = 32`,
    ),
    check("api_keys_hash_version_v1", sql`${table.hashVersion} = 1`),
    check(
      "api_keys_expiration_after_creation",
      sql`${table.expiresAt} is null or ${table.expiresAt} > ${table.createdAt}`,
    ),
    index("api_keys_workspace_idx").on(table.workspaceId, table.createdAt),
  ],
);

export const usageBatches = pgTable(
  "usage_batches",
  {
    id: uuid().defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    apiKeyId: uuid("api_key_id").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    requestHash: bytea("request_hash").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.workspaceId, table.apiKeyId],
      foreignColumns: [apiKeys.workspaceId, apiKeys.id],
      name: "usage_batches_workspace_api_key_fk",
    }).onDelete("restrict"),
    uniqueIndex("usage_batches_workspace_idempotency_unique").on(
      table.workspaceId,
      table.idempotencyKey,
    ),
    uniqueIndex("usage_batches_workspace_id_id_unique").on(
      table.workspaceId,
      table.id,
    ),
    check(
      "usage_batches_idempotency_key_valid",
      sql`octet_length(${table.idempotencyKey}) between 8 and 128 and ${table.idempotencyKey} ~ '^[!-~]+$'`,
    ),
    check(
      "usage_batches_request_hash_length",
      sql`octet_length(${table.requestHash}) = 32`,
    ),
  ],
);

export const usageEvents = pgTable(
  "usage_events",
  {
    id: uuid().defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    batchId: uuid("batch_id").notNull(),
    metricId: uuid("metric_id").notNull(),
    scopeId: uuid("scope_id").notNull(),
    scopeValue: text("scope_value").notNull(),
    consumed: doublePrecision().notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.workspaceId, table.batchId],
      foreignColumns: [usageBatches.workspaceId, usageBatches.id],
      name: "usage_events_workspace_batch_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.workspaceId, table.metricId],
      foreignColumns: [metrics.workspaceId, metrics.id],
      name: "usage_events_workspace_metric_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.workspaceId, table.scopeId],
      foreignColumns: [scopes.workspaceId, scopes.id],
      name: "usage_events_workspace_scope_fk",
    }).onDelete("restrict"),
    check(
      "usage_events_scope_value_valid",
      sql`length(${table.scopeValue}) between 1 and 512`,
    ),
    check(
      "usage_events_consumed_positive_finite",
      sql`${table.consumed} > 0 and ${table.consumed} < 'Infinity'::double precision`,
    ),
    index("usage_events_query_idx").on(
      table.workspaceId,
      table.metricId,
      table.scopeId,
      table.scopeValue,
      table.occurredAt,
    ),
  ],
);

export type Workspace = typeof workspaces.$inferSelect;
export type MetricRecord = typeof metrics.$inferSelect;
export type ScopeRecord = typeof scopes.$inferSelect;
export type QuotaRecord = typeof quotas.$inferSelect;
export type ApiKeyRecord = typeof apiKeys.$inferSelect;
export type UsageBatchRecord = typeof usageBatches.$inferSelect;
export type UsageEventRecord = typeof usageEvents.$inferSelect;
