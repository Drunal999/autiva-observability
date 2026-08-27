# Autiva Mission Control

Builds the agent-operations workspace on top of the existing task board, then
works through `DASHBOARD_MASTER_PROMPT.md` end to end — all 18 build-order
items plus the ADRs.

20 commits, each independently revertable. `main` is untouched.

---

## Before reviewing: one thing the prompt assumed that this repo does not have

The master prompt is written for **Supabase with RLS**, and names tables
(`tenants`, `agent_runs`, `events`, `approvals`, …) that do not exist here.
This repo is **Neon + Prisma**, with no policy engine.

We chose to stay on Neon and enforce tenancy in server routes instead. That is
a real security trade, so it is written down rather than buried:

> **A query that forgets `tenantId` returns every tenant's rows. There is no
> backstop.** Under RLS, forgetting the filter returns nothing. Here it returns
> everything.

See [ADR-002](adr/002-tenant-boundary-without-rls.md). Its "when to revisit" is
deliberately concrete: **before the second paying tenant shares an instance.**

Reviewers: a missing `tenantScope()` is a security defect, not a missing
filter. It is one greppable symbol on purpose.

---

## What is in it

**Fixes to what already existed**
- Vendored shadcn/reui components were generated for Tailwind v4 against a v3
  project. v3 emits **no CSS at all** for v4 syntax and logs nothing, so the
  calendar rendered with zero-height cells and looked absent rather than
  broken.
- `/api/events` enqueued nothing on open, so the browser did not fire
  `onopen` until the 25s heartbeat. Any event published in that window was lost.
- `DATABASE_URL` carried `channel_binding=require`, which Prisma's driver
  cannot negotiate. It surfaced as the misleading `P1001: Can't reach database
  server` and was 500-ing GitHub login.

**The workspace** — eight screens on live data: Fleet, Trace, Terminal,
Automations, States, Motion, Mission Control, plus the ambient background.

**The master prompt, items 1–18** — status vocabulary and INR, the tenant
dimension and client mode, approvals, one shared event stream, per-engine
latency budgets, the reliability baseline, threads, presence, calls, and the
calendar with its activity strip, cost ribbon and ICS feed.

---

## Decisions worth reviewing rather than skimming

| Area | Call | Why |
|---|---|---|
| Approvals | Update conditional on `status = PENDING` | A double-click or replay cannot overwrite a decision; the loser gets 409 |
| Cross-tenant reads | **404, not 403** | A 403 confirms the id exists |
| Client mode | Reads *different fields*, does not filter strings | Filtering fails open the moment a field is added |
| Comment bodies | Parsed to a token tree, rendered as React elements | No HTML string in the path, no `dangerouslySetInnerHTML` |
| Call rooms | HMAC of tenant+subject | On public Jitsi, anyone with the room name can join |
| ICS feed | Constant-time token, outside the auth matcher | A calendar client fetches it unattended with no session |
| RRULE | Rejected at save time, capped again at expansion | `FREQ=MINUTELY` is ~525,600 expansions a year |

---

## Verification

`tsc --noEmit` clean · **173 tests passing** (was 36 at branch point).

Behaviour was checked in a real browser, not only in unit tests — which is how
three bugs were found that read fine in source:

- **Presence never appeared.** React 18 double-invokes effects in dev; the
  `DELETE` in my effect cleanup raced the remount's heartbeat and resolved
  last, erasing the entry the `POST` had just created.
- **The background video broke mobile layout.** It laid out at its intrinsic
  2888px width; `overflow-hidden` clipped it visually but not for layout, so
  every phone got a horizontal scrollbar.
- **The Fleet tests had gone vacuous.** They still mocked `/api/metrics` as a
  bare array, so after a shape change `buckets` was `undefined`, a skeleton
  rendered, and every telemetry assertion passed for the wrong reason.

---

## Not built, deliberately

Visible rather than silently skipped:

- Threads are on **approvals only** — not fleet cards or trace. Unread
  indicators and the `c` shortcut are not in either.
- Calendar has no click-drag creation or natural-language quick add (§9.6).
  Events are creatable via the API.
- Continuous timeline zoom (§9.5 #4) and hover-a-run sparklines (§9.5 #5).

---

## Before this goes to production

| Item | Risk if ignored |
|---|---|
| `CALL_ROOM_SECRET` unset | Falls back to `NEXTAUTH_SECRET`; rotating call rooms invalidates every session |
| `ICS_FEED_SECRET` unset | Same coupling |
| `NEXT_PUBLIC_JITSI_DOMAIN` | `meet.jit.si` is the **public** instance — fine internally, wrong for a customer call about invoices |
| `public/purple-desert.mp4` | 21 MB, isolated in `4b6e3f3` so it can move to LFS without touching code |
| `SAMPLE DATA` badge | Every figure is seeded. Keep it on until the numbers are real |
