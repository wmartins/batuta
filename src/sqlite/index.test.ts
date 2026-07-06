import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import type { Usage, Window } from "../index.js";
import { SQLite3Storage } from "./index.js";

const databases: DatabaseSync[] = [];
const temporaryDirectories: string[] = [];

function database(): DatabaseSync {
  const value = new DatabaseSync(":memory:");
  databases.push(value);
  return value;
}

function insertQuota(
  db: DatabaseSync,
  input: {
    id: string;
    metric?: string;
    scope?: string;
    limit?: number;
    amount?: number;
    unit?: Window.Unit;
  },
): void {
  db.prepare(`
    INSERT INTO quotas
      (id, metric, scope_key, quota_limit, window_amount, window_unit)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    input.id,
    input.metric ?? "credits",
    input.scope ?? "user",
    input.limit ?? 10,
    input.amount ?? 1,
    input.unit ?? "day",
  );
}

function event(input: Partial<Usage.Synthetic> = {}): Usage.Synthetic {
  return {
    metric: "credits",
    scope: { key: "user", value: "user-1" },
    consumed: 1,
    occurredAt: new Date("2026-07-05T12:00:00.000Z"),
    ...input,
  };
}

afterEach(() => {
  for (const value of databases.splice(0)) {
    try {
      value.close();
    } catch {}
  }
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("SQLite3Storage initialization", () => {
  it("does not mutate the schema during construction", () => {
    const db = database();
    new SQLite3Storage({ database: db });
    expect(
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE name IN ('quotas', 'usage')",
        )
        .all(),
    ).toEqual([]);
  });

  it("creates the schema and is idempotent on one instance", async () => {
    const db = database();
    const storage = new SQLite3Storage({ database: db });
    await storage.initialize();
    await storage.initialize();

    expect(
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('quotas', 'usage') ORDER BY name",
        )
        .all(),
    ).toEqual([{ name: "quotas" }, { name: "usage" }]);
  });

  it("allows a second adapter to initialize the same database", async () => {
    const db = database();
    await new SQLite3Storage({ database: db }).initialize();
    await new SQLite3Storage({ database: db }).initialize();
    expect(
      db
        .prepare(
          "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name IN ('quotas', 'usage')",
        )
        .get(),
    ).toEqual({ count: 2 });
  });
});

describe("SQLite3Storage usage", () => {
  it("returns externally inserted quotas as domain objects", async () => {
    const db = database();
    const storage = new SQLite3Storage({ database: db });
    await storage.initialize();
    insertQuota(db, { id: "daily", limit: 50, amount: 14, unit: "day" });

    await expect(
      storage.usage({
        metric: "credits",
        scopes: [{ key: "user", value: "user-1" }],
        at: new Date("2026-07-05T12:00:00.000Z"),
      }),
    ).resolves.toEqual([
      {
        quota: {
          metric: "credits",
          scope: "user",
          limit: 50,
          window: { amount: 14, unit: "day" },
        },
        scope: { key: "user", value: "user-1" },
        consumed: 0,
      },
    ]);
  });

  it("isolates aggregation by metric, scope key, and scope value", async () => {
    const db = database();
    const storage = new SQLite3Storage({ database: db });
    await storage.initialize();
    insertQuota(db, { id: "user-credits" });
    await storage.record([
      event({ consumed: 2 }),
      event({ metric: "tokens", consumed: 100 }),
      event({ scope: { key: "company", value: "user-1" }, consumed: 4 }),
      event({ scope: { key: "user", value: "user-2" }, consumed: 8 }),
    ]);

    const [result] = await storage.usage({
      metric: "credits",
      scopes: [{ key: "user", value: "user-1" }],
      at: new Date("2026-07-05T12:00:00.000Z"),
    });
    expect(result?.consumed).toBe(2);
    expect(result?.scope).toEqual({ key: "user", value: "user-1" });
  });

  it("evaluates multiple scopes and overlapping quotas", async () => {
    const db = database();
    const storage = new SQLite3Storage({ database: db });
    await storage.initialize();
    insertQuota(db, { id: "user-day" });
    insertQuota(db, { id: "user-week", amount: 1, unit: "week" });
    insertQuota(db, { id: "company-day", scope: "company" });
    await storage.record([
      event({ scope: { key: "user", value: "user-1" }, consumed: 3 }),
      event({ scope: { key: "company", value: "company-1" }, consumed: 5 }),
    ]);

    const results = await storage.usage({
      metric: "credits",
      scopes: [
        { key: "user", value: "user-1" },
        { key: "company", value: "company-1" },
      ],
      at: new Date("2026-07-05T12:00:00.000Z"),
    });
    expect(results).toHaveLength(3);
    expect(
      results.map(({ quota, scope, consumed }) => [
        quota.window.unit,
        scope.value,
        consumed,
      ]),
    ).toEqual(
      expect.arrayContaining([
        ["day", "user-1", 3],
        ["week", "user-1", 3],
        ["day", "company-1", 5],
      ]),
    );
  });

  it.each([
    ["minute", 1, 60_000],
    ["hour", 1, 3_600_000],
    ["day", 14, 14 * 86_400_000],
    ["week", 1, 7 * 86_400_000],
  ] as const)("uses the exact elapsed boundary for a %s window", async (unit, amount, duration) => {
    const db = database();
    const storage = new SQLite3Storage({ database: db });
    await storage.initialize();
    insertQuota(db, { id: `${amount}-${unit}`, amount, unit });
    const at = new Date("2026-07-05T12:00:00.000Z");
    await storage.record([
      event({ consumed: 1, occurredAt: new Date(at.getTime() - duration - 1) }),
      event({ consumed: 2, occurredAt: new Date(at.getTime() - duration) }),
      event({ consumed: 4, occurredAt: new Date(at.getTime() - duration + 1) }),
      event({ consumed: 8, occurredAt: at }),
      event({ consumed: 16, occurredAt: new Date(at.getTime() + 1) }),
    ]);

    const [result] = await storage.usage({
      metric: "credits",
      scopes: [{ key: "user", value: "user-1" }],
      at,
    });
    expect(result?.consumed).toBe(12);
  });
});

describe("SQLite3Storage recording and ownership", () => {
  it("enforces invalid quota data through schema constraints", async () => {
    const db = database();
    const storage = new SQLite3Storage({ database: db });
    await storage.initialize();

    expect(() => insertQuota(db, { id: "negative", limit: -1 })).toThrow();
    expect(() => insertQuota(db, { id: "zero-window", amount: 0 })).toThrow();
  });

  it("rolls back an entire batch when one insert fails", async () => {
    const db = database();
    const storage = new SQLite3Storage({ database: db });
    await storage.initialize();
    db.exec(`
      CREATE TRIGGER reject_scope BEFORE INSERT ON usage
      WHEN NEW.scope_value = 'reject'
      BEGIN
        SELECT RAISE(ABORT, 'rejected by test');
      END
    `);

    await expect(
      storage.record([
        event({ scope: { key: "user", value: "accepted" } }),
        event({ scope: { key: "user", value: "reject" } }),
      ]),
    ).rejects.toThrow("rejected by test");
    expect(db.prepare("SELECT COUNT(*) AS count FROM usage").get()).toEqual({
      count: 0,
    });
  });

  it("supports injected and filename connections and leaves them open", async () => {
    const injected = database();
    const injectedStorage = new SQLite3Storage({ database: injected });
    await injectedStorage.initialize();
    expect(injectedStorage.database).toBe(injected);
    expect(injected.prepare("SELECT 1 AS value").get()).toEqual({ value: 1 });

    const directory = mkdtempSync(join(tmpdir(), "batuta-"));
    temporaryDirectories.push(directory);
    const filenameStorage = new SQLite3Storage({
      filename: join(directory, "batuta.db"),
    });
    databases.push(filenameStorage.database);
    await filenameStorage.initialize();
    expect(filenameStorage.database.prepare("SELECT 1 AS value").get()).toEqual(
      {
        value: 1,
      },
    );
  });
});
