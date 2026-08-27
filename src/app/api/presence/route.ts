import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getTenantContext } from '@/lib/ops/tenant'
import { heartbeat, roster, leave } from '@/lib/ops/presence'
import { rateLimit } from '@/lib/ops/rateLimit'

/** Current roster for the caller's tenant. Never spans tenants. */
export async function GET() {
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: 'unauthorised' }, { status: 401 })
  return NextResponse.json({ roster: roster(ctx.tenantId) })
}

/**
 * Heartbeat. The client reports what it is looking at; identity comes from the
 * session, never the body — otherwise anyone could appear as anyone.
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  const ctx = await getTenantContext()
  const userId = (session?.user as { id?: string } | undefined)?.id
  if (!session?.user || !ctx || !userId) {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 })
  }

  // Generous, because this is a 20s heartbeat — the limit exists to stop a
  // runaway loop, not to police normal use.
  const limited = rateLimit(`presence:${userId}`, 120, 60_000)
  if (!limited.ok) {
    return NextResponse.json({ error: 'too many heartbeats' }, { status: 429 })
  }

  let body: { viewing?: unknown } = {}
  try {
    body = await req.json()
  } catch {
    // A heartbeat with no body is still a heartbeat.
  }

  const viewing =
    typeof body.viewing === 'string' ? body.viewing.slice(0, 80) : 'the dashboard'

  const entries = heartbeat({
    tenantId: ctx.tenantId,
    userId,
    name: session.user.name ?? 'Someone',
    viewing,
  })

  return NextResponse.json({ roster: entries })
}

/** Explicit departure on tab close, so nobody lingers as a ghost. */
export async function DELETE() {
  const session = await getServerSession(authOptions)
  const ctx = await getTenantContext()
  const userId = (session?.user as { id?: string } | undefined)?.id
  if (!session?.user || !ctx || !userId) {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 })
  }
  leave(ctx.tenantId, userId)
  return NextResponse.json({ ok: true })
}
