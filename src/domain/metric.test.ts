import { describe, expect, it } from "vitest";
import { Metric } from "./metric.js";

describe("Metric.validate", () => {
  it("returns a valid metric", () => {
    expect(Metric.validate("credits")).toBe("credits");
  });

  it("rejects an empty metric", () => {
    expect(() => Metric.validate("")).toThrow(TypeError);
  });
});
