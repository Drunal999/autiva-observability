/**
 * Editing ONE occurrence of a repeating event.
 *
 * An occurrence has no row. It is computed from the series' RRULE at read
 * time, and its id is derived — `seriesId@instant`. So "move Tuesday's standup
 * to Wednesday" cannot be an UPDATE of anything, and the calendar refused it
 * outright until now.
 *
 * RFC 5545 already answers this, and the answer is the one implemented here:
 *
 *   - **EXDATE** — a list on the series of instants to skip when expanding.
 *     That is how one occurrence is deleted without deleting a row.
 *   - **RECURRENCE-ID** — a separate row that stands in for one occurrence,
 *     carrying the instant of the occurrence it replaces (not its own, moved,
 *     start). Expansion skips any instant that has one. That is how one
 *     occurrence is edited: it stops being computed and becomes a real row.
 *
 * The scope is never inferred. Dragging one instance of a weekly meeting could
 * plausibly mean "just this week" or "from now on, it's Wednesdays", and the
 * two produce very different calendars for everyone else. That is a genuine
 * ambiguity in the gesture, not a confirmation to be dismissed, so the caller
 * must say which.
 */

export type EditScope = 'occurrence' | 'series'

/** A derived occurrence id: the series row plus the instant it computes to. */
export interface ParsedOccurrenceId {
  seriesId: string
  /** The ORIGINAL instant, which is the occurrence's only stable identity. */
  occurrenceAt: Date
}

/**
 * Splits `seriesId@2026-09-15T09:30:00.000Z` into its parts.
 *
 * Returns null for a plain row id, which is the common case and not an error —
 * callers use that to mean "this is an ordinary event, edit it directly".
 */
export function parseOccurrenceId(id: string): ParsedOccurrenceId | null {
  const at = id.indexOf('@')
  if (at <= 0) return null

  const seriesId = id.slice(0, at)
  const iso = id.slice(at + 1)
  const occurrenceAt = new Date(iso)
  if (Number.isNaN(occurrenceAt.getTime())) return null
  // Round-trip: rejects a truncated or reformatted instant, which would
  // silently miss the occurrence it was meant to identify and create an
  // override nothing ever matches.
  if (occurrenceAt.toISOString() !== iso) return null

  return { seriesId, occurrenceAt }
}

/** The scope named by a request body, or null when it is missing or unknown. */
export function parseScope(value: unknown): EditScope | null {
  return value === 'occurrence' || value === 'series' ? value : null
}

/**
 * Shifts an occurrence's end by however much its start moved.
 *
 * An override inherits the series' duration unless the edit changed it, so a
 * move keeps the meeting the same length rather than silently resizing it to
 * whatever the caller happened to send.
 */
export function shiftedEnd(seriesStart: Date, seriesEnd: Date, newStart: Date): Date {
  const durationMs = Math.max(seriesEnd.getTime() - seriesStart.getTime(), 0)
  return new Date(newStart.getTime() + durationMs)
}
