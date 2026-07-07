import { z } from "zod";

export const workspaceInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter a workspace name.")
    .max(100, "Workspace names must be 100 characters or fewer."),
  slug: z
    .string()
    .trim()
    .min(1, "Enter a workspace slug.")
    .max(63, "Workspace slugs must be 63 characters or fewer.")
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Use lowercase letters, numbers, and single hyphens between words.",
    ),
});

export type WorkspaceInput = z.infer<typeof workspaceInputSchema>;

export type WorkspaceFormErrors = {
  name?: string;
  slug?: string;
  form?: string;
};

export function readWorkspaceForm(formData: FormData):
  | { success: true; data: WorkspaceInput }
  | {
      success: false;
      errors: WorkspaceFormErrors;
      values: WorkspaceInput;
    } {
  const values = {
    name: String(formData.get("name") ?? ""),
    slug: String(formData.get("slug") ?? ""),
  };
  const result = workspaceInputSchema.safeParse(values);

  if (result.success) {
    return result;
  }

  const fields = z.flattenError(result.error).fieldErrors;
  return {
    success: false,
    errors: {
      name: fields.name?.[0],
      slug: fields.slug?.[0],
    },
    values,
  };
}
