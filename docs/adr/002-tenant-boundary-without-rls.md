# 002 — Tenant boundary lives in server routes, not RLS

**Status:** Accepted, with a known gap

## Decision

This deployment runs on **Neon**, not Supabase. There is no Row Level Security
and no policy engine between a query and the rows.

Every tenant-scoped table carries `tenantId`, and every scoped query goes
through `tenantScope()` in `src/lib/ops/tenant.ts`. Tenant identity comes from
the **session only** — never a query string, path segment, header or request
body, because a caller-supplied tenant id is an escalation vector.

## The gap, stated plainly

**A query that forgets `tenantId` returns every tenant's rows. There is no
backstop.** Under RLS, forgetting the filter is a bug that returns nothing.
Here it is a bug that returns everything.

Treat a missing scope as a security defect in review, not a missing filter.
`tenantScope()` exists partly so the boundary is greppable: one symbol to audit.

## Why we accepted it

Moving to Supabase for RLS alone would mean migrating the database, the auth
integration and the realtime layer, for a guarantee we can approximate with
discipline while there is one tenant. The decision was made knowingly, not by
default.

## Mitigations in place

- Ownership and tenancy are in the `WHERE` clause, never an `if` above the
  query — there is no window in which the wrong row can be written.
- Cross-tenant reads return **404, not 403**: a 403 confirms the id exists.
- `/api/runs/[id]` and similar id-addressed routes AND the scope with the
  lookup rather than offering it as an alternative.

## The gap is now measured, not assumed

`scripts/tenant-isolation.mjs` creates a second tenant, fills it with
recognisable data, signs in as the FIRST tenant's user, and reads every
tenant-scoped endpoint. Nothing belonging to the second tenant may appear.

First run, 30 August 2026 — all clean:

    /api/agents, /api/approvals, /api/calendar, /api/metrics, /api/runs,
    /api/flows, /api/notifications, /api/comments/counts, /api/comments,
    /api/runs/[ref]

`/api/runs/[ref]` answered **404**, not 403, for the other tenant's run — the
behaviour this ADR asks for, since a 403 would confirm the id exists.

This does not remove the gap. There is still no backstop: a query added
tomorrow without `tenantScope()` will leak, and nothing will say so. What the
script does is turn "we believe it is scoped" into something checkable in a
minute. Run it whenever a tenant-scoped query is added or changed.

It cannot be a vitest case: it needs a real server, a real session and the real
database. Mocked Prisma would only assert the mock — which is exactly what
cannot prove isolation.

## When to revisit

Before the second paying tenant shares an instance. At that point the cost of
migrating is lower than the cost of one mistake.
