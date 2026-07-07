import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Link } from "@astryxdesign/core/Link";
import { List, ListItem } from "@astryxdesign/core/List";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Heading, Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { useState } from "react";
import { Form } from "react-router";

import type { RegistryListQuery } from "~/validation/registry-list";

type RegistryItem = {
  id: string;
  key: string;
  name: string;
  description: string | null;
};

type RegistryListPageProps = {
  description: string;
  items: RegistryItem[];
  kind: "metric" | "scope";
  plural: "metrics" | "scopes";
  query: RegistryListQuery;
  success?: "created" | "archived";
  total: number;
};

function queryHref(
  query: RegistryListQuery,
  changes: Partial<RegistryListQuery>,
) {
  const next = { ...query, ...changes };
  const parameters = new URLSearchParams();
  if (next.search) parameters.set("q", next.search);
  parameters.set("sort", next.sort);
  parameters.set("direction", next.direction);
  if (next.page > 1) parameters.set("page", String(next.page));
  return `?${parameters}`;
}

export function RegistryListPage({
  description,
  items,
  kind,
  plural,
  query,
  success,
  total,
}: RegistryListPageProps) {
  const [search, setSearch] = useState(query.search);
  const totalPages = Math.max(1, Math.ceil(total / query.pageSize));

  return (
    <VStack gap={5}>
      {success ? (
        <Banner
          status="success"
          title={`${kind === "metric" ? "Metric" : "Scope"} ${success}`}
        >
          The active {kind} registry has been updated.
        </Banner>
      ) : null}
      <VStack gap={1}>
        <Heading level={1}>
          {plural === "metrics" ? "Metrics" : "Scopes"}
        </Heading>
        <Text type="large" color="secondary">
          {description}
        </Text>
      </VStack>
      <HStack gap={3} align="end">
        <Form method="get">
          <HStack gap={2} align="end">
            <TextInput
              htmlName="q"
              label={`Search ${plural}`}
              value={search}
              onChange={setSearch}
              hasClear
            />
            <input type="hidden" name="sort" value={query.sort} />
            <input type="hidden" name="direction" value={query.direction} />
            <Button type="submit" variant="secondary" label="Search" />
          </HStack>
        </Form>
        <Button href="new" label={`Create ${kind}`} variant="primary" />
      </HStack>
      <HStack gap={3}>
        <Text type="supporting" color="secondary">
          Sort by
        </Text>
        {(["name", "key", "updated"] as const).map((sort) => (
          <Link
            key={sort}
            href={queryHref(query, {
              sort,
              direction:
                query.sort === sort && query.direction === "asc"
                  ? "desc"
                  : "asc",
              page: 1,
            })}
            isStandalone
          >
            {sort === "updated" ? "Recently updated" : sort}
          </Link>
        ))}
      </HStack>
      {items.length === 0 ? (
        <EmptyState
          headingLevel={2}
          title={query.search ? `No matching ${plural}` : `No ${plural} yet`}
          description={
            query.search
              ? "Try a different search or clear the current query."
              : `Create the first ${kind} for this workspace.`
          }
          actions={
            query.search ? (
              <Link href="?" isStandalone>
                Clear search
              </Link>
            ) : (
              <Button href="new" label={`Create ${kind}`} variant="secondary" />
            )
          }
        />
      ) : (
        <List hasDividers density="balanced">
          {items.map((item) => (
            <ListItem
              key={item.id}
              href={item.id}
              label={item.name}
              description={item.description ?? `Machine key: ${item.key}`}
              endContent={<Text type="code">{item.key}</Text>}
            />
          ))}
        </List>
      )}
      <HStack gap={3}>
        {query.page > 1 ? (
          <Link href={queryHref(query, { page: query.page - 1 })} isStandalone>
            Previous
          </Link>
        ) : null}
        <Text type="supporting" color="secondary">
          Page {query.page} of {totalPages} · {total} total
        </Text>
        {query.page < totalPages ? (
          <Link href={queryHref(query, { page: query.page + 1 })} isStandalone>
            Next
          </Link>
        ) : null}
      </HStack>
    </VStack>
  );
}
