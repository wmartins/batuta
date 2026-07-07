import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { FormLayout } from "@astryxdesign/core/FormLayout";
import { VStack } from "@astryxdesign/core/Stack";
import { Heading, Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { useState } from "react";
import { data, Form, redirect, useNavigation } from "react-router";

import { WorkspaceForm } from "~/components/workspace-form";
import {
  archiveWorkspace,
  requireActiveWorkspace,
  updateWorkspace,
  WorkspaceSlugConflictError,
} from "~/services/workspace.server";
import { readWorkspaceForm } from "~/validation/workspace";

import type { Route } from "./+types/w.$workspaceSlug.settings";

export async function loader({ params, request }: Route.LoaderArgs) {
  const workspace = await requireActiveWorkspace(params.workspaceSlug);
  const saved = new URL(request.url).searchParams.has("saved");
  return { workspace, saved };
}

export async function action({ params, request }: Route.ActionArgs) {
  const workspace = await requireActiveWorkspace(params.workspaceSlug);
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "save");

  if (intent === "archive") {
    const confirmation = String(formData.get("confirmation") ?? "");
    if (confirmation !== workspace.name) {
      return data(
        {
          intent: "archive" as const,
          confirmation,
          archiveError: `Enter “${workspace.name}” exactly to confirm.`,
        },
        { status: 400 },
      );
    }

    await archiveWorkspace(workspace);
    throw redirect("/");
  }

  const result = readWorkspaceForm(formData);
  if (!result.success) {
    return data({ intent: "save" as const, ...result }, { status: 400 });
  }

  try {
    const updated = await updateWorkspace(workspace, result.data);
    throw redirect(`/w/${updated.slug}/settings?saved=1`);
  } catch (error) {
    if (error instanceof WorkspaceSlugConflictError) {
      return data(
        {
          intent: "save" as const,
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

export default function WorkspaceSettings({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { workspace, saved } = loaderData;
  const navigation = useNavigation();
  const pendingIntent = navigation.formData?.get("intent");
  const archiveAction =
    actionData?.intent === "archive" ? actionData : undefined;
  const saveAction = actionData?.intent === "save" ? actionData : undefined;
  const [confirmation, setConfirmation] = useState(
    archiveAction?.confirmation ?? "",
  );

  return (
    <VStack gap={6}>
      {saved ? (
        <Banner status="success" title="Workspace updated">
          Changes to {workspace.name} were saved.
        </Banner>
      ) : null}
      <VStack gap={1}>
        <Heading level={1}>Workspace settings</Heading>
        <Text type="large" color="secondary">
          Update its display name or canonical URL slug.
        </Text>
      </VStack>
      <Card padding={5} maxWidth={640}>
        <Form method="post">
          <input type="hidden" name="intent" value="save" />
          <WorkspaceForm
            defaultValues={saveAction?.values ?? workspace}
            errors={saveAction?.errors}
            isSubmitting={
              navigation.state === "submitting" && pendingIntent === "save"
            }
            submitLabel="Save changes"
          />
        </Form>
      </Card>
      <VStack gap={2}>
        <Heading level={2}>Archive workspace</Heading>
        <Text type="body" color="secondary">
          Archiving hides this workspace and all of its configuration. V1 has no
          restore flow.
        </Text>
        <Card padding={5} maxWidth={640} variant="muted">
          <Form method="post">
            <FormLayout>
              {archiveAction?.archiveError ? (
                <Banner status="error" title="Confirmation does not match">
                  {archiveAction.archiveError}
                </Banner>
              ) : null}
              <TextInput
                htmlName="confirmation"
                label={`Enter “${workspace.name}” to confirm`}
                value={confirmation}
                onChange={setConfirmation}
                status={
                  archiveAction?.archiveError
                    ? { type: "error", message: archiveAction.archiveError }
                    : undefined
                }
              />
              <Button
                type="submit"
                name="intent"
                value="archive"
                variant="destructive"
                label="Archive workspace"
                isLoading={
                  navigation.state === "submitting" &&
                  pendingIntent === "archive"
                }
              />
            </FormLayout>
          </Form>
        </Card>
      </VStack>
    </VStack>
  );
}
