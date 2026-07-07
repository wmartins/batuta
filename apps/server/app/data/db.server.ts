import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { env } from "./env.server";
import * as schema from "./schema.server";

export const pool = new Pool({ connectionString: env.DATABASE_URL });

export const db = drizzle({ client: pool, schema });

export type Database = NodePgDatabase<typeof schema>;
