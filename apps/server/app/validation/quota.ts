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

const quotaFormSchema = z
  .object({
    metricId: z.uuid("Choose an active metric."),
    scopeId: z.uuid("Choose an active scope."),
    scopeValue: z.string().trim().max(512, "Scope value is too long."),
    type: z.enum(["direct", "balance", "rolling"], {
      error: "Choose a quota kind.",
    }),
    limitMode: z.enum(["finite", "unlimited"], {
      error: "Choose finite or unlimited.",
    }),
    quotaLimit: z.string(),
    windowAmount: z.string(),
    windowUnit: z.string(),
  })
  .superRefine((value, context) => {
    if (value.limitMode === "finite") {
      const result = finiteNonNegativeNumber.safeParse(value.quotaLimit);
      if (!result.success) {
        context.addIssue({
          code: "custom",
          path: ["quotaLimit"],
          message: result.error.issues[0]?.message ?? "Invalid limit.",
        });
      }
    }
    if (value.type === "rolling") {
      const amount = positiveInteger.safeParse(value.windowAmount);
      if (!amount.success) {
        context.addIssue({
          code: "custom",
          path: ["windowAmount"],
          message: amount.error.issues[0]?.message ?? "Invalid window.",
        });
      }
      if (
        !(["minute", "hour", "day", "week"] as const).includes(
          value.windowUnit as "minute",
        )
      ) {
        context.addIssue({
          code: "custom",
          path: ["windowUnit"],
          message: "Choose a supported window unit.",
        });
      }
    }
  })
  .transform((value) => ({
    metricId: value.metricId,
    scopeId: value.scopeId,
    scopeValue: value.scopeValue || null,
    type: value.type,
    quotaLimit:
      value.limitMode === "unlimited" ? null : Number(value.quotaLimit),
    windowAmount: value.type === "rolling" ? Number(value.windowAmount) : null,
    windowUnit:
      value.type === "rolling"
        ? (value.windowUnit as "minute" | "hour" | "day" | "week")
        : null,
  }));

export type QuotaInput = z.infer<typeof quotaFormSchema>;
export type QuotaFormValues = {
  metricId: string;
  scopeId: string;
  scopeValue: string;
  type: string;
  limitMode: string;
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
    scopeValue: String(formData.get("scopeValue") ?? ""),
    type: String(formData.get("type") ?? ""),
    limitMode: String(formData.get("limitMode") ?? ""),
    quotaLimit: String(formData.get("quotaLimit") ?? ""),
    windowAmount: String(formData.get("windowAmount") ?? ""),
    windowUnit: String(formData.get("windowUnit") ?? ""),
  };
  const result = quotaFormSchema.safeParse(values);
  if (result.success) return result;
  const fields = z.flattenError(result.error).fieldErrors;
  return {
    success: false,
    values,
    errors: {
      metricId: fields.metricId?.[0],
      scopeId: fields.scopeId?.[0],
      scopeValue: fields.scopeValue?.[0],
      type: fields.type?.[0],
      limitMode: (fields as Record<string, string[] | undefined>)
        .limitMode?.[0],
      quotaLimit: fields.quotaLimit?.[0],
      windowAmount: fields.windowAmount?.[0],
      windowUnit: fields.windowUnit?.[0],
    },
  };
}
