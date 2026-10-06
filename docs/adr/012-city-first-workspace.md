# 012 — City-first workspace, Simple and Team navigation

Status: Implemented locally

City remains the home route. Category buildings group existing modules without migrating or writing database rows. Sales, Marketing, Support, Finance, Operations, Security, Knowledge and Legal are presentation categories; unknown districts remain visible under Operations. Industry collections are explicitly Coming soon.

Simple is the default navigation preference; Team reveals engineering routes. This preference is not authorization. Tenant permissions remain server-controlled. Raw activity summaries in the new city require both Team preference and the server-provided internal mode. Every existing route and original 3D city remain available.

The city uses lightweight, keyboard-accessible vector buildings, device-local day/night styling and reduced-motion support. Selecting a building takes the user to its catalog. Catalog status comes from agent states and pending approvals. IDLE is Not running, not Paused; no installation availability or connection status is invented. Connection requirements not present in the catalog are explicitly undocumented. Industry packages have no install or purchase action.

No schema changes, migrations, reseeding, deletes or catalog mutations were performed. Existing sample-data labels are retained. Failed reads hide stale counts and offer retry. New API response field: mode, from the existing tenant context.

Verification: component coverage for keyboard entry, search, future collections, error handling and navigation preservation; desktop/mobile browser review. Broader test results are recorded in the implementation handoff.

Final checks: 449 application tests passed across 43 Vitest suites; the broad discovery command also selected a Node-only scripts/local-city-demo.test.mjs file, producing a runner mismatch. Its 3 tests passed separately with node --test. TypeScript, Next lint and git diff --check passed. Desktop 1440px and phone 390px previews inspected; mobile Simple/Team switching verified. No production build or deployment performed.
