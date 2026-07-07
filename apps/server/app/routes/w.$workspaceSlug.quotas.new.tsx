import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Heading, Text } from "@astryxdesign/core/Text";
import { data, Form, redirect, useNavigation } from "react-router";

import { QuotaForm } from "~/components/quota-form";
import { listActiveMetrics } from "~/services/metric.server";
import { createQuota, QuotaSelectionError } from "~/services/quota.server";
import { listActiveScopes } from "~/services/scope.server";
import { requireActiveWorkspace } from "~/services/workspace.server";
import { readQuotaForm } from "~/validation/quota";

import type { Route } from "./+types/w.$workspaceSlug.quotas.new";

export async function loader({ params }: Route.LoaderArgs) {
  const workspace = await requireActiveWorkspace(params.workspaceSlug);
  const [metrics, scopes] = await Promise.all([
    listActiveMetrics(workspace.id),
    listActiveScopes(workspace.id),
  ]);
  return { metrics, scopes };
}

export async function action({ params, request }: Route.ActionArgs) {
  const workspace = await requireActiveWorkspace(params.workspaceSlug);
  const result = readQuotaForm(await request.formData());
  if (!result.success) return data(result, { status: 400 });
  try {
    await createQuota(workspace.id, result.data);
    throw redirect(`/w/${workspace.slug}/quotas?created=1`);
  } catch (error) {
    if (error instanceof QuotaSelectionError) {
      return data(
        {
          success: false as const,
          values: {
            metricId: result.data.metricId,
            scopeId: result.data.scopeId,
            quotaLimit: String(result.data.quotaLimit),
            windowAmount: String(result.data.windowAmount),
            windowUnit: result.data.windowUnit,
          },
          errors: { form: error.message },
        },
        { status: 409 },
      );
    }
    throw error;
  }
}

export default function QuotasNew({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const navigation = useNavigation();
  return (
    <VStack gap={5}>
      <VStack gap={1}>
        <Heading level={1}>Create quota</Heading>
        <Text type="large" color="secondary">
          Choose active configuration and define an elapsed usage window.
        </Text>
      </VStack>
      {loaderData.metrics.length === 0 || loaderData.scopes.length === 0 ? (
        <Text type="body">
          Create at least one metric and scope before adding a quota.
        </Text>
      ) : (
        <Card padding={5} maxWidth={640}>
          <Form method="post">
            <QuotaForm
              metrics={loaderData.metrics}
              scopes={loaderData.scopes}
              defaultValues={actionData?.values}
              errors={actionData?.errors}
              isSubmitting={navigation.state === "submitting"}
              submitLabel="Create quota"
            />
          </Form>
        </Card>
      )}
      <HStack>
        <Button href=".." label="Back to quotas" variant="secondary" />
      </HStack>
    </VStack>
  );
}
