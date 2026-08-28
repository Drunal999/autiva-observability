import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  userFindMany: vi.fn(),
  commentCreate: vi.fn(),
  notificationCreateMany: vi.fn(),
  updateMany: vi.fn(),
  threadCreate: vi.fn(),
  getServerSession: vi.fn(),
  getTenantContext: vi.fn(),
  publishEvent: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findMany: h.userFindMany },
    comment: { create: h.commentCreate, findMany: vi.fn() },
    notification: { createMany: h.notificationCreateMany },
    threadRead: { updateMany: h.updateMany, create: h.threadCreate },
  },
}))
vi.mock('next-auth', () => ({ getServerSession: () => h.getServerSession() }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/ops/tenant', () => ({
  getTenantContext: () => h.getTenantContext(),
  tenantScope: (c: { tenantId: string }) => ({ tenantId: c.tenantId }),
}))
vi.mock('@/lib/realtime/bus', () => ({ publishEvent: h.publishEvent }))

import { POST } from '../route'
import { __resetRateLimits } from '@/lib/ops/rateLimit'

const post = (body: string) =>
  new Request('http://localhost/api/comments', {
    method: 'POST',
    body: JSON.stringify({ subjectType: 'RUN', subjectId: 'run-1', body }),
  })

describe('mention resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    __resetRateLimits()
    h.getServerSession.mockResolvedValue({ user: { id: 'user-1', name: 'Dev' } })
    h.getTenantContext.mockResolvedValue({
      tenantId: 'tnt_internal', slug: 'autiva', name: 'A', mode: 'internal',
    })
    h.userFindMany.mockResolvedValue([])
    h.updateMany.mockResolvedValue({ count: 1 })
    h.commentCreate.mockResolvedValue({
      id: 'c1', mentions: [], createdAt: new Date(),
    })
  })

  it('caps how many handles one comment can resolve', async () => {
    // Mention resolution is not tenant-scoped — User has no tenantId and there
    // is no membership table yet — so a resolved mention confirms a handle
    // exists somewhere in the install. The cap does not close that, but it
    // stops one request resolving a dictionary of handles at a time.
    const many = Array.from({ length: 40 }, (_, i) => '@user' + i).join(' ')
    await POST(post('hello ' + many))
    expect(h.userFindMany).toHaveBeenCalled()
    expect(h.userFindMany.mock.calls[0][0].where.githubId.in.length).toBeLessThanOrEqual(10)
  })

  it('still resolves an ordinary handful of mentions', async () => {
    await POST(post('@alice @bob can you look'))
    expect(h.userFindMany.mock.calls[0][0].where.githubId.in).toEqual(['alice', 'bob'])
  })

  it('does not query at all when nobody is mentioned', async () => {
    await POST(post('no mentions here'))
    expect(h.userFindMany).not.toHaveBeenCalled()
  })

  it('writes the comment into the caller’s tenant', async () => {
    await POST(post('@alice hi'))
    expect(h.commentCreate.mock.calls[0][0].data.tenantId).toBe('tnt_internal')
  })
})
