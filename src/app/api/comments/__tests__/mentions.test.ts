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

  it('refuses a comment that mentions more people than the cap, rather than silently dropping them', async () => {
    // Slicing was worse than refusing: the body still RENDERED the 11th
    // mention, so the author believed that person had been notified.
    const many = Array.from({ length: 40 }, (_, i) => '@user' + i).join(' ')
    const res = await POST(post('hello ' + many))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/limit/i)
    expect(h.userFindMany).not.toHaveBeenCalled()
    expect(h.commentCreate).not.toHaveBeenCalled()
  })

  it('allows a comment exactly at the cap', async () => {
    const ten = Array.from({ length: 10 }, (_, i) => '@user' + i).join(' ')
    const res = await POST(post(ten))
    expect(res.status).toBe(200)
    expect(h.userFindMany.mock.calls[0][0].where.githubId.in).toHaveLength(10)
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
