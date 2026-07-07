import { db } from "../data/db.server";
import { createWorkspaceRepository } from "../data/repositories/workspace.repository.server";
import type { Workspace } from "../data/schema.server";
import type { WorkspaceInput } from "../validation/workspace";

const repository = createWorkspaceRepository(db);

export class WorkspaceSlugConflictError extends Error {
  constructor() {
    super("An active workspace already uses this slug.");
  }
}

function hasPostgresCode(error: unknown, code: string) {
  if (!error || typeof error !== "object" || !("cause" in error)) {
    return false;
  }

  const { cause } = error;
  return (
    cause !== null &&
    typeof cause === "object" &&
    "code" in cause &&
    cause.code === code
  );
}

async function mapSlugConflict<T>(operation: () => Promise<T>) {
  try {
    return await operation();
  } catch (error) {
    if (hasPostgresCode(error, "23505")) {
      throw new WorkspaceSlugConflictError();
    }
    throw error;
  }
}

export function listActiveWorkspaces() {
  return repository.listActive();
}

export function findActiveWorkspace(slug: string) {
  return repository.findActiveBySlug(slug);
}

export async function requireActiveWorkspace(slug: string) {
  const workspace = await findActiveWorkspace(slug);
  if (!workspace) {
    throw new Response("Not found", { status: 404 });
  }
  return workspace;
}

export function createWorkspace(input: WorkspaceInput) {
  return mapSlugConflict(() => repository.create(input));
}

export async function updateWorkspace(
  workspace: Workspace,
  input: WorkspaceInput,
) {
  const updated = await mapSlugConflict(() =>
    repository.update(workspace.id, input),
  );
  if (!updated) {
    throw new Response("Not found", { status: 404 });
  }
  return updated;
}

export async function archiveWorkspace(workspace: Workspace) {
  const archived = await repository.archive(workspace.id);
  if (!archived) {
    throw new Response("Not found", { status: 404 });
  }
  return archived;
}

export function getWorkspaceCounts(workspaceId: string) {
  return repository.activeCounts(workspaceId);
}
