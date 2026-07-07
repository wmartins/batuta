import { sql } from "drizzle-orm";
import {
  check,
  doublePrecision,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

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

export type Workspace = typeof workspaces.$inferSelect;
export type MetricRecord = typeof metrics.$inferSelect;
export type ScopeRecord = typeof scopes.$inferSelect;
export type QuotaRecord = typeof quotas.$inferSelect;
