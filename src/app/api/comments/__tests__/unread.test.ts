import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  groupBy: vi.fn(),
  queryRaw: vi.fn(),
  updateMany: vi.fn(),
  create: vi.fn(),
  getServerSession: vi.fn(),
  getTenantContext: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    comment: { groupBy: h.groupBy },
    threadRead: { updateMany: h.updateMany, create: h.create },
    $queryRaw: h.queryRaw,
  },
}))
vi.mock('next-auth', () => ({ getServerSession: () => h.getServerSession() }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/ops/tenant', () => ({
  getTenantContext: () => h.getTenantContext(),
  tenantScope: (c: { tenantId: string }) => ({ tenantId: c.tenantId }),
}))

import { GET as counts } from '../counts/route'
import { POST as markRead } from '../read/route'
import { __resetRateLimits } from '@/lib/ops/rateLimit'

function signedIn(userId: string | null = 'user-1') {
  h.getServerSession.mockResolvedValue(userId ? { user: { id: userId, name: 'Dev' } } : null)
  h.getTenantContext.mockResolvedValue({
    tenantId: 'tnt_internal', slug: 'autiva', name: 'A', mode: 'internal',
  })
}

const countsReq = (t = 'AGENT') => new Request(`http://localhost/api/comments/counts?subjectType=${t}`)
const readReq = (body: unknown) =>
  new Request('http://localhost/api/comments/read', { method: 'POST', body: JSON.stringify(body) })

describe('per-thread unread', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    __resetRateLimits()
    h.groupBy.mockResolvedValue([{ subjectId: 'a1', _count: { _all: 4 } }])
    h.queryRaw.mockResolvedValue([])
    h.updateMany.mockResolvedValue({ count: 1 })
  })

  it('returns totals and unread from a single request, not one per card', async () => {
    signedIn()
    h.queryRaw.mockResolvedValue([{ subjectId: 'a1', unread: 2, mentions: 0 }])
    const body = await (await counts(countsReq())).json()
    expect(body.counts.a1).toBe(4)
    expect(body.unread.a1).toBe(2)
    expect(h.groupBy).toHaveBeenCalledTimes(1)
    expect(h.queryRaw).toHaveBeenCalledTimes(1)
  })

  it('separates a mention from ordinary new activity', async () => {
    signedIn()
    h.queryRaw.mockResolvedValue([
      { subjectId: 'a1', unread: 3, mentions: 1 },
      { subjectId: 'a2', unread: 2, mentions: 0 },
    ])
    const body = await (await counts(countsReq())).json()
    expect(body.mentions.a1).toBe(1)
    // A thread with no mention must not appear in the mention map at all,
    // or every card would render the stronger badge.
    expect(body.mentions.a2).toBeUndefined()
  })

  it('reports no unread rather than failing when the session carries no user id', async () => {
    h.getServerSession.mockResolvedValue({ user: { name: 'Dev' } })
    h.getTenantContext.mockResolvedValue({
      tenantId: 'tnt_internal', slug: 'autiva', name: 'A', mode: 'internal',
    })
    const res = await counts(countsReq())
    expect(res.status).toBe(200)
    expect((await res.json()).unread).toEqual({})
    expect(h.queryRaw).not.toHaveBeenCalled()
  })

  it('refuses an unrecognised subject type', async () => {
    signedIn()
    const res = await counts(countsReq('DROP_TABLE'))
    expect(res.status).toBe(400)
    expect(h.groupBy).not.toHaveBeenCalled()
  })

  it('refuses an unauthenticated read of the counts', async () => {
    h.getTenantContext.mockResolvedValue(null)
    expect((await counts(countsReq())).status).toBe(401)
  })
})

describe('marking a thread read', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    __resetRateLimits()
    h.updateMany.mockResolvedValue({ count: 1 })
  })

  it('moves the watermark for the signed-in user in their own tenant', async () => {
    signedIn()
    const res = await markRead(readReq({ subjectType: 'RUN', subjectId: 'run-9' }))
    expect(res.status).toBe(200)
    const where = h.updateMany.mock.calls[0][0].where
    expect(where.userId).toBe('user-1')
    expect(where.tenantId).toBe('tnt_internal')
  })

  it('never takes a tenant from the request body', async () => {
    signedIn()
    await markRead(readReq({ subjectType: 'RUN', subjectId: 'run-9', tenantId: 'tnt_victim' }))
    expect(h.updateMany.mock.calls[0][0].where.tenantId).toBe('tnt_internal')
  })

  it('refuses an unknown subject type before touching the database', async () => {
    signedIn()
    const res = await markRead(readReq({ subjectType: 'WALLET', subjectId: 'x' }))
    expect(res.status).toBe(400)
    expect(h.updateMany).not.toHaveBeenCalled()
  })

  it('requires a subject id', async () => {
    signedIn()
    expect((await markRead(readReq({ subjectType: 'RUN' }))).status).toBe(400)
  })

  it('refuses an unauthenticated mark-read', async () => {
    h.getServerSession.mockResolvedValue(null)
    h.getTenantContext.mockResolvedValue(null)
    expect((await markRead(readReq({ subjectType: 'RUN', subjectId: 'r' }))).status).toBe(401)
    expect(h.updateMany).not.toHaveBeenCalled()
  })

  it('rejects a malformed body', async () => {
    signedIn()
    const bad = new Request('http://localhost/api/comments/read', { method: 'POST', body: '{oops' })
    expect((await markRead(bad)).status).toBe(400)
  })
})
