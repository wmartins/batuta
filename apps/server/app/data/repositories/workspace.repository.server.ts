import { and, asc, count, eq, isNull } from "drizzle-orm";

import type { Database } from "../db.server";
import { metrics, quotas, scopes, workspaces } from "../schema.server";

export function createWorkspaceRepository(database: Database) {
  return {
    async listActive() {
      return database
        .select()
        .from(workspaces)
        .where(isNull(workspaces.deletedAt))
        .orderBy(asc(workspaces.name));
    },

    async findActiveBySlug(slug: string) {
      const [workspace] = await database
        .select()
        .from(workspaces)
        .where(and(eq(workspaces.slug, slug), isNull(workspaces.deletedAt)))
        .limit(1);

      return workspace;
    },

    async findActiveById(workspaceId: string) {
      const [workspace] = await database
        .select()
        .from(workspaces)
        .where(
          and(eq(workspaces.id, workspaceId), isNull(workspaces.deletedAt)),
        )
        .limit(1);

      return workspace;
    },

    async create(input: { name: string; slug: string }) {
      const [workspace] = await database
        .insert(workspaces)
        .values(input)
        .returning();

      return workspace;
    },

    async update(workspaceId: string, input: { name: string; slug: string }) {
      const [workspace] = await database
        .update(workspaces)
        .set({ ...input, updatedAt: new Date() })
        .where(
          and(eq(workspaces.id, workspaceId), isNull(workspaces.deletedAt)),
        )
        .returning();

      return workspace;
    },

    async archive(workspaceId: string) {
      const now = new Date();
      const [workspace] = await database
        .update(workspaces)
        .set({ deletedAt: now, updatedAt: now })
        .where(
          and(eq(workspaces.id, workspaceId), isNull(workspaces.deletedAt)),
        )
        .returning();

      return workspace;
    },

    async activeCounts(workspaceId: string) {
      const [[metricCount], [scopeCount], [quotaCount]] = await Promise.all([
        database
          .select({ value: count() })
          .from(metrics)
          .where(
            and(
              eq(metrics.workspaceId, workspaceId),
              isNull(metrics.deletedAt),
            ),
          ),
        database
          .select({ value: count() })
          .from(scopes)
          .where(
            and(eq(scopes.workspaceId, workspaceId), isNull(scopes.deletedAt)),
          ),
        database
          .select({ value: count() })
          .from(quotas)
          .where(
            and(eq(quotas.workspaceId, workspaceId), isNull(quotas.deletedAt)),
          ),
      ]);

      return {
        metrics: metricCount.value,
        scopes: scopeCount.value,
        quotas: quotaCount.value,
      };
    },
  };
}
