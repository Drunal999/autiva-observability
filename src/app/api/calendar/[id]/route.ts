import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getTenantContext } from '@/lib/ops/tenant'
import { rateLimit, logWriteAttempt } from '@/lib/ops/rateLimit'
import { validateRRule } from '@/lib/ops/recurrence'
import { normaliseAllDay, toDateOnlyUtc } from '@/lib/ops/allDay'
import { parseOccurrenceId, parseScope, shiftedEnd } from '@/lib/ops/occurrence'

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

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  // One occurrence of a repeating event. It has no row yet, so this either
  // promotes it to one (scope: occurrence) or edits the whole series.
  const occurrence = parseOccurrenceId(params.id)
  if (occurrence) {
    return patchOccurrence(occurrence, body, ctx, userId)
  }

  const existing = await prisma.calendarEvent.findFirst({
    where: { id: params.id, tenantId: ctx.tenantId },
    select: { kind: true, startsAt: true, endsAt: true, allDay: true },
  })
  if (!existing) return NextResponse.json({ error: 'event not found' }, { status: 404 })

  if (existing.kind === 'SCHEDULED_RUN') {
    logWriteAttempt({
      route: 'calendar.edit', userId, tenantId: ctx.tenantId,
      subjectId: params.id, outcome: 'denied', detail: 'scheduled_run is read-only',
    })
    return NextResponse.json({ error: READ_ONLY_MESSAGE }, { status: 409 })
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
  // Compare against what the row WILL hold, not only against what this request
  // happened to send. Requiring both fields let a PATCH carrying just `endsAt`
  // write an event that ends before it begins.
  // An all-day row keeps the date contract on edit too. Accepting an instant
  // here would quietly reintroduce the ambiguity the create path refuses:
  // the drag that rescheduled it happened in a browser whose timezone the
  // server does not know.
  const staysAllDay = body.allDay === undefined ? existing.allDay : body.allDay === true
  if (staysAllDay && (body.startsAt !== undefined || body.endsAt !== undefined)) {
    const dates = normaliseAllDay(
      String(body.startsAt ?? toDateOnlyUtc(existing.startsAt)),
      String(body.endsAt ?? toDateOnlyUtc(existing.endsAt))
    )
    if (!dates) {
      return NextResponse.json(
        { error: 'An all-day event needs plain dates (YYYY-MM-DD), not timestamps.' },
        { status: 400 }
      )
    }
    data.startsAt = dates.startsAt
    data.endsAt = dates.endsAt
  }

  const finalStart = startsAt ?? existing.startsAt
  const finalEnd = endsAt ?? existing.endsAt
  if (finalEnd < finalStart) {
    return NextResponse.json({ error: 'An event cannot end before it starts.' }, { status: 400 })
  }
  if (!staysAllDay) {
    if (startsAt) data.startsAt = startsAt
    if (endsAt) data.endsAt = endsAt
  }

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

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const auth = await authorise()
  if (!auth) return NextResponse.json({ error: 'unauthorised' }, { status: 401 })
  const { ctx, userId } = auth

  const limited = rateLimit(`calendar.delete:${userId}`, 30, 60_000)
  if (!limited.ok) {
    return NextResponse.json({ error: 'Too many deletions too quickly.' }, { status: 429 })
  }

  // Deleting ONE occurrence deletes no row, because an occurrence has none.
  // The scope arrives as a query parameter: DELETE has no body in fetch, and
  // sending one is not reliably transported.
  const occurrence = parseOccurrenceId(params.id)
  if (occurrence) {
    return deleteOccurrence(occurrence, new URL(req.url).searchParams.get('scope'), ctx, userId)
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

/**
 * Edits one occurrence of a repeating event.
 *
 * `scope: 'occurrence'` promotes it to a real row (an RFC 5545 override) that
 * replaces the computed one; `scope: 'series'` edits the underlying event and
 * every occurrence with it.
 *
 * The scope is required rather than inferred. Dragging one instance of a
 * weekly meeting could mean "just this week" or "it's Wednesdays now", and the
 * two produce very different calendars for everyone else. Guessing would be
 * wrong half the time and silently so.
 */
async function patchOccurrence(
  occurrence: { seriesId: string; occurrenceAt: Date },
  body: Record<string, unknown>,
  ctx: { tenantId: string },
  userId: string
) {
  const scope = parseScope(body.scope)
  if (!scope) {
    return NextResponse.json(
      {
        error:
          'This is one occurrence of a repeating event. Say whether to change ' +
          'just this one or the whole series.',
        needsScope: true,
      },
      { status: 409 }
    )
  }

  const series = await prisma.calendarEvent.findFirst({
    where: { id: occurrence.seriesId, tenantId: ctx.tenantId },
  })
  if (!series) return NextResponse.json({ error: 'event not found' }, { status: 404 })
  if (series.kind === 'SCHEDULED_RUN') {
    return NextResponse.json({ error: READ_ONLY_MESSAGE }, { status: 409 })
  }
  if (!series.rrule) {
    return NextResponse.json({ error: 'that event does not repeat' }, { status: 400 })
  }

  // Editing the series is an ordinary update of the row that owns the rule.
  if (scope === 'series') {
    const data: Record<string, unknown> = {}
    if (typeof body.title === 'string' && body.title.trim()) data.title = body.title.trim()

    if (typeof body.startsAt === 'string') {
      const nextStart = new Date(body.startsAt)
      if (Number.isNaN(nextStart.getTime())) {
        return NextResponse.json({ error: 'Invalid start time.' }, { status: 400 })
      }
      // Moving the series moves its anchor by the same delta the occurrence
      // moved, so "every Tuesday" becomes "every Wednesday" rather than
      // collapsing onto the single date that was dragged.
      const deltaMs = nextStart.getTime() - occurrence.occurrenceAt.getTime()
      data.startsAt = new Date(series.startsAt.getTime() + deltaMs)
      data.endsAt = new Date(series.endsAt.getTime() + deltaMs)
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'nothing to change' }, { status: 400 })
    }

    const result = await prisma.calendarEvent.updateMany({
      where: { id: series.id, tenantId: ctx.tenantId, kind: { not: 'SCHEDULED_RUN' } },
      data,
    })
    if (result.count === 0) return NextResponse.json({ error: 'event not found' }, { status: 404 })

    logWriteAttempt({
      route: 'calendar.series.edit', userId, tenantId: ctx.tenantId,
      subjectId: series.id, outcome: 'allowed',
    })
    return NextResponse.json({ id: series.id, scope: 'series' })
  }

  // One occurrence: create or update the override row standing in for it.
  const start =
    typeof body.startsAt === 'string' ? new Date(body.startsAt) : occurrence.occurrenceAt
  if (Number.isNaN(start.getTime())) {
    return NextResponse.json({ error: 'Invalid start time.' }, { status: 400 })
  }
  const end =
    typeof body.endsAt === 'string'
      ? new Date(body.endsAt)
      : shiftedEnd(series.startsAt, series.endsAt, start)
  if (Number.isNaN(end.getTime()) || end < start) {
    return NextResponse.json({ error: 'An event cannot end before it starts.' }, { status: 400 })
  }

  const title = typeof body.title === 'string' && body.title.trim()
    ? body.title.trim()
    : series.title

  // The unique index on (recurrenceParentId, recurrenceId) is what makes this
  // idempotent: a double submit updates the same override rather than
  // splitting one occurrence into two events.
  const override = await prisma.calendarEvent.upsert({
    where: {
      recurrenceParentId_recurrenceId: {
        recurrenceParentId: series.id,
        recurrenceId: occurrence.occurrenceAt,
      },
    },
    create: {
      tenantId: ctx.tenantId,
      kind: series.kind,
      title,
      description: series.description,
      startsAt: start,
      endsAt: end,
      allDay: series.allDay,
      moduleId: series.moduleId,
      createdById: userId,
      recurrenceParentId: series.id,
      recurrenceId: occurrence.occurrenceAt,
    },
    update: { title, startsAt: start, endsAt: end },
  })

  logWriteAttempt({
    route: 'calendar.occurrence.edit', userId, tenantId: ctx.tenantId,
    subjectId: override.id, outcome: 'allowed',
  })
  return NextResponse.json({ ...override, scope: 'occurrence' })
}

