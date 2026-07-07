import { db, pool } from "../app/data/db.server";
import { env } from "../app/data/env.server";
import { createApiKeyService } from "../app/services/api-key.server";
import {
  printCommandError,
  readArguments,
  requireArgument,
} from "./api-key-command";

async function main() {
  const arguments_ = readArguments(process.argv.slice(2));
  const id = requireArgument(arguments_, "id");
  const service = createApiKeyService({
    database: db,
    pepper: Buffer.from(env.API_KEY_PEPPER_V1, "base64url"),
  });
  const result = await service.revokeForOperator(id);
  process.stdout.write(
    `${JSON.stringify({
      id: result.record.id,
      workspaceId: result.record.workspaceId,
      revokedAt: result.record.revokedAt?.toISOString() ?? null,
      alreadyRevoked: result.alreadyRevoked,
    })}\n`,
  );
}

main()
  .catch(printCommandError)
  .finally(() => pool.end());
