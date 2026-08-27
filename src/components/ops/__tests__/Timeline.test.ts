import { describe, it, expect } from 'vitest'
import { buildTicks, tierFor, zoomWindow, MIN_SPAN, MAX_SPAN } from '../Timeline'
import { packRows, densify, snapTo } from '../TimelineLane'
import type { TimelineItem } from '../Timeline'

const HOUR = 3_600_000
const DAY = 86_400_000

const at = (iso: string) => new Date(iso).getTime()

function item(id: string, start: string, end: string, extra: Partial<TimelineItem> = {}): TimelineItem {
  return { id, layer: 'run', title: id, startsAt: start, endsAt: end, ...extra }
}

describe('zooming', () => {
  it('holds the instant under the pointer still', () => {
    // The whole point. Zooming about the centre instead makes whatever you
    // were looking at slide off the screen.
    const center = at('2026-08-28T12:00:00')
    const span = 14 * DAY
    const fraction = 0.25
    const anchorBefore = center - span / 2 + span * fraction

    const next = zoomWindow(center, span, 0.5, fraction)
    const anchorAfter = next.center - next.span / 2 + next.span * fraction

    expect(anchorAfter).toBeCloseTo(anchorBefore, 3)
  })

  it('holds it at either edge too', () => {
    const center = at('2026-08-28T12:00:00')
    const span = 7 * DAY
    for (const fraction of [0, 1]) {
      const before = center - span / 2 + span * fraction
      const next = zoomWindow(center, span, 2, fraction)
      const after = next.center - next.span / 2 + next.span * fraction
      expect(after).toBeCloseTo(before, 3)
    }
  })

  it('will not zoom past the readable floor or the API ceiling', () => {
    const c = Date.now()
    expect(zoomWindow(c, MIN_SPAN, 0.01, 0.5).span).toBe(MIN_SPAN)
    expect(zoomWindow(c, MAX_SPAN, 100, 0.5).span).toBe(MAX_SPAN)
  })

  it('keeps the fetch window inside the 400-day cap the API enforces', () => {
    // The component fetches 3x the visible span; if that could exceed 400 days
    // the calendar would start returning 400s at full zoom-out.
    expect(MAX_SPAN * 3).toBeLessThan(400 * DAY)
  })
})

describe('tiers', () => {
  it('changes representation at the thresholds, not the scale', () => {
    expect(tierFor(6 * HOUR)).toBe('hour')
    expect(tierFor(3 * DAY)).toBe('hour')
    expect(tierFor(3 * DAY + 1)).toBe('day')
    expect(tierFor(21 * DAY)).toBe('day')
    expect(tierFor(30 * DAY)).toBe('week')
    expect(tierFor(90 * DAY)).toBe('month')
  })
})

describe('the axis', () => {
  it('puts day ticks on midnight, never on an even fraction of the window', () => {
    const from = at('2026-08-28T13:37:00')
    const ticks = buildTicks('day', from, from + 10 * DAY)
    expect(ticks.length).toBeGreaterThan(3)
    for (const t of ticks) {
      const d = new Date(t.t)
      expect([d.getHours(), d.getMinutes(), d.getSeconds()]).toEqual([0, 0, 0])
    }
  })

  it('starts weeks on Monday', () => {
    const from = at('2026-08-28T00:00:00')
    for (const t of buildTicks('week', from, from + 60 * DAY)) {
      expect(new Date(t.t).getDay()).toBe(1)
    }
  })

  it('puts month ticks on the 1st and respects real month lengths', () => {
    const from = at('2026-01-15T00:00:00')
    const ticks = buildTicks('month', from, from + 200 * DAY)
    for (const t of ticks) expect(new Date(t.t).getDate()).toBe(1)

    // February is short. Stepping by a fixed 30 days would drift off the 1st
    // within a year, which is why this walks the calendar instead.
    // Ticks align DOWN, so the first one sits just left of the window and
    // renders off-screen. That is what keeps the gridlines on real boundaries
    // instead of starting wherever the window happened to open.
    const months = ticks.map((t) => new Date(t.t).getMonth())
    expect(months).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
  })

  it('marks day boundaries as major inside an hour view', () => {
    const from = at('2026-08-28T00:00:00')
    const ticks = buildTicks('hour', from, from + 2 * DAY)
    const majors = ticks.filter((t) => t.major)
    expect(majors.length).toBeGreaterThanOrEqual(2)
    for (const m of majors) expect(new Date(m.t).getHours()).toBe(0)
  })

  it('thins hour labels rather than emitting one per pixel', () => {
    const from = at('2026-08-28T00:00:00')
    // Three days at hourly ticks would be 72 labels overlapping into a smear.
    expect(buildTicks('hour', from, from + 3 * DAY).length).toBeLessThanOrEqual(18)
  })

  it('cannot run away on a pathological window', () => {
    const from = at('2020-01-01T00:00:00')
    expect(buildTicks('hour', from, from + 4000 * DAY).length).toBeLessThanOrEqual(400)
  })
})

