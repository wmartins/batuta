import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  demoWorkspaceId,
  runSetup,
  type SetupDependencies,
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
  type ApiKey = Awaited<
    ReturnType<SetupDependencies["apiKeys"]["list"]>
  >[number];
  const keys = new Map<string, ApiKey>();
  const credentials = new Map<string, string>();
  let createdKeyCount = 0;
  let revokedKeyCount = 0;

  const dependencies = {
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
    keys,
    get createdKeyCount() {
      return createdKeyCount;
    },
    get revokedKeyCount() {
      return revokedKeyCount;
    },
  };
}

describe("demo credential setup", () => {
  it("creates a workspace-scoped key and writes only runtime env data", async () => {
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

    expect(memory.keys).toHaveLength(1);
    expect([...memory.keys.values()][0].workspaceId).toBe(demoWorkspaceId);
    const contents = await readFile(envPath, "utf8");
    expect(contents).toMatch(/^BATUTA_URL=.*\nBATUTA_API_KEY=.*\n$/);
    expect(contents).not.toContain("DATABASE_URL");
    expect(output).not.toContain("batuta_live_");
  });

  it("retains a valid stored key", async () => {
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

    expect(memory.createdKeyCount).toBe(1);
    expect(await readFile(envPath, "utf8")).toBe(firstEnv);
  });

  it("replaces an invalid key and revokes active demo keys", async () => {
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
});
