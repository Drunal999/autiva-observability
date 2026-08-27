import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getTenantContext, tenantScope } from '@/lib/ops/tenant'
import { rateLimit, logWriteAttempt } from '@/lib/ops/rateLimit'
import { validateRRule, expandInWindow } from '@/lib/ops/recurrence'

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
        // A recurring event's stored startsAt may predate the window, so
        // recurring rows are always fetched and filtered after expansion.
        OR: [{ startsAt: { gte: from, lte: to } }, { rrule: { not: null } }],
      },
      include: { module: { select: { displayName: true } } },
      orderBy: { startsAt: 'asc' },
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

  const items: TimelineItem[] = []

  for (const e of events) {
    const durationMs = e.endsAt.getTime() - e.startsAt.getTime()
    const layer = e.kind === 'SCHEDULED_RUN' ? 'scheduled' : e.kind === 'DEADLINE' ? 'deadline' : 'human'

    if (!e.rrule) {
      if (e.startsAt >= from && e.startsAt <= to) {
        items.push({
          id: e.id, layer, title: e.title,
          startsAt: e.startsAt.toISOString(), endsAt: e.endsAt.toISOString(),
          allDay: e.allDay, moduleName: e.module?.displayName ?? null,
        })
      }
      continue
    }

    for (const occurrence of expandInWindow(e.rrule, e.startsAt, from, to)) {
      items.push({
        // Occurrence ids are derived, not stored — there is no row per instance.
        id: `${e.id}@${occurrence.toISOString()}`,
        layer,
        title: e.title,
        startsAt: occurrence.toISOString(),
        endsAt: new Date(occurrence.getTime() + durationMs).toISOString(),
        allDay: e.allDay,
        moduleName: e.module?.displayName ?? null,
        recurring: true,
      })
    }
  }

  // The past layer, read live. Never copied into CalendarEvent.
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

  const event = await prisma.calendarEvent.create({
    data: {
      tenantId: ctx.tenantId,
      kind: 'HUMAN',
      title,
      description: typeof body.description === 'string' ? body.description.slice(0, 2000) : null,
      startsAt,
      endsAt,
      allDay: body.allDay === true,
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
