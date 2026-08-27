import { describe, it, expect } from 'vitest'
import { quickAdd } from '../quickAdd'

// A fixed Wednesday, so weekday arithmetic is deterministic.
const NOW = new Date('2026-09-02T11:00:00.000Z')

describe('quickAdd — the phrasings people actually type', () => {
  it('parses a recurring standup', () => {
    const r = quickAdd('standup every weekday 9:30', NOW)
    expect(r.ok).toBe(true)
    expect(r.title).toBe('standup')
    expect(r.rrule).toBe('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR')
    expect(r.startsAt?.getHours()).toBe(9)
    expect(r.startsAt?.getMinutes()).toBe(30)
  })

  it('parses a named weekly day', () => {
    const r = quickAdd('retro every friday 16:00', NOW)
    expect(r.ok).toBe(true)
    expect(r.rrule).toBe('FREQ=WEEKLY;BYDAY=FR')
    expect(r.title).toBe('retro')
  })

  it('parses daily', () => {
    expect(quickAdd('backup daily 02:00', NOW).rrule).toBe('FREQ=DAILY')
  })

  it('parses a one-off tomorrow with a time', () => {
    const r = quickAdd('client review tomorrow 15:00', NOW)
    expect(r.ok).toBe(true)
    expect(r.rrule).toBeNull()
    expect(r.startsAt?.getDate()).toBe(3)
    expect(r.startsAt?.getHours()).toBe(15)
  })

  it('resolves "on friday" to the coming friday', () => {
    // NOW is a Wednesday; Friday is two days later.
    const r = quickAdd('demo on friday 11:00', NOW)
    expect(r.startsAt?.getDay()).toBe(5)
    expect(r.startsAt!.getTime()).toBeGreaterThan(NOW.getTime())
  })

  it('handles am/pm', () => {
    expect(quickAdd('call tomorrow 4pm', NOW).startsAt?.getHours()).toBe(16)
    expect(quickAdd('call tomorrow 9am', NOW).startsAt?.getHours()).toBe(9)
  })

  it('gives an untimed one-off a sensible all-day span', () => {
    const r = quickAdd('quarter close tomorrow', NOW)
    expect(r.ok).toBe(true)
    expect(r.allDay).toBe(true)
  })

  it('defaults a timed event to a 30-minute duration', () => {
    const r = quickAdd('sync tomorrow 10:00', NOW)
    const mins = (r.endsAt!.getTime() - r.startsAt!.getTime()) / 60000
    expect(mins).toBe(30)
  })
})

describe('quickAdd — refuses to guess', () => {
  it('refuses a recurring event with no time rather than inventing one', () => {
    // Silently defaulting this is how an automation fires at the wrong hour
    // and nobody finds out until it has.
    const r = quickAdd('standup every weekday', NOW)
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/no time was given/i)
  })

  it('refuses input with no title', () => {
    expect(quickAdd('every weekday 9:30', NOW).ok).toBe(false)
  })

  it('refuses empty input with a usable example', () => {
    const r = quickAdd('   ', NOW)
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/standup every weekday/i)
  })

  it('does not treat a bare number as a time', () => {
    // "sprint 5" is a name, not five o'clock.
    const r = quickAdd('sprint 5 planning tomorrow', NOW)
    expect(r.ok).toBe(true)
    expect(r.allDay).toBe(true)
    expect(r.title).toContain('sprint 5')
  })

  it('rejects an impossible time rather than clamping it', () => {
    const r = quickAdd('sync tomorrow 99:99', NOW)
    // Not read as a time, so it stays part of the name rather than becoming
    // a silently corrected hour.
    expect(r.allDay).toBe(true)
  })

  it('always returns a read-back to confirm before saving', () => {
    const r = quickAdd('standup every weekday 9:30', NOW)
    expect(r.summary).toContain('standup')
    expect(r.summary).toContain('every weekday')
  })
})
