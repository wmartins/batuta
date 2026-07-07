import { and, asc, count, desc, eq, isNull } from "drizzle-orm";
import type { QuotaInput } from "../../validation/quota";
import type { QuotaListQuery } from "../../validation/quota-list";
import type { Database } from "../db.server";
import { metrics, quotas, scopes } from "../schema.server";

export function createQuotaRepository(database: Database) {
  return {
    async listActive(workspaceId: string) {
      return database
        .select()
        .from(quotas)
        .where(
          and(eq(quotas.workspaceId, workspaceId), isNull(quotas.deletedAt)),
        )
        .orderBy(desc(quotas.updatedAt));
    },

    async findActiveById(workspaceId: string, quotaId: string) {
      const [quota] = await database
        .select()
        .from(quotas)
        .where(
          and(
            eq(quotas.workspaceId, workspaceId),
            eq(quotas.id, quotaId),
            isNull(quotas.deletedAt),
          ),
        )
        .limit(1);

      return quota;
    },

    async listPage(workspaceId: string, query: QuotaListQuery) {
      const where = and(
        eq(quotas.workspaceId, workspaceId),
        isNull(quotas.deletedAt),
        query.metricId ? eq(quotas.metricId, query.metricId) : undefined,
        query.scopeId ? eq(quotas.scopeId, query.scopeId) : undefined,
      );
      const column =
        query.sort === "limit"
          ? quotas.quotaLimit
          : query.sort === "window"
            ? quotas.windowAmount
            : quotas.updatedAt;
      const order = query.direction === "asc" ? asc(column) : desc(column);
      const [items, [total]] = await Promise.all([
        database
          .select({
            id: quotas.id,
            quotaLimit: quotas.quotaLimit,
            windowAmount: quotas.windowAmount,
            windowUnit: quotas.windowUnit,
            updatedAt: quotas.updatedAt,
            metric: { id: metrics.id, key: metrics.key, name: metrics.name },
            scope: { id: scopes.id, key: scopes.key, name: scopes.name },
          })
          .from(quotas)
          .innerJoin(
            metrics,
            and(
              eq(metrics.workspaceId, quotas.workspaceId),
              eq(metrics.id, quotas.metricId),
            ),
          )
          .innerJoin(
            scopes,
            and(
              eq(scopes.workspaceId, quotas.workspaceId),
              eq(scopes.id, quotas.scopeId),
            ),
          )
          .where(where)
          .orderBy(order, asc(quotas.id))
          .limit(query.pageSize)
          .offset((query.page - 1) * query.pageSize),
        database.select({ value: count() }).from(quotas).where(where),
      ]);
      return { items, total: total.value };
    },

    async create(workspaceId: string, input: QuotaInput) {
      const [quota] = await database
        .insert(quotas)
        .values({ workspaceId, ...input })
        .returning();
      return quota;
    },

    async update(workspaceId: string, quotaId: string, input: QuotaInput) {
      const [quota] = await database
        .update(quotas)
        .set({ ...input, updatedAt: new Date() })
        .where(
          and(
            eq(quotas.workspaceId, workspaceId),
            eq(quotas.id, quotaId),
            isNull(quotas.deletedAt),
          ),
        )
        .returning();
      return quota;
    },

    async archive(workspaceId: string, quotaId: string) {
      const now = new Date();
      const [quota] = await database
        .update(quotas)
        .set({ deletedAt: now, updatedAt: now })
        .where(
          and(
            eq(quotas.workspaceId, workspaceId),
            eq(quotas.id, quotaId),
            isNull(quotas.deletedAt),
          ),
        )
        .returning();
      return quota;
    },
  };
}
