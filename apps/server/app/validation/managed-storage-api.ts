import { z } from "zod";

const registryKey = z
  .string()
  .min(1)
  .max(63)
  .regex(/^[a-z][a-z0-9._-]*$/);
const scope = z
  .object({ key: registryKey, value: z.string().min(1).max(512) })
  .strict();

export const queryUsageRequestSchema = z
  .object({
    metric: registryKey,
    scopes: z.array(scope).min(1).max(100),
  })
  .strict()
  .superRefine((value, context) => {
    const seen = new Set<string>();
    for (const [index, item] of value.scopes.entries()) {
      const identity = JSON.stringify([item.key, item.value]);
      if (seen.has(identity)) {
        context.addIssue({
          code: "custom",
          path: ["scopes", index],
          message: "Duplicate scope key/value pairs are not allowed.",
        });
      }
      seen.add(identity);
    }
  });

export const recordUsageEventsRequestSchema = z
  .object({
    events: z
      .array(
        z
          .object({
            metric: registryKey,
            scope,
            consumed: z.number().positive(),
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict();
