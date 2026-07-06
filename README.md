<p align="center">
  <img src="assets/logo.png" alt="A robotic hand conducting with an orchestra baton" width="240" />
</p>

<h1 align="center">Batuta</h1>

Batuta is a storage-agnostic TypeScript quota engine. It defines how usage is
recorded and evaluated across arbitrary metrics and scopes; applications decide
where that data lives by providing a `Storage` implementation.

## Concepts

- **Metric** is what an application consumes, such as credits, tokens, or
  generations.
- **Scope** identifies the entity consuming it. A concrete scope always remains
  one `{ key, value }` object, such as `{ key: "user", value: "user-123" }`.
- **Quota** limits one metric for a scope key over an elapsed window.
- **Usage** is an immutable, append-only record of consumption by one concrete
  scope.

One operation can affect several scopes. For example, consuming three credits
for a user in a company records one usage event for the user and another for the
company. Batuta evaluates every matching quota and reports the operation as
exceeded when any consumption is greater than or equal to its limit.

## Public API

The client, domain values, and storage contract are exported from `batuta`:

```ts
import {
  Batuta,
  Metric,
  Quota,
  Scope,
  type Storage,
  Usage,
  Window,
} from "batuta";
```

Domain namespaces expose constructors that enforce invariants and return the
validated value:

```ts
const metric = Metric.validate("credits");
const scope = Scope.validate({ key: "user", value: "user-123" }, "scope");
const window = Window.validate({ amount: 14, unit: "day" });
```

Metrics and scope keys can be narrowed to the values used by an application:

```ts
type Metric = "credits" | "tokens";
type Scope = "user" | "company";

declare const storage: Storage<Metric, Scope>;
const batuta = new Batuta<Metric, Scope>({ storage });

await batuta.check({
  metric: "credits",
  scopes: [{ key: "user", value: "user-123" }],
});
```

The configured metric and scope-key unions flow through `Batuta`, `Storage`,
`Quota.Synthetic`, and `Usage.Synthetic`.

`Quota.validate()` and `Usage.validate()` do the same for their domain objects.
Domain values do not contain persistence IDs; IDs belong to storage
implementations.

## Bring your own storage

`Batuta` captures one timestamp per operation and delegates persistence to a
small interface:

```ts
interface Storage<Metric extends string, Scope extends string> {
  usage(
    input: Storage.Usage.Input<Metric, Scope>,
  ): Promise<Storage.Usage.Result<Metric, Scope>[]>;
  record(usages: readonly Usage.Synthetic<Metric, Scope>[]): Promise<void>;
}
```

A storage implementation is responsible for:

- Finding every quota matching the requested metric and scope keys.
- Returning consumption for every matching quota and concrete scope.
- Recording one immutable usage event per supplied scope.
- Applying the elapsed-window semantics described below.

The contract deliberately contains no initialization, quota-management, or
connection-cleanup methods. Those concerns belong to each implementation and
its owner.

Applications can implement this interface over their existing database or
infrastructure. A managed Batuta service is planned for applications that would
rather delegate storage and its operation entirely.

## Check and record

```ts
import { Batuta, type Storage } from "batuta";

type Metric = "credits" | "tokens";
type Scope = "user" | "company";

declare const storage: Storage<Metric, Scope>; // Your storage implementation

const batuta = new Batuta<Metric, Scope>({ storage });
const metric: Metric = "credits";
const scopes = [
  { key: "company" as const, value: "company-123" },
  { key: "user" as const, value: "user-123" },
];

const { exceeded } = await batuta.check({ metric, scopes });

if (!exceeded) {
  await batuta.record({ metric, scopes, consumed: 10 });
}
```

No matching quota produces `{ exceeded: false }`. Recording creates one usage
event per supplied scope and assigns every event the same timestamp.

`check()` and `record()` are separate and are not atomic. Storage
implementations or applications that require stronger concurrency guarantees
must provide that coordination themselves.

## Window semantics

Windows are elapsed durations ending at the check time. A 14-day window always
means the preceding `14 * 24` hours; it is not a calendar period. The queried
interval is `(at - duration, at]`: an event exactly one complete window old is
excluded, an event at `at` is included, and future events are excluded.

Minutes, hours, days, and weeks are fixed at 60 seconds, 60 minutes, 24 hours,
and seven days respectively.

## SQLite adapter

Batuta includes `batuta/sqlite` as a straightforward storage implementation
built on Node's `node:sqlite`.

> [!NOTE]
> The adapter manages quota data, not the SQLite instance itself. Applications
> using it own deployment, backups, concurrency planning, maintenance, and
> schema upgrades. `initialize()` creates the current schema but does not migrate
> older schemas.

The adapter uses Node's built-in `node:sqlite`. Construct it with an existing
connection or a filename, then initialize its schema explicitly:

```ts
import { DatabaseSync } from "node:sqlite";
import { SQLite3Storage } from "batuta/sqlite";

const database = new DatabaseSync(":memory:");
const storage = new SQLite3Storage({ database });

// Alternatively, open a file-backed database:
const fileStorage = new SQLite3Storage({ filename: "./batuta.db" });

await storage.initialize();
await fileStorage.initialize();
```

Initialization transactionally creates `quotas`, `usage`, and the usage lookup
index if they do not exist. Construction does not mutate the schema. The adapter
never closes a connection; its owner must close `storage.database`.

Quota management remains external SQL:

```ts
storage.database
  .prepare(`
    INSERT INTO quotas
      (metric, scope_key, quota_limit, window_amount, window_unit)
    VALUES (?, ?, ?, ?, ?)
  `)
  .run("credits", "user", 100, 14, "day");
```

The `quotas` table contains `id`, `metric`, `scope_key`, `quota_limit`,
`window_amount`, and `window_unit`. The append-only `usage` table contains `id`,
`metric`, `scope_key`, `scope_value`, `consumed`, and `occurred_at`. Timestamps
are Unix milliseconds.

Usage events are not associated with quota IDs, so one event can contribute to
multiple overlapping quotas. `record()` inserts each operation's events in one
transaction, and `usage()` performs matching and aggregation in one query.

## Current limitations

- Month, year, calendar-aligned, and billing-cycle windows are unsupported.
- Refunds, negative adjustments, and usage reversal are unsupported.
- `check()` returns only `{ exceeded }`.
- Atomic check-and-record behavior is not provided by the core library.
- The SQLite adapter does not manage database operations or schema upgrades.

## Development

Batuta requires Node.js `>=22.13.0` and uses pnpm through Corepack. Local
development pins Node.js `22.14.0` in `.tool-versions` and pnpm `11.10.0` in
`package.json`.

Install
[asdf](https://asdf-vm.com/guide/getting-started.html), the asdf Node.js plugin,
[direnv](https://direnv.net/docs/hook.html), and the
[`asdf-direnv` integration](https://github.com/asdf-community/asdf-direnv).
Then run:

```sh
asdf install
direnv allow
corepack enable
pnpm install
```

Unit and adapter tests are colocated with source files. Cross-component and
generated-package tests live under `test/integration`.

Run the standard checks with:

```sh
pnpm check
pnpm typecheck
pnpm test
pnpm build
pnpm typecheck:imports
pnpm test:imports
```

`build` only compiles with plain `tsc`, emitting JavaScript, declarations,
declaration maps, and source maps to `dist`. Run the import tasks after `build`;
they verify the generated root and SQLite package exports at type-check and
runtime levels.
