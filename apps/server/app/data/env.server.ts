import "dotenv/config";

import { z } from "zod";

const environmentSchema = z.object({
  DATABASE_URL: z.url().refine((url) => url.startsWith("postgres"), {
    message: "DATABASE_URL must use a PostgreSQL connection URL",
  }),
  API_KEY_PEPPER_V1: z
    .string()
    .regex(/^[A-Za-z0-9_-]+$/, "API_KEY_PEPPER_V1 must be base64url encoded")
    .refine((value) => Buffer.from(value, "base64url").length >= 32, {
      message: "API_KEY_PEPPER_V1 must decode to at least 32 bytes",
    }),
});

export const env = environmentSchema.parse(process.env);
