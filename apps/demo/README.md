# Managed storage demo

This React Router application is a small creative studio that demonstrates
Batuta's complete managed-storage path. Browser forms submit to server-side
loaders and actions; only those server modules use the API key and communicate
with `apps/server` through `@batuta/remote`.

## Run locally

From a fresh checkout, run:

```sh
docker compose up -d --wait postgres
cp apps/server/.env.example apps/server/.env
# Set API_KEY_PEPPER_V1 in apps/server/.env to a new base64url secret of at least 32 bytes.
corepack pnpm install
corepack pnpm --filter @batuta/server run db:migrate
corepack pnpm --filter @batuta/server run db:seed
corepack pnpm --filter @batuta/demo run setup
corepack pnpm --filter @batuta/server run dev
```

In another terminal:

```sh
corepack pnpm --filter @batuta/demo run dev
```

Open <http://localhost:5174>. The managed server listens on
<http://localhost:5173> by default.

The server seed owns the `creative-demo` workspace, `credits` metric, user and
team scopes, and one-minute quotas. The demo setup command only provisions a
dedicated API key and writes the managed URL and complete key to the gitignored
`apps/demo/.env`; it never prints the key. Rerunning setup retains a valid
stored key.

To use another managed API URL:

```sh
corepack pnpm --filter @batuta/demo run setup -- --batuta-url http://localhost:3000
```

## Walkthrough

1. Select Lumen Studio and Maya Chen.
2. Render a campaign film for 10 credits, then tune two taglines for 1 credit
   each. Maya reaches her 12-credit user limit.
3. Switch to Theo. His independent user quota remains available.
4. Spend a combined 30 credits across Maya, Theo, and Jun. Every Lumen user is
   then blocked by the shared team quota.
5. Switch to Paper Plane Labs. Its usage is isolated and remains available.
6. Wait for events to leave the rolling 60-second window individually. The
   page refreshes usage about every two seconds.

The application checks current quota state and prospective operation cost
before recording. Check and record are separate, non-atomic requests; the demo
does not claim to reserve credits or eliminate concurrent races.

## Troubleshooting

- **Missing server configuration:** copy `apps/server/.env.example`, then set a
  real `API_KEY_PEPPER_V1` and confirm `DATABASE_URL` is reachable.
- **Missing tables:** run `corepack pnpm --filter @batuta/server run db:migrate`.
- **Missing demo quotas:** run `corepack pnpm --filter @batuta/server run db:seed`.
- **Server unavailable:** start `@batuta/server` and check the URL stored in
  `apps/demo/.env`.
- **Invalid or revoked key:** rerun `corepack pnpm --filter @batuta/demo run setup`.
- **Quota still exhausted:** usage expires event by event; allow the rolling
  minute to drain while the page refreshes automatically.
