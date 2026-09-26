# 011 — Departments group districts for the nav; an engine run can request an approval

**Status:** Accepted

## The problem

The product brief organises the city as City → Departments → Buildings →
Workflows, naming seven departments (Marketing, Sales & Clients, Finance,
Operations, Security, Legal & Compliance, Knowledge). The catalog only knows
eight internal **districts** (`sales`, `marketing`, `support`, `operations`,
`finance`, `people`, `security`, `intelligence` — see `districtFor()`), which
read as engineering keys, not business functions, and there is no department
with zero districts behind it to demonstrate "discoverable, not yet
connected."

Separately, the vertical slice asked for — Lead Centre → owner approval →
execution status → recorded city activity — needs a way for a real engine run
to ask a human for a decision. `Approval` rows exist in the schema and the
decide route already works, but nothing before today ever created one outside
`prisma/seed-agent-ops.mjs`. There was no live path from "an engine finished
and found something" to "a pending approval exists."

## Decision

**Departments are a presentation grouping over districts, not a new column.**
`departmentFor(district)` in `src/lib/ops/districts.ts` maps each of the eight
districts onto one of the seven departments. The mapping is not 1:1 and says
so in its own comment rather than hiding the judgment call — `support` and
`sales` both join "Sales & Clients", `people` joins "Operations", and
`intelligence` joins "Knowledge" (arguable; a market-trends module could just
as reasonably sit under Marketing). `Legal & Compliance` maps to zero
districts on purpose: AUTIVA has no legal engine, so the department renders as
an empty, "Set up" placeholder in the nav rather than not existing at all —
exactly what the brief asks for discoverable-but-unconnected departments to
do. `/api/city` now returns `department` and `pendingApprovals` per module,
computed server-side so the client does not re-implement the mapping.

**An engine can request an approval by naming one when it finishes.**
`SessionReport.approval` (`{ action, detail?, risk?, amountInr? }`) on
`POST /api/runs/ingest` creates a real `PENDING` `Approval` row tied to that
run and module — once per run, never on a re-report of the same session. It
is gated on the run having a `module` (a person's own Claude Code session has
nothing to hang an approval on) and on a non-blank `action`. `risk` is
validated against the schema's enum and falls back to `OTHER` rather than
storing an unrecognised string. This reuses the one existing funnel every run
already goes through instead of adding a second "create an approval" surface.

On AUTIVA's side, `workflows/emit.mjs`'s `run.finish(output, extra)` already
took a second argument; `extra.approval` now rides through to the dashboard in
the same mirror POST that reports the run's own outcome. `agent_runs` (Supabase)
has no `approval` column, so `close()` destructures it out of the patch sent
there — forgetting that would make PostgREST reject the whole write.
`workflows/scan_osm.mjs` requests one when a real `--write` run finds at least
one contactable lead: "Approve follow-up outreach to N leads found in
`<city>`", risk `BULK_MESSAGE`, with a detail line that says outright that
approving does not send anything — outreach stays a separate, manual,
policy-gated step. Nothing here sends a message to a lead; it only asks
whether a human would want to.

## Consequences

A department can now be empty and still visible — expected, and the whole
point for Legal & Compliance today. Reassigning a district to a different
department (the `intelligence` → Knowledge call, in particular) is a one-line
change in `DEPARTMENT_BY_DISTRICT`, not a migration.

Any future engine that wants a human decision gets it for free by adding
`approval` to its `finish()` call — no new table, no new route. The one thing
it must not do is claim a business outcome that did not happen: `detail` is
free text and nothing here enforces that it stays honest, so authors of new
`approval` requests carry that responsibility the same way `emit.mjs`'s
existing "every write throws on failure" rule already asks of them.

## Verified

`npx vitest run src/app/api/runs/__tests__/ingest.test.ts` — 32/32, including
five new cases: an approval is created and tied to the right run/module,
re-reporting the same run does not duplicate it, an unrecognised risk falls
back to `OTHER`, a person's own session is never given one, and a blank
action is ignored. `./node_modules/.bin/tsc --noEmit` and `next lint` are both
clean across the whole repo. `node workflows/emit.mjs --selftest` and
`node workflows/scan_osm.mjs --selftest` both pass unchanged (confirmed by
`git stash`-ing this change and re-running both selftests: the pre-existing
"502: bad gateway" console lines in `emit.mjs --selftest` reproduce identically
on the unmodified code, so they predate this work and are not a regression it
introduced).

Logged in with the real `local-dev-aditya` E2E fixture against the running
dev server (`127.0.0.1:3111`) and confirmed `/api/city` returns the new
`department` and `pendingApprovals` fields correctly for every existing seeded
module (`Sales & Clients`, `Knowledge`, `Finance`, `Marketing`, `Operations`
all populated; `Legal & Compliance` present with none).

**Not verified live end-to-end**: running the real lead-discovery engine
(`node --env-file=.env workflows/scan_osm.mjs --write --no-emails`) to prove a
real `Approval` row appears from an actual engine run. AUTIVA's production
Supabase project (`tbtuuzncdsssffljuxxb.supabase.co`) does not resolve in DNS
right now, from WSL or from Windows — every engine that writes through
`emit.mjs`'s `sb()` is blocked on this, not only the lead scan. This needs
Aditya to check the project's status at supabase.com (a paused free-tier
project is the likely cause) before this path can be exercised for real.

## When to revisit

Revisit the district → department mapping if `intelligence` grows more than
one module and the Marketing-vs-Knowledge call starts to matter, or once
AUTIVA ships anything legal-shaped (contract drafts, renewal reminders) that
would finally give "Legal & Compliance" a district to point at.
