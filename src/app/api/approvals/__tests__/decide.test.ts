import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.mock factories are hoisted above ordinary const declarations, so the
// spies have to be created inside vi.hoisted() to exist by the time they run.
const h = vi.hoisted(() => ({
  updateMany: vi.fn(),
  findFirst: vi.fn(),
  findUnique: vi.fn(),
  getServerSession: vi.fn(),
  getTenantContext: vi.fn(),
}))
const { updateMany, findFirst, findUnique, getServerSession, getTenantContext } = h

vi.mock('@/lib/prisma', () => ({
  prisma: { approval: { updateMany: h.updateMany, findFirst: h.findFirst, findUnique: h.findUnique } },
}))
vi.mock('next-auth', () => ({ getServerSession: () => h.getServerSession() }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/ops/tenant', () => ({ getTenantContext: () => h.getTenantContext() }))

import { POST } from '../[id]/decide/route'
import { __resetRateLimits } from '@/lib/ops/rateLimit'

const req = (body: unknown) =>
  new Request('http://localhost/api/approvals/ap1/decide', {
    method: 'POST',
    body: JSON.stringify(body),
  })

const params = { params: { id: 'ap1' } }

function signedIn() {
  getServerSession.mockResolvedValue({ user: { id: 'user-1', name: 'Dev' } })
  getTenantContext.mockResolvedValue({ tenantId: 'tnt_internal', slug: 'autiva', name: 'A', mode: 'internal' })
}

describe('POST /api/approvals/[id]/decide', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    __resetRateLimits()
    updateMany.mockResolvedValue({ count: 1 })
    findUnique.mockResolvedValue({ id: 'ap1', status: 'APPROVED' })
  })

  it('refuses an unauthenticated caller before touching the database', async () => {
    getServerSession.mockResolvedValue(null)
    getTenantContext.mockResolvedValue(null)
    const res = await POST(req({ decision: 'APPROVED' }), params)
    expect(res.status).toBe(401)
    expect(updateMany).not.toHaveBeenCalled()
  })

  it('rejects a decision value it does not recognise', async () => {
    signedIn()
    const res = await POST(req({ decision: 'MAYBE' }), params)
    expect(res.status).toBe(400)
    expect(updateMany).not.toHaveBeenCalled()
  })

  it('requires a reason to reject', async () => {
    signedIn()
    const res = await POST(req({ decision: 'REJECTED', reason: '   ' }), params)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'A reason is required to reject.' })
    expect(updateMany).not.toHaveBeenCalled()
  })

  it('does not require a reason to approve', async () => {
    signedIn()
    const res = await POST(req({ decision: 'APPROVED' }), params)
    expect(res.status).toBe(200)
    expect(updateMany).toHaveBeenCalled()
  })

  it('scopes the write to the tenant and to rows still pending', async () => {
    signedIn()
    await POST(req({ decision: 'APPROVED' }), params)
    const where = updateMany.mock.calls[0][0].where
    expect(where.tenantId).toBe('tnt_internal')
    expect(where.status).toBe('PENDING')
    expect(where.id).toBe('ap1')
  })

  it('records who decided and when', async () => {
    signedIn()
    await POST(req({ decision: 'APPROVED' }), params)
    const data = updateMany.mock.calls[0][0].data
    expect(data.decidedById).toBe('user-1')
    expect(data.decidedAt).toBeInstanceOf(Date)
    expect(data.status).toBe('APPROVED')
  })

  it('returns 409 rather than overwriting an approval already decided', async () => {
    signedIn()
    updateMany.mockResolvedValue({ count: 0 })
    findFirst.mockResolvedValue({ status: 'APPROVED' })
    const res = await POST(req({ decision: 'REJECTED', reason: 'changed my mind' }), params)
    expect(res.status).toBe(409)
  })

  it('returns 404, not 403, for an approval in another tenant', async () => {
    signedIn()
    updateMany.mockResolvedValue({ count: 0 })
    findFirst.mockResolvedValue(null)
    const res = await POST(req({ decision: 'APPROVED' }), params)
    // 403 would confirm the id exists somewhere.
    expect(res.status).toBe(404)
  })

  it('rate-limits a caller hammering the endpoint', async () => {
    signedIn()
    let last: Response | undefined
    for (let i = 0; i < 25; i++) {
      last = await POST(req({ decision: 'APPROVED' }), params)
    }
    expect(last!.status).toBe(429)
    expect(last!.headers.get('Retry-After')).toBeTruthy()
  })

  it('caps the reason length', async () => {
    signedIn()
    const res = await POST(req({ decision: 'REJECTED', reason: 'x'.repeat(501) }), params)
    expect(res.status).toBe(400)
    expect(updateMany).not.toHaveBeenCalled()
  })
})
