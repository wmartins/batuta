import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Link } from "@astryxdesign/core/Link";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Heading, Text } from "@astryxdesign/core/Text";
import { data, Form, redirect, useNavigation } from "react-router";

import { RegistryForm } from "~/components/registry-form";
import { RegistryDependencyError } from "~/services/registry-errors.server";
import {
  archiveScope,
  requireActiveScope,
  updateScope,
} from "~/services/scope.server";
import { requireActiveWorkspace } from "~/services/workspace.server";
import { readUpdateRegistryForm } from "~/validation/registry";

import type { Route } from "./+types/w.$workspaceSlug.scopes.$scopeId";

export async function loader({ params, request }: Route.LoaderArgs) {
  const workspace = await requireActiveWorkspace(params.workspaceSlug);
  const scope = await requireActiveScope(workspace.id, params.scopeId);
  return { scope, saved: new URL(request.url).searchParams.has("saved") };
}

export async function action({ params, request }: Route.ActionArgs) {
  const workspace = await requireActiveWorkspace(params.workspaceSlug);
  const scope = await requireActiveScope(workspace.id, params.scopeId);
  const formData = await request.formData();
  if (formData.get("intent") === "archive") {
    try {
      await archiveScope(workspace.id, scope.id);
      throw redirect(`/w/${workspace.slug}/scopes?archived=1`);
    } catch (error) {
      if (error instanceof RegistryDependencyError) {
        return data(
          { intent: "archive" as const, dependencyError: error.message },
          { status: 409 },
        );
      }
      throw error;
    }
  }
  const result = readUpdateRegistryForm(formData);
  if (!result.success)
    return data({ intent: "save" as const, ...result }, { status: 400 });
  await updateScope(workspace.id, scope.id, result.data);
  throw redirect(`/w/${workspace.slug}/scopes/${scope.id}?saved=1`);
}

export default function ScopeEdit({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const navigation = useNavigation();
  const archiveError =
    actionData?.intent === "archive" ? actionData.dependencyError : undefined;
  const saveAction = actionData?.intent === "save" ? actionData : undefined;
  return (
    <VStack gap={6}>
      {loaderData.saved ? (
        <Banner status="success" title="Scope updated">
          Changes were saved.
        </Banner>
      ) : null}
      <VStack gap={1}>
        <Heading level={1}>{loaderData.scope.name}</Heading>
        <Text type="large" color="secondary">
          Applications provide values such as{" "}
          <Text type="code">{loaderData.scope.key}-123</Text>; the server
          manages only the key.
        </Text>
      </VStack>
      <Card padding={5} maxWidth={640}>
        <Form method="post">
          <input type="hidden" name="intent" value="save" />
          <RegistryForm
            kind="scope"
            isEditing
            defaultValues={saveAction?.values ?? loaderData.scope}
            errors={saveAction?.errors}
            isSubmitting={
              navigation.state === "submitting" &&
              navigation.formData?.get("intent") === "save"
            }
            submitLabel="Save scope"
          />
        </Form>
      </Card>
      <VStack gap={2}>
        <Heading level={2}>Archive scope</Heading>
        {archiveError ? (
          <Banner status="error" title="Scope is in use">
            {archiveError}{" "}
            <Link href={`../quotas?scope=${loaderData.scope.id}`} isStandalone>
              View blocking quotas
            </Link>
          </Banner>
        ) : null}
        <Form method="post">
          <Button
            type="submit"
            name="intent"
            value="archive"
            variant="destructive"
            label="Archive scope"
            isLoading={
              navigation.state === "submitting" &&
              navigation.formData?.get("intent") === "archive"
            }
          />
        </Form>
      </VStack>
      <HStack>
        <Button href=".." label="Back to scopes" variant="secondary" />
      </HStack>
    </VStack>
  );
}
