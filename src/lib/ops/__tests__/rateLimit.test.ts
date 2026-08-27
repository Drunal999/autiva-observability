import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { rateLimit, __resetRateLimits } from '../rateLimit'

describe('rateLimit', () => {
  beforeEach(() => {
    __resetRateLimits()
    vi.useFakeTimers()
  })
  afterEach(() => vi.useRealTimers())

  it('allows up to the limit and refuses the next request', () => {
    for (let i = 0; i < 3; i++) {
      expect(rateLimit('u1', 3, 60_000).ok).toBe(true)
    }
    expect(rateLimit('u1', 3, 60_000).ok).toBe(false)
  })

  it('keeps separate buckets per key, so one user cannot exhaust another', () => {
    rateLimit('u1', 1, 60_000)
    expect(rateLimit('u1', 1, 60_000).ok).toBe(false)
    expect(rateLimit('u2', 1, 60_000).ok).toBe(true)
  })

  it('reports how long until the window resets', () => {
    rateLimit('u1', 1, 60_000)
    const blocked = rateLimit('u1', 1, 60_000)
    expect(blocked.ok).toBe(false)
    expect(blocked.retryAfter).toBeGreaterThan(0)
    expect(blocked.retryAfter).toBeLessThanOrEqual(60)
  })

  it('lets the caller through again once the window has passed', () => {
    rateLimit('u1', 1, 60_000)
    expect(rateLimit('u1', 1, 60_000).ok).toBe(false)
    vi.advanceTimersByTime(60_001)
    expect(rateLimit('u1', 1, 60_000).ok).toBe(true)
  })

  it('counts down remaining allowance', () => {
    expect(rateLimit('u1', 3, 60_000).remaining).toBe(2)
    expect(rateLimit('u1', 3, 60_000).remaining).toBe(1)
    expect(rateLimit('u1', 3, 60_000).remaining).toBe(0)
  })
})
