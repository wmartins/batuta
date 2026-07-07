import { db } from "../data/db.server";
import { createScopeRepository } from "../data/repositories/scope.repository.server";
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

const repository = createScopeRepository(db);

export function listActiveScopes(workspaceId: string) {
  return repository.listActive(workspaceId);
}

export function listScopePage(workspaceId: string, query: RegistryListQuery) {
  return repository.listPage(workspaceId, query);
}

export async function requireActiveScope(workspaceId: string, scopeId: string) {
  const scope = await repository.findActiveById(workspaceId, scopeId);
  if (!scope) throw new Response("Not found", { status: 404 });
  return scope;
}

export async function createScope(
  workspaceId: string,
  input: CreateRegistryInput,
) {
  try {
    return await repository.create(workspaceId, input);
  } catch (error) {
    if (hasPostgresCode(error, "23505")) {
      throw new RegistryKeyConflictError("scope");
    }
    throw error;
  }
}

export async function updateScope(
  workspaceId: string,
  scopeId: string,
  input: UpdateRegistryInput,
) {
  const scope = await repository.update(workspaceId, scopeId, input);
  if (!scope) throw new Response("Not found", { status: 404 });
  return scope;
}

export async function archiveScope(workspaceId: string, scopeId: string) {
  const result = await repository.archiveIfUnused(workspaceId, scopeId);
  if (result.dependencies > 0) {
    throw new RegistryDependencyError("scope", result.dependencies);
  }
  if (!result.archived) throw new Response("Not found", { status: 404 });
  return result.archived;
}
