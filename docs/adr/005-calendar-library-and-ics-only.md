# 005 — rrule.js for recurrence; ICS export only in v1

**Status:** Accepted

## Decision

**Recurrence:** `rrule.js`, using standard RFC 5545 RRULE strings. We never
invent a repeat format.

**Google Calendar interop:** a read-only, token-authenticated **ICS feed**.
No two-way sync.

## Why not write recurrence ourselves

Recurrence, timezones and DST are a deep pit with no bottom. "Every second
Tuesday" is easy; "every second Tuesday, across a DST boundary, in a timezone
that changed its rules in 2007" is not. The effort belongs in the layer that is
actually ours.

## What is actually ours: refusing rules that would take the server down

`FREQ=MINUTELY` is roughly **525,600 occurrences a year**. Expanding that on a
request thread is a denial of service anyone can trigger by typing.

- Rules are validated at **save time** and rejected with a message a person can
  act on, not discovered when the grid stops loading.
- Expansion is **separately capped**, so a rule stored before the ceiling
  existed still cannot run away.
- A rule that no longer parses yields nothing rather than breaking the grid.

## Why ICS export and not two-way sync

Two-way sync in v1 would be eaten alive by conflict resolution and token
refresh. A subscribable feed is one afternoon and covers about 80% of the need.

**A feed URL is effectively a password.** A calendar client fetches it
unattended with no session and stores it in plaintext. So the token is a keyed
digest — never sequential, revocable by rotating `ICS_FEED_SECRET` — compared
in **constant time**, and every fetch is logged, successful or not.

The feed route is deliberately **outside** the auth matcher for that reason.

## When to revisit

One-way import of Google events as a read-only layer, if someone asks. Two-way
sync only if someone asks **twice**.
