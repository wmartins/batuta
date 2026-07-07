import { chmod, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { parse } from "dotenv";

export const setupIds = {
  workspace: "10000000-0000-4000-8000-000000000001",
  metric: "10000000-0000-4000-8000-000000000101",
  scopeUser: "10000000-0000-4000-8000-000000000201",
  scopeTeam: "10000000-0000-4000-8000-000000000202",
  quotaUser: "10000000-0000-4000-8000-000000000301",
  quotaTeam: "10000000-0000-4000-8000-000000000302",
} as const;

export const setupKeyName = "Managed storage demo";

type WorkspaceRecord = {
  id: string;
  slug: string;
  name: string;
  deletedAt: Date | null;
};

type RegistryRecord = {
  id: string;
  workspaceId: string;
  key: string;
  name: string;
  description: string | null;
  deletedAt: Date | null;
};

type QuotaRecord = {
  id: string;
  workspaceId: string;
  metricId: string;
  scopeId: string;
  quotaLimit: number;
  windowAmount: number;
  windowUnit: "minute" | "hour" | "day" | "week";
  deletedAt: Date | null;
};

type ApiKeyRecord = {
  id: string;
  workspaceId: string;
  name: string;
  expiresAt: Date | null;
  revokedAt: Date | null;
};

type RegistryInput = Omit<RegistryRecord, "deletedAt">;
type QuotaInput = Omit<QuotaRecord, "deletedAt">;

export type SetupDependencies = {
  workspaces: {
    findById(id: string): Promise<WorkspaceRecord | undefined>;
    findActiveBySlug(slug: string): Promise<WorkspaceRecord | undefined>;
    create(input: Omit<WorkspaceRecord, "deletedAt">): Promise<WorkspaceRecord>;
    update(
      id: string,
      input: { slug: string; name: string },
    ): Promise<WorkspaceRecord>;
  };
  metrics: RegistryRepository;
  scopes: RegistryRepository;
  quotas: {
    findById(id: string): Promise<QuotaRecord | undefined>;
    create(input: QuotaInput): Promise<QuotaRecord>;
    update(id: string, input: QuotaInput): Promise<QuotaRecord>;
  };
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

type RegistryRepository = {
  findById(id: string): Promise<RegistryRecord | undefined>;
  findActiveByKey(
    workspaceId: string,
    key: string,
  ): Promise<RegistryRecord | undefined>;
  create(input: RegistryInput): Promise<RegistryRecord>;
  update(id: string, input: RegistryInput): Promise<RegistryRecord>;
};

export type SetupOptions = {
  dependencies: SetupDependencies;
  envPath: string;
  batutaUrl: string;
  now?: Date;
  stdout?: Pick<NodeJS.WriteStream, "write">;
};

function collision(resource: string): never {
  throw new Error(
    `Demo setup ownership collision for ${resource}. No records were adopted or reassigned.`,
  );
}

async function convergeWorkspace(dependencies: SetupDependencies) {
  const [owned, natural] = await Promise.all([
    dependencies.workspaces.findById(setupIds.workspace),
    dependencies.workspaces.findActiveBySlug("creative-demo"),
  ]);
  if (!owned && !natural) {
    return dependencies.workspaces.create({
      id: setupIds.workspace,
      slug: "creative-demo",
      name: "Creative Demo",
    });
  }
  if (
    !owned ||
    !natural ||
    owned.id !== natural.id ||
    owned.deletedAt !== null
  ) {
    return collision("workspace");
  }
  return dependencies.workspaces.update(owned.id, {
    slug: "creative-demo",
    name: "Creative Demo",
  });
}

async function convergeRegistry(
  repository: RegistryRepository,
  input: RegistryInput,
  resource: string,
) {
  const [owned, natural] = await Promise.all([
    repository.findById(input.id),
    repository.findActiveByKey(input.workspaceId, input.key),
  ]);
  if (!owned && !natural) return repository.create(input);
  if (
    !owned ||
    !natural ||
    owned.id !== natural.id ||
    owned.workspaceId !== input.workspaceId ||
    owned.deletedAt !== null
  ) {
    return collision(resource);
  }
  return repository.update(input.id, input);
}

async function convergeQuota(
  dependencies: SetupDependencies,
  input: QuotaInput,
  resource: string,
) {
  const owned = await dependencies.quotas.findById(input.id);
  if (!owned) return dependencies.quotas.create(input);
  if (owned.workspaceId !== input.workspaceId) return collision(resource);
  return dependencies.quotas.update(input.id, input);
}

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
  const workspace = await convergeWorkspace(options.dependencies);
  const metric = await convergeRegistry(
    options.dependencies.metrics,
    {
      id: setupIds.metric,
      workspaceId: workspace.id,
      key: "credits",
      name: "Credits",
      description: "Credits spent by the managed-storage demo.",
    },
    "credits metric",
  );
  const userScope = await convergeRegistry(
    options.dependencies.scopes,
    {
      id: setupIds.scopeUser,
      workspaceId: workspace.id,
      key: "user",
      name: "User",
      description: "A creative working inside a demo studio.",
    },
    "user scope",
  );
  const teamScope = await convergeRegistry(
    options.dependencies.scopes,
    {
      id: setupIds.scopeTeam,
      workspaceId: workspace.id,
      key: "team",
      name: "Team",
      description: "A creative studio sharing a team quota.",
    },
    "team scope",
  );
  const userQuota = await convergeQuota(
    options.dependencies,
    {
      id: setupIds.quotaUser,
      workspaceId: workspace.id,
      metricId: metric.id,
      scopeId: userScope.id,
      quotaLimit: 12,
      windowAmount: 1,
      windowUnit: "minute",
    },
    "user quota",
  );
  const teamQuota = await convergeQuota(
    options.dependencies,
    {
      id: setupIds.quotaTeam,
      workspaceId: workspace.id,
      metricId: metric.id,
      scopeId: teamScope.id,
      quotaLimit: 30,
      windowAmount: 1,
      windowUnit: "minute",
    },
    "team quota",
  );

  let apiKey = await readStoredKey(options.envPath);
  if (apiKey) {
    try {
      const authenticated = await options.dependencies.apiKeys.authenticate(
        apiKey,
        now,
      );
      if (authenticated.workspace.id !== workspace.id) apiKey = undefined;
    } catch {
      apiKey = undefined;
    }
  }

  if (!apiKey) {
    const keys = await options.dependencies.apiKeys.list(workspace.id);
    for (const key of keys) {
      const isActive =
        key.name === setupKeyName &&
        key.revokedAt === null &&
        (key.expiresAt === null || key.expiresAt > now);
      if (isActive) {
        await options.dependencies.apiKeys.revoke(workspace.id, key.id, now);
      }
    }
    const created = await options.dependencies.apiKeys.create({
      workspaceId: workspace.id,
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
    `Configured ${workspace.slug}: metric ${metric.id}, scopes ${userScope.id}/${teamScope.id}, quotas ${userQuota.id}/${teamQuota.id}.\nRun the server, then: corepack pnpm --filter @batuta/demo dev\n`,
  );
  return { workspace, metric, userScope, teamScope, userQuota, teamQuota };
}
