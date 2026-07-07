import { describe, expect, test } from "vitest";

import { createRegistryInputSchema, readUpdateRegistryForm } from "./registry";

describe("registry validation", () => {
  test.each([
    "credits",
    "api.tokens",
    "image_count",
    "jobs-per-hour",
  ])("accepts the machine key %s", (key) => {
    expect(
      createRegistryInputSchema.safeParse({
        key,
        name: "Name",
        description: "",
      }).success,
    ).toBe(true);
  });

  test.each([
    "1credit",
    "Uppercase",
    "two words",
    ".leading",
  ])("rejects the machine key %s", (key) => {
    expect(
      createRegistryInputSchema.safeParse({
        key,
        name: "Name",
        description: "",
      }).success,
    ).toBe(false);
  });

  test("update parsing ignores submitted machine keys", () => {
    const formData = new FormData();
    formData.set("key", "attempted-change");
    formData.set("name", "Credits");
    formData.set("description", "Updated");

    expect(readUpdateRegistryForm(formData)).toEqual({
      success: true,
      data: { name: "Credits", description: "Updated" },
    });
  });
});
