import { db } from "../data/db.server";
import { createMetricRepository } from "../data/repositories/metric.repository.server";
import type {
  CreateRegistryInput,
  UpdateRegistryInput,
} from "../validation/registry";
import type { RegistryListQuery } from "../validation/registry-list";
import {
  hasPostgresCode,
  RegistryDependencyError,
  RegistryKeyConflictError,
} from "./registry-errors.server";

const repository = createMetricRepository(db);

export function listActiveMetrics(workspaceId: string) {
  return repository.listActive(workspaceId);
}

export function listMetricPage(workspaceId: string, query: RegistryListQuery) {
  return repository.listPage(workspaceId, query);
}

export async function requireActiveMetric(
  workspaceId: string,
  metricId: string,
) {
  const metric = await repository.findActiveById(workspaceId, metricId);
  if (!metric) throw new Response("Not found", { status: 404 });
  return metric;
}

export async function createMetric(
  workspaceId: string,
  input: CreateRegistryInput,
) {
  try {
    return await repository.create(workspaceId, input);
  } catch (error) {
    if (hasPostgresCode(error, "23505")) {
      throw new RegistryKeyConflictError("metric");
    }
    throw error;
  }
}

export async function updateMetric(
  workspaceId: string,
  metricId: string,
  input: UpdateRegistryInput,
) {
  const metric = await repository.update(workspaceId, metricId, input);
  if (!metric) throw new Response("Not found", { status: 404 });
  return metric;
}

export async function archiveMetric(workspaceId: string, metricId: string) {
  const result = await repository.archiveIfUnused(workspaceId, metricId);
  if (result.dependencies > 0) {
    throw new RegistryDependencyError("metric", result.dependencies);
  }
  if (!result.archived) throw new Response("Not found", { status: 404 });
  return result.archived;
}
