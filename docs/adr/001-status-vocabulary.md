# 001 — Four backend run states, display labels derived

**Status:** Accepted

## Decision

`RunStatus` has exactly four values: `RUNNING`, `SUCCESS`, `FAILED`,
`AWAITING_APPROVAL`. These are the single source of truth.

Everything the UI shows — label, colour, glyph, sort order, whether it animates
— is derived in `src/lib/ops/status.ts` and nowhere else. No status string is
hardcoded in more than one file.

`IDLE` is deliberately **not** a run status. An idle agent has no active run,
so it is an agent-level state modelled as the absence of one.

## Why

Display labels drift. Somebody prefers "Done" to "Success", somebody else
writes `status === 'DONE'` in a component, and six months later two screens
disagree about what a run is doing. Deriving every presentation concern from
one enum makes that class of bug impossible rather than merely unlikely.

## Cost

Display vocabulary and backend vocabulary differ, so reading the code requires
knowing that `SUCCESS` renders as "Done". The `statusLabel()` indirection is
worth that.

## When to revisit

If the backend gains a genuinely new state — not a new *label*. A new label is
a one-line change in the map.
