import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeEach, describe, expect, test } from "vitest";

import { createMetricRepository } from "../../app/data/repositories/metric.repository.server";
import { createQuotaRepository } from "../../app/data/repositories/quota.repository.server";
import { createScopeRepository } from "../../app/data/repositories/scope.repository.server";
import { createWorkspaceRepository } from "../../app/data/repositories/workspace.repository.server";
import * as schema from "../../app/data/schema.server";
import {
  metrics,
  quotas,
  scopes,
  workspaces,
} from "../../app/data/schema.server";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
  throw new Error("TEST_DATABASE_URL is required for repository tests");
}

if (testDatabaseUrl === process.env.DATABASE_URL) {
  throw new Error(
    "TEST_DATABASE_URL must not point to the development database",
  );
}

const pool = new Pool({ connectionString: testDatabaseUrl });
const database = drizzle({ client: pool, schema });

beforeEach(async () => {
  await database.delete(quotas);
  await database.delete(metrics);
  await database.delete(scopes);
  await database.delete(workspaces);
});

afterAll(async () => {
  await pool.end();
});

describe("repository tenant boundaries", () => {
  test("workspace lifecycle keeps archived workspaces out of active reads", async () => {
    const repository = createWorkspaceRepository(database);
    const created = await repository.create({ name: "Alpha", slug: "alpha" });

    await expect(repository.findActiveBySlug("alpha")).resolves.toEqual(
      created,
    );

    const updated = await repository.update(created.id, {
      name: "Alpha Prime",
      slug: "alpha-prime",
    });
    expect(updated).toMatchObject({ name: "Alpha Prime", slug: "alpha-prime" });

    await repository.archive(created.id);

    await expect(
      repository.findActiveBySlug("alpha-prime"),
    ).resolves.toBeUndefined();
    await expect(repository.listActive()).resolves.toEqual([]);
  });

  test("wrong-workspace IDs are absent from metric and scope repositories", async () => {
    const [alpha, beta] = await database
      .insert(workspaces)
      .values([
        { slug: "alpha", name: "Alpha" },
        { slug: "beta", name: "Beta" },
      ])
      .returning();
    const [metric] = await database
      .insert(metrics)
      .values({ workspaceId: alpha.id, key: "credits", name: "Credits" })
      .returning();
    const [scope] = await database
      .insert(scopes)
      .values({ workspaceId: alpha.id, key: "user", name: "User" })
      .returning();

    const metricRepository = createMetricRepository(database);
    const scopeRepository = createScopeRepository(database);

    await expect(
      metricRepository.findActiveById(beta.id, metric.id),
    ).resolves.toBeUndefined();
    await expect(
      scopeRepository.findActiveById(beta.id, scope.id),
    ).resolves.toBeUndefined();
  });

  test("composite foreign keys reject cross-workspace quota references", async () => {
    const [alpha, beta] = await database
      .insert(workspaces)
      .values([
        { slug: "alpha", name: "Alpha" },
        { slug: "beta", name: "Beta" },
      ])
      .returning();
    const [alphaMetric] = await database
      .insert(metrics)
      .values({ workspaceId: alpha.id, key: "credits", name: "Credits" })
      .returning();
    const [betaScope] = await database
      .insert(scopes)
      .values({ workspaceId: beta.id, key: "user", name: "User" })
      .returning();

    await expect(
      database.insert(quotas).values({
        workspaceId: beta.id,
        metricId: alphaMetric.id,
        scopeId: betaScope.id,
        quotaLimit: 10,
        windowAmount: 1,
        windowUnit: "day",
      }),
    ).rejects.toMatchObject({ cause: { code: "23503" } });
  });

  test("metric and scope archive guards are atomic with active quota dependencies", async () => {
    const [workspace] = await database
      .insert(workspaces)
      .values({ slug: "alpha", name: "Alpha" })
      .returning();
    const [metric] = await database
      .insert(metrics)
      .values({ workspaceId: workspace.id, key: "credits", name: "Credits" })
      .returning();
    const [scope] = await database
      .insert(scopes)
      .values({ workspaceId: workspace.id, key: "user", name: "User" })
      .returning();
    await database.insert(quotas).values({
      workspaceId: workspace.id,
      metricId: metric.id,
      scopeId: scope.id,
      quotaLimit: 10,
      windowAmount: 1,
      windowUnit: "day",
    });

    const metricRepository = createMetricRepository(database);
    const scopeRepository = createScopeRepository(database);

    await expect(
      metricRepository.archiveIfUnused(workspace.id, metric.id),
    ).resolves.toMatchObject({ dependencies: 1, archived: undefined });
    await expect(
      scopeRepository.archiveIfUnused(workspace.id, scope.id),
    ).resolves.toMatchObject({ dependencies: 1, archived: undefined });
    await expect(
      metricRepository.findActiveById(workspace.id, metric.id),
    ).resolves.toBeDefined();
    await expect(
      scopeRepository.findActiveById(workspace.id, scope.id),
    ).resolves.toBeDefined();
  });

  test("archiving permits active key reuse while keeping archived rows hidden", async () => {
    const [workspace] = await database
      .insert(workspaces)
      .values({ slug: "alpha", name: "Alpha" })
      .returning();
    const [archivedMetric] = await database
      .insert(metrics)
      .values({ workspaceId: workspace.id, key: "credits", name: "Credits" })
      .returning();

    await database
      .update(metrics)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(metrics.id, archivedMetric.id));
    const [replacement] = await database
      .insert(metrics)
      .values({
        workspaceId: workspace.id,
        key: "credits",
        name: "New credits",
      })
      .returning();

    const repository = createMetricRepository(database);
    await expect(repository.listActive(workspace.id)).resolves.toEqual([
      replacement,
    ]);
  });

  test("quota checks allow zero and reject non-finite or invalid windows", async () => {
    const [workspace] = await database
      .insert(workspaces)
      .values({ slug: "alpha", name: "Alpha" })
      .returning();
    const [metric] = await database
      .insert(metrics)
      .values({ workspaceId: workspace.id, key: "credits", name: "Credits" })
      .returning();
    const [scope] = await database
      .insert(scopes)
      .values({ workspaceId: workspace.id, key: "user", name: "User" })
      .returning();
    const baseQuota = {
      workspaceId: workspace.id,
      metricId: metric.id,
      scopeId: scope.id,
      windowUnit: "day" as const,
    };

    await expect(
      database
        .insert(quotas)
        .values({ ...baseQuota, quotaLimit: 0, windowAmount: 1 }),
    ).resolves.toBeDefined();
    await expect(
      database.insert(quotas).values({
        ...baseQuota,
        quotaLimit: Number.POSITIVE_INFINITY,
        windowAmount: 1,
      }),
    ).rejects.toMatchObject({ cause: { code: "23514" } });
    await expect(
      database
        .insert(quotas)
        .values({ ...baseQuota, quotaLimit: 1, windowAmount: 0 }),
    ).rejects.toMatchObject({ cause: { code: "23514" } });
  });

  test("quota repository supports overlaps, joined filters, and tenant-safe lifecycle", async () => {
    const [alpha, beta] = await database
      .insert(workspaces)
      .values([
        { slug: "alpha", name: "Alpha" },
        { slug: "beta", name: "Beta" },
      ])
      .returning();
    const [metric, otherMetric] = await database
      .insert(metrics)
      .values([
        { workspaceId: alpha.id, key: "credits", name: "Credits" },
        { workspaceId: alpha.id, key: "storage", name: "Storage" },
      ])
      .returning();
    const [scope] = await database
      .insert(scopes)
      .values({ workspaceId: alpha.id, key: "user", name: "User" })
      .returning();
    const repository = createQuotaRepository(database);
    const base = {
      metricId: metric.id,
      scopeId: scope.id,
      windowAmount: 1,
      windowUnit: "day" as const,
    };

    const first = await repository.create(alpha.id, {
      ...base,
      quotaLimit: 10,
    });
    const second = await repository.create(alpha.id, {
      ...base,
      quotaLimit: 20,
    });
    await repository.create(alpha.id, {
      ...base,
      metricId: otherMetric.id,
      quotaLimit: 30,
    });

    const page = await repository.listPage(alpha.id, {
      metricId: metric.id,
      scopeId: scope.id,
      sort: "limit",
      direction: "asc",
      page: 1,
      pageSize: 20,
    });
    expect(page.total).toBe(2);
    expect(page.items).toMatchObject([
      { id: first.id, metric: { key: "credits" }, scope: { key: "user" } },
      { id: second.id, metric: { key: "credits" }, scope: { key: "user" } },
    ]);

    await expect(
      repository.findActiveById(beta.id, first.id),
    ).resolves.toBeUndefined();
    await expect(
      repository.update(beta.id, first.id, { ...base, quotaLimit: 99 }),
    ).resolves.toBeUndefined();
    await expect(
      repository.archive(beta.id, first.id),
    ).resolves.toBeUndefined();

    await expect(
      repository.update(alpha.id, first.id, {
        ...base,
        quotaLimit: 15,
        windowAmount: 2,
        windowUnit: "hour",
      }),
    ).resolves.toMatchObject({ quotaLimit: 15, windowAmount: 2 });
    await expect(repository.archive(alpha.id, first.id)).resolves.toMatchObject(
      {
        id: first.id,
        deletedAt: expect.any(Date),
      },
    );
    await expect(
      repository.findActiveById(alpha.id, first.id),
    ).resolves.toBeUndefined();
  });
});
