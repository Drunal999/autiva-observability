import { describe, it, expect, beforeEach } from 'vitest'
import { icsToken, verifyIcsToken, buildIcs } from '../ics'

beforeEach(() => {
  process.env.ICS_FEED_SECRET = 'test-ics-secret'
})

const event = (over: Partial<Parameters<typeof buildIcs>[0][number]> = {}) => ({
  uid: 'e1',
  title: 'Standup',
  startsAt: new Date('2026-09-01T09:30:00.000Z'),
  endsAt: new Date('2026-09-01T09:45:00.000Z'),
  ...over,
})

describe('ICS feed tokens', () => {
  it('is stable for the same user, so a subscription keeps working', () => {
    expect(icsToken('t1', 'u1')).toBe(icsToken('t1', 'u1'))
  })

  it('differs per user and per tenant', () => {
    expect(icsToken('t1', 'u1')).not.toBe(icsToken('t1', 'u2'))
    expect(icsToken('t1', 'u1')).not.toBe(icsToken('t2', 'u1'))
  })

  it('is not sequential or guessable from the ids', () => {
    // A feed URL is effectively a password; a token derived visibly from a
    // user id would let anyone construct someone else's feed.
    const token = icsToken('tnt_internal', 'user-000001')
    expect(token).not.toContain('user-000001')
    expect(token).not.toContain('tnt_internal')
    expect(token.length).toBeGreaterThanOrEqual(32)
  })

  it('accepts a correct token and rejects a wrong one', () => {
    const good = icsToken('t1', 'u1')
    expect(verifyIcsToken('t1', 'u1', good)).toBe(true)
    expect(verifyIcsToken('t1', 'u1', good.slice(0, -1) + 'x')).toBe(false)
  })

  it('rejects one user token used for another user', () => {
    expect(verifyIcsToken('t1', 'u2', icsToken('t1', 'u1'))).toBe(false)
  })

  it('rejects empty and malformed tokens without throwing', () => {
    expect(verifyIcsToken('t1', 'u1', '')).toBe(false)
    expect(verifyIcsToken('t1', 'u1', 'short')).toBe(false)
  })

  it('is revoked by rotating the secret', () => {
    const before = icsToken('t1', 'u1')
    process.env.ICS_FEED_SECRET = 'rotated'
    expect(verifyIcsToken('t1', 'u1', before)).toBe(false)
  })
})

describe('buildIcs', () => {
  it('produces a well-formed calendar with CRLF line endings', () => {
    const ics = buildIcs([event()], 'Autiva')
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true)
    expect(ics).toContain('VERSION:2.0')
  })

  it('escapes the five characters that would otherwise change a line meaning', () => {
    const ics = buildIcs([event({ title: 'Review; notes, part\\one' })], 'Autiva')
    expect(ics).toContain('Review\\; notes\\, part\\\\one')
  })

  it('escapes newlines rather than emitting a broken multi-line field', () => {
    const ics = buildIcs([event({ description: 'line one\nline two' })], 'Autiva')
    expect(ics).toContain('line one\\nline two')
    // The literal newline must not survive into the body of the field.
    expect(ics).not.toMatch(/DESCRIPTION:line one\r?\nline two/)
  })

  it('folds long lines to 75 octets, the usual cause of a silent import failure', () => {
    const ics = buildIcs([event({ title: 'x'.repeat(200) })], 'Autiva')
    for (const line of ics.split('\r\n')) {
      expect(line.length).toBeLessThanOrEqual(75)
    }
  })

  it('emits DATE values for all-day events, not timestamps', () => {
    const ics = buildIcs([event({ allDay: true })], 'Autiva')
    expect(ics).toContain('DTSTART;VALUE=DATE:20260901')
  })

  it('carries an RRULE through unchanged', () => {
    const ics = buildIcs([event({ rrule: 'FREQ=WEEKLY;BYDAY=MO' })], 'Autiva')
    expect(ics).toContain('RRULE:FREQ=WEEKLY;BYDAY=MO')
  })

  it('does not double the RRULE prefix if one is already present', () => {
    const ics = buildIcs([event({ rrule: 'RRULE:FREQ=DAILY' })], 'Autiva')
    expect(ics).toContain('RRULE:FREQ=DAILY')
    expect(ics).not.toContain('RRULE:RRULE:')
  })

  it('tells clients how often to refresh rather than letting them guess', () => {
    expect(buildIcs([event()], 'Autiva')).toContain('REFRESH-INTERVAL')
  })
})
