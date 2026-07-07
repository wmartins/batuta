import "dotenv/config";

import { z } from "zod";

const environmentSchema = z.object({
  DATABASE_URL: z.url().refine((url) => url.startsWith("postgres"), {
    message: "DATABASE_URL must use a PostgreSQL connection URL",
  }),
});

export const env = environmentSchema.parse(process.env);
