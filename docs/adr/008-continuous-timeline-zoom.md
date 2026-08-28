# 008 — The timeline is one continuous scale, not four views

**Status:** Accepted

## Decision

The calendar timeline holds its window as a **`(centre, span)` pair**. Span is
continuous from two hours to 120 days. There is no "week view" and no "month
view".

A *tier* (`hour | day | week | month`) is derived from the span, and it decides
one thing only: **how the axis is labelled** and whether a lane is drawn item
by item or as a histogram. Nothing snaps to it.

## Why not discrete views

Discrete views are easier to build and worse to use. The question an operator
actually has — "what was happening around this failure?" — does not come in
week-sized units. Switching from a week to a month with a button reloads a
different picture and loses your place; scaling a single axis keeps the thing
you were looking at on screen.

## Zoom holds the pointer, not the centre

`zoomWindow()` keeps the instant under the cursor fixed. Zooming about the
centre makes whatever you were reading slide away, which is why a timeline that
does it feels broken even when the arithmetic is right.

## Ticks are calendar boundaries

Ticks land on midnight, Monday, and the 1st — never on even fractions of the
window. A tick at 03:47 because that is where a fifth of the screen fell makes
the axis unreadable as time.

Stepping goes through `setDate` / `setMonth`, not by adding milliseconds, so
February is short and a DST shift is the calendar's rather than an accumulating
drift.

## Three concessions to scale

1. **The fetch window is 3x the visible span, quantised.** Panning and zooming
   inside the current neighbourhood re-render from cache. Without this, one
   wheel gesture is fifty requests; with it, a session of dozens of zoom steps
   was 46. `MAX_SPAN * 3 < 400 days` is a *hard* constraint — the calendar API
   refuses a wider window — and there is a test pinning it.
2. **Lanes pack rows and report overflow.** Overlapping items go to separate
   rows up to three; the rest are counted as `+n more` rather than dropped
   silently or stacked into an unreadable pile.
3. **Past 60 items a lane becomes a histogram.** Drawing 400 half-pixel bars is
   not more information than "188 total" — it is the same information rendered
   illegibly, at 400 DOM nodes. **The red survives the summary:** a column
   containing any failure stays saturated, because a lane that summarises away
   its failures is worse than no lane.

## Creating on the timeline

Dragging the Events lane creates, the same gesture as the grid. Granularity
follows the tier: at hour zoom it snaps to a quarter hour and creates a timed
event; at every coarser zoom it snaps to midnight and creates an **all-day**
event. A day-scale drag carries no clock time, and inventing 09:00 is the guess
this UI exists to avoid.

Runs and scheduled rows do not accept a drag — a run already happened, and a
scheduled row belongs to Automations (see the read-only rule in
`/api/calendar/[id]`). Those lanes pan instead, so the whole surface is
draggable.

## Rescheduling, and what refuses to be rescheduled

Dragging a bar's body moves it (duration preserved exactly); dragging either
edge resizes it, holding the opposite edge still and refusing to invert the
event or shrink it below the zoom's smallest unit. `Alt`+arrow does the same
from the keyboard and `Alt`+`Shift`+arrow resizes, so this is not a mouse-only
capability. Every change offers undo, consistent with create.

Four things refuse the gesture, each saying why in its tooltip rather than
failing silently at the server:

- **runs** — the past is not editable
- **scheduled rows** — owned by Automations
- **read-only rows** — using the reason the server itself gave
- **recurring occurrences** — an occurrence has a *derived* id
  (`eventId@instant`) and no row of its own. Moving one would have to either
  rewrite the whole series or invent an exception. Silently doing the first
  loses somebody's standup, so until there is an exception model (EXDATE plus
  an override row) it declines and says so.

**A sizing lesson worth keeping.** The resize grips were a flat 7px at each
end. A two-hour event at day zoom is about *eight pixels wide*, so the two
grips consumed the entire bar and there was no middle left to grab — dragging
the body silently resized instead of moving. Grips are now capped at 30% of the
bar. Any fixed-pixel hit target inside an element whose width is data-dependent
has this bug latent in it.

## The grid stays

The timeline is more capable; the grid shows more detail per day. That is a
preference, not a regression to force, so both exist and the choice is
remembered in `localStorage`.

## What this cost us, and the lesson

Centre and span were originally **two** `useState`s, and zoom updated one from
inside the other's updater. React is free to run those at different times, so
the span read back was frequently stale. The symptom: zoom-out stalled at three
weeks and pinch-zoom panned instead of zooming — while **every unit test on the
pure `zoomWindow` function passed**, because the function was never wrong.

A window is one value, so it is one piece of state.

The regression test drives the real component rather than the pure function.
Reintroducing the bug fails four of its cases; that was checked, not assumed.
