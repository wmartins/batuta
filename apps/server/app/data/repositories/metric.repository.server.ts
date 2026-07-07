import { and, asc, count, desc, eq, ilike, isNull, or } from "drizzle-orm";
import type { RegistryListQuery } from "../../validation/registry-list";
import type { Database } from "../db.server";
import { metrics, quotas } from "../schema.server";

export function createMetricRepository(database: Database) {
  return {
    async listActive(workspaceId: string) {
      return database
        .select()
        .from(metrics)
        .where(
          and(eq(metrics.workspaceId, workspaceId), isNull(metrics.deletedAt)),
        )
        .orderBy(asc(metrics.name));
    },

    async listPage(workspaceId: string, query: RegistryListQuery) {
      const search = query.search
        ? or(
            ilike(metrics.key, `%${query.search}%`),
            ilike(metrics.name, `%${query.search}%`),
            ilike(metrics.description, `%${query.search}%`),
          )
        : undefined;
      const where = and(
        eq(metrics.workspaceId, workspaceId),
        isNull(metrics.deletedAt),
        search,
      );
      const column =
        query.sort === "key"
          ? metrics.key
          : query.sort === "updated"
            ? metrics.updatedAt
            : metrics.name;
      const order = query.direction === "desc" ? desc(column) : asc(column);

      const [items, [total]] = await Promise.all([
        database
          .select()
          .from(metrics)
          .where(where)
          .orderBy(order, asc(metrics.id))
          .limit(query.pageSize)
          .offset((query.page - 1) * query.pageSize),
        database.select({ value: count() }).from(metrics).where(where),
      ]);

      return { items, total: total.value };
    },

    async findActiveById(workspaceId: string, metricId: string) {
      const [metric] = await database
        .select()
        .from(metrics)
        .where(
          and(
            eq(metrics.workspaceId, workspaceId),
            eq(metrics.id, metricId),
            isNull(metrics.deletedAt),
          ),
        )
        .limit(1);

      return metric;
    },

    async create(
      workspaceId: string,
      input: { key: string; name: string; description: string | null },
    ) {
      const [metric] = await database
        .insert(metrics)
        .values({ workspaceId, ...input })
        .returning();
      return metric;
    },

    async update(
      workspaceId: string,
      metricId: string,
      input: { name: string; description: string | null },
    ) {
      const [metric] = await database
        .update(metrics)
        .set({ ...input, updatedAt: new Date() })
        .where(
          and(
            eq(metrics.workspaceId, workspaceId),
            eq(metrics.id, metricId),
            isNull(metrics.deletedAt),
          ),
        )
        .returning();
      return metric;
    },

    async archiveIfUnused(workspaceId: string, metricId: string) {
      return database.transaction(async (transaction) => {
        const [dependencyCount] = await transaction
          .select({ value: count() })
          .from(quotas)
          .where(
            and(
              eq(quotas.workspaceId, workspaceId),
              eq(quotas.metricId, metricId),
              isNull(quotas.deletedAt),
            ),
          );
        if (dependencyCount.value > 0) {
          return { archived: undefined, dependencies: dependencyCount.value };
        }
        const now = new Date();
        const [archived] = await transaction
          .update(metrics)
          .set({ deletedAt: now, updatedAt: now })
          .where(
            and(
              eq(metrics.workspaceId, workspaceId),
              eq(metrics.id, metricId),
              isNull(metrics.deletedAt),
            ),
          )
          .returning();
        return { archived, dependencies: 0 };
      });
    },
  };
}
