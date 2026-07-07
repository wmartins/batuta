import { and, eq, isNull } from "drizzle-orm";

import { db, pool } from "../app/data/db.server";
import { metrics, quotas, scopes, workspaces } from "../app/data/schema.server";
import { createApiKeyService } from "../app/services/api-key.server";

export function createDemoSetupAdapter(pepper: Buffer) {
  const apiKeys = createApiKeyService({ database: db, pepper });
  return {
    close: () => pool.end(),
    dependencies: {
      workspaces: {
        async findById(id: string) {
          const [record] = await db
            .select()
            .from(workspaces)
            .where(eq(workspaces.id, id))
            .limit(1);
          return record;
        },
        async findActiveBySlug(slug: string) {
          const [record] = await db
            .select()
            .from(workspaces)
            .where(and(eq(workspaces.slug, slug), isNull(workspaces.deletedAt)))
            .limit(1);
          return record;
        },
        async create(input: { id: string; slug: string; name: string }) {
          const [record] = await db
            .insert(workspaces)
            .values(input)
            .returning();
          return record;
        },
        async update(id: string, input: { slug: string; name: string }) {
          const [record] = await db
            .update(workspaces)
            .set({ ...input, updatedAt: new Date() })
            .where(and(eq(workspaces.id, id), isNull(workspaces.deletedAt)))
            .returning();
          return record;
        },
      },
      metrics: registryAdapter(metrics),
      scopes: registryAdapter(scopes),
      quotas: {
        async findById(id: string) {
          const [record] = await db
            .select()
            .from(quotas)
            .where(eq(quotas.id, id))
            .limit(1);
          return record;
        },
        async create(input: QuotaInput) {
          const [record] = await db.insert(quotas).values(input).returning();
          return record;
        },
        async update(id: string, input: QuotaInput) {
          const [record] = await db
            .update(quotas)
            .set({ ...input, deletedAt: null, updatedAt: new Date() })
            .where(eq(quotas.id, id))
            .returning();
          return record;
        },
      },
      apiKeys,
    },
  };
}

type RegistryInput = {
  id: string;
  workspaceId: string;
  key: string;
  name: string;
  description: string | null;
};

type QuotaInput = {
  id: string;
  workspaceId: string;
  metricId: string;
  scopeId: string;
  quotaLimit: number;
  windowAmount: number;
  windowUnit: "minute" | "hour" | "day" | "week";
};

function registryAdapter(table: typeof metrics | typeof scopes) {
  return {
    async findById(id: string) {
      const [record] = await db
        .select()
        .from(table)
        .where(eq(table.id, id))
        .limit(1);
      return record;
    },
    async findActiveByKey(workspaceId: string, key: string) {
      const [record] = await db
        .select()
        .from(table)
        .where(
          and(
            eq(table.workspaceId, workspaceId),
            eq(table.key, key),
            isNull(table.deletedAt),
          ),
        )
        .limit(1);
      return record;
    },
    async create(input: RegistryInput) {
      const [record] = await db.insert(table).values(input).returning();
      return record;
    },
    async update(id: string, input: RegistryInput) {
      const [record] = await db
        .update(table)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(table.id, id))
        .returning();
      return record;
    },
  };
}
