import { afterEach, describe, expect, it, vi } from "vitest";
import {
  Batuta,
  Quota,
  type Scope,
  type Storage,
  type Usage,
} from "./index.js";

class FakeStorage implements Storage<string, string> {
  usageInputs: Storage.Usage.Input<string, string>[] = [];
  recorded: readonly Usage.Synthetic<string, string>[] = [];
  results: Storage.Usage.Result<string, string>[] = [];

  async usage(input: Storage.Usage.Input<string, string>) {
    this.usageInputs.push(input);
    return this.results;
  }

  async record(usages: readonly Usage.Synthetic<string, string>[]) {
    this.recorded = usages;
  }
}

const rolling = (limit: number | "unlimited") =>
  Quota.validate({
    type: "rolling",
    metric: "credits",
    scope: "user",
    limit,
    window: { amount: 1, unit: "day" },
  });
const scope: Scope<string> = { key: "user", value: "user-123" };

afterEach(() => vi.useRealTimers());

describe("Batuta.check", () => {
  it("validates and forwards the input with one captured timestamp", async () => {
    const now = new Date("2026-07-05T12:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const storage = new FakeStorage();
    await new Batuta({ storage }).check({
      metric: "credits",
      scopes: [scope],
      amount: 2,
    });
    expect(storage.usageInputs).toEqual([
      { metric: "credits", scopes: [scope], at: now },
    ]);
    await expect(
      new Batuta({ storage }).check({
        metric: "credits",
        scopes: [scope],
        amount: -1,
      }),
    ).rejects.toThrow(/non-negative/);
  });

  it("allows an operation when storage finds no quotas", async () => {
    await expect(
      new Batuta({ storage: new FakeStorage() }).check({
        metric: "credits",
        scopes: [scope],
        amount: 100,
      }),
    ).resolves.toEqual({ exceeded: false });
  });

  it("uses prospective strict comparisons for accumulated quotas", async () => {
    const storage = new FakeStorage();
    storage.results = [{ quota: rolling(10), scope, used: 7 }];
    const batuta = new Batuta({ storage });
    await expect(
      batuta.check({ metric: "credits", scopes: [scope], amount: 3 }),
    ).resolves.toEqual({ exceeded: false });
    await expect(
      batuta.check({ metric: "credits", scopes: [scope], amount: 4 }),
    ).resolves.toEqual({ exceeded: true });
  });

  it("evaluates direct quotas against only the proposed amount", async () => {
    const storage = new FakeStorage();
    storage.results = [
      {
        quota: Quota.validate({
          type: "direct",
          metric: "prompt",
          scope: "user",
          limit: 10,
        }),
        scope,
      },
    ];
    const batuta = new Batuta({ storage });
    await expect(
      batuta.check({ metric: "prompt", scopes: [scope], amount: 10 }),
    ).resolves.toEqual({ exceeded: false });
    await expect(
      batuta.check({ metric: "prompt", scopes: [scope], amount: 11 }),
    ).resolves.toEqual({ exceeded: true });
  });

  it("allows unlimited quotas and exceeds when any finite quota does", async () => {
    const storage = new FakeStorage();
    storage.results = [
      { quota: rolling("unlimited"), scope, used: 1000 },
      { quota: rolling(5), scope, used: 5 },
    ];
    await expect(
      new Batuta({ storage }).check({
        metric: "credits",
        scopes: [scope],
        amount: 1,
      }),
    ).resolves.toEqual({ exceeded: true });
  });
});

describe("Batuta.record", () => {
  it("creates one signed event per scope with one shared timestamp", async () => {
    const now = new Date("2026-07-05T12:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const storage = new FakeStorage();
    const scopes = [scope, { key: "company", value: "company-123" }];
    await new Batuta({ storage }).record({
      metric: "credits",
      scopes,
      amount: -2,
    });
    expect(storage.recorded).toEqual(
      scopes.map((item) => ({
        metric: "credits",
        scope: item,
        amount: -2,
        occurredAt: now,
      })),
    );
    expect(storage.recorded[0]?.occurredAt).toBe(
      storage.recorded[1]?.occurredAt,
    );
  });
});
