import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { INTERNAL_TENANT_SLUG } from '@/lib/ops/tenant'
import { rateLimit } from '@/lib/ops/rateLimit'
import { publishEvent } from '@/lib/realtime/bus'
import { ingestSession, type SessionReport } from '../../runs/ingest'

/**
 * WHY THIS LIVES OUTSIDE /api/runs.
 *
 * The session middleware matches `/api/runs/:path*`, so a reporter posting
 * there is redirected to the sign-in page and its report silently becomes an
 * HTML login form. This endpoint authenticates with a per-person BEARER TOKEN
 * instead of a cookie, because it is called from a laptop with no browser
 * session — so it sits on a path the matcher does not cover, exactly as
 * `/api/calendar/feed` already does for calendar clients.
 *
 * Being outside the matcher means it has no session safety net: every check
 * below is the only thing standing between the caller and the database.
 */

/**
 * Reports a Claude Code session into the shared dashboard.
 *
 * Authenticated by a per-person bearer token, NOT a session cookie: the
 * reporter runs on a laptop, outside any browser. The token also says who the
 * session belongs to — see src/lib/ops/ingestToken.ts for why a single shared
 * secret would not have been enough.
 *
 * The tenant is resolved from the server's own configuration, never from the
 * request. A caller-supplied tenant would be an escalation vector, and this is
 * the one endpoint in the app that writes without a session behind it.
 */
export async function POST(req: Request) {
  const auth = req.headers.get('Authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length).trim() : ''
  if (!token) {
    return NextResponse.json({ error: 'a bearer ingest token is required' }, { status: 401 })
  }

  const limited = rateLimit(`runs.ingest:${token.slice(0, 8)}`, 120, 60_000)
  if (!limited.ok) {
    return NextResponse.json(
      { error: 'Too many reports too quickly.' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfter) } }
    )
  }

  let body: SessionReport
  try {
    body = (await req.json()) as SessionReport
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  const tenant = await prisma.tenant.findUnique({
    where: { slug: INTERNAL_TENANT_SLUG },
    select: { id: true },
  })
  if (!tenant) return NextResponse.json({ error: 'no tenant configured' }, { status: 500 })

  const result = await ingestSession(tenant.id, token, body)

  if (result.status === 200) {
    try {
      await publishEvent({
        tenantId: tenant.id,
        channel: 'FLEET',
        type: 'run.reported',
        payload: { ref: result.body.ref, agent: result.body.agent, status: result.body.status },
      })
    } catch {
      // The run is stored; announcing it is best-effort.
    }
  }

  return NextResponse.json(result.body, { status: result.status })
}
