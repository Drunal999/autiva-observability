import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({ updateMany: vi.fn(), create: vi.fn() }))

vi.mock('@/lib/prisma', () => ({
  prisma: { threadRead: { updateMany: h.updateMany, create: h.create } },
}))

import { markThreadRead } from '../threadRead'

const base = {
  tenantId: 'tnt_internal',
  userId: 'user-1',
  subjectType: 'RUN' as const,
  subjectId: 'run-9',
}

describe('the read watermark', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    h.updateMany.mockResolvedValue({ count: 1 })
    h.create.mockResolvedValue({})
  })

  it('only ever moves forward', async () => {
    // Opening a stale view of a thread must not un-read what you have seen.
    const upTo = new Date(Date.now() - 60_000)
    await markThreadRead({ ...base, upTo })
    expect(h.updateMany.mock.calls[0][0].where.lastReadAt).toEqual({ lt: upTo })
  })

  it('clamps a future timestamp to now, so a bad client cannot mute a thread forever', async () => {
    const before = Date.now()
    await markThreadRead({ ...base, upTo: new Date(Date.now() + 86_400_000) })
    const written = h.updateMany.mock.calls[0][0].data.lastReadAt as Date
    expect(written.getTime()).toBeGreaterThanOrEqual(before)
    expect(written.getTime()).toBeLessThanOrEqual(Date.now())
  })

  it('ignores an unparseable timestamp rather than writing an invalid date', async () => {
    await markThreadRead({ ...base, upTo: new Date('nonsense') })
    const written = h.updateMany.mock.calls[0][0].data.lastReadAt as Date
    expect(Number.isNaN(written.getTime())).toBe(false)
  })

  it('creates the row the first time a thread is opened', async () => {
    h.updateMany.mockResolvedValue({ count: 0 })
    await markThreadRead(base)
    expect(h.create).toHaveBeenCalled()
    expect(h.create.mock.calls[0][0].data.tenantId).toBe('tnt_internal')
  })

  it('does not create a second row when two tabs open the thread at once', async () => {
    // The unique constraint is the arbiter; the loser has nothing to move.
    h.updateMany.mockResolvedValue({ count: 0 })
    h.create.mockRejectedValue(Object.assign(new Error('dup'), { code: 'P2002' }))
    await expect(markThreadRead(base)).resolves.toBeUndefined()
  })

  it('still surfaces a real database failure', async () => {
    h.updateMany.mockResolvedValue({ count: 0 })
    h.create.mockRejectedValue(Object.assign(new Error('down'), { code: 'P1001' }))
    await expect(markThreadRead(base)).rejects.toThrow('down')
  })

  it('scopes the write to the tenant, not the user alone', async () => {
    await markThreadRead(base)
    expect(h.updateMany.mock.calls[0][0].where.tenantId).toBe('tnt_internal')
    expect(h.updateMany.mock.calls[0][0].where.userId).toBe('user-1')
  })

  it('skips the create when the update already moved the watermark', async () => {
    await markThreadRead(base)
    expect(h.create).not.toHaveBeenCalled()
  })
})
