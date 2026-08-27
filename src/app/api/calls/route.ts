import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getTenantContext } from '@/lib/ops/tenant'
import { callRoomName, JITSI_DOMAIN } from '@/lib/ops/callRoom'
import { publishEvent } from '@/lib/realtime/bus'
import { rateLimit, logWriteAttempt } from '@/lib/ops/rateLimit'

const SUBJECTS = ['RUN', 'APPROVAL', 'AGENT', 'MODULE', 'TENANT'] as const

/**
 * Mint a room for a call about one subject.
 *
 * The room name is derived server-side and never sent up by the client — a
 * client-supplied room could be used to join someone else's call, or to make
 * this dashboard mint a link into an arbitrary room.
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  const ctx = await getTenantContext()
  const userId = (session?.user as { id?: string } | undefined)?.id

  if (!session?.user || !ctx || !userId) {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 })
  }

  // Calls are off for client tenants by default. Turning them on is a product
  // decision with support implications, not a UI toggle.
  if (ctx.mode === 'client' && process.env.ENABLE_CLIENT_CALLS !== 'true') {
    logWriteAttempt({
      route: 'calls.start', userId, tenantId: ctx.tenantId, outcome: 'denied',
      detail: 'calls disabled for client tenants',
    })
    return NextResponse.json({ error: 'Calls are not enabled for this workspace.' }, { status: 403 })
  }

  const limited = rateLimit(`calls.start:${userId}`, 10, 60_000)
  if (!limited.ok) {
    return NextResponse.json(
      { error: 'Too many call attempts. Try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfter) } }
    )
  }

  let body: { subjectType?: unknown; subjectId?: unknown } = {}
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  const subjectType = SUBJECTS.includes(body.subjectType as never)
    ? (body.subjectType as string)
    : null
  const subjectId = typeof body.subjectId === 'string' ? body.subjectId : null
  if (!subjectType || !subjectId) {
    return NextResponse.json({ error: 'subjectType and subjectId are required' }, { status: 400 })
  }

  const room = callRoomName(ctx.tenantId, subjectType, subjectId)

  // The audit trail records that a discussion happened, never its content.
  try {
    await publishEvent({
      tenantId: ctx.tenantId,
      channel: 'SYSTEM',
      type: 'call.started',
      payload: { subjectType, subjectId, startedBy: userId },
    })
  } catch {
    // Best-effort; the call itself does not depend on the log.
  }

  logWriteAttempt({
    route: 'calls.start', userId, tenantId: ctx.tenantId, subjectId, outcome: 'allowed',
  })

  return NextResponse.json({ room, domain: JITSI_DOMAIN })
}
