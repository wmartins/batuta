import { Banner } from "@astryxdesign/core/Banner";
import { Card } from "@astryxdesign/core/Card";
import { Grid } from "@astryxdesign/core/Grid";
import { Link } from "@astryxdesign/core/Link";
import { VStack } from "@astryxdesign/core/Stack";
import { Heading, Text } from "@astryxdesign/core/Text";

import {
  getWorkspaceCounts,
  requireActiveWorkspace,
} from "~/services/workspace.server";

import type { Route } from "./+types/w.$workspaceSlug._index";

export async function loader({ params, request }: Route.LoaderArgs) {
  const workspace = await requireActiveWorkspace(params.workspaceSlug);
  const counts = await getWorkspaceCounts(workspace.id);
  const created = new URL(request.url).searchParams.has("created");
  return { workspace, counts, created };
}

export default function WorkspaceOverview({
  loaderData,
}: Route.ComponentProps) {
  const { workspace, counts, created } = loaderData;
  const resources = [
    { label: "Metrics", value: counts.metrics, href: "metrics" },
    { label: "Scopes", value: counts.scopes, href: "scopes" },
    { label: "Quotas", value: counts.quotas, href: "quotas" },
  ];

  return (
    <VStack gap={5}>
      {created ? (
        <Banner status="success" title="Workspace created">
          {workspace.name} is ready for configuration.
        </Banner>
      ) : null}
      <VStack gap={1}>
        <Heading level={1}>{workspace.name}</Heading>
        <Text type="large" color="secondary">
          Active configuration at a glance.
        </Text>
      </VStack>
      <Grid columns={{ minWidth: 200 }} gap={4}>
        {resources.map((resource) => (
          <Card key={resource.label} padding={5}>
            <VStack gap={2}>
              <Text type="supporting" color="secondary">
                {resource.label}
              </Text>
              <Heading level={2} type="display-2">
                {resource.value}
              </Heading>
              <Link href={resource.href} isStandalone>
                Manage {resource.label.toLowerCase()}
              </Link>
            </VStack>
          </Card>
        ))}
      </Grid>
    </VStack>
  );
}
