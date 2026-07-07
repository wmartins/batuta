import { and, asc, count, desc, eq, ilike, isNull, or } from "drizzle-orm";
import type { RegistryListQuery } from "../../validation/registry-list";
import type { Database } from "../db.server";
import { quotas, scopes } from "../schema.server";

export function createScopeRepository(database: Database) {
  return {
    async listActive(workspaceId: string) {
      return database
        .select()
        .from(scopes)
        .where(
          and(eq(scopes.workspaceId, workspaceId), isNull(scopes.deletedAt)),
        )
        .orderBy(asc(scopes.name));
    },

    async listPage(workspaceId: string, query: RegistryListQuery) {
      const search = query.search
        ? or(
            ilike(scopes.key, `%${query.search}%`),
            ilike(scopes.name, `%${query.search}%`),
            ilike(scopes.description, `%${query.search}%`),
          )
        : undefined;
      const where = and(
        eq(scopes.workspaceId, workspaceId),
        isNull(scopes.deletedAt),
        search,
      );
      const column =
        query.sort === "key"
          ? scopes.key
          : query.sort === "updated"
            ? scopes.updatedAt
            : scopes.name;
      const order = query.direction === "desc" ? desc(column) : asc(column);

      const [items, [total]] = await Promise.all([
        database
          .select()
          .from(scopes)
          .where(where)
          .orderBy(order, asc(scopes.id))
          .limit(query.pageSize)
          .offset((query.page - 1) * query.pageSize),
        database.select({ value: count() }).from(scopes).where(where),
      ]);

      return { items, total: total.value };
    },

    async findActiveById(workspaceId: string, scopeId: string) {
      const [scope] = await database
        .select()
        .from(scopes)
        .where(
          and(
            eq(scopes.workspaceId, workspaceId),
            eq(scopes.id, scopeId),
            isNull(scopes.deletedAt),
          ),
        )
        .limit(1);

      return scope;
    },

    async create(
      workspaceId: string,
      input: { key: string; name: string; description: string | null },
    ) {
      const [scope] = await database
        .insert(scopes)
        .values({ workspaceId, ...input })
        .returning();
      return scope;
    },

    async update(
      workspaceId: string,
      scopeId: string,
      input: { name: string; description: string | null },
    ) {
      const [scope] = await database
        .update(scopes)
        .set({ ...input, updatedAt: new Date() })
        .where(
          and(
            eq(scopes.workspaceId, workspaceId),
            eq(scopes.id, scopeId),
            isNull(scopes.deletedAt),
          ),
        )
        .returning();
      return scope;
    },

    async archiveIfUnused(workspaceId: string, scopeId: string) {
      return database.transaction(async (transaction) => {
        const [dependencyCount] = await transaction
          .select({ value: count() })
          .from(quotas)
          .where(
            and(
              eq(quotas.workspaceId, workspaceId),
              eq(quotas.scopeId, scopeId),
              isNull(quotas.deletedAt),
            ),
          );
        if (dependencyCount.value > 0) {
          return { archived: undefined, dependencies: dependencyCount.value };
        }
        const now = new Date();
        const [archived] = await transaction
          .update(scopes)
          .set({ deletedAt: now, updatedAt: now })
          .where(
            and(
              eq(scopes.workspaceId, workspaceId),
              eq(scopes.id, scopeId),
              isNull(scopes.deletedAt),
            ),
          )
          .returning();
        return { archived, dependencies: 0 };
      });
    },
  };
}
