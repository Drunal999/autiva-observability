# 006 — One component, two modes

**Status:** Accepted

## Decision

Internal and client views are the **same components** with a `mode` prop, never
a forked page.

The server decides the mode from the tenant and returns it alongside the data.
The browser cannot ask for internal mode.

## Why not fork

Two pages means two places to fix every bug, and the client copy is the one
nobody looks at. It also means the leak-prevention rule is enforced in one
place instead of being re-derived per screen.

## Client mode reads different fields, it does not filter strings

This is the important part. Filtering internal detail out of a string **fails
open** the moment a field is added: the new field is not on the blocklist, so
it leaks.

Client mode instead reads from a different set of fields entirely —
`module.displayName` rather than the agent codename, a status sentence derived
from the state rather than `currentStep`, which is internal prose full of file
paths.

## It fails closed

If the server sends no mode, the UI renders **client**, not internal. A bug in
mode resolution shows a customer too little, never too much.

## Verified

Tests assert the rendered DOM contains no agent codename, no model name, and no
`.spec.ts` / `src/` fragments in client mode — a regex sweep of the output, not
a per-field check, so a newly added field cannot quietly slip through.

## When to revisit

If client and internal views diverge so far that the shared component becomes
mostly branches. That has not happened; the shapes are genuinely the same.
