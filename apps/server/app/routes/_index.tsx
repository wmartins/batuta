import { AppShell } from "@astryxdesign/core/AppShell";
import { Button } from "@astryxdesign/core/Button";
import { ClickableCard } from "@astryxdesign/core/ClickableCard";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Grid } from "@astryxdesign/core/Grid";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Heading, Text } from "@astryxdesign/core/Text";
import { redirect } from "react-router";

import { listActiveWorkspaces } from "~/services/workspace.server";

import type { Route } from "./+types/_index";

export async function loader() {
  const workspaces = await listActiveWorkspaces();

  if (workspaces.length === 1) {
    throw redirect(`/w/${workspaces[0].slug}`);
  }

  return { workspaces };
}

export default function WorkspacesIndex({ loaderData }: Route.ComponentProps) {
  return (
    <AppShell contentPadding={6} height="auto">
      {loaderData.workspaces.length === 0 ? (
        <EmptyState
          headingLevel={1}
          title="Create your first workspace"
          description="A workspace keeps metrics, scope keys, and quotas together."
          actions={
            <Button
              href="/workspaces/new"
              label="Create workspace"
              variant="primary"
            />
          }
        />
      ) : (
        <VStack gap={5}>
          <VStack gap={1}>
            <Heading level={1}>Choose a workspace</Heading>
            <Text type="large" color="secondary">
              Select an active workspace or create another configuration
              boundary.
            </Text>
          </VStack>
          <Grid columns={{ minWidth: 240 }} gap={4}>
            {loaderData.workspaces.map((workspace) => (
              <ClickableCard
                key={workspace.id}
                href={`/w/${workspace.slug}`}
                label={`Open ${workspace.name}`}
                padding={5}
              >
                <VStack gap={1}>
                  <Heading level={2}>{workspace.name}</Heading>
                  <Text type="supporting" color="secondary">
                    /w/{workspace.slug}
                  </Text>
                </VStack>
              </ClickableCard>
            ))}
          </Grid>
          <HStack>
            <Button
              href="/workspaces/new"
              label="Create another workspace"
              variant="primary"
            />
          </HStack>
        </VStack>
      )}
    </AppShell>
  );
}
