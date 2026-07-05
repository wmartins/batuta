import { describe, expect, it } from "vitest";
import { Scope } from "./scope.js";

describe("Scope.validate", () => {
  it("returns a valid scope", () => {
    const scope = { key: "user", value: "user-1" };
    expect(Scope.validate(scope)).toBe(scope);
  });

  it("rejects an empty key", () => {
    expect(() => Scope.validate({ key: "", value: "user-1" })).toThrow(
      TypeError,
    );
  });
});

describe("Scope.validateAll", () => {
  it("rejects duplicate scopes", () => {
    const scope = { key: "user", value: "user-1" };
    expect(() => Scope.validateAll([scope, scope])).toThrow(TypeError);
  });
});
