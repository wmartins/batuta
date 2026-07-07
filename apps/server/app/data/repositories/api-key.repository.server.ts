import { and, asc, eq, gt, isNull, lte, or } from "drizzle-orm";

import type { Database } from "../db.server";
import { apiKeys, workspaces } from "../schema.server";

export type CreateApiKeyRecord = {
  id: string;
  workspaceId: string;
  name: string;
  secretHint: string;
  secretHash: Buffer;
  hashVersion: 1;
  expiresAt: Date | null;
  createdAt: Date;
};

export function createApiKeyRepository(database: Database) {
  return {
    async create(input: CreateApiKeyRecord) {
      const [apiKey] = await database.insert(apiKeys).values(input).returning();
      return apiKey;
    },

    async list(workspaceId: string) {
      return database
        .select({
          id: apiKeys.id,
          workspaceId: apiKeys.workspaceId,
          name: apiKeys.name,
          secretHint: apiKeys.secretHint,
          hashVersion: apiKeys.hashVersion,
          lastUsedAt: apiKeys.lastUsedAt,
          expiresAt: apiKeys.expiresAt,
          revokedAt: apiKeys.revokedAt,
          createdAt: apiKeys.createdAt,
        })
        .from(apiKeys)
        .where(eq(apiKeys.workspaceId, workspaceId))
        .orderBy(asc(apiKeys.createdAt), asc(apiKeys.id));
    },

    async findById(workspaceId: string, apiKeyId: string) {
      const [apiKey] = await database
        .select()
        .from(apiKeys)
        .where(
          and(eq(apiKeys.workspaceId, workspaceId), eq(apiKeys.id, apiKeyId)),
        )
        .limit(1);
      return apiKey;
    },

    // Authentication starts with the UUID embedded in the opaque credential,
    // before the owning workspace is known.
    async findForAuthentication(apiKeyId: string, at: Date) {
      const [result] = await database
        .select({ apiKey: apiKeys, workspace: workspaces })
        .from(apiKeys)
        .innerJoin(workspaces, eq(workspaces.id, apiKeys.workspaceId))
        .where(
          and(
            eq(apiKeys.id, apiKeyId),
            eq(apiKeys.hashVersion, 1),
            isNull(apiKeys.revokedAt),
            or(isNull(apiKeys.expiresAt), gt(apiKeys.expiresAt, at)),
            isNull(workspaces.deletedAt),
          ),
        )
        .limit(1);
      return result;
    },

    async touchLastUsed(
      workspaceId: string,
      apiKeyId: string,
      usedAt: Date,
      notAfter: Date,
    ) {
      const [apiKey] = await database
        .update(apiKeys)
        .set({ lastUsedAt: usedAt })
        .where(
          and(
            eq(apiKeys.workspaceId, workspaceId),
            eq(apiKeys.id, apiKeyId),
            or(isNull(apiKeys.lastUsedAt), lte(apiKeys.lastUsedAt, notAfter)),
          ),
        )
        .returning({ id: apiKeys.id });
      return apiKey;
    },

    async revoke(workspaceId: string, apiKeyId: string, revokedAt: Date) {
      const [apiKey] = await database
        .update(apiKeys)
        .set({ revokedAt })
        .where(
          and(
            eq(apiKeys.workspaceId, workspaceId),
            eq(apiKeys.id, apiKeyId),
            isNull(apiKeys.revokedAt),
          ),
        )
        .returning();
      return apiKey;
    },

    // The self-hosted revoke command accepts only the globally unique key UUID.
    async findForOperatorRevocation(apiKeyId: string) {
      const [apiKey] = await database
        .select()
        .from(apiKeys)
        .where(eq(apiKeys.id, apiKeyId))
        .limit(1);
      return apiKey;
    },
  };
}
