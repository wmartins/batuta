import { RegistryListPage } from "~/components/registry-list-page";
import { listMetricPage } from "~/services/metric.server";
import { requireActiveWorkspace } from "~/services/workspace.server";
import { parseRegistryListUrl } from "~/validation/registry-list";

import type { Route } from "./+types/w.$workspaceSlug.metrics._index";

export async function loader({ params, request }: Route.LoaderArgs) {
  const workspace = await requireActiveWorkspace(params.workspaceSlug);
  const query = parseRegistryListUrl(request.url);
  const page = await listMetricPage(workspace.id, query);
  const success = new URL(request.url).searchParams.has("created")
    ? ("created" as const)
    : new URL(request.url).searchParams.has("archived")
      ? ("archived" as const)
      : undefined;
  return { ...page, query, success };
}

export default function MetricsList({ loaderData }: Route.ComponentProps) {
  return (
    <RegistryListPage
      {...loaderData}
      kind="metric"
      plural="metrics"
      description="Manage the things your applications consume, such as credits or tokens."
    />
  );
}
