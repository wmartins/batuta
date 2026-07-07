import { z } from "zod";

export type QuotaListQuery = {
  metricId: string;
  scopeId: string;
  sort: "updated" | "limit" | "window";
  direction: "asc" | "desc";
  page: number;
  pageSize: number;
};

const uuid = z.uuid();

function readUuid(value: string | null) {
  const result = uuid.safeParse(value);
  return result.success ? result.data : "";
}

export function parseQuotaListUrl(url: string): QuotaListQuery {
  const parameters = new URL(url).searchParams;
  const sortValue = parameters.get("sort");
  const directionValue = parameters.get("direction");
  const requestedPage = Number(parameters.get("page"));
  return {
    metricId: readUuid(parameters.get("metric")),
    scopeId: readUuid(parameters.get("scope")),
    sort:
      sortValue === "limit" || sortValue === "window" ? sortValue : "updated",
    direction: directionValue === "asc" ? "asc" : "desc",
    page: Number.isInteger(requestedPage)
      ? Math.min(Math.max(requestedPage, 1), 10_000)
      : 1,
    pageSize: 20,
  };
}
