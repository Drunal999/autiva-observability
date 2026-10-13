import { beforeEach, expect, it, vi } from 'vitest'
const h = vi.hoisted(() => ({ tenant: vi.fn(), users: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    tenant: { findUnique: h.tenant },
    user: { findMany: h.users },
    approval: { findMany: h.findMany, updateMany: h.updateMany },
  },
}))
import { GET } from '../route'
import { POST } from '../[id]/applied/route'
import { ingestToken } from '@/lib/ops/ingestToken'
import { __resetRateLimits } from '@/lib/ops/rateLimit'

const TENANT = 'tnt'
let token = ''
const get = (q: string, t = token) => GET(new Request(`http://x/api/ingest/approvals${q}`, { headers: t ? { Authorization: `Bearer ${t}` } : {} }))
const applied = (body: unknown, t = token) =>
  POST(new Request('http://x/api/ingest/approvals/ap1/applied', { method: 'POST', headers: { Authorization: `Bearer ${t}` }, body: JSON.stringify(body) }), { params: { id: 'ap1' } })

beforeEach(() => {
  vi.clearAllMocks(); __resetRateLimits()
  process.env.INGEST_SECRET = 'x'.repeat(40)
  token = ingestToken(TENANT, 'user-1')
  h.tenant.mockResolvedValue({ id: TENANT })
  h.users.mockResolvedValue([{ id: 'user-1' }])
  h.findMany.mockResolvedValue([{ id: 'ap1', action: 'Meta Ads: pause 1 ad', decidedAt: new Date('2026-10-13T05:00:00Z'), run: { ref: 'run-e9-abc' }, decidedBy: { name: 'Aditya' } }])
  h.updateMany.mockResolvedValue({ count: 1 })
})

it('refuses callers without a valid ingest token', async () => {
  expect((await get('?module=marketing.meta_ads', '')).status).toBe(401)
  expect((await get('?module=marketing.meta_ads', 'wrong-token-wrong-token-wrong-to')).status).toBe(401)
  expect(h.findMany).not.toHaveBeenCalled()
})

it('lists only approved, unapplied, recent approvals for the asked module, in this tenant', async () => {
  const res = await get('?module=Marketing.Meta_Ads')
  expect(res.status).toBe(200)
  expect((await res.json()).approvals).toEqual([{ id: 'ap1', action: 'Meta Ads: pause 1 ad', decidedAt: '2026-10-13T05:00:00.000Z', decidedBy: 'Aditya', runRef: 'run-e9-abc' }])
  const where = h.findMany.mock.calls[0][0].where
  expect(where).toMatchObject({ tenantId: TENANT, status: 'APPROVED', appliedAt: null, module: { key: 'marketing.meta_ads' } })
  expect(Date.now() - where.decidedAt.gte.getTime()).toBeCloseTo(3 * 864e5, -4)
  expect((await get('')).status).toBe(400)
})

it('records the outcome once, success or failure, and refuses a second report', async () => {
  expect((await applied({ ok: true, note: '3/3 applied' })).status).toBe(200)
  expect(h.updateMany.mock.calls[0][0]).toMatchObject({
    where: { id: 'ap1', tenantId: TENANT, status: 'APPROVED', appliedAt: null },
    data: { applyOk: true, applyNote: '3/3 applied' },
  })
  h.updateMany.mockResolvedValue({ count: 0 })
  expect((await applied({ ok: false, note: 'again' })).status).toBe(409)
  for (const bad of [{}, { ok: 'yes', note: 'x' }, { ok: true, note: '  ' }]) expect((await applied(bad)).status).toBe(400)
})
