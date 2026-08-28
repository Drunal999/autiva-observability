/**
 * All-day events are DATES, not instants.
 *
 * The bug this file exists to close: an all-day event was stored as a local
 * midnight instant, and nothing recorded WHICH local. Reading a date back out
 * then depends on the reader's timezone —
 *
 *   - `toISOString().slice(0,10)` reads it in UTC, so 00:00 IST (18:30 UTC the
 *     previous day) comes back a day early;
 *   - `getFullYear()/getMonth()/getDate()` reads it in the SERVER's timezone,
 *     which on a UTC deployment is the same day-early answer, and on a server
 *     west of UTC is wrong in the other direction.
 *
 * There is no formatting trick that fixes this, because the information needed
 * — the creator's timezone — was never stored. So the storage changes instead:
 * an all-day event is normalised to UTC midnight and read back in UTC. It then
 * means the same date for everyone, everywhere, which is what "all day"
 * actually means. Calendar clients call this a floating date and do the same.
 *
 * The rule, in one line: an all-day event is SUBMITTED as `YYYY-MM-DD` by the
 * browser (the only party that knows which date was meant), stored at UTC
 * midnight, and read back with UTC accessors. Never with local accessors on
 * the server, which is where the first attempt at this fix went wrong.
 */

const DAY_MS = 86_400_000

/**
 * `YYYY-MM-DD` for the LOCAL date of an instant. Client-side only.
 *
 * This is how an all-day event is submitted. The browser is the only place
 * that knows which date the person meant, so it names the date explicitly
 * rather than sending an instant the server would have to guess about.
 */
export function toDateOnly(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * Parses a submitted `YYYY-MM-DD` into UTC midnight. Server-side.
 *
 * Returns null for anything else — including a full ISO instant, which is
 * REJECTED rather than interpreted. An instant carries no timezone the server
 * can trust: "2026-09-14T18:30:00Z" is the 15th in Kolkata and the 14th in
 * London, and the server has no way to know which was meant. Guessing with
 * server-local accessors is how the day-early bug survived its first fix.
 */
export function parseDateOnly(value: string): Date | null {
  const m = DATE_ONLY.exec(value)
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
  const parsed = new Date(Date.UTC(y, mo - 1, d))
  // Rejects 2026-02-31 and friends, which Date.UTC would roll forward.
  if (parsed.getUTCMonth() !== mo - 1 || parsed.getUTCDate() !== d) return null
  return parsed
}

/** The UTC midnight of an instant already normalised, i.e. read-path safe. */
export function floorUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

/**
 * `YYYY-MM-DD` in UTC, for a value already stored at UTC midnight.
 *
 * Used when an edit supplies only one end of a range and the other has to be
 * carried over in the same date form.
 */
export function toDateOnlyUtc(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`
}

/** `YYYYMMDD` in UTC, for RFC 5545 DATE values. */
export function utcDateStamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}`
}

/** Milliseconds at UTC midnight — the bucket key for grouping by day. */
export function utcDateKey(d: Date): number {
  return floorUtcDay(d).getTime()
}

/**
 * The RFC 5545 DTEND for an all-day event: EXCLUSIVE, the first day NOT in it.
 *
 * Emitting the inclusive last day makes a one-day event come out with
 * DTSTART == DTEND, which most clients drop entirely.
 */
export function exclusiveEndStamp(startsAt: Date, endsAt: Date): string {
  const start = floorUtcDay(startsAt)
  let end = floorUtcDay(endsAt)
  // Never end at or before the start; a same-day event runs for one day.
  if (end.getTime() < start.getTime()) end = start
  return utcDateStamp(new Date(end.getTime() + DAY_MS))
}

/**
 * Normalises a submitted all-day range for storage.
 *
 * The end is the UTC midnight of the LAST day the event covers, not 23:59 of
 * it: a date range needs no clock time, and storing one invites exactly the
 * timezone question this module removes.
 */
export function normaliseAllDay(
  startsAt: string,
  endsAt: string
): { startsAt: Date; endsAt: Date } | null {
  const start = parseDateOnly(startsAt)
  const end = parseDateOnly(endsAt)
  if (!start || !end) return null
  return { startsAt: start, endsAt: end.getTime() < start.getTime() ? start : end }
}
