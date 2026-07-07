const SORTS = ["key", "name", "updated"] as const;
const DIRECTIONS = ["asc", "desc"] as const;

export type RegistrySort = (typeof SORTS)[number];
export type SortDirection = (typeof DIRECTIONS)[number];

export type RegistryListQuery = {
  search: string;
  sort: RegistrySort;
  direction: SortDirection;
  page: number;
  pageSize: number;
};

export function parseRegistryListUrl(url: string): RegistryListQuery {
  const parameters = new URL(url).searchParams;
  const search = (parameters.get("q") ?? "").trim().slice(0, 100);
  const requestedSort = parameters.get("sort");
  const sort = SORTS.includes(requestedSort as RegistrySort)
    ? (requestedSort as RegistrySort)
    : "name";
  const requestedDirection = parameters.get("direction");
  const direction = DIRECTIONS.includes(requestedDirection as SortDirection)
    ? (requestedDirection as SortDirection)
    : "asc";
  const requestedPage = Number(parameters.get("page"));
  const page = Number.isInteger(requestedPage)
    ? Math.min(Math.max(requestedPage, 1), 10_000)
    : 1;

  return { search, sort, direction, page, pageSize: 20 };
}
