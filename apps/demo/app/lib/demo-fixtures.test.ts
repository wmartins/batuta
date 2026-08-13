import { describe, expect, it } from "vitest";

import { operations, teams } from "./demo-fixtures";

describe("demo fixtures", () => {
  it("assigns every globally unique user to one known team", () => {
    const userScopeValues = teams.flatMap((team) =>
      team.users.map((user) => user.scopeValue as string),
    );
    expect(userScopeValues).toHaveLength(6);
    expect(new Set(userScopeValues).size).toBe(userScopeValues.length);
  });

  it("defines operations that exercise every quota mode", () => {
    expect(
      operations.map(({ credits, briefCharacters, campaignChange }) => [
        credits,
        briefCharacters,
        campaignChange,
      ]),
    ).toEqual([
      [1, 600, 0],
      [3, 2_400, 1],
      [10, 6_000, 1],
      [0, 0, -1],
    ]);
  });
});