describe('lane packing', () => {
  it('keeps non-overlapping items on one row', () => {
    const { placed } = packRows(
      [
        item('a', '2026-08-01T00:00:00', '2026-08-01T01:00:00'),
        item('b', '2026-08-20T00:00:00', '2026-08-20T01:00:00'),
      ],
      60 * DAY
    )
    expect(placed.map((p) => p.row)).toEqual([0, 0])
  })

  it('pushes an overlapping item onto its own row rather than hiding it', () => {
    const { placed } = packRows(
      [
        item('a', '2026-08-01T00:00:00', '2026-08-05T00:00:00'),
        item('b', '2026-08-02T00:00:00', '2026-08-06T00:00:00'),
      ],
      10 * DAY
    )
    expect(new Set(placed.map((p) => p.row)).size).toBe(2)
  })

  it('reports what it could not fit instead of dropping it silently', () => {
    const items = Array.from({ length: 8 }, (_, i) =>
      item('x' + i, '2026-08-01T00:00:00', '2026-08-05T00:00:00')
    )
    const { placed, overflow } = packRows(items, 10 * DAY)
    expect(placed.length).toBe(3)
    expect(overflow).toBe(5)
  })

  it('treats a zero-length item as occupying its start, not a negative width', () => {
    const { placed } = packRows([item('a', '2026-08-01T00:00:00', '2026-07-01T00:00:00')], DAY)
    expect(placed[0].to).toBeGreaterThanOrEqual(placed[0].from)
  })
})

describe('density collapse', () => {
  const winStart = at('2026-08-01T00:00:00')
  const winEnd = at('2026-08-31T00:00:00')

  it('buckets items into fixed columns', () => {
    const cols = densify(
      [
        item('a', '2026-08-01T01:00:00', '2026-08-01T02:00:00'),
        item('b', '2026-08-01T02:00:00', '2026-08-01T03:00:00'),
      ],
      winStart,
      winEnd,
      30
    )
    expect(cols).toHaveLength(30)
    expect(cols[0].count).toBe(2)
    expect(cols.reduce((s, c) => s + c.count, 0)).toBe(2)
  })

  it('carries failure through the summary', () => {
    // A lane summarised into columns must not summarise away the red.
    const cols = densify(
      [
        item('a', '2026-08-02T01:00:00', '2026-08-02T02:00:00', { status: 'FAILED' }),
        item('b', '2026-08-02T03:00:00', '2026-08-02T04:00:00', { status: 'SUCCESS' }),
      ],
      winStart,
      winEnd,
      30
    )
    expect(cols.reduce((s, c) => s + c.failed, 0)).toBe(1)
  })

  it('ignores items outside the window rather than indexing off the end', () => {
    const cols = densify(
      [item('a', '2025-01-01T00:00:00', '2025-01-01T01:00:00')],
      winStart,
      winEnd,
      30
    )
    expect(cols.reduce((s, c) => s + c.count, 0)).toBe(0)
  })
})

describe('drag snapping', () => {
  it('snaps to a quarter hour when the axis can express one', () => {
    const t = at('2026-08-28T10:07:00')
    expect(new Date(snapTo(t, 'hour')).getMinutes()).toBe(0)
    // Nearest, not floor: :23 is closer to :30 than to :15.
    expect(new Date(snapTo(at('2026-08-28T10:23:00'), 'hour')).getMinutes()).toBe(30)
    expect(new Date(snapTo(at('2026-08-28T10:16:00'), 'hour')).getMinutes()).toBe(15)
  })

  it('snaps to midnight at every coarser zoom, because the drag carries no clock time', () => {
    for (const tier of ['day', 'week', 'month'] as const) {
      const d = new Date(snapTo(at('2026-08-28T17:42:00'), tier))
      expect([d.getHours(), d.getMinutes()]).toEqual([0, 0])
    }
  })
})
