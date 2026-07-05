<p align="center">
  <img src="assets/logo.png" alt="A robotic hand conducting with an orchestra baton" width="240" />
</p>

<h1 align="center">Batuta</h1>

Batuta is a small TypeScript quota engine for tracking arbitrary usage metrics
across one or more scopes. It ships with a SQLite adapter built on Node's
`node:sqlite` module.

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

## Requirements and setup

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

Hook direnv into your shell before running `direnv allow`. Review `.envrc`
first; it contains only `use asdf`. Entering the repository then selects the
pinned runtime and package manager.

## Public API

The client, domain values, and storage contract are exported from `batuta`. The
SQLite adapter is exported from `batuta/sqlite`:

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
import {
  SQLite3Storage,
  type SQLite3StorageOptions,
} from "batuta/sqlite";
```

Domain namespaces expose constructors that enforce invariants and return the
validated value:

```ts
const metric = Metric.validate("credits");
const scope = Scope.validate({ key: "user", value: "user-123" });
const window = Window.validate({ amount: 14, unit: "day" });
```

`Quota.validate()` and `Usage.validate()` do the same for their domain objects.
Domain values do not contain persistence IDs; IDs belong to storage adapters.

## Architecture

`Batuta` coordinates quota checks and usage recording. It captures one current
timestamp per operation and delegates persistence to this minimal contract:

```ts
interface Storage {
  usage(input: Storage.Usage.Input): Promise<Storage.Usage.Result[]>;
  record(usages: readonly Usage.Synthetic[]): Promise<void>;
}
```

The generic interface deliberately contains no initialization, quota CRUD, or
connection cleanup methods. Adapter initialization is adapter-specific, quota
management is external, and connection ownership remains with the caller.

## SQLite

Construct the adapter with an existing connection or a filename, then initialize
it explicitly:

```ts
import { DatabaseSync } from "node:sqlite";
import { SQLite3Storage } from "batuta/sqlite";

const database = new DatabaseSync(":memory:");
const storage = new SQLite3Storage({ database });

// Alternatively, open a file-backed connection:
const fileStorage = new SQLite3Storage({ filename: "./batuta.db" });

await storage.initialize();
await fileStorage.initialize();
```

Initialization is transactional and idempotent. Construction does not mutate
the schema. Batuta never closes either injected or filename-created connections;
close `storage.database` when its owner is finished with it.

### Schema

Schema version 1 contains three tables:

- `migrations` tracks applied versions and their Unix-millisecond timestamps.
- `quotas` stores persisted quota configuration.
- `usage` stores append-only usage events with Unix-millisecond timestamps.

The `quotas` columns are:

| Column | Meaning |
| --- | --- |
| `id` | SQLite-generated text primary key when omitted |
| `metric` | Metric name |
| `scope_key` | Scope kind matched against `Scope.key` |
| `quota_limit` | Finite, non-negative usage limit |
| `window_amount` | Positive integer duration amount |
| `window_unit` | `minute`, `hour`, `day`, or `week` |

The `usage` columns are `id`, `metric`, `scope_key`, `scope_value`, `consumed`,
and `occurred_at`. Usage is indexed by metric, scope key, scope value, and
occurrence time. Events are not associated with quota IDs, so one event can
contribute to multiple overlapping quotas.

Quota management remains external SQL. Insert quotas with parameterized SQL
through the exposed connection:

```ts
storage.database
  .prepare(`
    INSERT INTO quotas
      (metric, scope_key, quota_limit, window_amount, window_unit)
    VALUES (?, ?, ?, ?, ?)
  `)
  .run("credits", "user", 100, 14, "day");
```

## Check and record

```ts
import { Batuta, Metric, Scope } from "batuta";
import { SQLite3Storage } from "batuta/sqlite";

const storage = new SQLite3Storage({ filename: "./batuta.db" });
await storage.initialize();

storage.database
  .prepare(`
    INSERT INTO quotas
      (metric, scope_key, quota_limit, window_amount, window_unit)
    VALUES (?, ?, ?, ?, ?)
  `)
  .run("credits", "user", 100, 14, "day");

const batuta = new Batuta({ storage });
const metric = Metric.validate("credits");
const scopes = [
  Scope.validate({ key: "company", value: "company-123" }),
  Scope.validate({ key: "user", value: "user-123" }),
];

const { exceeded } = await batuta.check({ metric, scopes });

if (!exceeded) {
  await batuta.record({ metric, scopes, consumed: 10 });
}

storage.database.close();
```

No matching quota produces `{ exceeded: false }`. Recording creates one usage
event per supplied scope, assigns every event the same timestamp, and inserts the
batch in one SQLite transaction.

## Window semantics

Windows are elapsed durations ending at the check time. A 14-day window always
means the preceding `14 * 24` hours; it is not a calendar period. The queried
interval is `(at - duration, at]`: an event exactly one complete window old is
excluded, an event at `at` is included, and future events are excluded.

Minutes, hours, days, and weeks are fixed at 60 seconds, 60 minutes, 24 hours,
and seven days respectively.

## Current limitations

- `check()` and `record()` are separate and are not atomic.
- Month, year, calendar-aligned, and billing-cycle windows are unsupported.
- Refunds, negative adjustments, and usage reversal are unsupported.
- Quota CRUD is not part of the SDK; quotas are managed through SQL.
- Callers are responsible for closing adapter connections.

## Development

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
