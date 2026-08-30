import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  findFirst: vi.fn(),
  updateMany: vi.fn(),
  deleteMany: vi.fn(),
  findMany: vi.fn(),
  update: vi.fn(),
  upsert: vi.fn(),
  findUnique: vi.fn(),
  transaction: vi.fn(),
  getServerSession: vi.fn(),
  getTenantContext: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    calendarEvent: {
      findFirst: h.findFirst,
      findMany: h.findMany,
      updateMany: h.updateMany,
      deleteMany: h.deleteMany,
      update: h.update,
      upsert: h.upsert,
      findUnique: h.findUnique,
    },
    $transaction: h.transaction,
  },
}))
vi.mock('next-auth', () => ({ getServerSession: () => h.getServerSession() }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/ops/tenant', () => ({
  getTenantContext: () => h.getTenantContext(),
  tenantScope: (c: { tenantId: string }) => ({ tenantId: c.tenantId }),
}))

import { PATCH, DELETE } from '../[id]/route'
import { __resetRateLimits } from '@/lib/ops/rateLimit'

const SERIES_ID = 'evt_series'
const AT = '2026-09-15T09:30:00.000Z'
const OCC = `${SERIES_ID}@${AT}`

const patch = (body: unknown, id = OCC) =>
  new Request(`http://localhost/api/calendar/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
const del = (qs = '', id = OCC) =>
  new Request(`http://localhost/api/calendar/${id}${qs}`, { method: 'DELETE' })
const params = (id = OCC) => ({ params: { id } })

const SERIES = {
  id: SERIES_ID,
  kind: 'HUMAN',
  title: 'Standup',
  description: null,
  rrule: 'FREQ=WEEKLY;BYDAY=TU',
  startsAt: new Date('2026-09-01T09:30:00Z'),
  endsAt: new Date('2026-09-01T09:45:00Z'),
  allDay: false,
  moduleId: null,
  exdates: [] as Date[],
}

function signedIn() {
  h.getServerSession.mockResolvedValue({ user: { id: 'user-1', name: 'Dev' } })
  h.getTenantContext.mockResolvedValue({
    tenantId: 'tnt_internal', slug: 'autiva', name: 'A', mode: 'internal',
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  __resetRateLimits()
  signedIn()
  h.findFirst.mockResolvedValue(SERIES)
  h.upsert.mockResolvedValue({ id: 'override-1' })
  h.updateMany.mockResolvedValue({ count: 1 })
  h.deleteMany.mockResolvedValue({ count: 1 })
  // The series branch now writes through a transaction so the anchor move and
  // the exdate/override shifts land together.
  h.transaction.mockImplementation(async () => [{ count: 1 }])
  h.findMany.mockResolvedValue([])
})

describe('editing one occurrence of a repeating event', () => {
  it('refuses to act without a scope, and says why', async () => {
    // The gesture is genuinely ambiguous: "just this week" and "it is
    // Wednesdays now" are both plausible readings of the same drag.
    const res = await PATCH(patch({ startsAt: '2026-09-16T09:30:00.000Z' }), params())
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.needsScope).toBe(true)
    expect(h.upsert).not.toHaveBeenCalled()
    expect(h.updateMany).not.toHaveBeenCalled()
  })

  it('creates an override row for scope: occurrence', async () => {
    await PATCH(
      patch({ startsAt: '2026-09-16T09:30:00.000Z', scope: 'occurrence' }),
      params()
    )
    const call = h.upsert.mock.calls[0][0]
    expect(call.create.recurrenceParentId).toBe(SERIES_ID)
    // RECURRENCE-ID is the ORIGINAL instant, not the moved one — that is what
    // lets expansion know which computed occurrence to suppress.
    expect(call.create.recurrenceId.toISOString()).toBe(AT)
    expect(call.create.startsAt.toISOString()).toBe('2026-09-16T09:30:00.000Z')
  })

  it('gives the override the series duration when only the start moved', async () => {
    await PATCH(
      patch({ startsAt: '2026-09-16T14:00:00.000Z', scope: 'occurrence' }),
      params()
    )
    const call = h.upsert.mock.calls[0][0]
    // The series runs 15 minutes; a move must not silently resize it.
    expect(call.create.endsAt.toISOString()).toBe('2026-09-16T14:15:00.000Z')
  })

  it('upserts on (parent, recurrenceId), so a double submit cannot split one occurrence in two', async () => {
    await PATCH(patch({ startsAt: '2026-09-16T09:30:00.000Z', scope: 'occurrence' }), params())
    const where = h.upsert.mock.calls[0][0].where.recurrenceParentId_recurrenceId
    expect(where.recurrenceParentId).toBe(SERIES_ID)
    expect(where.recurrenceId.toISOString()).toBe(AT)
  })

  it('moves the series ANCHOR by the drag delta for scope: series', async () => {
    // Not onto the dragged date: "every Tuesday" must become "every
    // Wednesday", not "once, on 16 September".
    await PATCH(patch({ startsAt: '2026-09-16T09:30:00.000Z', scope: 'series' }), params())
    const data = h.updateMany.mock.calls[0][0].data
    expect(data.startsAt.toISOString()).toBe('2026-09-02T09:30:00.000Z')
    expect(data.endsAt.toISOString()).toBe('2026-09-02T09:45:00.000Z')
    expect(h.upsert).not.toHaveBeenCalled()
    expect(h.transaction).toHaveBeenCalled()
  })

  it('refuses a scheduled run, series or occurrence', async () => {
    h.findFirst.mockResolvedValue({ ...SERIES, kind: 'SCHEDULED_RUN' })
    const res = await PATCH(patch({ scope: 'occurrence', startsAt: '2026-09-16T09:30:00.000Z' }), params())
    expect(res.status).toBe(409)
    expect(h.upsert).not.toHaveBeenCalled()
  })

  it('refuses when the parent does not actually repeat', async () => {
    h.findFirst.mockResolvedValue({ ...SERIES, rrule: null })
    const res = await PATCH(patch({ scope: 'occurrence', startsAt: '2026-09-16T09:30:00.000Z' }), params())
    expect(res.status).toBe(400)
  })

  it('404s a series in another tenant rather than confirming it exists', async () => {
    h.findFirst.mockResolvedValue(null)
    const res = await PATCH(patch({ scope: 'occurrence', startsAt: '2026-09-16T09:30:00.000Z' }), params())
    expect(res.status).toBe(404)
  })

  it('scopes the series lookup to the caller’s tenant', async () => {
    await PATCH(patch({ scope: 'occurrence', startsAt: '2026-09-16T09:30:00.000Z' }), params())
    expect(h.findFirst.mock.calls[0][0].where.tenantId).toBe('tnt_internal')
  })
})

describe('deleting one occurrence of a repeating event', () => {
  it('refuses to act without a scope', async () => {
    const res = await DELETE(del(), params())
    expect(res.status).toBe(409)
    expect((await res.json()).needsScope).toBe(true)
    expect(h.transaction).not.toHaveBeenCalled()
  })

  it('adds an EXDATE rather than deleting a row', async () => {
    // There is no row for an occurrence; it is computed. EXDATE is how RFC
    // 5545 removes one.
    const res = await DELETE(del('?scope=occurrence'), params())
    expect(res.status).toBe(200)
    expect(h.transaction).toHaveBeenCalled()
    expect(h.update).toHaveBeenCalled()
    expect(h.update.mock.calls[0][0].data.exdates.push.toISOString()).toBe(AT)
  })

  it('also removes any override for that instant', async () => {
    // Otherwise the occurrence just "deleted" would still appear, as the row
    // that had replaced it.
    await DELETE(del('?scope=occurrence'), params())
    const call = h.deleteMany.mock.calls.find(
      (c) => c[0]?.where?.recurrenceParentId === SERIES_ID
    )
    expect(call).toBeDefined()
    expect(call![0].where.recurrenceId.toISOString()).toBe(AT)
  })

  it('does not push a duplicate EXDATE for an instant already excluded', async () => {
    // The array is expanded on every read; excluding twice must not grow it.
    h.findFirst.mockResolvedValue({ ...SERIES, exdates: [new Date(AT)] })
    await DELETE(del('?scope=occurrence'), params())
    expect(h.update).not.toHaveBeenCalled()
  })

  it('deletes the whole series for scope: series', async () => {
    const res = await DELETE(del('?scope=series'), params())
    expect(res.status).toBe(200)
    expect((await res.json()).scope).toBe('series')
    expect(h.deleteMany.mock.calls[0][0].where.id).toBe(SERIES_ID)
  })

  it('refuses to delete a scheduled run', async () => {
    h.findFirst.mockResolvedValue({ ...SERIES, kind: 'SCHEDULED_RUN' })
    const res = await DELETE(del('?scope=series'), params())
    expect(res.status).toBe(409)
  })

  it('leaves an ordinary event id on the plain delete path', async () => {
    h.findFirst.mockResolvedValue({ kind: 'HUMAN' })
    const res = await DELETE(del('', 'evt_plain'), params('evt_plain'))
    expect(res.status).toBe(200)
    expect(h.transaction).not.toHaveBeenCalled()
  })
})
