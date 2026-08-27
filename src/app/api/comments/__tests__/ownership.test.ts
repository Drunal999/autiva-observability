import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  updateMany: vi.fn(),
  findUnique: vi.fn(),
  getServerSession: vi.fn(),
  getTenantContext: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: { comment: { updateMany: h.updateMany, findUnique: h.findUnique } },
}))
vi.mock('next-auth', () => ({ getServerSession: () => h.getServerSession() }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/ops/tenant', () => ({ getTenantContext: () => h.getTenantContext() }))

import { PATCH, DELETE } from '../[id]/route'
import { __resetRateLimits } from '@/lib/ops/rateLimit'

const params = { params: { id: 'c1' } }
const req = (body: unknown) =>
  new Request('http://localhost/api/comments/c1', { method: 'PATCH', body: JSON.stringify(body) })

function signedIn(userId = 'user-1') {
  h.getServerSession.mockResolvedValue({ user: { id: userId, name: 'Dev' } })
  h.getTenantContext.mockResolvedValue({
    tenantId: 'tnt_internal', slug: 'autiva', name: 'A', mode: 'internal',
  })
}

describe('comments — ownership is enforced in the WHERE clause', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    __resetRateLimits()
    h.updateMany.mockResolvedValue({ count: 1 })
    h.findUnique.mockResolvedValue({ id: 'c1', body: 'edited' })
  })

  it('scopes an edit to tenant, author and not-deleted', async () => {
    signedIn()
    await PATCH(req({ body: 'edited' }), params)
    const where = h.updateMany.mock.calls[0][0].where
    expect(where.tenantId).toBe('tnt_internal')
    expect(where.authorId).toBe('user-1')
    expect(where.deletedAt).toBeNull()
    expect(where.id).toBe('c1')
  })

  it('returns 404 — not 403 — when the comment is not yours', async () => {
    signedIn()
    h.updateMany.mockResolvedValue({ count: 0 })
    const res = await PATCH(req({ body: 'edited' }), params)
    // Confirming that someone else's comment exists is itself a disclosure.
    expect(res.status).toBe(404)
  })

  it('refuses an unauthenticated edit before touching the database', async () => {
    h.getServerSession.mockResolvedValue(null)
    h.getTenantContext.mockResolvedValue(null)
    const res = await PATCH(req({ body: 'x' }), params)
    expect(res.status).toBe(401)
    expect(h.updateMany).not.toHaveBeenCalled()
  })

  it('rejects an empty edit', async () => {
    signedIn()
    const res = await PATCH(req({ body: '   ' }), params)
    expect(res.status).toBe(400)
    expect(h.updateMany).not.toHaveBeenCalled()
  })

  it('caps the body length', async () => {
    signedIn()
    const res = await PATCH(req({ body: 'x'.repeat(2001) }), params)
    expect(res.status).toBe(400)
    expect(h.updateMany).not.toHaveBeenCalled()
  })

  it('stamps editedAt so an edit is visible in the thread', async () => {
    signedIn()
    await PATCH(req({ body: 'edited' }), params)
    expect(h.updateMany.mock.calls[0][0].data.editedAt).toBeInstanceOf(Date)
  })
})

describe('comments — delete is soft and clears the body', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    __resetRateLimits()
    h.updateMany.mockResolvedValue({ count: 1 })
  })

  it('never hard-deletes; it stamps deletedAt', async () => {
    signedIn()
    await DELETE(new Request('http://localhost', { method: 'DELETE' }), params)
    const data = h.updateMany.mock.calls[0][0].data
    expect(data.deletedAt).toBeInstanceOf(Date)
  })

  it('clears the body, so the text is gone rather than merely hidden', async () => {
    signedIn()
    await DELETE(new Request('http://localhost', { method: 'DELETE' }), params)
    const data = h.updateMany.mock.calls[0][0].data
    expect(data.body).toBe('')
    expect(data.mentions).toEqual([])
  })

  it('only deletes your own comment', async () => {
    signedIn('user-2')
    await DELETE(new Request('http://localhost', { method: 'DELETE' }), params)
    expect(h.updateMany.mock.calls[0][0].where.authorId).toBe('user-2')
  })

  it('rate-limits repeated deletions', async () => {
    signedIn()
    let last: Response | undefined
    for (let i = 0; i < 35; i++) {
      last = await DELETE(new Request('http://localhost', { method: 'DELETE' }), params)
    }
    expect(last!.status).toBe(429)
  })
})
