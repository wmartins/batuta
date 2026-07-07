import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Heading, Text } from "@astryxdesign/core/Text";
import { data, Form, redirect, useNavigation } from "react-router";

import { RegistryForm } from "~/components/registry-form";
import { createMetric } from "~/services/metric.server";
import { RegistryKeyConflictError } from "~/services/registry-errors.server";
import { requireActiveWorkspace } from "~/services/workspace.server";
import { readCreateRegistryForm } from "~/validation/registry";

import type { Route } from "./+types/w.$workspaceSlug.metrics.new";

export async function action({ params, request }: Route.ActionArgs) {
  const workspace = await requireActiveWorkspace(params.workspaceSlug);
  const result = readCreateRegistryForm(await request.formData());
  if (!result.success) return data(result, { status: 400 });

  try {
    await createMetric(workspace.id, result.data);
    throw redirect(`/w/${workspace.slug}/metrics?created=1`);
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

export default function MetricsNew({ actionData }: Route.ComponentProps) {
  const navigation = useNavigation();
  return (
    <VStack gap={5}>
      <VStack gap={1}>
        <Heading level={1}>Create metric</Heading>
        <Text type="large" color="secondary">
          Define something consumed by your application.
        </Text>
      </VStack>
      <Card padding={5} maxWidth={640}>
        <Form method="post">
          <RegistryForm
            kind="metric"
            defaultValues={actionData?.values}
            errors={actionData?.errors}
            isSubmitting={navigation.state === "submitting"}
            submitLabel="Create metric"
          />
        </Form>
      </Card>
      <HStack>
        <Button href=".." label="Back to metrics" variant="secondary" />
      </HStack>
    </VStack>
  );
}
