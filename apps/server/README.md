# Batuta server

The Batuta server is a React Router SSR application for managing workspaces,
metrics, scopes, and quotas. It uses Astryx for its interface and PostgreSQL with
Drizzle ORM for control-plane persistence.

The application shell, workspace lifecycle, metric/scope registries, and quota
management are functional. The persistence layer, migration, representative
seed data, and tenant-isolation tests are working.

## Prerequisites

- Node.js 24.18.0 (the repository includes an asdf `.tool-versions` file)
- pnpm 11.10.0 through Corepack
- Docker with Docker Compose

React Router 8 requires Node.js `>=22.22.0`. Node 24 is the supported LTS target
for this repository; Node 23 may satisfy the numeric engine range but is EOL and
should not be used for ongoing development.

Some older asdf `nodejs` plugin installations do not list current Node 24 patch
releases even after `asdf plugin update nodejs`. If `asdf install` cannot resolve
the pinned version, use the repository devcontainer or install Node 24 with a
different maintained version manager. This is an asdf/node-build catalog issue,
not an application requirement for Node 23.

From the repository root, install dependencies:

```sh
corepack enable
pnpm install --frozen-lockfile
```

## Run with PostgreSQL

Start PostgreSQL from the repository root with Docker Compose:

```sh
docker compose up -d --wait postgres
```

Then enter the server package, create its local environment, apply committed
migrations, and load representative data:

```sh
cd apps/server
cp .env.example .env
pnpm db:migrate
pnpm db:seed
```

The seed is idempotent. It creates the `acme` and `northstar` workspaces and
includes two overlapping quotas for the same metric and scope.

Start the development server:

```sh
pnpm dev
```

Alternatively, run a server script from the repository root with an explicit
workspace filter, for example `pnpm --filter @batuta/server dev`.

Open <http://localhost:5173>. The seed creates two workspaces, so the root route
shows the workspace chooser. Open <http://localhost:5173/w/acme> to go directly
to Acme's overview.

From the repository root, stop PostgreSQL without deleting its named volume:

```sh
docker compose down
```

## Production SSR build

Build and run the Node SSR output:

```sh
pnpm build
pnpm start
```

The production server listens on port `3000` by default. Set `PORT` to override
it.

## Database workflow

After changing `app/data/schema.server.ts`, generate and inspect a SQL migration:

```sh
pnpm db:generate
```

Apply committed migrations with:

```sh
pnpm db:migrate
```

Do not use Drizzle schema push. Migrations are explicit and never run as an
application import side effect.

The Compose setup also creates `batuta_test`. Integration tests require its URL
explicitly so they can never fall back to the development database:

```sh
DATABASE_URL=postgresql://batuta:batuta@localhost:5432/batuta_test \
  pnpm db:migrate

TEST_DATABASE_URL=postgresql://batuta:batuta@localhost:5432/batuta_test \
  pnpm test
```

## Routes

Routes use React Router's flat-file convention through
`@react-router/fs-routes`. Dots create URL and layout nesting, `$` prefixes mark
dynamic segments, and `_index` files are index routes. For example:

```text
routes/w.$workspaceSlug.tsx
routes/w.$workspaceSlug.metrics.tsx
routes/w.$workspaceSlug.metrics._index.tsx
routes/w.$workspaceSlug.metrics.$metricId.tsx
```

## Security boundary

V1 has no authentication or authorization. Workspace IDs partition data and
form a future authorization boundary, but they are not security isolation. Do
not expose this version to an untrusted network.
