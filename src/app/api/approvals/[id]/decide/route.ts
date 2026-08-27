import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getTenantContext } from '@/lib/ops/tenant'
import { rateLimit, logWriteAttempt } from '@/lib/ops/rateLimit'
import { publishEvent } from '@/lib/realtime/bus'

/**
 * Decide an approval. This is the one route where a mistake costs money, so
 * it is deliberately strict:
 *
 *   - The client never writes to `approvals`. It calls here, and permission is
 *     re-checked server-side rather than trusted from the caller.
 *   - The tenant comes from the session, never the request. An approval in
 *     another tenant is 404, not 403 — a 403 would confirm the id exists.
 *   - The update is conditional on status still being PENDING, so a
 *     double-click, a retry or a replayed request cannot overwrite a decision
 *     that has already been made. Losing that race returns 409.
 *   - Rejecting requires a reason. A rejection nobody can explain later is not
 *     an audit trail.
 *   - Every attempt is logged, allowed or not.
 */

const MAX_REASON = 500

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  const ctx = await getTenantContext()
  const userId = (session?.user as { id?: string } | undefined)?.id

  if (!session?.user || !ctx || !userId) {
    logWriteAttempt({
      route: 'approvals.decide', userId: userId ?? 'anonymous',
      tenantId: ctx?.tenantId ?? 'unknown', subjectId: params.id, outcome: 'denied',
      detail: 'no session',
    })
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 })
  }

  const limited = rateLimit(`approvals.decide:${userId}`, 20, 60_000)
  if (!limited.ok) {
    logWriteAttempt({
      route: 'approvals.decide', userId, tenantId: ctx.tenantId,
      subjectId: params.id, outcome: 'rate_limited',
    })
    return NextResponse.json(
      { error: 'Too many decisions too quickly. Try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfter) } }
    )
  }

  let body: { decision?: unknown; reason?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  const decision = body.decision === 'APPROVED' || body.decision === 'REJECTED' ? body.decision : null
  if (!decision) {
    logWriteAttempt({
      route: 'approvals.decide', userId, tenantId: ctx.tenantId,
      subjectId: params.id, outcome: 'invalid', detail: 'bad decision value',
    })
    return NextResponse.json({ error: 'decision must be APPROVED or REJECTED' }, { status: 400 })
  }

  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
  if (decision === 'REJECTED' && !reason) {
    logWriteAttempt({
      route: 'approvals.decide', userId, tenantId: ctx.tenantId,
      subjectId: params.id, outcome: 'invalid', detail: 'reject without reason',
    })
    return NextResponse.json({ error: 'A reason is required to reject.' }, { status: 400 })
  }
  if (reason.length > MAX_REASON) {
    return NextResponse.json(
      { error: `Reason must be ${MAX_REASON} characters or fewer.` },
      { status: 400 }
    )
  }

  // Conditional update: scoped to the tenant AND still pending. updateMany
  // returns a count rather than throwing, which is what lets us tell "not
  // yours / does not exist" apart from "already decided".
  const result = await prisma.approval.updateMany({
    where: { id: params.id, tenantId: ctx.tenantId, status: 'PENDING' },
    data: {
      status: decision,
      decidedById: userId,
      decidedAt: new Date(),
      reason: reason || null,
    },
  })

  if (result.count === 0) {
    const exists = await prisma.approval.findFirst({
      where: { id: params.id, tenantId: ctx.tenantId },
      select: { status: true },
    })

    if (!exists) {
      logWriteAttempt({
        route: 'approvals.decide', userId, tenantId: ctx.tenantId,
        subjectId: params.id, outcome: 'not_found',
      })
      return NextResponse.json({ error: 'approval not found' }, { status: 404 })
    }

    logWriteAttempt({
      route: 'approvals.decide', userId, tenantId: ctx.tenantId,
      subjectId: params.id, outcome: 'conflict', detail: `already ${exists.status}`,
    })
    return NextResponse.json(
      { error: `This was already ${exists.status.toLowerCase()}.`, status: exists.status },
      { status: 409 }
    )
  }

  logWriteAttempt({
    route: 'approvals.decide', userId, tenantId: ctx.tenantId,
    subjectId: params.id, outcome: 'allowed', detail: decision,
  })

  // Announce on the shared stream so every open dashboard drops the row from
  // its queue without polling. Failure here must not undo a decision that is
  // already committed — the decision is the source of truth, the event is a
  // notification about it.
  try {
    await publishEvent({
      tenantId: ctx.tenantId,
      channel: 'APPROVALS',
      type: decision === 'APPROVED' ? 'approval.approved' : 'approval.rejected',
      payload: { id: params.id, decidedBy: userId },
    })
  } catch {
    // Swallowed deliberately: the write succeeded, and clients still refresh
    // on their poll interval.
  }

  const updated = await prisma.approval.findUnique({
    where: { id: params.id },
    include: {
      module: { select: { key: true, displayName: true } },
      run: { select: { ref: true, agent: { select: { name: true } } } },
      decidedBy: { select: { name: true } },
    },
  })
  return NextResponse.json(updated)
}
