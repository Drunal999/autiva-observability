import { describe, it, expect } from 'vitest'
import {
  toDateOnly,
  parseDateOnly,
  floorUtcDay,
  utcDateStamp,
  utcDateKey,
  exclusiveEndStamp,
  normaliseAllDay,
} from '../allDay'

/**
 * Every assertion below is on a FIXED UTC INSTANT, so it holds whatever
 * timezone the machine running it is in.
 *
 * That is the whole point. The previous version of this fix was tested by
 * building Dates from local components and asserting on local output, so test
 * timezone == creation timezone and the test agreed with the bug. The suite is
 * run under two timezones in CI-equivalent form; see the commit.
 */
const utc = (y: number, m: number, d: number, h = 0, min = 0) =>
  new Date(Date.UTC(y, m - 1, d, h, min))

describe('reading an all-day date', () => {
  it('is the same date in every timezone, because it is read in UTC', () => {
    expect(utcDateStamp(utc(2026, 9, 15))).toBe('20260915')
    // Late in the UTC day: a local reading east of UTC would roll over.
    expect(utcDateStamp(utc(2026, 9, 15, 23, 59))).toBe('20260915')
    // Early in the UTC day: a local reading west of UTC would roll back.
    expect(utcDateStamp(utc(2026, 9, 15, 0, 1))).toBe('20260915')
  })

  it('floors to UTC midnight regardless of the time of day', () => {
    expect(floorUtcDay(utc(2026, 9, 15, 18, 30)).toISOString()).toBe('2026-09-15T00:00:00.000Z')
  })

  it('buckets by UTC day', () => {
    expect(utcDateKey(utc(2026, 9, 15, 5, 30))).toBe(utcDateKey(utc(2026, 9, 15, 22, 0)))
    expect(utcDateKey(utc(2026, 9, 15))).not.toBe(utcDateKey(utc(2026, 9, 16)))
  })
})

describe('submitting an all-day date', () => {
  it('names the LOCAL date of the browser that took the input', () => {
    // Only the browser knows which day the person meant, so it says so.
    expect(toDateOnly(new Date(2026, 8, 15, 14, 37, 0))).toBe('2026-09-15')
    expect(toDateOnly(new Date(2026, 8, 15, 0, 0, 0))).toBe('2026-09-15')
    expect(toDateOnly(new Date(2026, 8, 15, 23, 59, 0))).toBe('2026-09-15')
  })

  it('parses a submitted date to UTC midnight', () => {
    expect(parseDateOnly('2026-09-15')?.toISOString()).toBe('2026-09-15T00:00:00.000Z')
  })

  it('REFUSES an instant, rather than guessing which date it meant', () => {
    // The whole bug in one line: 2026-09-14T18:30:00Z is the 15th in Kolkata
    // and the 14th in London. The server cannot know, so it must not choose.
    expect(parseDateOnly('2026-09-14T18:30:00.000Z')).toBeNull()
    expect(parseDateOnly('2026-09-15T00:00:00Z')).toBeNull()
  })

  it('refuses a date that does not exist', () => {
    // Date.UTC would happily roll 2026-02-31 forward to 3 March.
    expect(parseDateOnly('2026-02-31')).toBeNull()
    expect(parseDateOnly('2026-13-01')).toBeNull()
    expect(parseDateOnly('not-a-date')).toBeNull()
    expect(parseDateOnly('')).toBeNull()
  })

  it('accepts a leap day that does exist', () => {
    expect(parseDateOnly('2028-02-29')?.toISOString()).toBe('2028-02-29T00:00:00.000Z')
  })

  it('normalises a submitted range to two UTC midnights', () => {
    const r = normaliseAllDay('2026-09-15', '2026-09-17')
    expect(r?.startsAt.toISOString()).toBe('2026-09-15T00:00:00.000Z')
    expect(r?.endsAt.toISOString()).toBe('2026-09-17T00:00:00.000Z')
  })

  it('never lets the end precede the start', () => {
    const r = normaliseAllDay('2026-09-15', '2026-08-01')
    expect(r?.endsAt.getTime()).toBe(r?.startsAt.getTime())
  })

  it('rejects the range if either end is not a plain date', () => {
    expect(normaliseAllDay('2026-09-15', '2026-09-17T00:00:00Z')).toBeNull()
  })

  it('round-trips: what the browser names is what comes back', () => {
    const local = new Date(2026, 8, 15, 22, 45, 0)
    const stored = parseDateOnly(toDateOnly(local))!
    expect(utcDateStamp(stored)).toBe('20260915')
  })
})

describe('the RFC 5545 exclusive end', () => {
  it('makes a one-day event span one day, not zero', () => {
    // DTSTART == DTEND makes most clients drop the event entirely.
    expect(exclusiveEndStamp(utc(2026, 9, 15), utc(2026, 9, 15))).toBe('20260916')
  })

  it('adds exactly one day past the last day covered', () => {
    expect(exclusiveEndStamp(utc(2026, 9, 15), utc(2026, 9, 17))).toBe('20260918')
  })

  it('crosses a month boundary correctly', () => {
    expect(exclusiveEndStamp(utc(2026, 9, 29), utc(2026, 9, 30))).toBe('20261001')
  })

  it('crosses a leap day correctly', () => {
    expect(exclusiveEndStamp(utc(2028, 2, 28), utc(2028, 2, 29))).toBe('20280301')
  })

  it('tolerates an end before the start rather than emitting a reversed range', () => {
    expect(exclusiveEndStamp(utc(2026, 9, 15), utc(2026, 8, 1))).toBe('20260916')
  })
})
