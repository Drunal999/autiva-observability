import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { getTenantContext, tenantScope } from '@/lib/ops/tenant'

const SUBJECTS = ['RUN', 'APPROVAL', 'AGENT', 'MODULE', 'TENANT'] as const
type Subject = (typeof SUBJECTS)[number]

/**
 * Comment counts AND per-thread unread for a whole screen in one request.
 *
 * A badge per card would otherwise mean one request per card — six on the
 * fleet, more on a busy approvals queue — so both numbers are fetched together
 * and looked up client-side.
 */

interface UnreadRow {
  subjectId: string
  unread: number
  mentions: number
}

export async function GET(req: Request) {
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: 'unauthorised' }, { status: 401 })

  const raw = new URL(req.url).searchParams.get('subjectType')
  const subjectType = SUBJECTS.includes(raw as Subject) ? (raw as Subject) : null
  if (!subjectType) {
    return NextResponse.json({ error: 'subjectType is required' }, { status: 400 })
  }

  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string } | undefined)?.id ?? null

  const totalRows = await prisma.comment.groupBy({
    by: ['subjectId'],
    // Deleted comments leave a tombstone in an open thread but should not
    // inflate a badge — the count is "things worth opening this for".
    where: { ...tenantScope(ctx), subjectType, deletedAt: null },
    _count: { _all: true },
  })

  const counts: Record<string, number> = {}
  for (const r of totalRows) counts[r.subjectId] = r._count._all

  // Unread needs a per-subject threshold, which no single groupBy can express:
  // the cut-off is a different instant for every thread. One LEFT JOIN against
  // the read watermarks answers it in a single round trip instead of N.
  //
  // A thread with no watermark row is entirely unread — see ThreadRead in the
  // schema for why a missing row is not treated as "read".
  const unread: Record<string, number> = {}
  const mentions: Record<string, number> = {}

  if (userId) {
    const rows = await prisma.$queryRaw<UnreadRow[]>(Prisma.sql`
      SELECT c."subjectId"                                                AS "subjectId",
             COUNT(*)::int                                                AS "unread",
             COUNT(*) FILTER (WHERE ${userId} = ANY(c."mentions"))::int   AS "mentions"
        FROM "Comment" c
        LEFT JOIN "ThreadRead" r
               ON r."tenantId"    = c."tenantId"
              AND r."subjectType" = c."subjectType"
              AND r."subjectId"   = c."subjectId"
              AND r."userId"      = ${userId}
       WHERE c."tenantId"    = ${ctx.tenantId}
         AND c."subjectType" = ${subjectType}::"SubjectType"
         AND c."deletedAt" IS NULL
         -- Your own comment is not news to you. Agent and system entries have
         -- a null author and DO count: nobody has read those yet either.
         AND (c."authorId" IS NULL OR c."authorId" <> ${userId})
         AND (r."lastReadAt" IS NULL OR c."createdAt" > r."lastReadAt")
       GROUP BY c."subjectId"
    `)
    for (const r of rows) {
      unread[r.subjectId] = Number(r.unread)
      if (Number(r.mentions) > 0) mentions[r.subjectId] = Number(r.mentions)
    }
  }

  return NextResponse.json({ counts, unread, mentions })
}
