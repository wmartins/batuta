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

  it("defines the intended operation costs", () => {
    expect(operations.map((operation) => operation.cost)).toEqual([1, 3, 10]);
  });
});
