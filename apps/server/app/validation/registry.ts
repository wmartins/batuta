import { z } from "zod";

const machineKey = z
  .string()
  .trim()
  .min(1, "Enter a machine key.")
  .max(63, "Machine keys must be 63 characters or fewer.")
  .regex(
    /^[a-z][a-z0-9._-]*$/,
    "Start with a lowercase letter, then use lowercase letters, numbers, dots, underscores, or hyphens.",
  );

const registryDetails = {
  name: z
    .string()
    .trim()
    .min(1, "Enter a display name.")
    .max(100, "Display names must be 100 characters or fewer."),
  description: z
    .string()
    .trim()
    .max(500, "Descriptions must be 500 characters or fewer.")
    .transform((value) => value || null),
};

export const createRegistryInputSchema = z.object({
  key: machineKey,
  ...registryDetails,
});

export const updateRegistryInputSchema = z.object(registryDetails);

export type CreateRegistryInput = z.infer<typeof createRegistryInputSchema>;
export type UpdateRegistryInput = z.infer<typeof updateRegistryInputSchema>;

export type RegistryFormErrors = {
  key?: string;
  name?: string;
  description?: string;
  form?: string;
};

function valuesFrom(formData: FormData) {
  return {
    key: String(formData.get("key") ?? ""),
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? ""),
  };
}

export function readCreateRegistryForm(formData: FormData) {
  const values = valuesFrom(formData);
  const result = createRegistryInputSchema.safeParse(values);
  if (result.success) return result;
  const fields = z.flattenError(result.error).fieldErrors;
  return {
    success: false as const,
    values,
    errors: {
      key: fields.key?.[0],
      name: fields.name?.[0],
      description: fields.description?.[0],
    } satisfies RegistryFormErrors,
  };
}

export function readUpdateRegistryForm(formData: FormData) {
  const values = valuesFrom(formData);
  const result = updateRegistryInputSchema.safeParse(values);
  if (result.success) return result;
  const fields = z.flattenError(result.error).fieldErrors;
  return {
    success: false as const,
    values,
    errors: {
      name: fields.name?.[0],
      description: fields.description?.[0],
    } satisfies RegistryFormErrors,
  };
}
