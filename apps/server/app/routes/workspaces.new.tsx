import { AppShell } from "@astryxdesign/core/AppShell";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Heading, Text } from "@astryxdesign/core/Text";
import { data, Form, redirect, useNavigation } from "react-router";

import { WorkspaceForm } from "~/components/workspace-form";
import {
  createWorkspace,
  WorkspaceSlugConflictError,
} from "~/services/workspace.server";
import { readWorkspaceForm } from "~/validation/workspace";

import type { Route } from "./+types/workspaces.new";

export async function action({ request }: Route.ActionArgs) {
  const result = readWorkspaceForm(await request.formData());

  if (!result.success) {
    return data(result, { status: 400 });
  }

  try {
    const workspace = await createWorkspace(result.data);
    throw redirect(`/w/${workspace.slug}?created=1`);
  } catch (error) {
    if (error instanceof WorkspaceSlugConflictError) {
      return data(
        {
          success: false as const,
          values: result.data,
          errors: { slug: error.message },
        },
        { status: 409 },
      );
    }
    throw error;
  }
}

export default function WorkspacesNew({ actionData }: Route.ComponentProps) {
  const navigation = useNavigation();

  return (
    <AppShell contentPadding={6} height="auto">
      <VStack gap={5}>
        <VStack gap={1}>
          <Heading level={1}>Create workspace</Heading>
          <Text type="large" color="secondary">
            Create an isolated configuration boundary with a stable URL.
          </Text>
        </VStack>
        <Card padding={5} maxWidth={640}>
          <Form method="post">
            <WorkspaceForm
              defaultValues={actionData?.values}
              errors={actionData?.errors}
              isSubmitting={navigation.state === "submitting"}
              submitLabel="Create workspace"
            />
          </Form>
        </Card>
        <HStack>
          <Button href="/" label="Back to workspaces" variant="secondary" />
        </HStack>
      </VStack>
    </AppShell>
  );
}
