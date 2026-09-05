import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const h = vi.hoisted(() => ({
  userFindMany: vi.fn(),
  moduleUpsert: vi.fn(),
  agentUpsert: vi.fn(),
  agentUpdate: vi.fn(),
  runUpsert: vi.fn(),
  spanDeleteMany: vi.fn(),
  spanCreateMany: vi.fn(),
  lockQuery: vi.fn(),
  transaction: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findMany: h.userFindMany },
    module: { upsert: h.moduleUpsert },
    agent: { upsert: h.agentUpsert, update: h.agentUpdate },
    run: { upsert: h.runUpsert },
    span: { deleteMany: h.spanDeleteMany, createMany: h.spanCreateMany },
    $transaction: h.transaction,
  },
}))

import { ingestSession, spanTypeForTool, MAX_STEPS, displayNameForKey } from '../ingest'
import { ingestToken } from '@/lib/ops/ingestToken'

const TENANT = 'tnt_internal'
const USERS = [
  { id: 'user-1', name: 'Devarshi', handle: 'drunal999' },
  { id: 'user-2', name: 'Aditya Mondal', handle: 'adityamondal-ai-spec' },
]

let saved: string | undefined
beforeEach(() => {
  vi.clearAllMocks()
  saved = process.env.INGEST_SECRET
  process.env.INGEST_SECRET = 'x'.repeat(40)
  h.userFindMany.mockResolvedValue(USERS)
  h.moduleUpsert.mockResolvedValue({ id: 'mod-1', key: 'marketing.seo_audit' })
  h.agentUpsert.mockResolvedValue({ id: 'agent-1', name: 'drunal999' })
  h.runUpsert.mockResolvedValue({ id: 'run-1', ref: 'cc-s1' })
  // Run the interactive callback for real, with a tx that records what the
  // transaction does — otherwise the span assertions would test the mock.
  h.transaction.mockImplementation(async (fn: unknown) => {
    if (typeof fn === 'function') {
      return (fn as (tx: unknown) => unknown)({
        $queryRaw: h.lockQuery,
        span: { deleteMany: h.spanDeleteMany, createMany: h.spanCreateMany },
      })
    }
    return []
  })
  h.agentUpdate.mockResolvedValue({})
})
afterEach(() => {
  if (saved === undefined) delete process.env.INGEST_SECRET
  else process.env.INGEST_SECRET = saved
})

const tokenFor = (userId: string) => ingestToken(TENANT, userId)

