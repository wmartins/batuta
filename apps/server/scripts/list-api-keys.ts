import { db, pool } from "../app/data/db.server";
import { env } from "../app/data/env.server";
import { createWorkspaceRepository } from "../app/data/repositories/workspace.repository.server";
import { createApiKeyService } from "../app/services/api-key.server";
import {
  printCommandError,
  readArguments,
  requireArgument,
} from "./api-key-command";

async function main() {
  const arguments_ = readArguments(process.argv.slice(2));
  const workspace = await createWorkspaceRepository(db).findActiveBySlug(
    requireArgument(arguments_, "workspace"),
  );
  if (!workspace) throw new Error("Active workspace not found.");
  const service = createApiKeyService({
    database: db,
    pepper: Buffer.from(env.API_KEY_PEPPER_V1, "base64url"),
  });
  const records = await service.list(workspace.id);
  process.stdout.write(
    `${JSON.stringify(
      records.map((record) => ({
        id: record.id,
        workspaceId: record.workspaceId,
        name: record.name,
        secretHint: record.secretHint,
        createdAt: record.createdAt.toISOString(),
        expiresAt: record.expiresAt?.toISOString() ?? null,
        revokedAt: record.revokedAt?.toISOString() ?? null,
        lastUsedAt: record.lastUsedAt?.toISOString() ?? null,
      })),
    )}\n`,
  );
}

main()
  .catch(printCommandError)
  .finally(() => pool.end());
