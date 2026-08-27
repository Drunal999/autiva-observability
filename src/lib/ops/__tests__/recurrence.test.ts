import { describe, it, expect } from 'vitest'
import {
  validateRRule,
  expandInWindow,
  describeRRule,
  MAX_OCCURRENCES_PER_WINDOW,
} from '../recurrence'

const START = new Date('2026-09-01T09:30:00.000Z')

describe('validateRRule', () => {
  it('accepts a weekday standup and reads it back in plain English', () => {
    const v = validateRRule('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', START)
    expect(v.ok).toBe(true)
    expect(v.text).toContain('weekday')
  })

  it('rejects a runaway rule rather than letting it take the grid down', () => {
    // FREQ=MINUTELY is ~525,600 occurrences a year. Expanding that on a
    // request thread is a denial of service anyone could trigger by typing.
    const v = validateRRule('FREQ=MINUTELY', START)
    expect(v.ok).toBe(false)
    expect(v.error).toMatch(/less frequent/i)
  })

  it('rejects hourly for the same reason', () => {
    expect(validateRRule('FREQ=HOURLY', START).ok).toBe(false)
  })

  it('accepts daily, which is well inside the ceiling', () => {
    const v = validateRRule('FREQ=DAILY', START)
    expect(v.ok).toBe(true)
    expect(v.occurrencesPerYear).toBeLessThan(400)
  })

  it('rejects a rule it cannot parse, with a message a person can act on', () => {
    const v = validateRRule('EVERY SECOND TUESDAY-ISH', START)
    expect(v.ok).toBe(false)
    expect(v.error).toMatch(/not valid/i)
  })

  it('rejects an empty rule', () => {
    expect(validateRRule('   ', START).ok).toBe(false)
  })
})

describe('expandInWindow', () => {
  it('returns occurrences inside the window only', () => {
    const from = new Date('2026-09-01T00:00:00.000Z')
    const to = new Date('2026-09-08T00:00:00.000Z')
    const days = expandInWindow('FREQ=DAILY', START, from, to)
    expect(days.length).toBe(7)
    days.forEach((d) => {
      expect(d.getTime()).toBeGreaterThanOrEqual(from.getTime())
      expect(d.getTime()).toBeLessThanOrEqual(to.getTime())
    })
  })

  it('caps expansion even for a rule that slipped past validation', () => {
    // Defence in depth: a rule stored before the ceiling existed must still
    // not be able to expand without bound.
    const from = new Date('2026-09-01T00:00:00.000Z')
    const to = new Date('2027-09-01T00:00:00.000Z')
    const out = expandInWindow('FREQ=MINUTELY', START, from, to)
    expect(out.length).toBeLessThanOrEqual(MAX_OCCURRENCES_PER_WINDOW)
  })

  it('returns nothing for an unparsable stored rule rather than throwing', () => {
    // One bad row must not break the whole grid.
    const out = expandInWindow('NONSENSE', START, START, new Date('2026-10-01T00:00:00.000Z'))
    expect(out).toEqual([])
  })

  it('returns nothing when the window is before the series starts', () => {
    const out = expandInWindow(
      'FREQ=DAILY',
      START,
      new Date('2026-01-01T00:00:00.000Z'),
      new Date('2026-02-01T00:00:00.000Z')
    )
    expect(out).toEqual([])
  })
})

describe('describeRRule', () => {
  it('reads a rule back so it can be confirmed before saving', () => {
    expect(describeRRule('FREQ=WEEKLY;BYDAY=MO')).toContain('week')
  })

  it('returns null rather than throwing on nonsense', () => {
    expect(describeRRule('not a rule')).toBeNull()
  })
})
