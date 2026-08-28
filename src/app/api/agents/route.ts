import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { statusOrder } from '@/lib/ops/status'
import { getTenantContext, tenantScope } from '@/lib/ops/tenant'
import { rateLimit, logWriteAttempt } from '@/lib/ops/rateLimit'
import { publishEvent } from '@/lib/realtime/bus'
import {
  AGENT_MODELS,
  MAX_AGENT_NAME,
  isAgentModel,
  isValidAgentName,
} from '@/lib/ops/agentModels'

// Fleet sorts failed → running → awaiting_approval → success → idle so anything
// on fire reaches the operator first. Postgres has no enum ordering that
// matches, so the sort is applied here — but the ordering itself lives in the
// shared status module, not duplicated in this file.
export async function GET() {
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: 'unauthorised' }, { status: 401 })

  const agents = await prisma.agent.findMany({
    where: { ...tenantScope(ctx) },
    include: { module: { select: { key: true, displayName: true, targetMs: true } } },
    orderBy: { name: 'asc' },
  })
  agents.sort((a, b) => statusOrder(a.status) - statusOrder(b.status))

  // Mode is decided server-side from the tenant, never sent up by the client.
  return NextResponse.json({ mode: ctx.mode, agents })
}


/**
 * Adds an agent to the fleet.
 *
 * Agents were seed-only until now: the table had no create path at all, from
 * the API or the UI, so a teammate could watch the fleet but never add to it.
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  const ctx = await getTenantContext()
  const userId = (session?.user as { id?: string } | undefined)?.id
  if (!session?.user || !ctx || !userId) {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 })
  }

  const limited = rateLimit(`agents.create:${userId}`, 20, 60_000)
  if (!limited.ok) {
    return NextResponse.json(
      { error: 'Too many agents too quickly. Try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfter) } }
    )
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  const name = typeof body.name === 'string' ? body.name.trim().toLowerCase() : ''
  if (!name) {
    return NextResponse.json({ error: 'An agent needs a codename.' }, { status: 400 })
  }
  if (!isValidAgentName(name)) {
    return NextResponse.json(
      {
        error:
          `"${name.slice(0, MAX_AGENT_NAME)}" will not do. Codenames are lowercase ` +
          'letters, numbers and hyphens, starting with a letter — they end up in ' +
          'URLs and log lines.',
      },
      { status: 400 }
    )
  }

  const model = typeof body.model === 'string' ? body.model : ''
  if (!isAgentModel(model)) {
    return NextResponse.json(
      { error: `Pick a model the fleet runs: ${AGENT_MODELS.join(', ')}.` },
      { status: 400 }
    )
  }

  // An engine is optional, and is named by its KEY rather than its row id: the
  // key is what the client already holds and what a person recognises, and
  // resolving it here keeps internal ids off the wire.
  //
  // Scoped to THIS tenant, so a caller cannot attach their agent to someone
  // else's engine and read its latency target.
  let moduleId: string | null = null
  const moduleKey = typeof body.moduleKey === 'string' ? body.moduleKey.trim() : ''
  if (moduleKey) {
    const found = await prisma.module.findFirst({
      where: { key: moduleKey, ...tenantScope(ctx) },
      select: { id: true },
    })
    if (!found) return NextResponse.json({ error: 'unknown engine' }, { status: 400 })
    moduleId = found.id
  }

  // The unique index on (tenantId, name) is the arbiter, so two people adding
  // the same codename at once cannot both succeed. Checking first would leave
  // a window between the check and the write.
  let agent
  try {
    agent = await prisma.agent.create({
      data: { tenantId: ctx.tenantId, name, model, moduleId, status: 'IDLE' },
      include: { module: { select: { key: true, displayName: true, targetMs: true } } },
    })
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') {
      return NextResponse.json(
        { error: `An agent called "${name}" is already in this fleet.` },
        { status: 409 }
      )
    }
    throw err
  }

  logWriteAttempt({
    route: 'agents.create', userId, tenantId: ctx.tenantId,
    subjectId: agent.id, outcome: 'allowed',
  })

  try {
    await publishEvent({
      tenantId: ctx.tenantId,
      channel: 'FLEET',
      type: 'agent.created',
      payload: { id: agent.id, name: agent.name },
    })
  } catch {
    // The agent exists; announcing it is best-effort.
  }

  return NextResponse.json(agent, { status: 201 })
}
