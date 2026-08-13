# Batuta

Batuta is a small, storage-backed TypeScript quota engine. Applications propose
one metric amount, and Batuta selects the effective quotas and decides whether
the operation fits.

## Quota kinds

- `direct` compares the proposed amount directly with a limit and stores no
  usage, such as maximum prompt characters.
- `balance` adds the proposed amount to a persistent signed balance, such as
  active lessons. Positive and negative events increment and reverse it.
- `rolling` adds the proposed amount to events in an elapsed window, such as AI
  generations in the last seven days.

Limits are finite non-negative numbers or the explicit string `"unlimited"`.
An operation reaching a finite limit exactly is allowed; only a projected value
greater than the limit is exceeded.

Quota definitions are explicit discriminated objects. Use `Quota.validate()`
at runtime boundaries when validation is needed:

```ts
import { Quota } from "batuta";

Quota.validate({
  type: "direct",
  metric: "prompt_characters",
  scope: "user",
  limit: 4_000,
});
Quota.validate({
  type: "balance",
  metric: "active_lessons",
  scope: "user",
  limit: 10,
});
Quota.validate({
  type: "rolling",
  metric: "generations",
  scope: "user",
  limit: 100,
  window: { amount: 7, unit: "day" },
});
```

A scope-key string is a generic default. A concrete scope is an override:

```ts
Quota.validate({
  type: "rolling",
  metric: "generations",
  scope: { key: "user", value: "user-123" },
  limit: "unlimited",
  window: { amount: 7, unit: "day" },
});
```

If any concrete definitions exist for a metric and concrete scope, that
complete concrete set replaces the generic set. Several rolling definitions
may coexist when their windows differ. A selector cannot mix kinds or contain
duplicate rolling windows.

## Runtime API

```ts
import { Batuta, type Storage } from "batuta";

type Metric = "prompt_characters" | "active_lessons" | "generations";
type ScopeKey = "user" | "company";

declare const storage: Storage<Metric, ScopeKey>;
const batuta = new Batuta({ storage });
const scopes = [{ key: "user" as const, value: "user-123" }];

const decision = await batuta.check({
  metric: "generations",
  scopes,
  amount: 1,
});

if (!decision.exceeded) {
  await batuta.record({ metric: "generations", scopes, amount: 1 });
}
```

`check()` accepts a finite non-negative proposed amount and returns only
`{ exceeded }`. No matching quota allows the operation. `record()` creates one
event per supplied scope with one shared timestamp:

- direct quotas reject recording;
- rolling quotas require a positive amount;
- balances require a non-zero amount of either sign and reject atomic
  underflow;
- recording without an effective quota is rejected.

`check()` and `record()` are separate and are not atomic. Applications needing
reservations or atomic authorization and recording must add that coordination.

## Storage contract

Storage implementations expose only usage queries and event recording:

```ts
interface Storage<MetricName extends string, ScopeKey extends string> {
  usage(input: {
    metric: MetricName;
    scopes: Scope<ScopeKey>[];
    at: Date;
  }): Promise<(
    | {
        quota: Quota.Direct<MetricName, ScopeKey>;
        scope: Scope<ScopeKey>;
      }
    | {
        quota:
          | Quota.Balance<MetricName, ScopeKey>
          | Quota.Rolling<MetricName, ScopeKey>;
        scope: Scope<ScopeKey>;
        used: number;
      }
  )[]>;

  record(events: readonly Usage.Synthetic<MetricName, ScopeKey>[]): Promise<void>;
}
```

Direct-quota results omit `used` because they have no accumulated state.
Balance results return the net amount through the evaluation time, and rolling
results use `(at - duration, at]`. Minutes, hours, days, and weeks are fixed
elapsed durations.

Quota configuration is deliberately not part of the runtime interface.

## SQLite adapter

```ts
import { SQLite3Storage } from "batuta/sqlite";

const storage = new SQLite3Storage({ filename: "./batuta.db" });
await storage.initialize();
```

`initialize()` creates the latest schema but never migrates an older schema.
Applications own the connection, backups, concurrency planning, and upgrades.
The adapter does not close its database.

Configuration remains external SQL. SQL `NULL` represents a domain unlimited
limit, while a null `scope_value` represents a generic selector:

```sql
INSERT INTO quotas
  (metric, scope_key, scope_value, quota_type, quota_limit,
   window_amount, window_unit)
VALUES
  ('generations', 'user', NULL, 'rolling', 100, 7, 'day'),
  ('active_lessons', 'user', NULL, 'balance', 10, NULL, NULL),
  ('prompt_characters', 'user', NULL, 'direct', 4000, NULL, NULL),
  ('generations', 'user', 'user-123', 'rolling', NULL, 7, 'day');
```

The `usage` table stores `metric`, `scope_key`, `scope_value`, signed `amount`,
and Unix-millisecond `occurred_at`. Events are not tied to quota IDs, so one
rolling event can contribute to several windows.

This schema is incompatible with the earlier rolling-only schema. Existing
quotas can be migrated as generic `rolling` rows, and historical positive
events remain valid. Do not reinterpret rolling history as balances or direct
state.

## Development

From the repository root:

```sh
corepack pnpm --filter batuta check
corepack pnpm --filter batuta typecheck
corepack pnpm --filter batuta test
corepack pnpm --filter batuta build
corepack pnpm --filter batuta typecheck:imports
corepack pnpm --filter batuta test:imports
```
