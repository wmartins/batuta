import "dotenv/config";

import { z } from "zod";

const schema = z.object({
  BATUTA_URL: z.url(),
  BATUTA_API_KEY: z.string().min(1),
  BATUTA_REFRESH_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .max(30_000)
    .default(2_000),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(
    "Invalid demo environment. Set BATUTA_URL and BATUTA_API_KEY; see apps/demo/.env.example.",
  );
}

export const env = parsed.data;
