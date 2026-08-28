import { describe, it, expect } from 'vitest'
import { statusLabel, statusColor, statusGlyph, statusOrder, statusIsLive } from '../status'
import { inr, tokens } from '../format'

describe('status vocabulary', () => {
  it('maps the four backend values onto display labels', () => {
    expect(statusLabel('RUNNING')).toBe('Running')
    expect(statusLabel('SUCCESS')).toBe('Done')
    expect(statusLabel('FAILED')).toBe('Failed')
    expect(statusLabel('AWAITING_APPROVAL')).toBe('Blocked')
  })

  it('treats IDLE as an agent state, not a run state', () => {
    expect(statusLabel('IDLE')).toBe('Idle')
    expect(statusIsLive('IDLE')).toBe(false)
  })

  it('animates only a running agent', () => {
    expect(statusIsLive('RUNNING')).toBe(true)
    for (const s of ['SUCCESS', 'FAILED', 'AWAITING_APPROVAL', 'IDLE'] as const) {
      expect(statusIsLive(s)).toBe(false)
    }
  })

  it('gives every state a glyph so status never rides on colour alone', () => {
    const glyphs = (['RUNNING', 'SUCCESS', 'FAILED', 'AWAITING_APPROVAL', 'IDLE'] as const).map(statusGlyph)
    expect(new Set(glyphs).size).toBe(5)
    expect(glyphs.every((g) => g.length > 0)).toBe(true)
  })

  it('sorts anything on fire ahead of everything else', () => {
    const sorted = (['IDLE', 'SUCCESS', 'FAILED', 'RUNNING', 'AWAITING_APPROVAL'] as const)
      .slice()
      .sort((a, b) => statusOrder(a) - statusOrder(b))
    expect(sorted[0]).toBe('FAILED')
    expect(sorted[1]).toBe('RUNNING')
    expect(sorted[sorted.length - 1]).toBe('IDLE')
  })

  it('gives each state a distinct colour', () => {
    const colors = (['RUNNING', 'SUCCESS', 'FAILED', 'AWAITING_APPROVAL', 'IDLE'] as const).map(statusColor)
    expect(new Set(colors).size).toBe(5)
  })
})

describe('formatting', () => {
  it('formats currency as INR with Indian digit grouping', () => {
    expect(inr(72.15)).toBe('₹72.15')
    // Indian grouping is 2,2,3 — not thousands separators.
    expect(inr(123456.78)).toContain('1,23,456')
  })

  it('never emits a dollar sign', () => {
    for (const n of [0, 1, 999, 100000]) {
      expect(inr(n)).not.toContain('$')
    }
  })

  it('uses compact notation for token counts', () => {
    expect(tokens(950)).toBe('950')
    expect(tokens(71400)).toBe('71.4k')
    expect(tokens(2_400_000)).toBe('2.4M')
  })
})
