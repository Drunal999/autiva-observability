# 010 — The Agentic City proof is a fail-closed local fixture

**Status:** Accepted

## The problem

The city dashboard needs a real ingested run before a building can light. The
two city/ingest pull requests are still open and the local GitHub OAuth client
is intentionally a placeholder, so a normal local sign-in cannot prove that
flow tonight.

## Decision

`scripts/local-city-demo.mjs` is the single setup path for a disposable local
proof. It refuses to run unless `DATABASE_URL` names exactly
`localhost:54322/autiva_obs`. It creates that database only in the existing
local Docker Postgres container, pushes the Prisma schema, runs the existing
seed only when no tenant exists, and upserts one clearly fake identity:

- id: `local_aditya`
- GitHub id: `local-dev-aditya`
- email: `aditya@local.demo`

It then derives and prints a local ingest token from the local `INGEST_SECRET`.
The token is not written to source, an env file, or the database.

The E2E credentials provider remains available only with `E2E_TEST_MODE=true`
and never under `NODE_ENV=production`. The fixture therefore cannot become a
production authentication path by accident.

## Consequences

The underlying seed deletes operations rows, so repeat setup must skip it once
a tenant exists. Existing runs and their timestamps remain unchanged. Fresh
fixtures still need a real ingested run; setup does not fabricate activity.

This does not replace GitHub OAuth, merged production ingest code, or a Vercel
deployment. Once PRs #1 and #2 merge, production configuration is the target;
this remains useful only as an isolated local smoke fixture.

## Verified

On 16 September 2026 the script ran twice against `autiva_obs`: the second run
reused the database and upserted the same fake user without a duplicate. Its
unit test rejects non-local hosts and every database name other than
`autiva_obs`. After the seed reset the fixture rows, an existing AUTIVA
workflow posted a fresh successful `JARVIS` run to the existing
`intelligence.market_trends` catalog module; the local Run table recorded it.

## When to revisit

Regression verification: `node --env-file=.env scripts/local-city-demo.integration.mjs`
runs setup twice, compares every existing Run row, checks one fake user remains,
and signs in through E2E credentials to verify the authenticated City response
contains the successful JARVIS run under Market Trends. Tokens and cookies are
kept out of test output. The test requires an existing local proof run and the
local dev server on port 3111.

Revisit when both city/ingest PRs merge and a real GitHub OAuth client is
configured for the deployment. Do not expand this fixture to accept a broader
database URL.
