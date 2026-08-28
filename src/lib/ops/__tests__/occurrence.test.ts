import { describe, it, expect } from 'vitest'
import { parseOccurrenceId, parseScope, shiftedEnd } from '../occurrence'

describe('occurrence ids', () => {
  it('splits a derived id into the series and the instant', () => {
    const r = parseOccurrenceId('evt_123@2026-09-15T09:30:00.000Z')
    expect(r?.seriesId).toBe('evt_123')
    expect(r?.occurrenceAt.toISOString()).toBe('2026-09-15T09:30:00.000Z')
  })

  it('returns null for a plain row id, which is not an error', () => {
    // Callers use this to mean "ordinary event, edit it directly".
    expect(parseOccurrenceId('evt_123')).toBeNull()
  })

  it('refuses an instant that does not round-trip', () => {
    // A truncated or reformatted instant would miss the occurrence it was
    // meant to identify, creating an override that nothing ever matches and an
    // EXDATE that excludes nothing.
    expect(parseOccurrenceId('evt_123@2026-09-15T09:30:00Z')).toBeNull()
    expect(parseOccurrenceId('evt_123@2026-09-15')).toBeNull()
    expect(parseOccurrenceId('evt_123@not-a-date')).toBeNull()
  })

  it('refuses an id with no series part', () => {
    expect(parseOccurrenceId('@2026-09-15T09:30:00.000Z')).toBeNull()
  })

  it('keeps a cuid containing no @ intact', () => {
    expect(parseOccurrenceId('cmtblvsoe000daux0kumxubk9')).toBeNull()
  })
})

describe('the edit scope', () => {
  it('accepts only the two meanings a drag can have', () => {
    expect(parseScope('occurrence')).toBe('occurrence')
    expect(parseScope('series')).toBe('series')
  })

  it('refuses anything else, so a scope is never inferred', () => {
    // Dragging one instance of a weekly meeting could mean "just this week" or
    // "it is Wednesdays now". Defaulting would be wrong half the time.
    expect(parseScope(undefined)).toBeNull()
    expect(parseScope(null)).toBeNull()
    expect(parseScope('all')).toBeNull()
    expect(parseScope('')).toBeNull()
    expect(parseScope(true)).toBeNull()
  })
})

describe('an override inherits the series duration', () => {
  const start = new Date('2026-09-15T09:30:00Z')
  const end = new Date('2026-09-15T10:00:00Z')

  it('keeps the meeting the same length when it moves', () => {
    const moved = shiftedEnd(start, end, new Date('2026-09-16T14:00:00Z'))
    expect(moved.toISOString()).toBe('2026-09-16T14:30:00.000Z')
  })

  it('works when the move is backwards', () => {
    const moved = shiftedEnd(start, end, new Date('2026-09-14T08:00:00Z'))
    expect(moved.toISOString()).toBe('2026-09-14T08:30:00.000Z')
  })

  it('never produces a negative duration from a malformed series', () => {
    const moved = shiftedEnd(end, start, new Date('2026-09-16T14:00:00Z'))
    expect(moved.getTime()).toBeGreaterThanOrEqual(new Date('2026-09-16T14:00:00Z').getTime())
  })
})