describe('reporting a Claude Code session', () => {
  it('stores a run attributed to the token holder', async () => {
    const res = await ingestSession(TENANT, tokenFor('user-2'), {
      sessionId: 's1',
      summary: 'built the ingest path',
      endedAt: new Date().toISOString(),
    })
    expect(res.status).toBe(200)
    // The token said who: the agent is Aditya's, not the first user in the list.
    expect(h.agentUpsert.mock.calls[0][0].create.name).toBe('adityamondal-ai-spec')
  })

  it('refuses a token that belongs to nobody', async () => {
    const res = await ingestSession(TENANT, 'not-a-real-token', { sessionId: 's1' })
    expect(res.status).toBe(401)
    expect(h.runUpsert).not.toHaveBeenCalled()
  })

  it('refuses a token minted for a different tenant', async () => {
    // Otherwise a token from one deployment would write into another.
    const res = await ingestSession(TENANT, ingestToken('tnt_other', 'user-1'), { sessionId: 's1' })
    expect(res.status).toBe(401)
    expect(h.runUpsert).not.toHaveBeenCalled()
  })

  it('requires a session id', async () => {
    const res = await ingestSession(TENANT, tokenFor('user-1'), {} as never)
    expect(res.status).toBe(400)
    expect(h.userFindMany).not.toHaveBeenCalled()
  })

  it('upserts on ref, so re-reporting a session updates one run', async () => {
    // A session that reports at start and again at end must become ONE run
    // going RUNNING -> SUCCESS, not two runs telling different halves.
    await ingestSession(TENANT, tokenFor('user-1'), { sessionId: 's1' })
    expect(h.runUpsert.mock.calls[0][0].where.ref).toBe('cc-s1')
  })

  it('is RUNNING while the session is still open', async () => {
    const res = await ingestSession(TENANT, tokenFor('user-1'), { sessionId: 's1' })
    expect(res.body.status).toBe('RUNNING')
    expect(h.agentUpdate.mock.calls[0][0].data.status).toBe('RUNNING')
  })

  it('is SUCCESS once it has ended, and FAILED when it says so', async () => {
    const ended = { sessionId: 's1', endedAt: new Date().toISOString() }
    expect((await ingestSession(TENANT, tokenFor('user-1'), ended)).body.status).toBe('SUCCESS')
    expect(
      (await ingestSession(TENANT, tokenFor('user-1'), { ...ended, ok: false })).body.status
    ).toBe('FAILED')
  })

  it('replaces spans rather than appending them', async () => {
    // A re-report carries the WHOLE session, so appending would double every
    // step already recorded.
    await ingestSession(TENANT, tokenFor('user-1'), {
      sessionId: 's1',
      steps: [{ tool: 'Bash', name: 'run tests' }],
    })
    expect(h.spanDeleteMany).toHaveBeenCalled()
    expect(h.spanCreateMany).toHaveBeenCalled()
  })

  it('maps Claude Code tools onto the span vocabulary already in use', () => {
    expect(spanTypeForTool('Bash')).toBe('SHELL')
    expect(spanTypeForTool('Edit')).toBe('FILE')
    expect(spanTypeForTool('Read')).toBe('FILE')
    expect(spanTypeForTool('Task')).toBe('SUBAGENT')
    // An unclassified tool is still a step that happened; dropping it would
    // silently shorten the trace.
    expect(spanTypeForTool('SomeFutureTool')).toBe('TOOL')
  })

  it('caps how many steps one report can carry', async () => {
    const steps = Array.from({ length: MAX_STEPS + 50 }, (_, i) => ({ tool: 'Bash', name: `s${i}` }))
    const res = await ingestSession(TENANT, tokenFor('user-1'), { sessionId: 's1', steps })
    expect(res.body.steps).toBe(MAX_STEPS)
  })

  it('rejects an unparseable timestamp instead of storing an invalid date', async () => {
    const res = await ingestSession(TENANT, tokenFor('user-1'), {
      sessionId: 's1',
      startedAt: 'not a time',
    })
    expect(res.status).toBe(400)
  })

  it('never stores negative tokens or cost', async () => {
    await ingestSession(TENANT, tokenFor('user-1'), {
      sessionId: 's1', tokens: -500, costInr: -12,
    })
    expect(h.runUpsert.mock.calls[0][0].create.tokens).toBe(0)
    expect(h.runUpsert.mock.calls[0][0].create.costInr).toBe(0)
  })

  it('falls back to a step count when no summary is given', async () => {
    await ingestSession(TENANT, tokenFor('user-1'), {
      sessionId: 's1',
      steps: [{ tool: 'Bash' }, { tool: 'Edit' }],
    })
    expect(h.runUpsert.mock.calls[0][0].create.summary).toBe('2 steps')
  })

  it('records the project, which is what "whose work, on what" needs', async () => {
    await ingestSession(TENANT, tokenFor('user-1'), { sessionId: 's1', project: 'autiva-web' })
    expect(h.runUpsert.mock.calls[0][0].create.project).toBe('autiva-web')
    expect(h.runUpsert.mock.calls[0][0].update.project).toBe('autiva-web')
  })

  it('keeps the project off the agent, because a person works on many', async () => {
    // An agent here is a PERSON. Hanging the project off them would make the
    // fleet claim somebody only ever works on whatever they touched last.
    await ingestSession(TENANT, tokenFor('user-1'), { sessionId: 's1', project: 'autiva-web' })
    expect(h.agentUpsert.mock.calls[0][0].create).not.toHaveProperty('project')
  })

  it('treats a blank project as none rather than an empty label', async () => {
    await ingestSession(TENANT, tokenFor('user-1'), { sessionId: 's1', project: '   ' })
    expect(h.runUpsert.mock.calls[0][0].create.project).toBeNull()
  })

  it('locks the run row before replacing spans', async () => {
    // The Stop hook fires every turn, and a reporter that stops waiting does
    // not stop the server. Two delete-then-create passes interleaved once and
    // turned three steps into six. The lock is what makes the last report win
    // whole instead of both winning half.
    await ingestSession(TENANT, tokenFor('user-1'), {
      sessionId: 's1',
      steps: [{ tool: 'Bash' }],
    })
    expect(h.transaction).toHaveBeenCalled()
    expect(h.lockQuery).toHaveBeenCalled()
    const sql = String(h.lockQuery.mock.calls[0][0])
    expect(sql).toContain('FOR UPDATE')
    // And the lock is taken BEFORE anything is deleted.
    expect(h.lockQuery.mock.invocationCallOrder[0]).toBeLessThan(
      h.spanDeleteMany.mock.invocationCallOrder[0]
    )
  })

  it('writes into the tenant it was told, never one from the payload', async () => {
    await ingestSession(TENANT, tokenFor('user-1'), {
      sessionId: 's1',
      ...({ tenantId: 'tnt_victim' } as object),
    })
    expect(h.runUpsert.mock.calls[0][0].create.tenantId).toBe(TENANT)
    expect(h.agentUpsert.mock.calls[0][0].create.tenantId).toBe(TENANT)
  })
})

