import { describe, expect, test } from "vitest";

import { parseQuotaListUrl } from "./quota-list";

describe("quota list URL parsing", () => {
  test("parses supported filters, sorting, and pagination", () => {
    expect(
      parseQuotaListUrl(
        "https://example.test/quotas?metric=92a919d4-9f4e-48a4-ab41-85f12fab7f3f&scope=6ac9e8ed-b9d0-4c71-bff6-69db0120f418&sort=limit&direction=asc&page=3",
      ),
    ).toEqual({
      metricId: "92a919d4-9f4e-48a4-ab41-85f12fab7f3f",
      scopeId: "6ac9e8ed-b9d0-4c71-bff6-69db0120f418",
      sort: "limit",
      direction: "asc",
      page: 3,
      pageSize: 20,
    });
  });

  test("ignores malformed UUID filters and normalizes unsupported values", () => {
    expect(
      parseQuotaListUrl(
        "https://example.test/quotas?metric=nope&scope=also-nope&sort=name&direction=sideways&page=999999",
      ),
    ).toEqual({
      metricId: "",
      scopeId: "",
      sort: "updated",
      direction: "desc",
      page: 10_000,
      pageSize: 20,
    });
  });
});
