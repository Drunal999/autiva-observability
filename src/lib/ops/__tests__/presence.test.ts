import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { heartbeat, roster, leave, __resetPresence, PRESENCE_TTL_MS } from '../presence'

const beat = (tenantId: string, userId: string, name = userId, viewing = 'the fleet') =>
  heartbeat({ tenantId, userId, name, viewing })

describe('presence', () => {
  beforeEach(() => {
    __resetPresence()
    vi.useFakeTimers()
  })
  afterEach(() => vi.useRealTimers())

  it('records who is online and what they are viewing', () => {
    beat('t1', 'u1', 'Ana', 'run r-8f2c')
    expect(roster('t1')).toEqual([
      expect.objectContaining({ userId: 'u1', name: 'Ana', viewing: 'run r-8f2c' }),
    ])
  })

  it('never leaks presence across tenants', () => {
    beat('t1', 'u1', 'Ana')
    beat('t2', 'u2', 'Kenji')
    expect(roster('t1').map((r) => r.userId)).toEqual(['u1'])
    expect(roster('t2').map((r) => r.userId)).toEqual(['u2'])
  })

  it('returns an empty roster for a tenant nobody is in', () => {
    expect(roster('nobody-here')).toEqual([])
  })

  it('updates location on the next heartbeat rather than duplicating a person', () => {
    beat('t1', 'u1', 'Ana', 'the fleet')
    beat('t1', 'u1', 'Ana', 'the approvals queue')
    const r = roster('t1')
    expect(r).toHaveLength(1)
    expect(r[0].viewing).toBe('the approvals queue')
  })

  it('drops someone who has stopped checking in', () => {
    beat('t1', 'u1', 'Ana')
    expect(roster('t1')).toHaveLength(1)
    vi.advanceTimersByTime(PRESENCE_TTL_MS + 1000)
    expect(roster('t1')).toHaveLength(0)
  })

  it('keeps someone who is still checking in', () => {
    beat('t1', 'u1', 'Ana')
    vi.advanceTimersByTime(PRESENCE_TTL_MS - 5000)
    beat('t1', 'u1', 'Ana')
    vi.advanceTimersByTime(PRESENCE_TTL_MS - 5000)
    expect(roster('t1')).toHaveLength(1)
  })

  it('removes someone immediately on explicit leave, without waiting for TTL', () => {
    beat('t1', 'u1', 'Ana')
    leave('t1', 'u1')
    expect(roster('t1')).toHaveLength(0)
  })

  it('leaving one tenant does not remove the same user id elsewhere', () => {
    beat('t1', 'u1', 'Ana')
    beat('t2', 'u1', 'Ana')
    leave('t1', 'u1')
    expect(roster('t1')).toHaveLength(0)
    expect(roster('t2')).toHaveLength(1)
  })

  it('sorts the roster by name so avatars do not shuffle between polls', () => {
    beat('t1', 'u3', 'Zara')
    beat('t1', 'u1', 'Ana')
    beat('t1', 'u2', 'Kenji')
    expect(roster('t1').map((r) => r.name)).toEqual(['Ana', 'Kenji', 'Zara'])
  })
})
