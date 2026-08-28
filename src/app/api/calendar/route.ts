import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getTenantContext, tenantScope } from '@/lib/ops/tenant'
import { rateLimit, logWriteAttempt } from '@/lib/ops/rateLimit'
import { validateRRule, expandInWindow } from '@/lib/ops/recurrence'
import { normaliseAllDay } from '@/lib/ops/allDay'

/**
 * The timeline.
 *
 * Four layers on one axis. Human events and scheduled runs come from
 * CalendarEvent; the past layer is read LIVE from Run and merged here rather
 * than copied into the calendar table, so there is one source of truth for
 * what actually happened. Deadlines come from pending approvals for the same
 * reason.
 *
 * Everything is stored and returned in UTC. Rendering in the viewer's timezone
 * is the client's job — the server never guesses where anyone is.
 */

/**
 * How far back to look for an event that is still running.
 *
 * The overlap query needs a lower bound on `startsAt` to stay on its index; an
 * unbounded one degrades into a scan of all history. A year is far longer than
 * any real calendar entry and longer than the 400-day window cap allows to be
 * requested.
 */
const MAX_EVENT_SPAN_MS = 366 * 86400_000

export interface TimelineItem {
  id: string
  layer: 'human' | 'scheduled' | 'run' | 'deadline'
  title: string
  startsAt: string
  endsAt: string
  allDay?: boolean
  /** Present on the run layer, so a past bar can be coloured by outcome. */
  status?: string
  moduleName?: string | null
  /** True for an expanded RRULE occurrence rather than a stored row. */
  recurring?: boolean
  /**
   * Set on anything belonging to a repeating series: a computed occurrence or
   * an override row. Its presence is what tells the UI an edit needs a scope.
   */
  seriesId?: string
  /** Scheduled runs and live rows are not editable from the calendar. */
  readOnly?: boolean
  readOnlyReason?: string
  href?: string
}

