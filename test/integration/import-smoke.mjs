import { DatabaseSync } from "node:sqlite";
import { Batuta, Metric, Quota, Scope, Usage, Window } from "batuta";
import { SQLite3Storage } from "batuta/sqlite";

if (
  typeof Batuta !== "function" ||
  typeof SQLite3Storage !== "function" ||
  [Metric, Quota, Scope, Usage, Window].some(
    (domain) => typeof domain.validate !== "function",
  )
) {
  throw new Error("Package exports did not resolve from the generated build");
}

const database = new DatabaseSync(":memory:");
try {
  const storage = new SQLite3Storage({ database });
  await storage.initialize();
  storage.database
    .prepare(`
      INSERT INTO quotas
        (metric, scope_key, quota_limit, window_amount, window_unit)
      VALUES (?, ?, ?, ?, ?)
    `)
    .run("credits", "user", 10, 14, "day");

  const batuta = new Batuta({ storage });
  const input = {
    metric: "credits",
    scopes: [{ key: "user", value: "user-123" }],
  };
  const before = await batuta.check(input);
  await batuta.record({ ...input, consumed: 10 });
  const after = await batuta.check(input);

  if (before.exceeded || !after.exceeded) {
    throw new Error(
      "Generated package failed the end-to-end SQLite smoke test",
    );
  }
} finally {
  database.close();
}
