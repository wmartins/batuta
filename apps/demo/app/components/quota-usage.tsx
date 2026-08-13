import { Card } from "@astryxdesign/core/Card";
import { Grid } from "@astryxdesign/core/Grid";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";

import type { ActorUsage, RollingUsage } from "~/lib/demo-usage";

function limitLabel(limit: number | "unlimited") {
  return limit === "unlimited" ? "Unlimited" : limit.toLocaleString();
}

function RollingCard({ label, usage }: { label: string; usage: RollingUsage }) {
  const max =
    usage.limit === "unlimited" ? Math.max(usage.used, 1) : usage.limit;
  return (
    <Card padding={5} height="100%">
      <VStack gap={4}>
        <HStack hAlign="between" vAlign="center">
          <Heading level={2}>{label}</Heading>
          <Token label="Rolling" color="blue" size="sm" />
        </HStack>
        <ProgressBar
          label={`${label} used`}
          value={usage.used}
          max={max}
          hasValueLabel
          formatValueLabel={(value) => `${value} / ${limitLabel(usage.limit)}`}
          variant={
            usage.limit !== "unlimited" && usage.used >= usage.limit
              ? "error"
              : "accent"
          }
        />
        <Text type="supporting" color="secondary">
          Events expire individually after {usage.window.amount}{" "}
          {usage.window.unit}.
        </Text>
      </VStack>
    </Card>
  );
}

function CampaignCard({ usage }: { usage: ActorUsage["campaigns"] }) {
  const max =
    usage.limit === "unlimited" ? Math.max(usage.used, 1) : usage.limit;
  return (
    <Card padding={5} height="100%">
      <VStack gap={4}>
        <HStack hAlign="between" vAlign="center">
          <Heading level={2}>Active campaigns</Heading>
          <Token label="Balance" color="purple" size="sm" />
        </HStack>
        <ProgressBar
          label="Active campaigns"
          value={usage.used}
          max={max}
          hasValueLabel
          formatValueLabel={(value) => `${value} / ${limitLabel(usage.limit)}`}
          variant={
            usage.limit !== "unlimited" && usage.used >= usage.limit
              ? "warning"
              : "accent"
          }
        />
        <Text type="supporting" color="secondary">
          Launching adds one; archiving records a negative reversal.
        </Text>
      </VStack>
    </Card>
  );
}

function BriefCard({ usage }: { usage: ActorUsage["brief"] }) {
  return (
    <Card padding={5} height="100%">
      <VStack gap={4}>
        <HStack hAlign="between" vAlign="center">
          <Heading level={2}>Creative brief</Heading>
          <Token label="Direct" color="green" size="sm" />
        </HStack>
        <VStack gap={1}>
          <Text type="large" weight="bold">
            {limitLabel(usage.limit)}
          </Text>
          <Text type="supporting" color="secondary">
            characters per proposed brief
          </Text>
        </VStack>
        <Text type="supporting" color="secondary">
          {usage.isConcreteOverride
            ? "Concrete extended-brief override; no usage is recorded."
            : "Generic creator default; no usage is recorded."}
        </Text>
      </VStack>
    </Card>
  );
}

export function QuotaUsage({ usage }: { usage: ActorUsage }) {
  return (
    <Grid columns={{ minWidth: 280, max: 2 }} gap={4}>
      <RollingCard label="Creator credits" usage={usage.credits.user} />
      <RollingCard label="Studio credits" usage={usage.credits.team} />
      <CampaignCard usage={usage.campaigns} />
      <BriefCard usage={usage.brief} />
    </Grid>
  );
}
