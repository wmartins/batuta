import { execFileSync } from "node:child_process";
import { describe, expect, test } from "vitest";

describe("runtime API route manifest", () => {
  test("keeps both v1 managed-storage paths stable", () => {
    const manifest = execFileSync("react-router", ["routes"], {
      cwd: process.cwd(),
      encoding: "utf8",
    });
    expect(manifest).toContain('path="api/v1/usage/query"');
    expect(manifest).toContain('path="api/v1/usage/events"');
  });
});
