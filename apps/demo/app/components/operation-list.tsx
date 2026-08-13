import { Button } from "@astryxdesign/core/Button";
import { Divider } from "@astryxdesign/core/Divider";
import { Item } from "@astryxdesign/core/Item";
import { VStack } from "@astryxdesign/core/Stack";
import { Heading, Text } from "@astryxdesign/core/Text";
import type { FetcherWithComponents } from "react-router";

import type { DemoOperation, DemoTeam, DemoUser } from "~/lib/demo-fixtures";
import type { ActorUsage } from "~/lib/demo-usage";
import type { OperationResult } from "~/lib/demo-usage.server";

export function OperationList({
  operations,
  team,
  user,
  usage,
  fetcher,
}: {
  operations: readonly DemoOperation[];
  team: DemoTeam;
  user: DemoUser;
  usage: ActorUsage | null;
  fetcher: FetcherWithComponents<OperationResult>;
}) {
  return (
    <VStack gap={3}>
      <VStack gap={1}>
        <Heading level={2}>Studio operations</Heading>
        <Text color="secondary">
          Each action asks Batuta about the independent rules it needs. Direct
          limits are checked but never recorded.
        </Text>
      </VStack>
      <Divider />
      {operations.map((operation, index) => {
        const isSubmitting =
          fetcher.state !== "idle" &&
          fetcher.formData?.get("operation") === operation.id;
        return (
          <VStack key={operation.id} gap={0}>
            <Item
              align="start"
              density="spacious"
              label={operation.name}
              description={`${operation.description} ${operation.credits > 0 ? `${operation.credits} ${operation.credits === 1 ? "credit" : "credits"}` : "No credits"}${operation.briefCharacters > 0 ? ` · ${operation.briefCharacters.toLocaleString()} brief characters` : ""}${operation.campaignChange > 0 ? " · opens one campaign" : operation.campaignChange < 0 ? " · closes one campaign" : ""}.`}
              endContent={
                <fetcher.Form method="post">
                  <input type="hidden" name="team" value={team.id} />
                  <input type="hidden" name="user" value={user.id} />
                  <Button
                    type="submit"
                    name="operation"
                    value={operation.id}
                    label="Run operation"
                    isDisabled={!usage}
                    isLoading={isSubmitting}
                    variant={index === 0 ? "primary" : "secondary"}
                  />
                </fetcher.Form>
              }
            />
            {index < operations.length - 1 ? <Divider /> : null}
          </VStack>
        );
      })}
    </VStack>
  );
}
