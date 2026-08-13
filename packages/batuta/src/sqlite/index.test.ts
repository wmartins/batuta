import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import type { Usage } from "../index.js";
import { SQLite3Storage } from "./index.js";

const databases: DatabaseSync[] = [];
function setup() {
  const database = new DatabaseSync(":memory:");
  databases.push(database);
  const storage = new SQLite3Storage<string, string>({ database });
  return { database, storage };
}

function quota(
  database: DatabaseSync,
  input: {
    metric?: string;
    scopeKey?: string;
    scopeValue?: string | null;
    type: "direct" | "balance" | "rolling";
    limit?: number | null;
    windowAmount?: number | null;
    windowUnit?: string | null;
  },
) {
  database
    .prepare(`
      INSERT INTO quotas
        (metric, scope_key, scope_value, quota_type, quota_limit,
         window_amount, window_unit)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      input.metric ?? "credits",
      input.scopeKey ?? "user",
      input.scopeValue ?? null,
      input.type,
      input.limit === undefined ? 10 : input.limit,
      input.windowAmount ?? (input.type === "rolling" ? 1 : null),
      input.windowUnit ?? (input.type === "rolling" ? "day" : null),
    );
}

function event(
  input: Partial<Usage.Synthetic<string, string>> = {},
): Usage.Synthetic<string, string> {
  return {
    metric: "credits",
    scope: { key: "user", value: "user-1" },
    amount: 1,
    occurredAt: new Date("2026-07-05T12:00:00.000Z"),
    ...input,
  };
}

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

describe("SQLite3Storage schema", () => {
  it("initializes idempotently and enforces quota configurations", async () => {
    const { database, storage } = setup();
    await storage.initialize();
    await storage.initialize();
    quota(database, { type: "rolling", windowAmount: 1 });
    expect(() =>
      quota(database, { type: "rolling", windowAmount: 1 }),
    ).toThrow();
    expect(() => quota(database, { type: "balance" })).toThrow(
      /mix quota kinds/,
    );
  });

  it("enforces conditional windows and finite non-zero events", async () => {
    const { database, storage } = setup();
    await storage.initialize();
    expect(() =>
      quota(database, { type: "direct", windowAmount: 1, windowUnit: "day" }),
    ).toThrow();
    expect(() =>
      database.exec(`
        INSERT INTO usage
          (metric, scope_key, scope_value, amount, occurred_at)
        VALUES ('credits', 'user', '1', 0, 1)
      `),
    ).toThrow();
  });
});

describe("SQLite3Storage usage", () => {
  it("omits usage for a direct unlimited concrete override", async () => {
    const { database, storage } = setup();
    await storage.initialize();
    quota(database, { type: "direct", limit: 5 });
    quota(database, {
      type: "direct",
      scopeValue: "user-1",
      limit: null,
    });
    await expect(
      storage.usage({
        metric: "credits",
        scopes: [{ key: "user", value: "user-1" }],
        at: new Date(),
      }),
    ).resolves.toEqual([
      {
        quota: {
          type: "direct",
          metric: "credits",
          scope: { key: "user", value: "user-1" },
          limit: "unlimited",
        },
        scope: { key: "user", value: "user-1" },
      },
    ]);
  });

  it("uses concrete sets instead of generic rolling sets", async () => {
    const { database, storage } = setup();
    await storage.initialize();
    quota(database, { type: "rolling", windowAmount: 1, windowUnit: "day" });
    quota(database, {
      type: "rolling",
      scopeValue: "user-1",
      windowAmount: 1,
      windowUnit: "week",
    });
    await storage.record([event({ amount: 3 })]);
    const results = await storage.usage({
      metric: "credits",
      scopes: [
        { key: "user", value: "user-1" },
        { key: "user", value: "user-2" },
      ],
      at: new Date("2026-07-05T12:00:00.000Z"),
    });
    expect(
      results.map((result) => [
        result.quota.type === "rolling" ? result.quota.window.unit : "none",
        result.scope.value,
        "used" in result ? result.used : undefined,
      ]),
    ).toEqual(
      expect.arrayContaining([
        ["week", "user-1", 3],
        ["day", "user-2", 0],
      ]),
    );
  });

  it("preserves the elapsed rolling boundary", async () => {
    const { database, storage } = setup();
    await storage.initialize();
    quota(database, { type: "rolling" });
    const at = new Date("2026-07-05T12:00:00.000Z");
    const day = 86_400_000;
    await storage.record([
      event({ amount: 2, occurredAt: new Date(at.getTime() - day) }),
      event({ amount: 4, occurredAt: new Date(at.getTime() - day + 1) }),
      event({ amount: 8, occurredAt: at }),
      event({ amount: 16, occurredAt: new Date(at.getTime() + 1) }),
    ]);
    const [result] = await storage.usage({
      metric: "credits",
      scopes: [{ key: "user", value: "user-1" }],
      at,
    });
    expect(result && "used" in result ? result.used : undefined).toBe(12);
  });

  it("returns persistent signed balances through the evaluation time", async () => {
    const { database, storage } = setup();
    await storage.initialize();
    quota(database, { type: "balance" });
    await storage.record([event({ amount: 3 }), event({ amount: -1 })]);
    const [result] = await storage.usage({
      metric: "credits",
      scopes: [{ key: "user", value: "user-1" }],
      at: new Date("2026-07-05T12:00:00.000Z"),
    });
    expect(result && "used" in result ? result.used : undefined).toBe(2);
  });
});

describe("SQLite3Storage recording", () => {
  it("rejects missing quotas, direct quotas, rolling negatives, and balance underflow", async () => {
    const first = setup();
    await first.storage.initialize();
    await expect(first.storage.record([event()])).rejects.toThrow(
      /effective quota/,
    );

    quota(first.database, { type: "direct" });
    await expect(first.storage.record([event()])).rejects.toThrow(
      /direct quotas/,
    );

    const second = setup();
    await second.storage.initialize();
    quota(second.database, { type: "rolling" });
    await expect(
      second.storage.record([event({ amount: -1 })]),
    ).rejects.toThrow(/greater than zero/);

    const third = setup();
    await third.storage.initialize();
    quota(third.database, { type: "balance" });
    await expect(third.storage.record([event({ amount: -1 })])).rejects.toThrow(
      /negative balance/,
    );
  });

  it("rolls back the complete batch when one scope is invalid", async () => {
    const { database, storage } = setup();
    await storage.initialize();
    quota(database, { type: "balance" });
    await expect(
      storage.record([
        event({ scope: { key: "user", value: "user-1" }, amount: 2 }),
        event({ scope: { key: "user", value: "user-2" }, amount: -1 }),
      ]),
    ).rejects.toThrow(/negative balance/);
    expect(
      database.prepare("SELECT COUNT(*) AS count FROM usage").get(),
    ).toEqual({
      count: 0,
    });
  });
});
