import { describe, expect, test } from "vitest";

import { readQuotaForm } from "./quota";

const metricId = "92a919d4-9f4e-48a4-ab41-85f12fab7f3f";
const scopeId = "6ac9e8ed-b9d0-4c71-bff6-69db0120f418";

function quotaForm(overrides: Record<string, string> = {}) {
  const formData = new FormData();
  for (const [name, value] of Object.entries({
    metricId,
    scopeId,
    quotaLimit: "100",
    windowAmount: "1",
    windowUnit: "day",
    ...overrides,
  })) {
    formData.set(name, value);
  }
  return formData;
}

describe("quota validation", () => {
  test("accepts zero and supported window units", () => {
    expect(
      readQuotaForm(quotaForm({ quotaLimit: "0", windowUnit: "minute" })),
    ).toEqual({
      success: true,
      data: {
        metricId,
        scopeId,
        quotaLimit: 0,
        windowAmount: 1,
        windowUnit: "minute",
      },
    });
  });

  test.each([
    "-1",
    "NaN",
    "Infinity",
    "-Infinity",
    "",
  ])("rejects invalid quota limit %j", (quotaLimit) => {
    expect(readQuotaForm(quotaForm({ quotaLimit }))).toMatchObject({
      success: false,
    });
  });

  test.each([
    "0",
    "-1",
    "1.5",
    "",
  ])("rejects invalid window amount %j", (windowAmount) => {
    expect(readQuotaForm(quotaForm({ windowAmount }))).toMatchObject({
      success: false,
    });
  });

  test("rejects unknown units and malformed selections", () => {
    expect(
      readQuotaForm(quotaForm({ metricId: "not-a-uuid", windowUnit: "month" })),
    ).toMatchObject({
      success: false,
      errors: { metricId: expect.any(String), windowUnit: expect.any(String) },
    });
  });
});
