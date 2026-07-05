import { afterEach, describe, expect, it, vi } from "vitest";
import {
  Batuta,
  type Quota,
  type Scope,
  type Storage,
  type Usage,
} from "./index.js";

class FakeStorage implements Storage {
  usageInputs: Storage.Usage.Input[] = [];
  recorded: readonly Usage.Synthetic[] = [];
  results: Storage.Usage.Result[] = [];

  async usage(input: Storage.Usage.Input): Promise<Storage.Usage.Result[]> {
    this.usageInputs.push(input);
    return this.results;
  }

  async record(usages: readonly Usage.Synthetic[]): Promise<void> {
    this.recorded = usages;
  }
}

const quota = (limit: number): Quota.Synthetic => ({
  metric: "credits",
  scope: "user",
  limit,
  window: { amount: 1, unit: "day" },
});

const scope: Scope = { key: "user", value: "user-123" };

afterEach(() => {
  vi.useRealTimers();
});

describe("Batuta.check", () => {
  it("forwards the input with one captured current timestamp", async () => {
    const now = new Date("2026-07-05T12:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const storage = new FakeStorage();
    const batuta = new Batuta({ storage });

    await batuta.check({ metric: "credits", scopes: [scope] });

    expect(storage.usageInputs).toEqual([
      { metric: "credits", scopes: [scope], at: now },
    ]);
  });

  it("is not exceeded when storage finds no quotas", async () => {
    const batuta = new Batuta({ storage: new FakeStorage() });
    await expect(
      batuta.check({ metric: "credits", scopes: [scope] }),
    ).resolves.toEqual({ exceeded: false });
  });

  it("is not exceeded when every quota is below its limit", async () => {
    const storage = new FakeStorage();
    storage.results = [
      { quota: quota(10), scope, consumed: 9 },
      { quota: quota(20), scope, consumed: 19 },
    ];
    await expect(
      new Batuta({ storage }).check({ metric: "credits", scopes: [scope] }),
    ).resolves.toEqual({ exceeded: false });
  });

  it("is exceeded when any quota reaches or exceeds its limit", async () => {
    const storage = new FakeStorage();
    storage.results = [
      { quota: quota(10), scope, consumed: 9 },
      { quota: quota(20), scope, consumed: 20 },
    ];
    await expect(
      new Batuta({ storage }).check({ metric: "credits", scopes: [scope] }),
    ).resolves.toEqual({ exceeded: true });
  });

  it("treats a valid zero limit as already exceeded", async () => {
    const storage = new FakeStorage();
    storage.results = [{ quota: quota(0), scope, consumed: 0 }];
    await expect(
      new Batuta({ storage }).check({ metric: "credits", scopes: [scope] }),
    ).resolves.toEqual({ exceeded: true });
  });
});

describe("Batuta.record", () => {
  it("creates one event per scope with one shared timestamp", async () => {
    const now = new Date("2026-07-05T12:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const storage = new FakeStorage();
    const scopes = [scope, { key: "company", value: "company-123" }];

    await new Batuta({ storage }).record({
      metric: "credits",
      scopes,
      consumed: 10,
    });

    expect(storage.recorded).toEqual(
      scopes.map((item) => ({
        metric: "credits",
        scope: item,
        consumed: 10,
        occurredAt: now,
      })),
    );
    expect(storage.recorded[0]?.occurredAt).toBe(
      storage.recorded[1]?.occurredAt,
    );
  });
});
