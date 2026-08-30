import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const h = vi.hoisted(() => ({
  userFindMany: vi.fn(),
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
    agent: { upsert: h.agentUpsert, update: h.agentUpdate },
    run: { upsert: h.runUpsert },
    span: { deleteMany: h.spanDeleteMany, createMany: h.spanCreateMany },
    $transaction: h.transaction,
  },
}))

import { ingestSession, spanTypeForTool, MAX_STEPS } from '../ingest'
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
