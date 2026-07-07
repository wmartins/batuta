<p align="center">
  <img src="assets/logo.png" alt="A robotic hand conducting with an orchestra baton" width="240" />
</p>

<h1 align="center">Batuta</h1>

Batuta is a storage-agnostic TypeScript quota engine. It defines how usage is
recorded and evaluated across arbitrary metrics and scopes; applications decide
where that data lives by providing a storage implementation.

Applications often need to limit resources such as credits, tokens, or
generations for users, companies, or other scopes. Batuta provides the domain
model and evaluation engine for those limits while leaving persistence and
infrastructure ownership with the application. It also includes a SQLite
adapter for projects that want a ready-made local storage implementation.

This repository is a pnpm workspace for the Batuta library and its future
applications.

## Layout

- `packages/batuta` contains the publishable [`batuta`](packages/batuta/README.md)
  TypeScript library and SQLite adapter.
- [`apps/server`](apps/server/README.md) contains the server-rendered management
  application.
- `docs` contains the [workspace migration plan](docs/pnpm-workspace-plan.md) and
  [server plan](docs/server-plan.md).

## Development

Install all workspace dependencies from the repository root:

```sh
pnpm install
```

Run a task across every workspace package that provides the corresponding
script:

```sh
pnpm build
pnpm test
pnpm typecheck
```

You can also address the library directly with pnpm's workspace filter:

```sh
pnpm --filter batuta test
pnpm --filter batuta build
```

Application-specific scripts live in their package. Run server commands from
`apps/server`, or address the package explicitly from the repository root:

```sh
pnpm --filter @batuta/server dev
pnpm --filter @batuta/server test
```

See the [server README](apps/server/README.md) for PostgreSQL setup, migrations,
seed data, and development or production commands.
