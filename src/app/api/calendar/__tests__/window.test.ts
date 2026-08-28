import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  findMany: vi.fn(),
  runFindMany: vi.fn(),
  approvalFindMany: vi.fn(),
  findFirst: vi.fn(),
  updateMany: vi.fn(),
  findUnique: vi.fn(),
  getServerSession: vi.fn(),
  getTenantContext: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    calendarEvent: {
      findMany: h.findMany,
      findFirst: h.findFirst,
      updateMany: h.updateMany,
      findUnique: h.findUnique,
      deleteMany: vi.fn(),
    },
    run: { findMany: h.runFindMany },
    approval: { findMany: h.approvalFindMany },
  },
}))
vi.mock('next-auth', () => ({ getServerSession: () => h.getServerSession() }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/ops/tenant', () => ({
  getTenantContext: () => h.getTenantContext(),
  tenantScope: (c: { tenantId: string }) => ({ tenantId: c.tenantId }),
}))

import { GET } from '../route'
import { PATCH } from '../[id]/route'
import { __resetRateLimits } from '@/lib/ops/rateLimit'

function signedIn() {
  h.getServerSession.mockResolvedValue({ user: { id: 'user-1', name: 'Dev' } })
  h.getTenantContext.mockResolvedValue({
    tenantId: 'tnt_internal', slug: 'autiva', name: 'A', mode: 'internal',
  })
}

const FROM = '2026-09-10T00:00:00.000Z'
const TO = '2026-09-17T00:00:00.000Z'
const req = () => new Request(`http://localhost/api/calendar?from=${FROM}&to=${TO}`)

const row = (over: Record<string, unknown> = {}) => ({
  id: 'e1',
  kind: 'HUMAN',
  title: 'Offsite',
  startsAt: new Date('2026-09-08T09:00:00Z'),
  endsAt: new Date('2026-09-12T17:00:00Z'),
  allDay: false,
  rrule: null,
  module: null,
  ...over,
})

describe('the calendar window', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    __resetRateLimits()
    h.runFindMany.mockResolvedValue([])
    h.approvalFindMany.mockResolvedValue([])
    h.findMany.mockResolvedValue([])
  })

  it('asks the database for events that OVERLAP the window', async () => {
    // Matching on startsAt alone made an event spanning the window boundary
    // vanish — a three-day offsite disappeared from its second day onward,
    // which is exactly when someone looks it up.
    signedIn()
    await GET(req())
    const or = h.findMany.mock.calls[0][0].where.OR
    const overlap = or.find((c: Record<string, unknown>) => 'AND' in c)
    expect(overlap).toBeDefined()
    const clauses = overlap.AND as Record<string, Record<string, Date>>[]
    // Both bounds on startsAt, so the (tenantId, startsAt) index stays usable;
    // an unbounded lower end degrades into a scan of all history.
    expect(clauses.some((c) => c.startsAt?.lte?.getTime() === new Date(TO).getTime())).toBe(true)
    expect(clauses.some((c) => c.startsAt?.gte instanceof Date)).toBe(true)
    expect(clauses.some((c) => c.endsAt?.gte?.getTime() === new Date(FROM).getTime())).toBe(true)
  })

  it('returns an event that began before the window and is still running', async () => {
    signedIn()
    h.findMany.mockResolvedValue([row()])
    const body = await (await GET(req())).json()
    expect(body.items.map((i: { id: string }) => i.id)).toContain('e1')
  })

  it('returns an event that starts inside the window and ends after it', async () => {
    signedIn()
    h.findMany.mockResolvedValue([
      row({ startsAt: new Date('2026-09-16T09:00:00Z'), endsAt: new Date('2026-09-20T17:00:00Z') }),
    ])
    const body = await (await GET(req())).json()
    expect(body.items).toHaveLength(1)
  })

  it('returns an event that swallows the whole window', async () => {
    signedIn()
    h.findMany.mockResolvedValue([
      row({ startsAt: new Date('2026-08-01T00:00:00Z'), endsAt: new Date('2026-10-01T00:00:00Z') }),
    ])
    const body = await (await GET(req())).json()
    expect(body.items).toHaveLength(1)
  })

  it('still excludes an event entirely outside the window', async () => {
    signedIn()
    h.findMany.mockResolvedValue([
      row({ startsAt: new Date('2026-01-01T00:00:00Z'), endsAt: new Date('2026-01-02T00:00:00Z') }),
    ])
    const body = await (await GET(req())).json()
    expect(body.items).toHaveLength(0)
  })
})

describe('a partial reschedule', () => {
  const params = { params: { id: 'ev1' } }
  const patch = (body: unknown) =>
    new Request('http://localhost/api/calendar/ev1', { method: 'PATCH', body: JSON.stringify(body) })

  beforeEach(() => {
    vi.clearAllMocks()
    __resetRateLimits()
    h.updateMany.mockResolvedValue({ count: 1 })
    h.findUnique.mockResolvedValue({ id: 'ev1' })
    signedIn()
    h.findFirst.mockResolvedValue({
      kind: 'HUMAN',
      startsAt: new Date('2026-09-10T10:00:00Z'),
      endsAt: new Date('2026-09-10T12:00:00Z'),
    })
  })

  it('refuses an endsAt that precedes the STORED start', async () => {
    // The guard required both fields, so a PATCH carrying only endsAt wrote an
    // event that ends before it begins.
    const res = await PATCH(patch({ endsAt: '2026-09-10T08:00:00Z' }), params)
    expect(res.status).toBe(400)
    expect(h.updateMany).not.toHaveBeenCalled()
  })

  it('refuses a startsAt that follows the STORED end', async () => {
    const res = await PATCH(patch({ startsAt: '2026-09-10T18:00:00Z' }), params)
    expect(res.status).toBe(400)
    expect(h.updateMany).not.toHaveBeenCalled()
  })

  it('allows a valid single-field move', async () => {
    const res = await PATCH(patch({ endsAt: '2026-09-10T13:00:00Z' }), params)
    expect(res.status).toBe(200)
    expect(h.updateMany).toHaveBeenCalled()
  })

  it('still allows moving both ends together', async () => {
    const res = await PATCH(
      patch({ startsAt: '2026-09-11T10:00:00Z', endsAt: '2026-09-11T12:00:00Z' }),
      params
    )
    expect(res.status).toBe(200)
  })
})
