import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  runSetup,
  type SetupDependencies,
  setupIds,
  setupKeyName,
} from "../scripts/setup-core";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { force: true, recursive: true })),
  );
});

async function temporaryEnvPath() {
  const directory = await mkdtemp(join(tmpdir(), "batuta-demo-setup-"));
  temporaryDirectories.push(directory);
  return join(directory, ".env");
}

function memoryDependencies() {
  type Workspace = Awaited<
    ReturnType<SetupDependencies["workspaces"]["create"]>
  >;
  type Registry = Awaited<ReturnType<SetupDependencies["metrics"]["create"]>>;
  type Quota = Awaited<ReturnType<SetupDependencies["quotas"]["create"]>>;
  type ApiKey = Awaited<
    ReturnType<SetupDependencies["apiKeys"]["list"]>
  >[number];

  const workspaces = new Map<string, Workspace>();
  const metrics = new Map<string, Registry>();
  const scopes = new Map<string, Registry>();
  const quotas = new Map<string, Quota>();
  const keys = new Map<string, ApiKey>();
  const credentials = new Map<string, string>();
  let createdKeyCount = 0;
  let revokedKeyCount = 0;

  function registryRepository(records: Map<string, Registry>) {
    return {
      async findById(id: string) {
        return records.get(id);
      },
      async findActiveByKey(workspaceId: string, key: string) {
        return [...records.values()].find(
          (record) =>
            record.workspaceId === workspaceId &&
            record.key === key &&
            record.deletedAt === null,
        );
      },
      async create(input: Omit<Registry, "deletedAt">) {
        const record = { ...input, deletedAt: null };
        records.set(record.id, record);
        return record;
      },
      async update(id: string, input: Omit<Registry, "deletedAt">) {
        const record = { ...input, deletedAt: null };
        records.set(id, record);
        return record;
      },
    };
  }

  const dependencies = {
    workspaces: {
      async findById(id: string) {
        return workspaces.get(id);
      },
      async findActiveBySlug(slug: string) {
        return [...workspaces.values()].find(
          (record) => record.slug === slug && record.deletedAt === null,
        );
      },
      async create(input: Omit<Workspace, "deletedAt">) {
        const record = { ...input, deletedAt: null };
        workspaces.set(record.id, record);
        return record;
      },
      async update(id: string, input: { slug: string; name: string }) {
        const current = workspaces.get(id);
        if (!current) throw new Error("Missing workspace");
        const record = { ...current, ...input };
        workspaces.set(id, record);
        return record;
      },
    },
    metrics: registryRepository(metrics),
    scopes: registryRepository(scopes),
    quotas: {
      async findById(id: string) {
        return quotas.get(id);
      },
      async create(input: Omit<Quota, "deletedAt">) {
        const record = { ...input, deletedAt: null };
        quotas.set(record.id, record);
        return record;
      },
      async update(id: string, input: Omit<Quota, "deletedAt">) {
        const record = { ...input, deletedAt: null };
        quotas.set(id, record);
        return record;
      },
    },
    apiKeys: {
      async authenticate(value: string) {
        const workspaceId = credentials.get(value);
        if (!workspaceId) throw new Error("Invalid API key");
        return { workspace: { id: workspaceId } };
      },
      async list(workspaceId: string) {
        return [...keys.values()].filter(
          (key) => key.workspaceId === workspaceId,
        );
      },
      async revoke(_workspaceId: string, apiKeyId: string, at: Date) {
        const key = keys.get(apiKeyId);
        if (key) {
          keys.set(apiKeyId, { ...key, revokedAt: at });
          revokedKeyCount += 1;
        }
      },
      async create(input: { workspaceId: string; name: string }) {
        createdKeyCount += 1;
        const id = `key-${createdKeyCount}`;
        const apiKey = `batuta_live_test_${createdKeyCount}`;
        const record = {
          id,
          workspaceId: input.workspaceId,
          name: input.name,
          expiresAt: null,
          revokedAt: null,
        };
        keys.set(id, record);
        credentials.set(apiKey, input.workspaceId);
        return { apiKey, record };
      },
    },
  } satisfies SetupDependencies;

  return {
    dependencies,
    workspaces,
    metrics,
    scopes,
    quotas,
    keys,
    get createdKeyCount() {
      return createdKeyCount;
    },
    get revokedKeyCount() {
      return revokedKeyCount;
    },
  };
}

describe("demo setup", () => {
  it("creates the workspace, registries, quotas, key, and restricted env data", async () => {
    const memory = memoryDependencies();
    const envPath = await temporaryEnvPath();
    let output = "";
    await runSetup({
      dependencies: memory.dependencies,
      envPath,
      batutaUrl: "http://localhost:5173",
      stdout: {
        write(chunk) {
          output += String(chunk);
          return true;
        },
      },
    });

    expect(memory.workspaces).toHaveLength(1);
    expect(memory.metrics).toHaveLength(1);
    expect(memory.scopes).toHaveLength(2);
    expect(memory.quotas).toHaveLength(2);
    expect(memory.keys).toHaveLength(1);
    const contents = await readFile(envPath, "utf8");
    expect(contents).toMatch(/^BATUTA_URL=.*\nBATUTA_API_KEY=.*\n$/);
    expect(contents).not.toContain("DATABASE_URL");
    expect(output).not.toContain("batuta_live_");
  });

  it("is idempotent and retains a valid stored key", async () => {
    const memory = memoryDependencies();
    const envPath = await temporaryEnvPath();
    const options = {
      dependencies: memory.dependencies,
      envPath,
      batutaUrl: "http://localhost:5173",
    };
    await runSetup(options);
    const firstEnv = await readFile(envPath, "utf8");
    await runSetup(options);

    expect(memory.quotas).toHaveLength(2);
    expect(memory.createdKeyCount).toBe(1);
    expect(await readFile(envPath, "utf8")).toBe(firstEnv);
  });

  it("replaces an invalid key and revokes active setup-owned keys", async () => {
    const memory = memoryDependencies();
    const envPath = await temporaryEnvPath();
    const options = {
      dependencies: memory.dependencies,
      envPath,
      batutaUrl: "http://localhost:5173",
    };
    await runSetup(options);
    await writeFile(
      envPath,
      "BATUTA_URL=http://localhost:5173\nBATUTA_API_KEY=invalid\n",
    );
    await runSetup(options);

    expect(memory.createdKeyCount).toBe(2);
    expect(memory.revokedKeyCount).toBe(1);
    expect(
      [...memory.keys.values()].filter((key) => !key.revokedAt),
    ).toHaveLength(1);
    expect([...memory.keys.values()].at(-1)?.name).toBe(setupKeyName);
  });

  it("fails safely when a setup-owned ID belongs to another record", async () => {
    const memory = memoryDependencies();
    memory.workspaces.set(setupIds.workspace, {
      id: setupIds.workspace,
      slug: "someone-elses-workspace",
      name: "Someone else",
      deletedAt: null,
    });
    const envPath = await temporaryEnvPath();

    await expect(
      runSetup({
        dependencies: memory.dependencies,
        envPath,
        batutaUrl: "http://localhost:5173",
      }),
    ).rejects.toThrow("ownership collision");
    await expect(readFile(envPath, "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});
