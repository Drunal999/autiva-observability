import { beforeEach, expect, it, vi } from 'vitest'
const h = vi.hoisted(() => ({ session: vi.fn(), ctx: vi.fn(), create: vi.fn() }))
vi.mock('next-auth', () => ({ getServerSession: h.session }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/ops/tenant', () => ({ getTenantContext: h.ctx }))
vi.mock('@/lib/prisma', () => ({ prisma: { approval: { create: h.create } } }))
import { POST } from '../route'
import { __resetRateLimits } from '@/lib/ops/rateLimit'

const call = (body: unknown) => POST(new Request('http://x/api/setup-requests', { method: 'POST', body: JSON.stringify(body) }))
beforeEach(() => {
  vi.clearAllMocks(); __resetRateLimits()
  h.session.mockResolvedValue({ user: { id: 'u1', name: 'Asha' } })
  h.ctx.mockResolvedValue({ tenantId: 't1' })
  h.create.mockResolvedValue({ id: 'ap1' })
})

it('refuses signed-out callers and plans with unknown or no automations', async () => {
  h.session.mockResolvedValue(null)
  expect((await call({ keys: ['ca-gst-recon'] })).status).toBe(401)
  h.session.mockResolvedValue({ user: { id: 'u1' } })
  for (const bad of [{}, { keys: [] }, { keys: ['not-real'] }, { keys: [1] }]) expect((await call(bad)).status).toBe(400)
  expect(h.create).not.toHaveBeenCalled()
})

it('works out the plan from the buildings, at the launch price, and files it for the team', async () => {
  const one = await call({ keys: ['ca-gst-recon', 'ca-bank-ledger'] }) // both Finance: one building
  expect(await one.json()).toMatchObject({ plan: 'starter', priceInr: 499, buildings: 1 })
  const filed = h.create.mock.calls[0][0].data
  expect(filed).toMatchObject({ tenantId: 't1', risk: 'OTHER', amountInr: 499 })
  expect(filed.action).toMatch(/^Setup request: Finance & Billing \(Starter, ₹499\/month\)/)
  expect(filed.detail).toMatch(/Reserve \(coming soon\): GSTR-2B Reconciliation/)
  expect(filed.detail).toMatch(/nothing has been charged/)
  const two = await call({ keys: ['ca-gst-recon', 'meta-ads-optimizer'] }) // Finance + Marketing
  expect((await two.json()).plan).toBe('growth')
  expect(h.create.mock.calls[1][0].data.amountInr).toBe(1499)
})