export async function GET(req: Request) {
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: 'unauthorised' }, { status: 401 })

  const url = new URL(req.url)
  const from = new Date(url.searchParams.get('from') ?? Date.now() - 7 * 86400_000)
  const to = new Date(url.searchParams.get('to') ?? Date.now() + 7 * 86400_000)

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) {
    return NextResponse.json({ error: 'invalid window' }, { status: 400 })
  }
  // A window nobody could read is a cheap way to ask for a lot of work.
  if (to.getTime() - from.getTime() > 400 * 86400_000) {
    return NextResponse.json({ error: 'window is too wide (max 400 days)' }, { status: 400 })
  }

  const [events, runs, approvals] = await Promise.all([
    prisma.calendarEvent.findMany({
      where: {
        ...tenantScope(ctx),
        // OVERLAP, not "starts inside". Matching on startsAt alone made an
        // event that spans the window boundary vanish completely — a
        // three-day offsite was invisible from its second day onward, which
        // is exactly when someone looks it up.
        //
        // A recurring event's stored startsAt may predate the window entirely,
        // so recurring rows are always fetched and filtered after expansion.
        OR: [
          {
            AND: [
              // Both bounds on startsAt keep the (tenantId, startsAt) index
              // usable; endsAt has its own index for the other half. Dropping
              // the lower bound turned this into "everything that ever started
              // before `to`", which grows with history, not with the window.
              //
              // MAX_EVENT_SPAN_MS is the assumption made explicit: an event
              // longer than this that overlaps the window will be missed. The
              // API already caps a window at 400 days, so a year is generous.
              { startsAt: { gte: new Date(from.getTime() - MAX_EVENT_SPAN_MS) } },
              { startsAt: { lte: to } },
              { endsAt: { gte: from } },
            ],
          },
          { rrule: { not: null } },
        ],
      },
      include: { module: { select: { displayName: true } } },
      orderBy: { startsAt: 'asc' },
      // A window this wide is already capped at 400 days; this caps the rows.
      take: 2000,
    }),
    prisma.run.findMany({
      where: { ...tenantScope(ctx), startedAt: { gte: from, lte: to } },
      include: { agent: { select: { name: true, module: { select: { displayName: true } } } } },
      orderBy: { startedAt: 'asc' },
      take: 500,
    }),
    prisma.approval.findMany({
      where: { ...tenantScope(ctx), status: 'PENDING' },
      include: { module: { select: { displayName: true } } },
      orderBy: { requestedAt: 'asc' },
    }),
  ])

  // Overrides are fetched by PARENT, not by window.
  //
  // An occurrence that was moved out of the window still has to suppress the
  // computed occurrence it replaces, or the event would appear twice: once
  // where it was moved to, and once where it used to be.
  const seriesIds = events.filter((e) => e.rrule && !e.recurrenceParentId).map((e) => e.id)
  const overrides = seriesIds.length
    ? await prisma.calendarEvent.findMany({
        where: { ...tenantScope(ctx), recurrenceParentId: { in: seriesIds } },
        include: { module: { select: { displayName: true } } },
      })
    : []

  const overrideKey = (parentId: string, at: Date) => `${parentId}@${at.toISOString()}`
  const overridden = new Set(
    overrides.map((o) => overrideKey(o.recurrenceParentId!, o.recurrenceId!))
  )

  const items: TimelineItem[] = []

  for (const e of events) {
    // An override is a real row and is emitted from `overrides` below. Without
    // this it would also match the window query and be emitted twice.
    if (e.recurrenceParentId) continue
    const durationMs = e.endsAt.getTime() - e.startsAt.getTime()
    const layer = e.kind === 'SCHEDULED_RUN' ? 'scheduled' : e.kind === 'DEADLINE' ? 'deadline' : 'human'
    // Scheduled runs are shown but not editable: the calendar must not become
    // a second copy of the automation schedule, and Flow has nothing to write
    // through to yet.
    const readOnly = e.kind === 'SCHEDULED_RUN'
    const readOnlyReason = readOnly
      ? 'Managed in Automations — editing here would not change when it runs'
      : undefined

    if (!e.rrule) {
      // Same overlap test as the query, so a row fetched for spanning the
      // window is not then dropped here.
      if (e.startsAt <= to && e.endsAt >= from) {
        items.push({
          id: e.id, layer, title: e.title,
          startsAt: e.startsAt.toISOString(), endsAt: e.endsAt.toISOString(),
          allDay: e.allDay, moduleName: e.module?.displayName ?? null,
          readOnly, readOnlyReason,
        })
      }
      continue
    }

    const exdates = new Set(e.exdates.map((d) => d.toISOString()))

    for (const occurrence of expandInWindow(e.rrule, e.startsAt, from, to)) {
      const iso = occurrence.toISOString()
      // Deleted from the series: EXDATE holds the instants to skip, because an
      // occurrence has no row to delete.
      if (exdates.has(iso)) continue
      // Replaced by an override row, which is emitted with its own real id.
      if (overridden.has(overrideKey(e.id, occurrence))) continue

      items.push({
        // Occurrence ids are derived, not stored — there is no row per instance.
        id: `${e.id}@${iso}`,
        layer,
        title: e.title,
        startsAt: occurrence.toISOString(),
        endsAt: new Date(occurrence.getTime() + durationMs).toISOString(),
        allDay: e.allDay,
        moduleName: e.module?.displayName ?? null,
        recurring: true,
        seriesId: e.id,
        readOnly, readOnlyReason,
      })
    }
  }

  // The past layer, read live. Never copied into CalendarEvent.
  // Overrides: real rows standing in for one occurrence each. They are fully
  // editable — that is the point of promoting an occurrence to a row — and
  // still flagged as part of a series so the UI can say so.
  for (const o of overrides) {
    if (o.startsAt > to || o.endsAt < from) continue
    items.push({
      id: o.id,
      layer: o.kind === 'SCHEDULED_RUN' ? 'scheduled' : o.kind === 'DEADLINE' ? 'deadline' : 'human',
      title: o.title,
      startsAt: o.startsAt.toISOString(),
      endsAt: o.endsAt.toISOString(),
      allDay: o.allDay,
      moduleName: o.module?.displayName ?? null,
      recurring: true,
      seriesId: o.recurrenceParentId ?? undefined,
    })
  }

  for (const r of runs) {
    items.push({
      id: `run:${r.id}`,
      layer: 'run',
      title: r.summary ?? r.ref,
      startsAt: r.startedAt.toISOString(),
      endsAt: (r.endedAt ?? new Date()).toISOString(),
      status: r.status,
      moduleName: r.agent?.module?.displayName ?? null,
      href: `/trace?run=${r.ref}`,
    })
  }

  for (const a of approvals) {
    items.push({
      id: `approval:${a.id}`,
      layer: 'deadline',
      title: a.action,
      startsAt: a.requestedAt.toISOString(),
      endsAt: a.requestedAt.toISOString(),
      moduleName: a.module?.displayName ?? null,
      href: '/approvals',
    })
  }

  items.sort((x, y) => x.startsAt.localeCompare(y.startsAt))
  return NextResponse.json({ from: from.toISOString(), to: to.toISOString(), items })
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  const ctx = await getTenantContext()
  const userId = (session?.user as { id?: string } | undefined)?.id
  if (!session?.user || !ctx || !userId) {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 })
  }

  const limited = rateLimit(`calendar.create:${userId}`, 30, 60_000)
  if (!limited.ok) {
    return NextResponse.json(
      { error: 'Too many events too quickly. Try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfter) } }
    )
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  const title = typeof body.title === 'string' ? body.title.trim() : ''
  const startsAt = typeof body.startsAt === 'string' ? new Date(body.startsAt) : null
  const endsAt = typeof body.endsAt === 'string' ? new Date(body.endsAt) : null
  const rrule = typeof body.rrule === 'string' && body.rrule.trim() ? body.rrule.trim() : null

  if (!title) return NextResponse.json({ error: 'A title is required.' }, { status: 400 })
  if (title.length > 200) {
    return NextResponse.json({ error: 'Title is limited to 200 characters.' }, { status: 400 })
  }
  // A date-only all-day submission still parses as a valid Date here (as UTC
  // midnight), so this check holds for both shapes; the all-day branch below
  // re-reads the raw strings to be sure the date was stated, not inferred.
  if (!startsAt || !endsAt || Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    return NextResponse.json({ error: 'A valid start and end are required.' }, { status: 400 })
  }
  if (endsAt < startsAt) {
    return NextResponse.json({ error: 'An event cannot end before it starts.' }, { status: 400 })
  }

  if (rrule) {
    // A runaway rule is rejected at save time, not discovered when the grid
    // stops loading.
    const check = validateRRule(rrule, startsAt)
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 })
  }

  // An all-day event is a DATE, and must be submitted as one.
  //
  // The server cannot derive a date from an instant: 2026-09-14T18:30:00Z is
  // the 15th in Kolkata and the 14th in London, and nothing in the request
  // says which was meant. So the browser — the only party that knows — names
  // the date, and anything else is refused rather than guessed.
  const allDay = body.allDay === true
  let times = { startsAt, endsAt }
  if (allDay) {
    const dates = normaliseAllDay(String(body.startsAt), String(body.endsAt))
    if (!dates) {
      return NextResponse.json(
        { error: 'An all-day event needs plain dates (YYYY-MM-DD), not timestamps.' },
        { status: 400 }
      )
    }
    times = dates
  }

  const event = await prisma.calendarEvent.create({
    data: {
      tenantId: ctx.tenantId,
      kind: 'HUMAN',
      title,
      description: typeof body.description === 'string' ? body.description.slice(0, 2000) : null,
      startsAt: times.startsAt,
      endsAt: times.endsAt,
      allDay,
      rrule,
      createdById: userId,
    },
  })

  logWriteAttempt({
    route: 'calendar.create', userId, tenantId: ctx.tenantId,
    subjectId: event.id, outcome: 'allowed',
  })
  return NextResponse.json(event)
}
