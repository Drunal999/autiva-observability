import { beforeEach, expect, it, vi } from 'vitest'
const { mocks, ok } = vi.hoisted(() => ({ mocks: { ctx: vi.fn(), calendar: vi.fn() }, ok: (body: unknown) => async () => Response.json(body) }))
vi.mock('@/lib/ops/tenant', () => ({ getTenantContext: mocks.ctx }))
vi.mock('../../city/route', () => ({ GET: ok({ city: 1 }) }))
vi.mock('../../approvals/route', () => ({ GET: async () => { throw new Error('db down') } }))
vi.mock('../../calendar/route', () => ({ GET: mocks.calendar }))
vi.mock('../../agents/route', () => ({ GET: ok({ agents: [] }) }))
vi.mock('../../notifications/route', () => ({ GET: async () => Response.json({ error: 'unauthorised' }, { status: 401 }) }))
vi.mock('../../presence/route', () => ({ GET: ok({ roster: [] }) }))
vi.mock('../../user/prefs/route', () => ({ GET: ok({ prefs: null }) }))
vi.mock('../../team/route', () => ({ GET: ok({ members: [] }) }))
import { POST } from '../route'
import { BATCHABLE } from '@/lib/ops/swrBatch'

const call = (paths: unknown) => POST(new Request('http://localhost:3111/api/batch', { method: 'POST', headers: { cookie: 'session=abc' }, body: JSON.stringify({ paths }) }))
beforeEach(() => { vi.clearAllMocks(); mocks.ctx.mockResolvedValue({ tenantId: 't' }); mocks.calendar.mockImplementation(async (req: Request) => Response.json({ q: new URL(req.url).search, cookie: req.headers.get('cookie') })) })

it('refuses signed-out callers and malformed bodies', async () => {
  mocks.ctx.mockResolvedValue(null)
  expect((await call(['/api/city'])).status).toBe(401)
  mocks.ctx.mockResolvedValue({ tenantId: 't' })
  for (const bad of [[], 'x', [1], Array(21).fill('/api/city')]) expect((await call(bad)).status).toBe(400)
})

it('answers every client-batchable path, in order, keeping status, query and cookie', async () => {
  const { results } = await (await call(BATCHABLE.map((p) => (p === '/api/calendar' ? p + '?from=a' : p)))).json()
  expect(results.map((r: { status: number }) => r.status)).toEqual(BATCHABLE.map((p) => (p === '/api/approvals' ? 500 : p === '/api/notifications' ? 401 : 200)))
  expect(results[BATCHABLE.indexOf('/api/calendar')].body).toEqual({ q: '?from=a', cookie: 'session=abc' })
})

it('will not run anything outside the list or on another origin', async () => {
  const { results } = await (await call(['/api/tasks', 'https://evil.example/api/city', '/api/stack-status'])).json()
  expect(results.every((r: { status: number }) => r.status === 400)).toBe(true)
})