/**
 * An engine's run belongs to what it RAN, not to whoever's token carried it.
 *
 * These exist because the failure they guard against is invisible: a run filed
 * under a person still returns 200, still shows in the fleet, and still leaves
 * the building dark forever. /api/city drops any run whose agent has no module.
 */
describe('reporting an engine run', () => {
  const SEO = 'marketing.seo_audit'

  it('files the run under the module, not under the token holder', async () => {
    h.agentUpsert.mockResolvedValue({ id: 'agent-seo', name: SEO })
    const res = await ingestSession(TENANT, tokenFor('user-2'), {
      sessionId: 'abc-123',
      module: SEO,
      endedAt: new Date().toISOString(),
    })
    expect(res.status).toBe(200)
    const call = h.agentUpsert.mock.calls[0][0]
    // Named for the module, because CityView resolves a live event through a
    // lowercased agent NAME and the FLEET payload carries nothing else.
    expect(call.where.tenantId_name.name).toBe(SEO)
    expect(call.create.name).toBe(SEO)
    expect(call.create.moduleId).toBe('mod-1')
    // Aditya's token was used, and Aditya is NOT what lights up.
    expect(call.create.name).not.toBe('adityamondal-ai-spec')
    expect(res.body.module).toBe(SEO)
  })

  it('adopts an agent that predates this route and carries no module', async () => {
    // Otherwise a second, unplaceable agent appears beside the first and the
    // building stays dark for reasons nobody can see.
    h.agentUpsert.mockResolvedValue({ id: 'agent-seo', name: SEO })
    await ingestSession(TENANT, tokenFor('user-1'), { sessionId: 'abc-1', module: SEO })
    expect(h.agentUpsert.mock.calls[0][0].update.moduleId).toBe('mod-1')
  })

  it('creates the module when the catalog has never seen it', async () => {
    h.agentUpsert.mockResolvedValue({ id: 'a', name: 'people.onboarding' })
    await ingestSession(TENANT, tokenFor('user-1'), {
      sessionId: 'abc-2',
      module: 'people.onboarding',
    })
    const call = h.moduleUpsert.mock.calls[0][0]
    expect(call.where.tenantId_key).toEqual({ tenantId: TENANT, key: 'people.onboarding' })
    expect(call.create.displayName).toBe('Onboarding')
    // An existing module keeps the display name it was given.
    expect(call.update).toEqual({})
  })

  it('gives an engine run its own ref prefix', async () => {
    // `cc-` means a Claude Code session and has to keep meaning that.
    h.agentUpsert.mockResolvedValue({ id: 'a', name: SEO })
    await ingestSession(TENANT, tokenFor('user-1'), { sessionId: 'abc-3', module: SEO })
    expect(h.runUpsert.mock.calls[0][0].where.ref).toBe('run-abc-3')
  })

  it('leaves a person\u2019s session exactly as it was', async () => {
    const res = await ingestSession(TENANT, tokenFor('user-2'), {
      sessionId: 's-person',
      endedAt: new Date().toISOString(),
    })
    expect(res.status).toBe(200)
    expect(h.moduleUpsert).not.toHaveBeenCalled()
    expect(h.agentUpsert.mock.calls[0][0].create.name).toBe('adityamondal-ai-spec')
    expect(h.agentUpsert.mock.calls[0][0].create.moduleId).toBeUndefined()
    expect(h.runUpsert.mock.calls[0][0].where.ref).toBe('cc-s-person')
    expect(res.body.module).toBeNull()
  })

  it('treats a blank module as no module rather than creating an empty one', async () => {
    const res = await ingestSession(TENANT, tokenFor('user-1'), {
      sessionId: 's-blank',
      module: '   ',
    })
    expect(res.status).toBe(200)
    expect(h.moduleUpsert).not.toHaveBeenCalled()
    expect(res.body.module).toBeNull()
  })

  it('normalises the key so one module cannot become two', async () => {
    h.agentUpsert.mockResolvedValue({ id: 'a', name: SEO })
    await ingestSession(TENANT, tokenFor('user-1'), {
      sessionId: 'abc-4',
      module: '  Marketing.SEO_Audit  ',
    })
    expect(h.moduleUpsert.mock.calls[0][0].where.tenantId_key.key).toBe(SEO)
  })
})

describe('naming a module nobody has catalogued', () => {
  it('reads as words, not as a key', () => {
    expect(displayNameForKey('marketing.seo_audit')).toBe('Seo Audit')
    expect(displayNameForKey('sales.follow_up_agent')).toBe('Follow Up Agent')
    expect(displayNameForKey('seo-audit')).toBe('Seo Audit')
  })

  it('never returns an empty label', () => {
    // A blank label would render as an invisible building.
    expect(displayNameForKey('marketing.')).toBe('marketing.')
    expect(displayNameForKey('___')).toBe('___')
  })
})
