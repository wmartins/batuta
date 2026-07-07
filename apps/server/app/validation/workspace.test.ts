import { describe, expect, test } from "vitest";

import { readWorkspaceForm, workspaceInputSchema } from "./workspace";

describe("workspace validation", () => {
  test("trims valid names and slugs", () => {
    expect(
      workspaceInputSchema.parse({ name: "  Acme  ", slug: "  acme-one  " }),
    ).toEqual({ name: "Acme", slug: "acme-one" });
  });

  test.each([
    "Uppercase",
    "two words",
    "-leading",
    "trailing-",
    "two--hyphens",
  ])("rejects the invalid slug %s", (slug) => {
    expect(workspaceInputSchema.safeParse({ name: "Acme", slug }).success).toBe(
      false,
    );
  });

  test("returns field errors and submitted values for forms", () => {
    const formData = new FormData();
    formData.set("name", "");
    formData.set("slug", "Not valid");

    expect(readWorkspaceForm(formData)).toEqual({
      success: false,
      errors: {
        name: "Enter a workspace name.",
        slug: "Use lowercase letters, numbers, and single hyphens between words.",
      },
      values: { name: "", slug: "Not valid" },
    });
  });
});
