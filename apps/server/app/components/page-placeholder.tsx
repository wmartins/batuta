import { AppShell } from "@astryxdesign/core/AppShell";
import { Card } from "@astryxdesign/core/Card";
import { Link } from "@astryxdesign/core/Link";
import { VStack } from "@astryxdesign/core/Stack";
import { Heading, Text } from "@astryxdesign/core/Text";

type PagePlaceholderProps = {
  title: string;
  description: string;
  actionHref?: string;
  actionLabel?: string;
  standalone?: boolean;
};

export function PagePlaceholder({
  title,
  description,
  actionHref,
  actionLabel,
  standalone = false,
}: PagePlaceholderProps) {
  const content = (
    <VStack gap={4}>
      <VStack gap={1}>
        <Heading level={1}>{title}</Heading>
        <Text type="large" color="secondary">
          {description}
        </Text>
      </VStack>
      <Card padding={5} variant="muted">
        <VStack gap={2}>
          <Heading level={2}>Ready for the data layer</Heading>
          <Text type="body">
            This route is in place and will be connected to its loader, service,
            and progressively enhanced forms in the next delivery slices.
          </Text>
          {actionHref && actionLabel ? (
            <Link href={actionHref} isStandalone>
              {actionLabel}
            </Link>
          ) : null}
        </VStack>
      </Card>
    </VStack>
  );

  return standalone ? (
    <AppShell contentPadding={6} height="auto">
      {content}
    </AppShell>
  ) : (
    content
  );
}
