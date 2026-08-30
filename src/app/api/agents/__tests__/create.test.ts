import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  create: vi.fn(),
  moduleFindFirst: vi.fn(),
  getServerSession: vi.fn(),
  getTenantContext: vi.fn(),
  publishEvent: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    agent: { create: h.create, findMany: vi.fn() },
    module: { findFirst: h.moduleFindFirst },
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

const post = (body: unknown) =>
  new Request('http://localhost/api/agents', { method: 'POST', body: JSON.stringify(body) })

function signedIn() {
  h.getServerSession.mockResolvedValue({ user: { id: 'user-1', name: 'Dev' } })
  h.getTenantContext.mockResolvedValue({
    tenantId: 'tnt_internal', slug: 'autiva', name: 'A', mode: 'internal',
  })
}

const VALID = { name: 'nightly-crawler', model: 'claude-sonnet-5' }

beforeEach(() => {
  vi.clearAllMocks()
  __resetRateLimits()
  signedIn()
  h.create.mockResolvedValue({ id: 'a1', name: 'nightly-crawler' })
  h.moduleFindFirst.mockResolvedValue({ id: 'mod-1' })
})

describe('adding an agent to the fleet', () => {
  it('creates one in the caller’s tenant', async () => {
    const res = await POST(post(VALID))
    expect(res.status).toBe(201)
    const data = h.create.mock.calls[0][0].data
    expect(data.tenantId).toBe('tnt_internal')
    expect(data.name).toBe('nightly-crawler')
    expect(data.status).toBe('IDLE')
  })

  it('never takes the tenant from the request body', async () => {
    await POST(post({ ...VALID, tenantId: 'tnt_victim' }))
    expect(h.create.mock.calls[0][0].data.tenantId).toBe('tnt_internal')
  })

  it('lowercases the codename, so two casings are not two agents', async () => {
    await POST(post({ ...VALID, name: '  Nightly-Crawler  ' }))
    expect(h.create.mock.calls[0][0].data.name).toBe('nightly-crawler')
  })

  it('refuses a codename that would not survive a URL or a log line', async () => {
    for (const bad of ['Nightly Crawler', '-leading', '9lives', 'has_underscore', 'trailing space ']) {
      h.create.mockClear()
      const res = await POST(post({ ...VALID, name: bad }))
      expect(res.status, bad).toBe(400)
      expect(h.create).not.toHaveBeenCalled()
    }
  })

  it('accepts a one-character codename, which the rule allows', async () => {
    // The pattern said {1,39} after the leading letter, i.e. a minimum of two
    // characters, while the message described only the character set. A name
    // that satisfied the stated rule was rejected without saying why.
    const res = await POST(post({ ...VALID, name: 'x' }))
    expect(res.status).toBe(201)
  })

  it('requires a codename at all', async () => {
    const res = await POST(post({ model: 'claude-sonnet-5' }))
    expect(res.status).toBe(400)
  })

  it('refuses a model the fleet does not run, and says which it does', async () => {
    // Free text here becomes a typo farm, and a run against a model that does
    // not exist fails at the worst moment rather than at creation.
    const res = await POST(post({ ...VALID, model: 'gpt-9' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/claude-sonnet-5/)
    expect(h.create).not.toHaveBeenCalled()
  })

  it('resolves an engine by key, scoped to the tenant', async () => {
    await POST(post({ ...VALID, moduleKey: 'seo-audit' }))
    const where = h.moduleFindFirst.mock.calls[0][0].where
    expect(where.key).toBe('seo-audit')
    expect(where.tenantId).toBe('tnt_internal')
    expect(h.create.mock.calls[0][0].data.moduleId).toBe('mod-1')
  })

  it('refuses an engine that is not this tenant’s', async () => {
    // Otherwise an agent could be attached to someone else's engine and read
    // its latency target.
    h.moduleFindFirst.mockResolvedValue(null)
    const res = await POST(post({ ...VALID, moduleKey: 'someone-elses' }))
    expect(res.status).toBe(400)
    expect(h.create).not.toHaveBeenCalled()
  })

  it('allows an agent with no engine at all', async () => {
    const res = await POST(post(VALID))
    expect(res.status).toBe(201)
    expect(h.moduleFindFirst).not.toHaveBeenCalled()
    expect(h.create.mock.calls[0][0].data.moduleId).toBeNull()
  })

  it('reports a duplicate codename as a conflict, not a crash', async () => {
    // The unique index is the arbiter: checking first would leave a window
    // between the check and the write.
    h.create.mockRejectedValue(Object.assign(new Error('dup'), { code: 'P2002' }))
    const res = await POST(post(VALID))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/already in this fleet/i)
  })

  it('still surfaces a real database failure', async () => {
    h.create.mockRejectedValue(Object.assign(new Error('down'), { code: 'P1001' }))
    await expect(POST(post(VALID))).rejects.toThrow('down')
  })

  it('announces the new agent on the fleet channel', async () => {
    await POST(post(VALID))
    expect(h.publishEvent.mock.calls[0][0].channel).toBe('FLEET')
  })

  it('still returns the agent when announcing it fails', async () => {
    // The row is committed; the broadcast is best-effort.
    h.publishEvent.mockRejectedValue(new Error('bus down'))
    const res = await POST(post(VALID))
    expect(res.status).toBe(201)
  })

  it('refuses an unauthenticated create before touching the database', async () => {
    h.getServerSession.mockResolvedValue(null)
    h.getTenantContext.mockResolvedValue(null)
    const res = await POST(post(VALID))
    expect(res.status).toBe(401)
    expect(h.create).not.toHaveBeenCalled()
  })

  it('rejects a malformed body', async () => {
    const bad = new Request('http://localhost/api/agents', { method: 'POST', body: '{oops' })
    expect((await POST(bad)).status).toBe(400)
  })

  it('rate limits a runaway caller', async () => {
    for (let i = 0; i < 20; i++) await POST(post({ ...VALID, name: `agent-${i}` }))
    const res = await POST(post({ ...VALID, name: 'one-too-many' }))
    expect(res.status).toBe(429)
  })
})
