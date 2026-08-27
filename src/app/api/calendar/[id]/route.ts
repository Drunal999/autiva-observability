import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getTenantContext } from '@/lib/ops/tenant'
import { rateLimit, logWriteAttempt } from '@/lib/ops/rateLimit'
import { validateRRule } from '@/lib/ops/recurrence'

/**
 * Edit or delete one calendar event.
 *
 * SCHEDULED_RUN events are READ-ONLY here, deliberately.
 *
 * The rule is that the calendar must not be a second copy of the automation
 * schedule — a `scheduled_run` should write through to the automation config.
 * Today `Flow` stores no schedule to write to, so that link cannot be made
 * cleanly. Rather than let someone edit a row that looks authoritative and
 * changes nothing about when the automation actually fires, these are refused
 * with an explanation. A silent no-op would be worse than an error.
 */

async function authorise() {
  const session = await getServerSession(authOptions)
  const ctx = await getTenantContext()
  const userId = (session?.user as { id?: string } | undefined)?.id
  if (!session?.user || !ctx || !userId) return null
  return { ctx, userId }
}

const READ_ONLY_MESSAGE =
  'Scheduled automations are managed in Automations, not here — editing this would change the calendar without changing when the automation runs.'

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const auth = await authorise()
  if (!auth) return NextResponse.json({ error: 'unauthorised' }, { status: 401 })
  const { ctx, userId } = auth

  const limited = rateLimit(`calendar.edit:${userId}`, 30, 60_000)
  if (!limited.ok) {
    return NextResponse.json(
      { error: 'Too many edits too quickly. Try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfter) } }
    )
  }

  const existing = await prisma.calendarEvent.findFirst({
    where: { id: params.id, tenantId: ctx.tenantId },
    select: { kind: true, startsAt: true },
  })
  if (!existing) return NextResponse.json({ error: 'event not found' }, { status: 404 })

  if (existing.kind === 'SCHEDULED_RUN') {
    logWriteAttempt({
      route: 'calendar.edit', userId, tenantId: ctx.tenantId,
      subjectId: params.id, outcome: 'denied', detail: 'scheduled_run is read-only',
    })
    return NextResponse.json({ error: READ_ONLY_MESSAGE }, { status: 409 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  const data: Record<string, unknown> = {}

  if (typeof body.title === 'string') {
    const title = body.title.trim()
    if (!title) return NextResponse.json({ error: 'A title is required.' }, { status: 400 })
    if (title.length > 200) {
      return NextResponse.json({ error: 'Title is limited to 200 characters.' }, { status: 400 })
    }
    data.title = title
  }

  const startsAt = typeof body.startsAt === 'string' ? new Date(body.startsAt) : null
  const endsAt = typeof body.endsAt === 'string' ? new Date(body.endsAt) : null
  if (startsAt && Number.isNaN(startsAt.getTime())) {
    return NextResponse.json({ error: 'Invalid start time.' }, { status: 400 })
  }
  if (endsAt && Number.isNaN(endsAt.getTime())) {
    return NextResponse.json({ error: 'Invalid end time.' }, { status: 400 })
  }
  if (startsAt && endsAt && endsAt < startsAt) {
    return NextResponse.json({ error: 'An event cannot end before it starts.' }, { status: 400 })
  }
  if (startsAt) data.startsAt = startsAt
  if (endsAt) data.endsAt = endsAt

  if (typeof body.rrule === 'string') {
    const rule = body.rrule.trim()
    if (rule) {
      const check = validateRRule(rule, startsAt ?? existing.startsAt)
      if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 })
      data.rrule = rule
    } else {
      data.rrule = null
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 })
  }

  // Tenancy and the read-only kind are both in the predicate, so a race
  // cannot slip an edit through after the check above.
  const result = await prisma.calendarEvent.updateMany({
    where: { id: params.id, tenantId: ctx.tenantId, kind: { not: 'SCHEDULED_RUN' } },
    data,
  })
  if (result.count === 0) return NextResponse.json({ error: 'event not found' }, { status: 404 })

  logWriteAttempt({
    route: 'calendar.edit', userId, tenantId: ctx.tenantId,
    subjectId: params.id, outcome: 'allowed',
  })
  return NextResponse.json(await prisma.calendarEvent.findUnique({ where: { id: params.id } }))
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const auth = await authorise()
  if (!auth) return NextResponse.json({ error: 'unauthorised' }, { status: 401 })
  const { ctx, userId } = auth

  const limited = rateLimit(`calendar.delete:${userId}`, 30, 60_000)
  if (!limited.ok) {
    return NextResponse.json({ error: 'Too many deletions too quickly.' }, { status: 429 })
  }

  const existing = await prisma.calendarEvent.findFirst({
    where: { id: params.id, tenantId: ctx.tenantId },
    select: { kind: true },
  })
  if (!existing) return NextResponse.json({ error: 'event not found' }, { status: 404 })
  if (existing.kind === 'SCHEDULED_RUN') {
    return NextResponse.json({ error: READ_ONLY_MESSAGE }, { status: 409 })
  }

  await prisma.calendarEvent.deleteMany({
    where: { id: params.id, tenantId: ctx.tenantId, kind: { not: 'SCHEDULED_RUN' } },
  })

  logWriteAttempt({
    route: 'calendar.delete', userId, tenantId: ctx.tenantId,
    subjectId: params.id, outcome: 'allowed',
  })
  return NextResponse.json({ ok: true })
}
