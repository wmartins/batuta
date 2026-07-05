import { describe, expect, it } from "vitest";
import { Window } from "./window.js";

describe("Window.validate", () => {
  it("returns a valid elapsed window", () => {
    const window = { amount: 14, unit: "day" } as const;
    expect(Window.validate(window)).toBe(window);
  });

  it("rejects a non-positive amount", () => {
    expect(() => Window.validate({ amount: 0, unit: "day" })).toThrow(
      TypeError,
    );
  });
});