/**
 * Removes one occurrence of a repeating event, or the whole series.
 *
 * A single occurrence cannot be deleted, because there is no row to delete —
 * it is computed from the rule. RFC 5545's answer is EXDATE: the series
 * records the instants to skip when expanding. Any override standing in for
 * that occurrence goes too, or the "deleted" event would reappear as the row
 * that replaced it.
 */
async function deleteOccurrence(
  occurrence: { seriesId: string; occurrenceAt: Date },
  rawScope: string | null,
  ctx: { tenantId: string },
  userId: string
) {
  const scope = parseScope(rawScope)
  if (!scope) {
    return NextResponse.json(
      {
        error:
          'This is one occurrence of a repeating event. Say whether to remove ' +
          'just this one or the whole series.',
        needsScope: true,
      },
      { status: 409 }
    )
  }

  const series = await prisma.calendarEvent.findFirst({
    where: { id: occurrence.seriesId, tenantId: ctx.tenantId },
    select: { id: true, kind: true, rrule: true, exdates: true },
  })
  if (!series) return NextResponse.json({ error: 'event not found' }, { status: 404 })
  if (series.kind === 'SCHEDULED_RUN') {
    return NextResponse.json({ error: READ_ONLY_MESSAGE }, { status: 409 })
  }

  if (scope === 'series') {
    // Overrides cascade with the parent, so the whole series goes at once.
    await prisma.calendarEvent.deleteMany({
      where: { id: series.id, tenantId: ctx.tenantId, kind: { not: 'SCHEDULED_RUN' } },
    })
    logWriteAttempt({
      route: 'calendar.series.delete', userId, tenantId: ctx.tenantId,
      subjectId: series.id, outcome: 'allowed',
    })
    return NextResponse.json({ ok: true, scope: 'series' })
  }

  const iso = occurrence.occurrenceAt.toISOString()
  const already = series.exdates.some((d) => d.toISOString() === iso)

  await prisma.$transaction([
    // Idempotent: excluding the same instant twice must not grow the array,
    // which is expanded on every read.
    ...(already
      ? []
      : [
          prisma.calendarEvent.update({
            where: { id: series.id },
            data: { exdates: { push: occurrence.occurrenceAt } },
          }),
        ]),
    // An override for this instant must go too, or the occurrence just
    // "deleted" would still appear as the row that replaced it.
    prisma.calendarEvent.deleteMany({
      where: {
        tenantId: ctx.tenantId,
        recurrenceParentId: series.id,
        recurrenceId: occurrence.occurrenceAt,
      },
    }),
  ])

  logWriteAttempt({
    route: 'calendar.occurrence.delete', userId, tenantId: ctx.tenantId,
    subjectId: `${series.id}@${iso}`, outcome: 'allowed',
  })
  return NextResponse.json({ ok: true, scope: 'occurrence' })
}
