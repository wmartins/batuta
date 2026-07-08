import { chmod, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { parse } from "dotenv";

export const demoWorkspaceId = "10000000-0000-4000-8000-000000000001";
export const setupKeyName = "Managed storage demo";

type ApiKeyRecord = {
  id: string;
  workspaceId: string;
  name: string;
  expiresAt: Date | null;
  revokedAt: Date | null;
};

export type SetupDependencies = {
  apiKeys: {
    authenticate(
      value: string,
      at: Date,
    ): Promise<{ workspace: { id: string } }>;
    list(workspaceId: string): Promise<ApiKeyRecord[]>;
    revoke(workspaceId: string, apiKeyId: string, at: Date): Promise<unknown>;
    create(input: {
      workspaceId: string;
      name: string;
      now: Date;
    }): Promise<{ apiKey: string; record: ApiKeyRecord }>;
  };
};

export type SetupOptions = {
  dependencies: SetupDependencies;
  envPath: string;
  batutaUrl: string;
  now?: Date;
  stdout?: Pick<NodeJS.WriteStream, "write">;
};

async function readStoredKey(envPath: string) {
  try {
    const values = parse(await readFile(envPath, "utf8"));
    return values.BATUTA_API_KEY;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

export async function writeDemoEnv(
  envPath: string,
  values: { batutaUrl: string; apiKey: string },
) {
  const temporaryPath = join(
    dirname(envPath),
    `.env.${process.pid}.${Date.now()}.tmp`,
  );
  const contents = `BATUTA_URL=${values.batutaUrl}\nBATUTA_API_KEY=${values.apiKey}\n`;
  await writeFile(temporaryPath, contents, { encoding: "utf8", mode: 0o600 });
  await chmod(temporaryPath, 0o600).catch(() => undefined);
  await rename(temporaryPath, envPath);
}

export async function runSetup(options: SetupOptions) {
  const now = options.now ?? new Date();
  let apiKey = await readStoredKey(options.envPath);
  if (apiKey) {
    try {
      const authenticated = await options.dependencies.apiKeys.authenticate(
        apiKey,
        now,
      );
      if (authenticated.workspace.id !== demoWorkspaceId) apiKey = undefined;
    } catch {
      apiKey = undefined;
    }
  }

  if (!apiKey) {
    const keys = await options.dependencies.apiKeys.list(demoWorkspaceId);
    for (const key of keys) {
      const isActive =
        key.name === setupKeyName &&
        key.revokedAt === null &&
        (key.expiresAt === null || key.expiresAt > now);
      if (isActive) {
        await options.dependencies.apiKeys.revoke(demoWorkspaceId, key.id, now);
      }
    }
    const created = await options.dependencies.apiKeys.create({
      workspaceId: demoWorkspaceId,
      name: setupKeyName,
      now,
    });
    apiKey = created.apiKey;
  }

  await writeDemoEnv(options.envPath, {
    batutaUrl: options.batutaUrl,
    apiKey,
  });
  options.stdout?.write(
    "Configured the demo API key. Run the server, then: corepack pnpm --filter @batuta/demo run dev\n",
  );
}
