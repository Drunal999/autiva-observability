import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  findMany: vi.fn(),
  findFirst: vi.fn(),
  createMany: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findMany: h.findMany },
    notification: { findFirst: h.findFirst, createMany: h.createMany },
  },
}))

import { notifyTeam } from '../notify'

const base = {
  tenantId: 't1',
  kind: 'RUN_FAILED' as const,
  subjectType: 'RUN' as const,
  subjectId: 'run1',
  preview: 'vega failed — e2e repair',
}

beforeEach(() => {
  vi.clearAllMocks()
  h.findMany.mockResolvedValue([{ id: 'u1' }, { id: 'u2' }, { id: 'u3' }])
  h.findFirst.mockResolvedValue(null)
  h.createMany.mockResolvedValue({ count: 0 })
})

const rowsWritten = () =>
  h.createMany.mock.calls[0][0].data as { userId: string; kind: string; preview: string }[]

describe('an alert reaches the team', () => {
  it('writes one row per person', async () => {
    await notifyTeam(base)
    expect(rowsWritten().map((r) => r.userId)).toEqual(['u1', 'u2', 'u3'])
  })

  it('carries the kind, so the header shows it as an alert and not a mention', async () => {
    await notifyTeam(base)
    expect(rowsWritten().every((r) => r.kind === 'RUN_FAILED')).toBe(true)
  })
})

describe('nobody is told about their own action', () => {
  it('skips the person who caused it', async () => {
    // Being told your own run failed, while you sit watching it fail in the
    // terminal, is the noise that teaches people to dismiss the badge unread.
    await notifyTeam({ ...base, exceptUserId: 'u2' })
    expect(rowsWritten().map((r) => r.userId)).toEqual(['u1', 'u3'])
  })

  it('writes nothing at all when they are the only person', async () => {
    h.findMany.mockResolvedValue([{ id: 'u2' }])
    expect(await notifyTeam({ ...base, exceptUserId: 'u2' })).toBe(0)
    expect(h.createMany).not.toHaveBeenCalled()
  })
})

describe('the same thing is not raised twice', () => {
  it('stays quiet while an unread alert for that subject already stands', async () => {
    // The reporter re-sends a whole session on every turn, so one broken run
    // arrives again and again. Without this the badge climbs all afternoon.
    h.findFirst.mockResolvedValue({ id: 'n1' })
    expect(await notifyTeam(base)).toBe(0)
    expect(h.createMany).not.toHaveBeenCalled()
  })

  it('matches on subject AND kind, not on subject alone', async () => {
    await notifyTeam(base)
    expect(h.findFirst.mock.calls[0][0].where).toMatchObject({
      tenantId: 't1', kind: 'RUN_FAILED', subjectId: 'run1', readAt: null,
    })
  })

  it('speaks again once the earlier one has been read', async () => {
    // Read means dealt with. A failure after that is news.
    h.findFirst.mockResolvedValue(null)
    await notifyTeam(base)
    expect(h.createMany).toHaveBeenCalled()
  })
})

describe('the preview', () => {
  it('is truncated, because it renders in a fixed-width badge row', async () => {
    await notifyTeam({ ...base, preview: 'x'.repeat(500) })
    expect(rowsWritten()[0]).toMatchObject({ preview: 'x'.repeat(140) })
  })
})
