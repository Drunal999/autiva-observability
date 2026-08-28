# 009 — One occurrence of a repeating event is editable, and the scope is asked

**Status:** Accepted

## The problem

An occurrence of a repeating event has **no row**. It is computed from the
series' RRULE at read time, and its id is derived — `seriesId@instant`. So
"move Tuesday's standup to Wednesday" could not be an `UPDATE` of anything, and
the calendar refused it outright (ADR-008 recorded that refusal and why).

Refusing was the right call at the time: silently moving the whole series when
someone dragged one instance loses everybody else's standup.

## Decision

Implement the two mechanisms RFC 5545 already defines, rather than inventing a
third.

**EXDATE** — an array on the series of instants to skip when expanding. This is
how one occurrence is *deleted* without deleting a row.

**RECURRENCE-ID** — a separate row that stands in for one occurrence, carrying
the instant of the occurrence it replaces (not its own, possibly moved, start).
Expansion skips any instant that has one. This is how one occurrence is
*edited*: it stops being computed and becomes a real row, editable like any
other.

Both live on `CalendarEvent`: `exdates`, plus `recurrenceId` /
`recurrenceParentId` with a self-relation. A unique index on
`(recurrenceParentId, recurrenceId)` means the database refuses a second
override for the same occurrence — a double submit updates one row rather than
splitting an occurrence into two events.

## The scope is required, never inferred

A drag on one instance of a weekly meeting has two plausible readings:

- *just this week* — the ship date moved once;
- *from now on* — it's Wednesdays.

They produce very different calendars for everyone else, and neither is the
obvious default. So the API returns **409 with `needsScope: true`** when a
scoped write arrives without one, and the UI asks: **This one** / **All of
them** / cancel.

This is not a confirmation dialog, and the distinction matters. Elsewhere in
this product cheap reversible actions use undo rather than a prompt (creating an
event, ADR-008) precisely so that prompts stay rare enough to be read. This one
is a **disambiguation** — the gesture genuinely does not say which was meant,
and no amount of undo recovers the intent.

## Editing the series moves its anchor, not its date

`scope: 'series'` shifts the series' `startsAt` by the same delta the dragged
occurrence moved — not onto the dragged date. Dragging the 8 October instance to
the 9th turns "every Thursday" into "every Friday". Setting the anchor to
9 October instead would collapse a weekly series onto a single date, which is
never what dragging one instance means.

## Deleting

Deleting one occurrence pushes an EXDATE **and removes any override for that
instant**. Without the second half, the occurrence just "deleted" reappears as
the row that had replaced it. Deleting the series relies on the FK cascade to
take its overrides with it.

Pushing the same EXDATE twice is suppressed: the array is expanded on every
read, so an idempotent delete must not grow it.

## What is still not supported

- **"This and all future occurrences."** The usual implementation is to end the
  old series with an UNTIL and start a new one, which splits history in a way
  worth designing deliberately rather than adding here.
- **Editing an override's recurrence.** An override is a single dated row; it
  has no rule of its own and cannot grow one.

## Verified

Against real Postgres, not only mocks: a weekly series expands to four
occurrences; a scopeless edit is refused; moving one leaves the count at four
with the original date gone and the new one present (no duplicate); deleting one
drops the count to three; deleting the series removes the override with it.
