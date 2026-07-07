import {
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";

import type { Database } from "../data/db.server";
import { createApiKeyRepository } from "../data/repositories/api-key.repository.server";
import { createWorkspaceRepository } from "../data/repositories/workspace.repository.server";

const API_KEY_PATTERN =
  /^batuta_live_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})_([A-Za-z0-9_-]{43})$/;
const LAST_USED_INTERVAL_MS = 5 * 60 * 1000;

export class InvalidApiKeyError extends Error {
  constructor() {
    super("The API key is invalid.");
  }
}

export class ApiKeyInputError extends Error {}
export class ApiKeyNotFoundError extends Error {}

function hashSecret(pepper: Buffer, secret: string) {
  return createHmac("sha256", pepper).update(secret, "utf8").digest();
}

export function createApiKeyService(options: {
  database: Database;
  pepper: Buffer;
}) {
  if (options.pepper.length < 32) {
    throw new Error("The API-key pepper must contain at least 32 bytes.");
  }
  const keys = createApiKeyRepository(options.database);
  const workspaces = createWorkspaceRepository(options.database);

  return {
    async create(input: {
      workspaceId: string;
      name: string;
      expiresAt?: Date | null;
      now?: Date;
    }) {
      const now = input.now ?? new Date();
      const name = input.name.trim();
      if (name.length < 1 || name.length > 100) {
        throw new ApiKeyInputError(
          "API-key names must be 1 to 100 characters.",
        );
      }
      const expiresAt = input.expiresAt ?? null;
      if (expiresAt && expiresAt.getTime() <= now.getTime()) {
        throw new ApiKeyInputError("API-key expiration must be in the future.");
      }
      if (!(await workspaces.findActiveById(input.workspaceId))) {
        throw new ApiKeyNotFoundError("The active workspace was not found.");
      }

      const id = randomUUID();
      const secret = randomBytes(32).toString("base64url");
      const record = await keys.create({
        id,
        workspaceId: input.workspaceId,
        name,
        secretHint: secret.slice(-4),
        secretHash: hashSecret(options.pepper, secret),
        hashVersion: 1,
        expiresAt,
        createdAt: now,
      });
      return {
        record,
        apiKey: `batuta_live_${id}_${secret}`,
      };
    },

    list(workspaceId: string) {
      return keys.list(workspaceId);
    },

    async authenticate(value: string, at = new Date()) {
      const match = API_KEY_PATTERN.exec(value);
      if (!match) throw new InvalidApiKeyError();
      const [, id, secret] = match;
      const result = await keys.findForAuthentication(id, at);
      if (result?.apiKey.hashVersion !== 1) {
        throw new InvalidApiKeyError();
      }
      const suppliedHash = hashSecret(options.pepper, secret);
      if (
        suppliedHash.length !== result.apiKey.secretHash.length ||
        !timingSafeEqual(suppliedHash, result.apiKey.secretHash)
      ) {
        throw new InvalidApiKeyError();
      }

      const notAfter = new Date(at.getTime() - LAST_USED_INTERVAL_MS);
      await keys
        .touchLastUsed(result.workspace.id, result.apiKey.id, at, notAfter)
        .catch(() => undefined);
      return result;
    },

    async revoke(workspaceId: string, apiKeyId: string, at = new Date()) {
      const existing = await keys.findById(workspaceId, apiKeyId);
      if (!existing)
        throw new ApiKeyNotFoundError("The API key was not found.");
      if (existing.revokedAt) return { record: existing, alreadyRevoked: true };
      const record = await keys.revoke(workspaceId, apiKeyId, at);
      return { record: record ?? existing, alreadyRevoked: !record };
    },

    async revokeForOperator(apiKeyId: string, at = new Date()) {
      const existing = await keys.findForOperatorRevocation(apiKeyId);
      if (!existing)
        throw new ApiKeyNotFoundError("The API key was not found.");
      return this.revoke(existing.workspaceId, apiKeyId, at);
    },
  };
}
