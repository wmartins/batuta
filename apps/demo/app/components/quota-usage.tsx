import { Card } from "@astryxdesign/core/Card";
import { Grid } from "@astryxdesign/core/Grid";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Heading, Text } from "@astryxdesign/core/Text";

import type { ActorUsage, DemoScopeKey } from "~/lib/demo-usage";

function UsageMeter({
  label,
  scope,
}: {
  label: string;
  scope: ActorUsage[DemoScopeKey];
}) {
  const quota = scope.quotas[0];
  return (
    <Card padding={5} height="100%">
      <VStack gap={4}>
        <HStack hAlign="between" vAlign="center">
          <Heading level={2}>{label}</Heading>
          <Text type="supporting" color="secondary">
            {quota.remaining} remaining
          </Text>
        </HStack>
        <ProgressBar
          label={`${label} credits used`}
          value={quota.consumed}
          max={quota.limit}
          hasValueLabel
          formatValueLabel={(value, max) => `${value} / ${max}`}
          variant={quota.remaining === 0 ? "error" : "accent"}
        />
        <Text type="supporting" color="secondary">
          Rolling 60-second window
        </Text>
      </VStack>
    </Card>
  );
}

export function QuotaUsage({ usage }: { usage: ActorUsage }) {
  return (
    <Grid columns={{ minWidth: 260, max: 2 }} gap={4}>
      <UsageMeter label="User quota" scope={usage.user} />
      <UsageMeter label="Team quota" scope={usage.team} />
    </Grid>
  );
}
