import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { Batuta } from "../../src/index.js";
import { SQLite3Storage } from "../../src/sqlite/index.js";

describe("Batuta with SQLite", () => {
  it("enforces prospective user and company rolling quotas", async () => {
    const database = new DatabaseSync(":memory:");
    try {
      const storage = new SQLite3Storage({ database });
      await storage.initialize();
      const insert = database.prepare(`
        INSERT INTO quotas
          (metric, scope_key, quota_type, quota_limit, window_amount, window_unit)
        VALUES (?, ?, 'rolling', ?, 1, 'day')
      `);
      insert.run("credits", "company", 6);
      insert.run("credits", "user", 3);
      const batuta = new Batuta({ storage });
      const scopes = [
        { key: "company", value: "company-1" },
        { key: "user", value: "user-1" },
      ];
      await expect(
        batuta.check({ metric: "credits", scopes, amount: 3 }),
      ).resolves.toEqual({ exceeded: false });
      await batuta.record({ metric: "credits", scopes, amount: 3 });
      await expect(
        batuta.check({ metric: "credits", scopes, amount: 0 }),
      ).resolves.toEqual({ exceeded: false });
      await expect(
        batuta.check({ metric: "credits", scopes, amount: 1 }),
      ).resolves.toEqual({ exceeded: true });
    } finally {
      database.close();
    }
  });

  it("supports balance increments and reversals", async () => {
    const database = new DatabaseSync(":memory:");
    try {
      const storage = new SQLite3Storage({ database });
      await storage.initialize();
      database.exec(`
        INSERT INTO quotas
          (metric, scope_key, quota_type, quota_limit)
        VALUES ('lessons', 'user', 'balance', 2)
      `);
      const batuta = new Batuta({ storage });
      const scope = { key: "user", value: "user-1" };
      const scopes = [scope];
      await batuta.record({ metric: "lessons", scopes, amount: 1 });
      await expect(
        batuta.check({ metric: "lessons", scopes, amount: 1 }),
      ).resolves.toEqual({ exceeded: false });
      await batuta.record({ metric: "lessons", scopes, amount: -1 });
      await expect(
        storage.record([
          {
            metric: "lessons",
            scope,
            amount: -1,
            occurredAt: new Date(),
          },
        ]),
      ).rejects.toThrow(/negative balance/);
    } finally {
      database.close();
    }
  });
});
