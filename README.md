# Internal Team Dashboard — Task & Assignment Board

Phase 1 of the Internal Team Dashboard. Kanban task board with GitHub login,
realtime sync (self-hosted via Server-Sent Events — no external realtime
provider needed), and animated/audio feedback on task-state changes.

## Local setup

1. Copy `.env.example` to `.env.local` and fill in every value (see
   "Accounts you need" below).
2. `npm install`
3. `npx prisma migrate dev --name init`
4. `npm run dev` → http://localhost:3000

## Accounts you need

- **Neon** (neon.tech, free tier) — create a project, copy the pooled
  connection string into `DATABASE_URL`.
- **GitHub OAuth App** (github.com/settings/developers) — callback URL
  `http://localhost:3000/api/auth/callback/github` for local dev, and your
  production URL's equivalent once deployed. Copy Client ID/Secret into
  `GITHUB_ID`/`GITHUB_SECRET`.
- **`NEXTAUTH_SECRET`** — generate with `openssl rand -base64 32`.
- **`CRON_SECRET`** — any random string; must match what you set in Vercel's
  project environment variables.

No realtime-provider account is needed — `/api/events` (Server-Sent Events)
and an in-memory event bus (`src/lib/realtime/bus.ts`) handle live sync
in-process, replacing the Pusher-based design from the original plan.
**Caveat:** this in-memory bus only broadcasts within a single running
server instance. That's correct for local dev and any single-instance
deploy; on serverless platforms where requests can land on different
containers (e.g. Vercel), an SSE connection and a mutation may hit
different instances and miss each other. The existing SWR polling
fallback (~20s, revalidate-on-focus) keeps data eventually consistent in
that case, same as it was designed to cover Pusher gaps. Swapping the bus
for a shared pub/sub (e.g. Redis) would remove this caveat if instant
cross-instance delivery becomes a requirement.

## Deploying

1. Push this repo to GitHub (personal account, private).
2. Import it in Vercel; add all `.env.example` variables (with production
   values — a new GitHub OAuth App or an updated callback URL, the same
   Neon credentials) in Vercel's project settings.
3. Vercel reads `vercel.json` and schedules the overdue-flagging cron
   automatically on deploy.

## Testing

- `npx vitest run` — unit/component tests
- `npx playwright test` — E2E smoke test (see Task 14 in the implementation
  plan for how login is stubbed for this)
