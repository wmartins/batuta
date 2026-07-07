import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Link } from "@astryxdesign/core/Link";
import { List, ListItem } from "@astryxdesign/core/List";
import { Selector } from "@astryxdesign/core/Selector";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Heading, Text } from "@astryxdesign/core/Text";
import { useEffect, useState } from "react";
import { Form } from "react-router";

import { listActiveMetrics } from "~/services/metric.server";
import { listQuotaPage } from "~/services/quota.server";
import { listActiveScopes } from "~/services/scope.server";
import { requireActiveWorkspace } from "~/services/workspace.server";
import {
  parseQuotaListUrl,
  type QuotaListQuery,
} from "~/validation/quota-list";

import type { Route } from "./+types/w.$workspaceSlug.quotas._index";

export async function loader({ params, request }: Route.LoaderArgs) {
  const workspace = await requireActiveWorkspace(params.workspaceSlug);
  const query = parseQuotaListUrl(request.url);
  const [page, metrics, scopes] = await Promise.all([
    listQuotaPage(workspace.id, query),
    listActiveMetrics(workspace.id),
    listActiveScopes(workspace.id),
  ]);
  const parameters = new URL(request.url).searchParams;
  const success = parameters.has("created")
    ? ("created" as const)
    : parameters.has("archived")
      ? ("archived" as const)
      : undefined;
  return { ...page, metrics, scopes, query, success };
}

function queryHref(query: QuotaListQuery, changes: Partial<QuotaListQuery>) {
  const next = { ...query, ...changes };
  const parameters = new URLSearchParams();
  if (next.metricId) parameters.set("metric", next.metricId);
  if (next.scopeId) parameters.set("scope", next.scopeId);
  parameters.set("sort", next.sort);
  parameters.set("direction", next.direction);
  if (next.page > 1) parameters.set("page", String(next.page));
  return `?${parameters}`;
}

type FilterOption = { id: string; key: string; name: string };

function QuotaFilters({
  metrics,
  query,
  scopes,
}: {
  metrics: FilterOption[];
  query: QuotaListQuery;
  scopes: FilterOption[];
}) {
  const [metricId, setMetricId] = useState(query.metricId);
  const [scopeId, setScopeId] = useState(query.scopeId);

  useEffect(() => setMetricId(query.metricId), [query.metricId]);
  useEffect(() => setScopeId(query.scopeId), [query.scopeId]);

  const metricOptions = metrics.map((metric) => ({
    value: metric.id,
    label: `${metric.name} (${metric.key})`,
  }));
  const scopeOptions = scopes.map((scope) => ({
    value: scope.id,
    label: `${scope.name} (${scope.key})`,
  }));

  return (
    <Form method="get">
      <VStack gap={5}>
        <HStack>
          <Button href="new" label="Create quota" variant="primary" />
        </HStack>
        <HStack gap={3} align="end">
          <Selector
            label="Metric"
            options={metricOptions}
            value={metricId}
            onChange={(value) => setMetricId(value ?? "")}
            placeholder="All metrics"
            hasClear
            hasSearch={metricOptions.length > 8}
            searchPlaceholder="Search metrics"
          />
          <Selector
            label="Scope"
            options={scopeOptions}
            value={scopeId}
            onChange={(value) => setScopeId(value ?? "")}
            placeholder="All scopes"
            hasClear
            hasSearch={scopeOptions.length > 8}
            searchPlaceholder="Search scopes"
          />
          <noscript>
            <label>
              Metric
              <select name="metric" defaultValue={query.metricId}>
                <option value="">All metrics</option>
                {metricOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Scope
              <select name="scope" defaultValue={query.scopeId}>
                <option value="">All scopes</option>
                {scopeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </noscript>
          <input type="hidden" name="metric" value={metricId} />
          <input type="hidden" name="scope" value={scopeId} />
          <input type="hidden" name="sort" value={query.sort} />
          <input type="hidden" name="direction" value={query.direction} />
          <Button type="submit" variant="secondary" label="Apply filters" />
        </HStack>
      </VStack>
    </Form>
  );
}

export default function QuotasList({ loaderData }: Route.ComponentProps) {
  const { items, metrics, query, scopes, success, total } = loaderData;
  const totalPages = Math.max(1, Math.ceil(total / query.pageSize));
  return (
    <VStack gap={5}>
      {success ? (
        <Banner status="success" title={`Quota ${success}`}>
          The active quota definitions have been updated.
        </Banner>
      ) : null}
      <VStack gap={1}>
        <Heading level={1}>Quotas</Heading>
        <Text type="large" color="secondary">
          Every matching quota is evaluated, so overlapping definitions are
          supported.
        </Text>
      </VStack>
      <QuotaFilters metrics={metrics} query={query} scopes={scopes} />
      <HStack gap={3}>
        <Text type="supporting" color="secondary">
          Sort by
        </Text>
        {(["updated", "limit", "window"] as const).map((sort) => (
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
            {sort}
          </Link>
        ))}
      </HStack>
      {items.length === 0 ? (
        <EmptyState
          headingLevel={2}
          title="No matching quotas"
          description="Create a quota or change the active filters."
          actions={
            <Button href="new" label="Create quota" variant="secondary" />
          }
        />
      ) : (
        <List hasDividers density="balanced">
          {items.map((item) => (
            <ListItem
              key={item.id}
              href={item.id}
              label={`${item.metric.name} · ${item.scope.name}`}
              description={`${item.quotaLimit} per ${item.windowAmount} ${item.windowUnit}${item.windowAmount === 1 ? "" : "s"}`}
              endContent={
                <Text type="code">
                  {item.metric.key} / {item.scope.key}
                </Text>
              }
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
