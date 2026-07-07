import { describe, expect, test } from "vitest";

import { parseRegistryListUrl } from "./registry-list";

describe("registry list URL parsing", () => {
  test("parses supported search, sorting, and pagination", () => {
    expect(
      parseRegistryListUrl(
        "https://example.test/metrics?q=credit&sort=updated&direction=desc&page=3",
      ),
    ).toEqual({
      search: "credit",
      sort: "updated",
      direction: "desc",
      page: 3,
      pageSize: 20,
    });
  });

  test("normalizes unsupported or unbounded values", () => {
    expect(
      parseRegistryListUrl(
        "https://example.test/metrics?sort=nope&direction=sideways&page=999999",
      ),
    ).toMatchObject({ sort: "name", direction: "asc", page: 10_000 });
  });
});
