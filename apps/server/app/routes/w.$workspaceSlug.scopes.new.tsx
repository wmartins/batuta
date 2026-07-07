import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Heading, Text } from "@astryxdesign/core/Text";
import { data, Form, redirect, useNavigation } from "react-router";

import { RegistryForm } from "~/components/registry-form";
import { RegistryKeyConflictError } from "~/services/registry-errors.server";
import { createScope } from "~/services/scope.server";
import { requireActiveWorkspace } from "~/services/workspace.server";
import { readCreateRegistryForm } from "~/validation/registry";

import type { Route } from "./+types/w.$workspaceSlug.scopes.new";

export async function action({ params, request }: Route.ActionArgs) {
  const workspace = await requireActiveWorkspace(params.workspaceSlug);
  const result = readCreateRegistryForm(await request.formData());
  if (!result.success) return data(result, { status: 400 });
  try {
    await createScope(workspace.id, result.data);
    throw redirect(`/w/${workspace.slug}/scopes?created=1`);
  } catch (error) {
    if (error instanceof RegistryKeyConflictError) {
      return data(
        {
          success: false as const,
          values: result.data,
          errors: { key: error.message },
        },
        { status: 409 },
      );
    }
    throw error;
  }
}

export default function ScopesNew({ actionData }: Route.ComponentProps) {
  const navigation = useNavigation();
  return (
    <VStack gap={5}>
      <VStack gap={1}>
        <Heading level={1}>Create scope</Heading>
        <Text type="large" color="secondary">
          Define a scope key. Concrete values remain in your application.
        </Text>
      </VStack>
      <Card padding={5} maxWidth={640}>
        <Form method="post">
          <RegistryForm
            kind="scope"
            defaultValues={actionData?.values}
            errors={actionData?.errors}
            isSubmitting={navigation.state === "submitting"}
            submitLabel="Create scope"
          />
        </Form>
      </Card>
      <HStack>
        <Button href=".." label="Back to scopes" variant="secondary" />
      </HStack>
    </VStack>
  );
}
