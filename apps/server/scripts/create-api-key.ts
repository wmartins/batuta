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
  const workspaceSlug = requireArgument(arguments_, "workspace");
  const name = requireArgument(arguments_, "name");
  const expiresAtValue = arguments_.get("expires-at");
  const expiresAt = expiresAtValue ? new Date(expiresAtValue) : null;
  if (
    expiresAt &&
    (!expiresAtValue?.includes("T") || !Number.isFinite(expiresAt.getTime()))
  ) {
    throw new Error("--expires-at must be an RFC 3339 timestamp");
  }
  const workspace =
    await createWorkspaceRepository(db).findActiveBySlug(workspaceSlug);
  if (!workspace) throw new Error("Active workspace not found.");
  const service = createApiKeyService({
    database: db,
    pepper: Buffer.from(env.API_KEY_PEPPER_V1, "base64url"),
  });
  const created = await service.create({
    workspaceId: workspace.id,
    name,
    expiresAt,
  });
  process.stdout.write(
    `${JSON.stringify({
      id: created.record.id,
      workspaceId: created.record.workspaceId,
      name: created.record.name,
      apiKey: created.apiKey,
      expiresAt: created.record.expiresAt?.toISOString() ?? null,
    })}\n`,
  );
}

main()
  .catch(printCommandError)
  .finally(() => pool.end());
