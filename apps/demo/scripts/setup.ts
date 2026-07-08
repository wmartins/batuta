import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parse } from "dotenv";

import { runSetup } from "./setup-core";

const demoDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const serverEnvPath = resolve(demoDirectory, "../server/.env");
const demoEnvPath = resolve(demoDirectory, ".env");

function readBatutaUrl(argv: readonly string[]) {
  let batutaUrl = "http://localhost:5173";
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument !== "--batuta-url") {
      throw new Error(`Unexpected argument: ${argument}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error("--batuta-url requires a value");
    }
    batutaUrl = value;
    index += 1;
  }
  const url = new URL(batutaUrl);
  if (url.username || url.password) {
    throw new Error("--batuta-url must not contain credentials");
  }
  return url.toString().replace(/\/$/, "");
}

async function loadServerEnvironment() {
  let values: Record<string, string>;
  try {
    values = parse(await readFile(serverEnvPath, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(
        "apps/server/.env is missing. Copy apps/server/.env.example and configure it first.",
      );
    }
    throw error;
  }
  for (const name of ["DATABASE_URL", "API_KEY_PEPPER_V1"] as const) {
    if (!values[name]) {
      throw new Error(`${name} is missing from apps/server/.env.`);
    }
    process.env[name] = values[name];
  }
}

async function main() {
  const batutaUrl = readBatutaUrl(process.argv.slice(2));
  await loadServerEnvironment();

  const [{ db, pool }, { ApiKeyNotFoundError, createApiKeyService }] =
    await Promise.all([
      import("../../server/app/data/db.server"),
      import("../../server/app/services/api-key.server"),
    ]);
  const apiKeys = createApiKeyService({
    database: db,
    pepper: Buffer.from(process.env.API_KEY_PEPPER_V1 ?? "", "base64url"),
  });

  try {
    try {
      await runSetup({
        dependencies: { apiKeys },
        envPath: demoEnvPath,
        batutaUrl,
        stdout: process.stdout,
      });
    } catch (error) {
      if (error instanceof ApiKeyNotFoundError) {
        throw new Error(
          "The seeded demo workspace was not found. Run corepack pnpm --filter @batuta/server run db:seed first.",
        );
      }
      throw error;
    }
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Demo setup failed.";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
