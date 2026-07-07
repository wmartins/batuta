import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Link } from "@astryxdesign/core/Link";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Heading, Text } from "@astryxdesign/core/Text";
import { data, Form, redirect, useNavigation } from "react-router";

import { RegistryForm } from "~/components/registry-form";
import {
  archiveMetric,
  requireActiveMetric,
  updateMetric,
} from "~/services/metric.server";
import { RegistryDependencyError } from "~/services/registry-errors.server";
import { requireActiveWorkspace } from "~/services/workspace.server";
import { readUpdateRegistryForm } from "~/validation/registry";

import type { Route } from "./+types/w.$workspaceSlug.metrics.$metricId";

export async function loader({ params, request }: Route.LoaderArgs) {
  const workspace = await requireActiveWorkspace(params.workspaceSlug);
  const metric = await requireActiveMetric(workspace.id, params.metricId);
  return { metric, saved: new URL(request.url).searchParams.has("saved") };
}

export async function action({ params, request }: Route.ActionArgs) {
  const workspace = await requireActiveWorkspace(params.workspaceSlug);
  const metric = await requireActiveMetric(workspace.id, params.metricId);
  const formData = await request.formData();
  if (formData.get("intent") === "archive") {
    try {
      await archiveMetric(workspace.id, metric.id);
      throw redirect(`/w/${workspace.slug}/metrics?archived=1`);
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
  await updateMetric(workspace.id, metric.id, result.data);
  throw redirect(`/w/${workspace.slug}/metrics/${metric.id}?saved=1`);
}

export default function MetricEdit({
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
        <Banner status="success" title="Metric updated">
          Changes were saved.
        </Banner>
      ) : null}
      <VStack gap={1}>
        <HStack>
          <Link href="..">Back to metrics</Link>
        </HStack>
        <Heading level={1}>{loaderData.metric.name}</Heading>
        <Text type="large" color="secondary">
          Edit display details for{" "}
          <Text type="code">{loaderData.metric.key}</Text>.
        </Text>
      </VStack>
      <Card padding={5} maxWidth={640}>
        <Form method="post">
          <input type="hidden" name="intent" value="save" />
          <RegistryForm
            kind="metric"
            isEditing
            defaultValues={saveAction?.values ?? loaderData.metric}
            errors={saveAction?.errors}
            isSubmitting={
              navigation.state === "submitting" &&
              navigation.formData?.get("intent") === "save"
            }
            submitLabel="Save metric"
          />
        </Form>
      </Card>
      <VStack gap={2}>
        <Heading level={2}>Archive metric</Heading>
        {archiveError ? (
          <Banner status="error" title="Metric is in use">
            {archiveError}{" "}
            <Link
              href={`../quotas?metric=${loaderData.metric.id}`}
              isStandalone
            >
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
            label="Archive metric"
            isLoading={
              navigation.state === "submitting" &&
              navigation.formData?.get("intent") === "archive"
            }
          />
        </Form>
      </VStack>
    </VStack>
  );
}
