# 003 — One realtime stream for the dashboard and the city

**Status:** Accepted

## Decision

A single SSE connection per tab, at `/api/events`, filtered by tenant on the
server. Consumers subscribe to **channels** — `BOARD`, `COMMENTS`, `FLEET`,
`RUNS`, `APPROVALS`, `SYSTEM`.

A new realtime feature adds a channel. It does not open a second connection.

Events are **persisted** to the `Event` table before being emitted, and every
frame carries `id:`, which the browser echoes back as `Last-Event-ID` so a
reconnect replays the gap.

## Why

Verified rather than assumed: one open tab with three hooks mounted holds
exactly **one** connection. Parallel socket stacks are how a dashboard ends up
with four sockets, four reconnect policies, and one of them silently dead.

Persisting first matters: an event that reached the database but not the
emitter is recoverable on replay. The reverse is lost forever.

## Reconnection is ours, not EventSource's

`EventSource` retries on a **fixed** interval, so every client in a fleet
reconnects in the same tick and stampedes a server that has just come back.
Reconnection is managed manually with exponential backoff (500ms → 30s) plus
jitter.

## Cost

The in-process emitter means that on multiple instances a publish and an open
connection can land on different containers. The event log is what makes that
survivable — clients replay rather than silently missing work.

## When to revisit

When the app runs on more than one instance. Swap the emitter for Redis
pub/sub; the channel API and every consumer stay unchanged.
