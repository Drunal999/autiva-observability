import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getTenantContext, tenantScope } from '@/lib/ops/tenant'

const SUBJECTS = ['RUN', 'APPROVAL', 'AGENT', 'MODULE', 'TENANT'] as const
type Subject = (typeof SUBJECTS)[number]

/**
 * Comment counts for a whole screen in one request.
 *
 * A badge per card would otherwise mean one request per card — six on the
 * fleet, more on a busy approvals queue — so the counts are fetched together
 * and looked up client-side.
 */
export async function GET(req: Request) {
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: 'unauthorised' }, { status: 401 })

  const raw = new URL(req.url).searchParams.get('subjectType')
  const subjectType = SUBJECTS.includes(raw as Subject) ? (raw as Subject) : null
  if (!subjectType) {
    return NextResponse.json({ error: 'subjectType is required' }, { status: 400 })
  }

  const rows = await prisma.comment.groupBy({
    by: ['subjectId'],
    // Deleted comments leave a tombstone in an open thread but should not
    // inflate a badge — the count is "things worth opening this for".
    where: { ...tenantScope(ctx), subjectType, deletedAt: null },
    _count: { _all: true },
  })

  const counts: Record<string, number> = {}
  for (const r of rows) counts[r.subjectId] = r._count._all
  return NextResponse.json({ counts })
}
