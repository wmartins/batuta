import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { Batuta } from "../../src/index.js";
import { SQLite3Storage } from "../../src/sqlite/index.js";

describe("Batuta with SQLite", () => {
  it("enforces user and company quotas across real usage", async () => {
    const database = new DatabaseSync(":memory:");

    try {
      const storage = new SQLite3Storage({ database });
      await storage.initialize();

      const insertQuota = database.prepare(`
        INSERT INTO quotas
          (metric, scope_key, quota_limit, window_amount, window_unit)
        VALUES (?, ?, ?, ?, ?)
      `);
      insertQuota.run("credits", "company", 6, 1, "day");
      insertQuota.run("credits", "user", 3, 1, "day");

      const batuta = new Batuta({ storage });
      const company = { key: "company", value: "company-1" };
      const firstUser = { key: "user", value: "user-1" };
      const secondUser = { key: "user", value: "user-2" };

      await batuta.record({
        metric: "credits",
        scopes: [company, firstUser],
        consumed: 3,
      });

      await expect(
        batuta.check({ metric: "credits", scopes: [company] }),
      ).resolves.toEqual({ exceeded: false });
      await expect(
        batuta.check({ metric: "credits", scopes: [firstUser] }),
      ).resolves.toEqual({ exceeded: true });

      await batuta.record({
        metric: "credits",
        scopes: [company, secondUser],
        consumed: 3,
      });

      await expect(
        batuta.check({ metric: "credits", scopes: [company] }),
      ).resolves.toEqual({ exceeded: true });
      await expect(
        batuta.check({ metric: "credits", scopes: [secondUser] }),
      ).resolves.toEqual({ exceeded: true });
      await expect(
        batuta.check({ metric: "credits", scopes: [company, secondUser] }),
      ).resolves.toEqual({ exceeded: true });
    } finally {
      database.close();
    }
  });
});
