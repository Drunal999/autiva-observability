import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  findFirst: vi.fn(),
  updateMany: vi.fn(),
  deleteMany: vi.fn(),
  findUnique: vi.fn(),
  getServerSession: vi.fn(),
  getTenantContext: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    calendarEvent: {
      findFirst: h.findFirst,
      updateMany: h.updateMany,
      deleteMany: h.deleteMany,
      findUnique: h.findUnique,
    },
  },
}))
vi.mock('next-auth', () => ({ getServerSession: () => h.getServerSession() }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/ops/tenant', () => ({ getTenantContext: () => h.getTenantContext() }))

import { PATCH, DELETE } from '../[id]/route'
import { __resetRateLimits } from '@/lib/ops/rateLimit'

const params = { params: { id: 'ev1' } }
const patch = (body: unknown) =>
  new Request('http://localhost/api/calendar/ev1', { method: 'PATCH', body: JSON.stringify(body) })
const del = () => new Request('http://localhost/api/calendar/ev1', { method: 'DELETE' })

function signedIn() {
  h.getServerSession.mockResolvedValue({ user: { id: 'user-1', name: 'Dev' } })
  h.getTenantContext.mockResolvedValue({
    tenantId: 'tnt_internal', slug: 'autiva', name: 'A', mode: 'internal',
  })
}

describe('scheduled runs are read-only from the calendar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    __resetRateLimits()
    h.updateMany.mockResolvedValue({ count: 1 })
    h.deleteMany.mockResolvedValue({ count: 1 })
    h.findUnique.mockResolvedValue({ id: 'ev1' })
  })

  it('refuses to edit a scheduled run, and explains why', async () => {
    // Letting this through would change a row that looks authoritative while
    // changing nothing about when the automation actually fires.
    signedIn()
    h.findFirst.mockResolvedValue({ kind: 'SCHEDULED_RUN', startsAt: new Date() })
    const res = await PATCH(patch({ title: 'moved' }), params)
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/managed in automations/i)
    expect(h.updateMany).not.toHaveBeenCalled()
  })

  it('refuses to delete a scheduled run', async () => {
    signedIn()
    h.findFirst.mockResolvedValue({ kind: 'SCHEDULED_RUN' })
    const res = await DELETE(del(), params)
    expect(res.status).toBe(409)
    expect(h.deleteMany).not.toHaveBeenCalled()
  })

  it('keeps the read-only kind in the WHERE clause, so a race cannot slip through', async () => {
    signedIn()
    h.findFirst.mockResolvedValue({ kind: 'HUMAN', startsAt: new Date() })
    await PATCH(patch({ title: 'renamed' }), params)
    expect(h.updateMany.mock.calls[0][0].where.kind).toEqual({ not: 'SCHEDULED_RUN' })
  })

  it('allows editing a human event', async () => {
    signedIn()
    h.findFirst.mockResolvedValue({ kind: 'HUMAN', startsAt: new Date() })
    const res = await PATCH(patch({ title: 'renamed' }), params)
    expect(res.status).toBe(200)
    expect(h.updateMany).toHaveBeenCalled()
  })

  it('rejects an end before a start', async () => {
    signedIn()
    h.findFirst.mockResolvedValue({ kind: 'HUMAN', startsAt: new Date() })
    const res = await PATCH(
      patch({ startsAt: '2026-09-02T10:00:00Z', endsAt: '2026-09-02T09:00:00Z' }),
      params
    )
    expect(res.status).toBe(400)
    expect(h.updateMany).not.toHaveBeenCalled()
  })

  it('rejects a runaway rrule on edit, not just on create', async () => {
    signedIn()
    h.findFirst.mockResolvedValue({ kind: 'HUMAN', startsAt: new Date('2026-09-01T09:00:00Z') })
    const res = await PATCH(patch({ rrule: 'FREQ=MINUTELY' }), params)
    expect(res.status).toBe(400)
    expect(h.updateMany).not.toHaveBeenCalled()
  })

  it('scopes every write to the tenant', async () => {
    signedIn()
    h.findFirst.mockResolvedValue({ kind: 'HUMAN', startsAt: new Date() })
    await PATCH(patch({ title: 'x' }), params)
    expect(h.updateMany.mock.calls[0][0].where.tenantId).toBe('tnt_internal')
    expect(h.findFirst.mock.calls[0][0].where.tenantId).toBe('tnt_internal')
  })

  it('refuses an unauthenticated edit before touching the database', async () => {
    h.getServerSession.mockResolvedValue(null)
    h.getTenantContext.mockResolvedValue(null)
    const res = await PATCH(patch({ title: 'x' }), params)
    expect(res.status).toBe(401)
    expect(h.findFirst).not.toHaveBeenCalled()
  })
})
