import { Quota } from "batuta";

import { db } from "../data/db.server";
import { createQuotaRepository } from "../data/repositories/quota.repository.server";
import type { QuotaInput } from "../validation/quota";
import type { QuotaListQuery } from "../validation/quota-list";
import { requireActiveMetric } from "./metric.server";
import { requireActiveScope } from "./scope.server";

const repository = createQuotaRepository(db);

export class QuotaSelectionError extends Error {}

async function validateInput(workspaceId: string, input: QuotaInput) {
  const records = await Promise.all([
    requireActiveMetric(workspaceId, input.metricId),
    requireActiveScope(workspaceId, input.scopeId),
  ]).catch((error: unknown) => {
    if (error instanceof Response && error.status === 404) {
      throw new QuotaSelectionError(
        "Choose active metric and scope records from this workspace.",
      );
    }
    throw error;
  });
  const [metric, scope] = records;

  Quota.validate({
    metric: metric.key,
    scope: scope.key,
    limit: input.quotaLimit,
    window: { amount: input.windowAmount, unit: input.windowUnit },
  });
}

export function listQuotaPage(workspaceId: string, query: QuotaListQuery) {
  return repository.listPage(workspaceId, query);
}

export async function requireActiveQuota(workspaceId: string, quotaId: string) {
  const quota = await repository.findActiveById(workspaceId, quotaId);
  if (!quota) throw new Response("Not found", { status: 404 });
  return quota;
}

export async function createQuota(workspaceId: string, input: QuotaInput) {
  await validateInput(workspaceId, input);
  return repository.create(workspaceId, input);
}

export async function updateQuota(
  workspaceId: string,
  quotaId: string,
  input: QuotaInput,
) {
  await validateInput(workspaceId, input);
  const quota = await repository.update(workspaceId, quotaId, input);
  if (!quota) throw new Response("Not found", { status: 404 });
  return quota;
}

export async function archiveQuota(workspaceId: string, quotaId: string) {
  const quota = await repository.archive(workspaceId, quotaId);
  if (!quota) throw new Response("Not found", { status: 404 });
  return quota;
}
