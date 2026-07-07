import "dotenv/config";

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { BatutaClient, BatutaStorage } from "@batuta/remote";
import { Batuta } from "batuta";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "../app/data/schema.server";
import {
  apiKeys,
  metrics,
  quotas,
  scopes,
  usageBatches,
  usageEvents,
  workspaces,
} from "../app/data/schema.server";
import { createApiKeyService } from "../app/services/api-key.server";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl || testDatabaseUrl === process.env.DATABASE_URL) {
  throw new Error("A distinct TEST_DATABASE_URL is required.");
}

const pepperText = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const pepper = Buffer.from(pepperText, "base64url");
const pool = new Pool({ connectionString: testDatabaseUrl });
const database = drizzle({ client: pool, schema });

async function availablePort() {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert(address && typeof address === "object");
  const port = address.port;
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return port;
}

async function clearDatabase() {
  await database.delete(usageEvents);
  await database.delete(usageBatches);
  await database.delete(apiKeys);
  await database.delete(quotas);
  await database.delete(metrics);
  await database.delete(scopes);
  await database.delete(workspaces);
}

async function main() {
  await clearDatabase();
  const [workspace] = await database
    .insert(workspaces)
    .values({ slug: "blackbox", name: "Black box" })
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
  const created = await createApiKeyService({ database, pepper }).create({
    workspaceId: workspace.id,
    name: "Black-box test",
  });

  const port = await availablePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn("react-router-serve", ["./build/server/index.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      API_KEY_PEPPER_V1: pepperText,
      DATABASE_URL: testDatabaseUrl,
      PORT: String(port),
    },
    stdio: ["ignore", "ignore", "pipe"],
  });
  let serverError = "";
  child.on("error", (error) => {
    serverError += error.message;
  });
  child.stderr?.on("data", (chunk) => {
    serverError += String(chunk);
  });
  try {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      try {
        const response = await fetch(`${baseUrl}/api/v1/usage/query`, {
          method: "POST",
        });
        if (response.status === 401) break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      if (attempt === 49)
        throw new Error(`Server did not start. ${serverError}`);
    }

    const storage = new BatutaStorage<"credits", "user">({
      baseUrl,
      apiKey: created.apiKey,
      retries: 0,
    });
    const batuta = new Batuta({ storage });
    const scopes = [{ key: "user" as const, value: "user-123" }];
    await expectEqual(batuta.check({ metric: "credits", scopes }), {
      exceeded: false,
    });
    await batuta.record({ metric: "credits", scopes, consumed: 3 });
    const client = new BatutaClient({
      baseUrl,
      apiKey: created.apiKey,
      retries: 0,
    });
    const queried = await client.queryUsage({ metric: "credits", scopes });
    assert.equal(queried.results.length, 1);
    assert.equal(queried.results[0]?.consumed, 3);

    const event = [{ metric: "credits", scope: scopes[0], consumed: 2 }];
    const first = await client.recordUsage(event, {
      idempotencyKey: "blackbox-replay-key",
    });
    const replay = await client.recordUsage(event, {
      idempotencyKey: "blackbox-replay-key",
    });
    assert.equal(first.replayed, false);
    assert.equal(replay.replayed, true);
    assert.equal(replay.batchId, first.batchId);
    assert.equal(replay.occurredAt, first.occurredAt);
    process.stdout.write("Managed-storage black-box flow passed.\n");
  } finally {
    child.kill("SIGTERM");
    await new Promise<void>((resolve) => child.once("exit", () => resolve()));
    await clearDatabase();
  }
}

async function expectEqual(actual: Promise<unknown>, expected: unknown) {
  assert.deepEqual(await actual, expected);
}

main().finally(() => pool.end());
