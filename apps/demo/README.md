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

The server seed owns the `creative-demo` workspace, user and team scopes, and
three metrics: rolling `credits`, persistent `campaigns.active`, and direct
`brief.characters`. Maya has a concrete 8,000-character
override; every other creator uses the generic 4,000-character default. The
demo setup command only provisions a dedicated API key and writes the managed
URL and complete key to the gitignored `apps/demo/.env`; it never prints the
key. Rerunning setup retains a valid stored key.

To use another managed API URL:

```sh
corepack pnpm --filter @batuta/demo run setup -- --batuta-url http://localhost:3000
```

## Walkthrough

1. Select Lumen Studio and Maya Chen. Her creative-brief card shows the
   concrete 8,000-character extended-brief override.
2. Launch a campaign film. Batuta checks 10 rolling credits, a 6,000-character
   direct brief, and one prospective active campaign, then records only the
   rolling and balance events.
3. Switch to Theo. His generic 4,000-character brief limit blocks the same
   6,000-character film operation without recording anything.
4. Launch two storyboard campaigns for one creator. The persistent campaign
   balance reaches two; a third launch is blocked.
5. Archive a campaign. Batuta records `-1` against the balance, releasing room
   for another launch. Archiving at zero demonstrates atomic underflow
   protection.
6. Spend creative credits across several Lumen users to observe the shared team
   rolling quota, then wait for events to expire individually after 60 seconds.

The application passes each prospective operation cost to Batuta's `check()`
and records the same amount after an allowed operation. It performs no local
quota arithmetic. Check and record are separate, non-atomic requests; the demo
does not claim to reserve credits or eliminate concurrent races.

## Troubleshooting

- **Missing server configuration:** copy `apps/server/.env.example`, then set a
  real `API_KEY_PEPPER_V1` and confirm `DATABASE_URL` is reachable.
- **Missing tables:** run `corepack pnpm --filter @batuta/server run db:migrate`.
- **Missing demo quotas:** run `corepack pnpm --filter @batuta/server run db:seed`.
- **Old demo metric keys:** rerun the same seed command; stable metric IDs let
  it rename the keys without discarding quota or usage history.
- **Server unavailable:** start `@batuta/server` and check the URL stored in
  `apps/demo/.env`.
- **Invalid or revoked key:** rerun `corepack pnpm --filter @batuta/demo run setup`.
- **Quota still exhausted:** usage expires event by event; allow the rolling
  minute to drain while the page refreshes automatically.
