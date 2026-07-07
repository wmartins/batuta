import { AppShell } from "@astryxdesign/core/AppShell";
import { Banner } from "@astryxdesign/core/Banner";
import { Card } from "@astryxdesign/core/Card";
import { Section } from "@astryxdesign/core/Section";
import { VStack } from "@astryxdesign/core/Stack";
import { Heading, Text } from "@astryxdesign/core/Text";
import { TopNav, TopNavHeading } from "@astryxdesign/core/TopNav";
import { useEffect } from "react";
import { useFetcher, useRevalidator } from "react-router";

import { ActorSelector } from "~/components/actor-selector";
import { OperationList } from "~/components/operation-list";
import { QuotaUsage } from "~/components/quota-usage";
import { operations, resolveActor, teams } from "~/lib/demo-fixtures";
import { demoUsage, type OperationResult } from "~/lib/demo-usage.server";

import type { Route } from "./+types/_index";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const { team, user } = resolveActor(
    url.searchParams.get("team"),
    url.searchParams.get("user"),
  );
  try {
    const snapshot = await demoUsage.getActorUsage(team, user);
    return { team, user, teams, operations, ...snapshot, error: null };
  } catch {
    return {
      team,
      user,
      teams,
      operations,
      usage: null,
      evaluatedAt: null,
      error:
        "Usage is unavailable. Check that the managed server is running and rerun demo setup if needed.",
    };
  }
}

export async function action({
  request,
}: Route.ActionArgs): Promise<OperationResult> {
  const form = await request.formData();
  return demoUsage.attemptOperation({
    teamId: String(form.get("team") ?? ""),
    userId: String(form.get("user") ?? ""),
    operationId: String(form.get("operation") ?? ""),
  });
}

function useLiveUsageRefresh() {
  const revalidator = useRevalidator();
  useEffect(() => {
    const interval = window.setInterval(() => {
      if (
        document.visibilityState === "visible" &&
        revalidator.state === "idle"
      ) {
        revalidator.revalidate();
      }
    }, 2_000);
    return () => window.clearInterval(interval);
  }, [revalidator]);
}

export default function DemoIndex({ loaderData }: Route.ComponentProps) {
  const fetcher = useFetcher<OperationResult>();
  useLiveUsageRefresh();
  const feedback = fetcher.data;

  return (
    <AppShell
      height="auto"
      variant="section"
      contentPadding={0}
      topNav={
        <TopNav
          label="Creative credits"
          heading={<TopNavHeading heading="Lumen Creative Credits" />}
        />
      }
    >
      <Section padding={6} variant="transparent">
        <VStack gap={6} className="demo-content">
          <VStack gap={2}>
            <Text type="supporting" color="accent" weight="bold">
              MANAGED STORAGE DEMO
            </Text>
            <Heading level={1}>Make quota isolation visible</Heading>
            <Text type="large" color="secondary">
              Run studio operations that spend credits through Batuta’s managed
              API.
            </Text>
          </VStack>

          <ActorSelector
            teams={loaderData.teams}
            team={loaderData.team}
            user={loaderData.user}
          />

          {loaderData.error ? (
            <Banner
              status="error"
              title="Could not load usage"
              description={loaderData.error}
            />
          ) : null}
          {feedback ? (
            <Banner
              status={
                feedback.status === "success"
                  ? "success"
                  : feedback.status === "blocked"
                    ? "warning"
                    : "error"
              }
              title={
                feedback.status === "blocked"
                  ? "Operation blocked"
                  : feedback.status === "success"
                    ? "Credits recorded"
                    : "Operation failed"
              }
              description={feedback.message}
            />
          ) : null}

          {loaderData.usage ? <QuotaUsage usage={loaderData.usage} /> : null}

          <Card padding={0}>
            <Section padding={5} variant="transparent">
              <OperationList
                operations={loaderData.operations}
                team={loaderData.team}
                user={loaderData.user}
                usage={loaderData.usage}
                fetcher={fetcher}
              />
            </Section>
          </Card>

          <VStack gap={1}>
            <Text type="supporting" color="secondary">
              Usage refreshes about every two seconds. Last evaluated:{" "}
              {loaderData.evaluatedAt
                ? new Date(loaderData.evaluatedAt).toLocaleTimeString()
                : "unavailable"}
              .
            </Text>
            <Text type="supporting" color="secondary">
              Check and record are separate, non-atomic requests; this demo does
              not reserve credits.
            </Text>
          </VStack>
        </VStack>
      </Section>
    </AppShell>
  );
}
