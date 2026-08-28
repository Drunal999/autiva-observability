import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getTenantContext } from '@/lib/ops/tenant'
import { rateLimit } from '@/lib/ops/rateLimit'
import { markThreadRead, type ThreadSubject } from '@/lib/ops/threadRead'

const SUBJECTS = ['RUN', 'APPROVAL', 'AGENT', 'MODULE', 'TENANT'] as const

/**
 * Marks one thread read up to a given comment timestamp.
 *
 * Called when a thread is actually opened and rendered — not on hover and not
 * on page load. A badge that clears because a card scrolled past is worse than
 * no badge, because it silently loses the thing it was there to point at.
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  const ctx = await getTenantContext()
  const userId = (session?.user as { id?: string } | undefined)?.id
  if (!session?.user || !ctx || !userId) {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 })
  }

  // Generous: opening threads is a normal, fast activity. This exists to stop a
  // loop, not to ration ordinary reading.
  const limited = rateLimit(`comments.read:${userId}`, 240, 60_000)
  if (!limited.ok) {
    return NextResponse.json(
      { error: 'Too many requests.' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfter) } }
    )
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  const subjectType = SUBJECTS.includes(body.subjectType as ThreadSubject)
    ? (body.subjectType as ThreadSubject)
    : null
  const subjectId = typeof body.subjectId === 'string' ? body.subjectId : ''
  if (!subjectType || !subjectId) {
    return NextResponse.json({ error: 'subjectType and subjectId are required' }, { status: 400 })
  }

  const upTo = typeof body.upTo === 'string' ? new Date(body.upTo) : undefined
  await markThreadRead({ tenantId: ctx.tenantId, userId, subjectType, subjectId, upTo })

  return NextResponse.json({ ok: true })
}
