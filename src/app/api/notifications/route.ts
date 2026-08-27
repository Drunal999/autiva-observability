import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getTenantContext, tenantScope } from '@/lib/ops/tenant'
import { rateLimit } from '@/lib/ops/rateLimit'

/** Unread mentions for the signed-in user. Scoped to the user, not just the tenant. */
export async function GET() {
  const session = await getServerSession(authOptions)
  const ctx = await getTenantContext()
  const userId = (session?.user as { id?: string } | undefined)?.id
  if (!session?.user || !ctx || !userId) {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 })
  }

  const unread = await prisma.notification.findMany({
    // Both scopes: a notification belongs to one user AND one tenant.
    where: { ...tenantScope(ctx), userId, readAt: null },
    orderBy: { createdAt: 'desc' },
    take: 30,
  })

  return NextResponse.json({ unread })
}

/** Mark notifications read. Only ever your own. */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  const ctx = await getTenantContext()
  const userId = (session?.user as { id?: string } | undefined)?.id
  if (!session?.user || !ctx || !userId) {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 })
  }

  const limited = rateLimit(`notifications.read:${userId}`, 60, 60_000)
  if (!limited.ok) {
    return NextResponse.json({ error: 'too many requests' }, { status: 429 })
  }

  let body: { ids?: unknown } = {}
  try {
    body = await req.json()
  } catch {
    // No body means "mark everything read".
  }

  const ids = Array.isArray(body.ids) ? body.ids.filter((i): i is string => typeof i === 'string') : null

  // userId is in the predicate, so one user can never clear another's badge.
  const result = await prisma.notification.updateMany({
    where: {
      ...tenantScope(ctx),
      userId,
      readAt: null,
      ...(ids && ids.length ? { id: { in: ids } } : {}),
    },
    data: { readAt: new Date() },
  })

  return NextResponse.json({ marked: result.count })
}
