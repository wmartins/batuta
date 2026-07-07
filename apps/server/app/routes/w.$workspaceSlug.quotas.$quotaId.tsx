import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Heading, Text } from "@astryxdesign/core/Text";
import { data, Form, redirect, useNavigation } from "react-router";

import { QuotaForm } from "~/components/quota-form";
import { listActiveMetrics } from "~/services/metric.server";
import {
  archiveQuota,
  QuotaSelectionError,
  requireActiveQuota,
  updateQuota,
} from "~/services/quota.server";
import { listActiveScopes } from "~/services/scope.server";
import { requireActiveWorkspace } from "~/services/workspace.server";
import { readQuotaForm } from "~/validation/quota";

import type { Route } from "./+types/w.$workspaceSlug.quotas.$quotaId";

export async function loader({ params, request }: Route.LoaderArgs) {
  const workspace = await requireActiveWorkspace(params.workspaceSlug);
  const [quota, metrics, scopes] = await Promise.all([
    requireActiveQuota(workspace.id, params.quotaId),
    listActiveMetrics(workspace.id),
    listActiveScopes(workspace.id),
  ]);
  return {
    quota,
    metrics,
    scopes,
    saved: new URL(request.url).searchParams.has("saved"),
  };
}

export async function action({ params, request }: Route.ActionArgs) {
  const workspace = await requireActiveWorkspace(params.workspaceSlug);
  const quota = await requireActiveQuota(workspace.id, params.quotaId);
  const formData = await request.formData();
  if (formData.get("intent") === "archive") {
    await archiveQuota(workspace.id, quota.id);
    throw redirect(`/w/${workspace.slug}/quotas?archived=1`);
  }
  const result = readQuotaForm(formData);
  if (!result.success)
    return data({ intent: "save" as const, ...result }, { status: 400 });
  try {
    await updateQuota(workspace.id, quota.id, result.data);
    throw redirect(`/w/${workspace.slug}/quotas/${quota.id}?saved=1`);
  } catch (error) {
    if (error instanceof QuotaSelectionError) {
      return data(
        {
          intent: "save" as const,
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

export default function QuotaEdit({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const navigation = useNavigation();
  const values =
    actionData?.intent === "save"
      ? actionData.values
      : {
          metricId: loaderData.quota.metricId,
          scopeId: loaderData.quota.scopeId,
          quotaLimit: String(loaderData.quota.quotaLimit),
          windowAmount: String(loaderData.quota.windowAmount),
          windowUnit: loaderData.quota.windowUnit,
        };
  const errors = actionData?.intent === "save" ? actionData.errors : undefined;
  return (
    <VStack gap={6}>
      {loaderData.saved ? (
        <Banner status="success" title="Quota updated">
          Changes were saved.
        </Banner>
      ) : null}
      <VStack gap={1}>
        <Heading level={1}>Edit quota</Heading>
        <Text type="large" color="secondary">
          All quota configuration fields can be changed.
        </Text>
      </VStack>
      <Card padding={5} maxWidth={640}>
        <Form method="post">
          <input type="hidden" name="intent" value="save" />
          <QuotaForm
            metrics={loaderData.metrics}
            scopes={loaderData.scopes}
            defaultValues={values}
            errors={errors}
            isSubmitting={
              navigation.state === "submitting" &&
              navigation.formData?.get("intent") === "save"
            }
            submitLabel="Save quota"
          />
        </Form>
      </Card>
      <VStack gap={2}>
        <Heading level={2}>Archive quota</Heading>
        <Text type="body" color="secondary">
          The quota will disappear from active configuration.
        </Text>
        <Form method="post">
          <Button
            type="submit"
            name="intent"
            value="archive"
            variant="destructive"
            label="Archive quota"
            isLoading={
              navigation.state === "submitting" &&
              navigation.formData?.get("intent") === "archive"
            }
          />
        </Form>
      </VStack>
      <HStack>
        <Button href=".." label="Back to quotas" variant="secondary" />
      </HStack>
    </VStack>
  );
}
