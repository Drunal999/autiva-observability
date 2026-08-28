import { prisma } from '@/lib/prisma'
import { verifyIcsToken, buildIcs } from '@/lib/ops/ics'
import { logWriteAttempt } from '@/lib/ops/rateLimit'

/**
 * Subscribable ICS feed.
 *
 * Deliberately NOT behind the session: a calendar client fetches this
 * unattended, with no cookie. The token in the query string is the entire
 * credential, which is why it is a keyed digest compared in constant time —
 * and why every fetch is logged. See lib/ops/ics.ts and ADR-005.
 */
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const tenantId = url.searchParams.get('t') ?? ''
  const userId = url.searchParams.get('u') ?? ''
  const token = url.searchParams.get('k') ?? ''

  if (!tenantId || !userId || !token || !verifyIcsToken(tenantId, userId, token)) {
    // Rule 7: log the attempt whether or not it succeeded. A feed URL is a
    // password, so failed fetches are worth seeing.
    logWriteAttempt({
      route: 'calendar.feed', userId: userId || 'anonymous',
      tenantId: tenantId || 'unknown', outcome: 'denied', detail: 'bad or missing feed token',
    })
    return new Response('Not found', { status: 404 })
  }

  const [tenant, events] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
    prisma.calendarEvent.findMany({
      where: { tenantId },
      orderBy: { startsAt: 'asc' },
      take: 1000,
    }),
  ])

  if (!tenant) return new Response('Not found', { status: 404 })

  logWriteAttempt({
    route: 'calendar.feed', userId, tenantId, outcome: 'allowed',
    detail: `${events.length} events`,
  })

  const ics = buildIcs(
    events.map((e) => ({
      uid: e.id,
      title: e.title,
      startsAt: e.startsAt,
      endsAt: e.endsAt,
      allDay: e.allDay,
      description: e.description,
      rrule: e.rrule,
    })),
    `${tenant.name} — Autiva`
  )

  return new Response(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="autiva.ics"',
      // A token in a URL must never be cached by an intermediary.
      'Cache-Control': 'private, no-store',
    },
  })
}
