import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeEach, describe, expect, test } from "vitest";

import { createApiKeyRepository } from "../../app/data/repositories/api-key.repository.server";
import { createMetricRepository } from "../../app/data/repositories/metric.repository.server";
import { createQuotaRepository } from "../../app/data/repositories/quota.repository.server";
import { createScopeRepository } from "../../app/data/repositories/scope.repository.server";
import { createUsageRepository } from "../../app/data/repositories/usage.repository.server";
import { createWorkspaceRepository } from "../../app/data/repositories/workspace.repository.server";
import * as schema from "../../app/data/schema.server";
import {
  apiKeys,
  metrics,
  quotas,
  scopes,
  usageBatches,
  usageEvents,
  workspaces,
} from "../../app/data/schema.server";
import {
  createApiKeyService,
  InvalidApiKeyError,
} from "../../app/services/api-key.server";
import {
  createManagedStorageService,
  IdempotencyConflictError,
  ManagedStorageValidationError,
} from "../../app/services/managed-storage.server";

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
  await database.delete(usageEvents);
  await database.delete(usageBatches);
  await database.delete(apiKeys);
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

  test("API-key reads are tenant-scoped and list metadata never exposes hashes", async () => {
    const [alpha, beta] = await database
      .insert(workspaces)
      .values([
        { slug: "alpha", name: "Alpha" },
        { slug: "beta", name: "Beta" },
      ])
      .returning();
    const repository = createApiKeyRepository(database);
    const createdAt = new Date("2026-07-07T12:00:00.000Z");
    const key = await repository.create({
      id: randomUUID(),
      workspaceId: alpha.id,
      name: "Local integration",
      secretHint: "abcd",
      secretHash: Buffer.alloc(32, 7),
      hashVersion: 1,
      expiresAt: null,
      createdAt,
    });

    await expect(repository.findById(beta.id, key.id)).resolves.toBeUndefined();
    const listed = await repository.list(alpha.id);
    expect(listed).toEqual([
      expect.objectContaining({
        id: key.id,
        workspaceId: alpha.id,
        name: "Local integration",
        secretHint: "abcd",
      }),
    ]);
    expect(listed[0]).not.toHaveProperty("secretHash");
  });

  test("usage batches enforce workspace idempotency and allow the same opaque key in another workspace", async () => {
    const [alpha, beta] = await database
      .insert(workspaces)
      .values([
        { slug: "alpha", name: "Alpha" },
        { slug: "beta", name: "Beta" },
      ])
      .returning();
    const keyRows = await database
      .insert(apiKeys)
      .values(
        [alpha, beta].map((workspace, index) => ({
          workspaceId: workspace.id,
          name: "Integration",
          secretHint: `abc${index}`,
          secretHash: Buffer.alloc(32, index + 1),
        })),
      )
      .returning();
    const occurredAt = new Date("2026-07-07T12:00:00.000Z");
    const idempotencyKey = "same-request-key";

    await database.insert(usageBatches).values([
      {
        workspaceId: alpha.id,
        apiKeyId: keyRows[0].id,
        idempotencyKey,
        requestHash: Buffer.alloc(32, 1),
        occurredAt,
      },
      {
        workspaceId: beta.id,
        apiKeyId: keyRows[1].id,
        idempotencyKey,
        requestHash: Buffer.alloc(32, 2),
        occurredAt,
      },
    ]);

    await expect(
      database.insert(usageBatches).values({
        workspaceId: alpha.id,
        apiKeyId: keyRows[0].id,
        idempotencyKey,
        requestHash: Buffer.alloc(32, 3),
        occurredAt,
      }),
    ).rejects.toMatchObject({ cause: { code: "23505" } });
  });

  test("usage repository rolls back the batch when one event crosses a tenant boundary", async () => {
    const [alpha, beta] = await database
      .insert(workspaces)
      .values([
        { slug: "alpha", name: "Alpha" },
        { slug: "beta", name: "Beta" },
      ])
      .returning();
    const [key] = await database
      .insert(apiKeys)
      .values({
        workspaceId: alpha.id,
        name: "Integration",
        secretHint: "abcd",
        secretHash: Buffer.alloc(32, 1),
      })
      .returning();
    const [metric] = await database
      .insert(metrics)
      .values({ workspaceId: alpha.id, key: "credits", name: "Credits" })
      .returning();
    const [alphaScope, betaScope] = await database
      .insert(scopes)
      .values([
        { workspaceId: alpha.id, key: "user", name: "User" },
        { workspaceId: beta.id, key: "user", name: "User" },
      ])
      .returning();
    const repository = createUsageRepository(database);

    await expect(
      repository.insertBatch({
        id: randomUUID(),
        workspaceId: alpha.id,
        apiKeyId: key.id,
        idempotencyKey: "atomic-request-key",
        requestHash: Buffer.alloc(32, 4),
        occurredAt: new Date("2026-07-07T12:00:00.000Z"),
        events: [
          {
            metricId: metric.id,
            scopeId: alphaScope.id,
            scopeValue: "user-1",
            consumed: 1,
          },
          {
            metricId: metric.id,
            scopeId: betaScope.id,
            scopeValue: "user-2",
            consumed: 1,
          },
        ],
      }),
    ).rejects.toMatchObject({ cause: { code: "23503" } });

    await expect(database.select().from(usageBatches)).resolves.toEqual([]);
    await expect(database.select().from(usageEvents)).resolves.toEqual([]);
  });

  test("API-key service creates the exact opaque format and authenticates without storing the secret", async () => {
    const [workspace] = await database
      .insert(workspaces)
      .values({ slug: "alpha", name: "Alpha" })
      .returning();
    const service = createApiKeyService({
      database,
      pepper: Buffer.alloc(32, 9),
    });
    const now = new Date("2026-07-07T12:00:00.000Z");
    const created = await service.create({
      workspaceId: workspace.id,
      name: "  Local integration  ",
      now,
    });

    expect(created.apiKey).toMatch(
      /^batuta_live_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_[A-Za-z0-9_-]{43}$/,
    );
    expect(created.record.name).toBe("Local integration");
    expect(created.record.secretHash).toHaveLength(32);
    expect(created.apiKey).not.toContain(created.record.secretHash.toString());

    await expect(
      service.authenticate(created.apiKey, now),
    ).resolves.toMatchObject({
      workspace: { id: workspace.id },
      apiKey: { id: created.record.id },
    });
    const [stored] = await database.select().from(apiKeys);
    expect(stored.lastUsedAt).toEqual(now);
  });

  test("API-key service rejects altered, expired, revoked, and archived-workspace credentials", async () => {
    const [workspace] = await database
      .insert(workspaces)
      .values({ slug: "alpha", name: "Alpha" })
      .returning();
    const service = createApiKeyService({
      database,
      pepper: Buffer.alloc(32, 9),
    });
    const createdAt = new Date("2026-07-07T12:00:00.000Z");
    const expiresAt = new Date("2026-07-07T13:00:00.000Z");
    const first = await service.create({
      workspaceId: workspace.id,
      name: "First",
      expiresAt,
      now: createdAt,
    });
    const altered = `${first.apiKey.slice(0, -1)}${first.apiKey.endsWith("a") ? "b" : "a"}`;
    await expect(
      service.authenticate(altered, createdAt),
    ).rejects.toBeInstanceOf(InvalidApiKeyError);
    await expect(
      service.authenticate(first.apiKey, expiresAt),
    ).rejects.toBeInstanceOf(InvalidApiKeyError);

    const second = await service.create({
      workspaceId: workspace.id,
      name: "Second",
      now: createdAt,
    });
    await service.revoke(workspace.id, second.record.id, createdAt);
    await expect(
      service.authenticate(second.apiKey, createdAt),
    ).rejects.toBeInstanceOf(InvalidApiKeyError);

    const third = await service.create({
      workspaceId: workspace.id,
      name: "Third",
      now: createdAt,
    });
    await database
      .update(workspaces)
      .set({ deletedAt: createdAt })
      .where(eq(workspaces.id, workspace.id));
    await expect(
      service.authenticate(third.apiKey, createdAt),
    ).rejects.toBeInstanceOf(InvalidApiKeyError);
  });

  test("managed usage aggregation preserves elapsed boundaries, overlaps, zero rows, and registry validation", async () => {
    const [workspace] = await database
      .insert(workspaces)
      .values({ slug: "alpha", name: "Alpha" })
      .returning();
    const [metric, unusedMetric] = await database
      .insert(metrics)
      .values([
        { workspaceId: workspace.id, key: "credits", name: "Credits" },
        { workspaceId: workspace.id, key: "storage", name: "Storage" },
      ])
      .returning();
    const [scope] = await database
      .insert(scopes)
      .values({ workspaceId: workspace.id, key: "user", name: "User" })
      .returning();
    await database.insert(quotas).values([
      {
        workspaceId: workspace.id,
        metricId: metric.id,
        scopeId: scope.id,
        quotaLimit: 100,
        windowAmount: 1,
        windowUnit: "day",
      },
      {
        workspaceId: workspace.id,
        metricId: metric.id,
        scopeId: scope.id,
        quotaLimit: 10,
        windowAmount: 1,
        windowUnit: "hour",
      },
    ]);
    const [key] = await database
      .insert(apiKeys)
      .values({
        workspaceId: workspace.id,
        name: "Integration",
        secretHint: "abcd",
        secretHash: Buffer.alloc(32, 1),
      })
      .returning();
    const evaluatedAt = new Date("2026-07-07T12:00:00.000Z");
    const [batch] = await database
      .insert(usageBatches)
      .values({
        workspaceId: workspace.id,
        apiKeyId: key.id,
        idempotencyKey: "aggregation-batch",
        requestHash: Buffer.alloc(32, 2),
        occurredAt: evaluatedAt,
      })
      .returning();
    await database.insert(usageEvents).values(
      [
        ["2026-07-06T12:00:00.000Z", 100],
        ["2026-07-07T10:00:00.000Z", 7],
        ["2026-07-07T11:30:00.000Z", 3],
        ["2026-07-07T12:00:00.000Z", 2],
        ["2026-07-07T12:00:00.001Z", 1000],
      ].map(([occurredAt, consumed]) => ({
        workspaceId: workspace.id,
        batchId: batch.id,
        metricId: metric.id,
        scopeId: scope.id,
        scopeValue: "user-123",
        consumed: Number(consumed),
        occurredAt: new Date(String(occurredAt)),
      })),
    );
    const service = createManagedStorageService(database);
    const results = await service.query({
      workspaceId: workspace.id,
      metric: "credits",
      scopes: [{ key: "user", value: "user-123" }],
      evaluatedAt,
    });
    expect(results).toHaveLength(2);
    expect(
      results.map((result) => [result.quota.window.unit, result.consumed]),
    ).toEqual(
      expect.arrayContaining([
        ["day", 12],
        ["hour", 5],
      ]),
    );

    await expect(
      service.query({
        workspaceId: workspace.id,
        metric: unusedMetric.key,
        scopes: [{ key: "user", value: "user-123" }],
        evaluatedAt,
      }),
    ).resolves.toEqual([]);
    await expect(
      service.query({
        workspaceId: workspace.id,
        metric: "unknown",
        scopes: [{ key: "user", value: "user-123" }],
        evaluatedAt,
      }),
    ).rejects.toBeInstanceOf(ManagedStorageValidationError);
  });

  test("managed recording is atomic, active-registry constrained, and idempotent", async () => {
    const [workspace] = await database
      .insert(workspaces)
      .values({ slug: "alpha", name: "Alpha" })
      .returning();
    await database.insert(metrics).values({
      workspaceId: workspace.id,
      key: "credits",
      name: "Credits",
    });
    await database.insert(scopes).values({
      workspaceId: workspace.id,
      key: "user",
      name: "User",
    });
    const [key] = await database
      .insert(apiKeys)
      .values({
        workspaceId: workspace.id,
        name: "Integration",
        secretHint: "abcd",
        secretHash: Buffer.alloc(32, 1),
      })
      .returning();
    const service = createManagedStorageService(database);
    const input = {
      workspaceId: workspace.id,
      apiKeyId: key.id,
      idempotencyKey: "record-request-key",
      requestHash: Buffer.alloc(32, 3),
      occurredAt: new Date("2026-07-07T12:00:00.000Z"),
      events: [
        {
          metric: "credits",
          scope: { key: "user", value: "user-123" },
          consumed: 2,
        },
        {
          metric: "credits",
          scope: { key: "user", value: "user-123" },
          consumed: 2,
        },
      ],
    };

    await expect(service.record(input)).resolves.toMatchObject({
      recorded: 2,
      occurredAt: input.occurredAt,
      replayed: false,
    });
    await expect(
      service.record({ ...input, occurredAt: new Date("2027-01-01") }),
    ).resolves.toMatchObject({
      recorded: 2,
      occurredAt: input.occurredAt,
      replayed: true,
    });
    await expect(
      service.record({ ...input, requestHash: Buffer.alloc(32, 4) }),
    ).rejects.toBeInstanceOf(IdempotencyConflictError);
    await expect(database.select().from(usageEvents)).resolves.toHaveLength(2);

    await expect(
      service.record({
        ...input,
        idempotencyKey: "invalid-registry-request",
        requestHash: Buffer.alloc(32, 5),
        events: [
          ...input.events,
          {
            metric: "unknown",
            scope: { key: "user", value: "user-123" },
            consumed: 1,
          },
        ],
      }),
    ).rejects.toBeInstanceOf(ManagedStorageValidationError);
    await expect(database.select().from(usageBatches)).resolves.toHaveLength(1);
  });
});
