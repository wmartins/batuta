import { Quota } from "batuta";

import { db } from "../data/db.server";
import { createQuotaRepository } from "../data/repositories/quota.repository.server";
import type { QuotaInput as QuotaInputValue } from "../validation/quota";
import type { QuotaListQuery } from "../validation/quota-list";
import { requireActiveMetric } from "./metric.server";
import { requireActiveScope } from "./scope.server";

const repository = createQuotaRepository(db);

export class QuotaSelectionError extends Error {}

type QuotaInput = QuotaInputValue;

namespace QuotaInput {
  export async function validate(workspaceId: string, input: QuotaInput) {
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

    const base = {
      metric: metric.key,
      scope: input.scopeValue
        ? { key: scope.key, value: input.scopeValue }
        : scope.key,
      limit: input.quotaLimit ?? ("unlimited" as const),
    };
    if (input.type === "rolling") {
      Quota.validate({
        type: "rolling",
        ...base,
        window: {
          amount: input.windowAmount as number,
          unit: input.windowUnit as "minute" | "hour" | "day" | "week",
        },
      });
    } else if (input.type === "balance") {
      Quota.validate({ type: "balance", ...base });
    } else {
      Quota.validate({ type: "direct", ...base });
    }
  }
}

function isConfigurationConflict(error: unknown) {
  const cause =
    error && typeof error === "object" && "cause" in error
      ? error.cause
      : undefined;
  return Boolean(
    cause &&
      typeof cause === "object" &&
      "code" in cause &&
      (cause.code === "23505" || cause.code === "P0001"),
  );
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
  await QuotaInput.validate(workspaceId, input);
  try {
    return await repository.create(workspaceId, input);
  } catch (error) {
    if (isConfigurationConflict(error)) {
      throw new QuotaSelectionError(
        "This selector conflicts with an active quota. Use one kind per metric and scope, and unique rolling windows.",
      );
    }
    throw error;
  }
}

export async function updateQuota(
  workspaceId: string,
  quotaId: string,
  input: QuotaInput,
) {
  await QuotaInput.validate(workspaceId, input);
  try {
    const quota = await repository.update(workspaceId, quotaId, input);
    if (!quota) throw new Response("Not found", { status: 404 });
    return quota;
  } catch (error) {
    if (isConfigurationConflict(error)) {
      throw new QuotaSelectionError(
        "This selector conflicts with an active quota. Use one kind per metric and scope, and unique rolling windows.",
      );
    }
    throw error;
  }
}

export async function archiveQuota(workspaceId: string, quotaId: string) {
  const quota = await repository.archive(workspaceId, quotaId);
  if (!quota) throw new Response("Not found", { status: 404 });
  return quota;
}
