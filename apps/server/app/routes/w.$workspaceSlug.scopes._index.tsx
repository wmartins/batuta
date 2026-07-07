import { RegistryListPage } from "~/components/registry-list-page";
import { listScopePage } from "~/services/scope.server";
import { requireActiveWorkspace } from "~/services/workspace.server";
import { parseRegistryListUrl } from "~/validation/registry-list";

import type { Route } from "./+types/w.$workspaceSlug.scopes._index";

export async function loader({ params, request }: Route.LoaderArgs) {
  const workspace = await requireActiveWorkspace(params.workspaceSlug);
  const query = parseRegistryListUrl(request.url);
  const page = await listScopePage(workspace.id, query);
  const success = new URL(request.url).searchParams.has("created")
    ? ("created" as const)
    : new URL(request.url).searchParams.has("archived")
      ? ("archived" as const)
      : undefined;
  return { ...page, query, success };
}

export default function ScopesList({ loaderData }: Route.ComponentProps) {
  return (
    <RegistryListPage
      {...loaderData}
      kind="scope"
      plural="scopes"
      description="Manage scope keys such as user or company. Applications provide concrete values such as user-123."
    />
  );
}
