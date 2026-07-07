import { z } from "zod";

const finiteNonNegativeNumber = z
  .string()
  .trim()
  .min(1, "Enter a quota limit.")
  .transform(Number)
  .refine(Number.isFinite, "Quota limit must be a finite number.")
  .refine((value) => value >= 0, "Quota limit cannot be negative.");

const positiveInteger = z
  .string()
  .trim()
  .min(1, "Enter a window amount.")
  .transform(Number)
  .refine(Number.isInteger, "Window amount must be an integer.")
  .refine((value) => value > 0, "Window amount must be positive.");

export const quotaInputSchema = z.object({
  metricId: z.uuid("Choose an active metric."),
  scopeId: z.uuid("Choose an active scope."),
  quotaLimit: finiteNonNegativeNumber,
  windowAmount: positiveInteger,
  windowUnit: z.enum(["minute", "hour", "day", "week"], {
    error: "Choose a supported window unit.",
  }),
});

export type QuotaInput = z.infer<typeof quotaInputSchema>;
export type QuotaFormValues = {
  metricId: string;
  scopeId: string;
  quotaLimit: string;
  windowAmount: string;
  windowUnit: string;
};
export type QuotaFormErrors = Partial<
  Record<keyof QuotaFormValues | "form", string>
>;

export function readQuotaForm(
  formData: FormData,
):
  | { success: true; data: QuotaInput }
  | { success: false; values: QuotaFormValues; errors: QuotaFormErrors } {
  const values: QuotaFormValues = {
    metricId: String(formData.get("metricId") ?? ""),
    scopeId: String(formData.get("scopeId") ?? ""),
    quotaLimit: String(formData.get("quotaLimit") ?? ""),
    windowAmount: String(formData.get("windowAmount") ?? ""),
    windowUnit: String(formData.get("windowUnit") ?? ""),
  };
  const result = quotaInputSchema.safeParse(values);
  if (result.success) return result;
  const fields = z.flattenError(result.error).fieldErrors;
  return {
    success: false,
    values,
    errors: {
      metricId: fields.metricId?.[0],
      scopeId: fields.scopeId?.[0],
      quotaLimit: fields.quotaLimit?.[0],
      windowAmount: fields.windowAmount?.[0],
      windowUnit: fields.windowUnit?.[0],
    },
  };
}
