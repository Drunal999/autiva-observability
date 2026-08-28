import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({ findFirst: vi.fn(), findMany: vi.fn() }))

vi.mock('@/lib/prisma', () => ({
  prisma: { event: { findFirst: h.findFirst, findMany: h.findMany } },
}))

import { replayEvents } from '../bus'

const stored = (id: string) => ({
  id,
  tenantId: 'tnt_internal',
  channel: 'BOARD',
  type: 'task-updated',
  payload: {},
  at: new Date('2020-01-01T00:00:00Z'),
})

describe('replaying after a reconnect', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    h.findMany.mockResolvedValue([stored('e1')])
  })

  it('replays nothing when the cursor is unknown', async () => {
    // publishBoardEvent mints `local-…` ids that are never persisted, and the
    // client stores whatever id it last saw as its Last-Event-ID. Treating an
    // unknown cursor as "no cursor" replayed the tenant's OLDEST hundred
    // events and the client rendered them as if they had just happened.
    h.findFirst.mockResolvedValue(null)
    const out = await replayEvents('tnt_internal', 'local-1730000000000-ab12cd')
    expect(out).toEqual([])
    expect(h.findMany).not.toHaveBeenCalled()
  })

  it('replays from the cursor when it is known', async () => {
    const at = new Date('2026-08-01T00:00:00Z')
    h.findFirst.mockResolvedValue({ at })
    const out = await replayEvents('tnt_internal', 'e0')
    expect(out).toHaveLength(1)
    expect(h.findMany.mock.calls[0][0].where.at).toEqual({ gt: at })
  })

  it('returns recent history when there is genuinely no cursor', async () => {
    // A first connection has nothing to resume from; that is not the same as
    // a cursor that could not be found.
    const out = await replayEvents('tnt_internal')
    expect(out).toHaveLength(1)
    expect(h.findFirst).not.toHaveBeenCalled()
    expect(h.findMany.mock.calls[0][0].where.at).toBeUndefined()
  })

  it('scopes the cursor lookup to the tenant', async () => {
    h.findFirst.mockResolvedValue({ at: new Date() })
    await replayEvents('tnt_internal', 'e0')
    expect(h.findFirst.mock.calls[0][0].where.tenantId).toBe('tnt_internal')
    expect(h.findMany.mock.calls[0][0].where.tenantId).toBe('tnt_internal')
  })

  it('caps how much history one replay can pull', async () => {
    await replayEvents('tnt_internal')
    expect(h.findMany.mock.calls[0][0].take).toBe(100)
  })
})
