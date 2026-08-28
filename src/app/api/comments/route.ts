import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getTenantContext, tenantScope } from '@/lib/ops/tenant'
import { rateLimit, logWriteAttempt } from '@/lib/ops/rateLimit'
import { publishEvent } from '@/lib/realtime/bus'
import { extractMentions, MAX_COMMENT_LENGTH } from '@/lib/ops/safeMarkdown'
import { markThreadRead } from '@/lib/ops/threadRead'

/**
 * A comment that genuinely needs to notify more than this many people is a
 * broadcast, not a note. The cap also keeps one request from resolving a
 * dictionary of handles at a time.
 */
const MAX_MENTIONS_PER_COMMENT = 10

const SUBJECTS = ['RUN', 'APPROVAL', 'AGENT', 'MODULE', 'TENANT'] as const
type Subject = (typeof SUBJECTS)[number]

function parseSubject(v: string | null): Subject | null {
  return SUBJECTS.includes(v as Subject) ? (v as Subject) : null
}

/** One thread. Deleted comments are returned as tombstones, not omitted —
 *  a gap in a thread attached to an approval would misrepresent the record. */
export async function GET(req: Request) {
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: 'unauthorised' }, { status: 401 })

  const url = new URL(req.url)
  const subjectType = parseSubject(url.searchParams.get('subjectType'))
  const subjectId = url.searchParams.get('subjectId')
  if (!subjectType || !subjectId) {
    return NextResponse.json({ error: 'subjectType and subjectId are required' }, { status: 400 })
  }

  const comments = await prisma.comment.findMany({
    where: { ...tenantScope(ctx), subjectType, subjectId },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true, subjectType: true, subjectId: true,
      authorId: true, authorKind: true, authorName: true,
      body: true, mentions: true,
      createdAt: true, editedAt: true, deletedAt: true,
    },
  })

  return NextResponse.json(
    comments.map((c) =>
      // A deleted body never leaves the server, so a client cannot recover it
      // from a network tab.
      c.deletedAt ? { ...c, body: '', mentions: [] } : c
    )
  )
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  const ctx = await getTenantContext()
  const userId = (session?.user as { id?: string } | undefined)?.id
  const userName = session?.user?.name ?? 'Unknown'

  if (!session?.user || !ctx || !userId) {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 })
  }

  const limited = rateLimit(`comments.create:${userId}`, 30, 60_000)
  if (!limited.ok) {
    logWriteAttempt({
      route: 'comments.create', userId, tenantId: ctx.tenantId, outcome: 'rate_limited',
    })
    return NextResponse.json(
      { error: 'Too many comments too quickly. Try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfter) } }
    )
  }

  let body: { subjectType?: unknown; subjectId?: unknown; body?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  const subjectType = parseSubject(typeof body.subjectType === 'string' ? body.subjectType : null)
  const subjectId = typeof body.subjectId === 'string' ? body.subjectId : null
  const text = typeof body.body === 'string' ? body.body.trim() : ''

  if (!subjectType || !subjectId) {
    return NextResponse.json({ error: 'subjectType and subjectId are required' }, { status: 400 })
  }
  if (!text) {
    return NextResponse.json({ error: 'A comment cannot be empty.' }, { status: 400 })
  }
  if (text.length > MAX_COMMENT_LENGTH) {
    return NextResponse.json(
      { error: `Comments are limited to ${MAX_COMMENT_LENGTH} characters.` },
      { status: 400 }
    )
  }

  // MENTION RESOLUTION IS NOT TENANT-SCOPED, and the comment here used to
  // claim that it was.
  //
  // It cannot be, yet: `User` has no `tenantId` and there is no membership
  // table — the same stub `getTenantContext()` documents (ADR-002). So a
  // resolved mention confirms that a GitHub handle exists somewhere in this
  // install, which is an enumeration oracle the moment a second tenant shares
  // it.
  //
  // Two mitigations until membership lands, neither of which closes it:
  //   - the handle cap below makes bulk probing slow rather than free
  //   - resolution happens on write only, so nothing is echoed back except
  //     ids the author already guessed
  //
  // When membership exists, scope this query and delete this note.
  const allHandles = extractMentions(text)
  if (allHandles.length > MAX_MENTIONS_PER_COMMENT) {
    // Silently dropping the 11th mention is the worst outcome: the body still
    // RENDERS it as a mention, so the author believes that person was
    // notified. Every other limit in this route returns 400; so does this one.
    return NextResponse.json(
      {
        error: `That mentions ${allHandles.length} people; ${MAX_MENTIONS_PER_COMMENT} is the limit. ` +
          `Anything wider is an announcement, not a note.`,
      },
      { status: 400 }
    )
  }
  const handles = allHandles
  const mentioned = handles.length
    ? await prisma.user.findMany({
        where: { githubId: { in: handles } },
        select: { id: true },
      })
    : []

  const comment = await prisma.comment.create({
    data: {
      tenantId: ctx.tenantId,
      subjectType,
      subjectId,
      authorId: userId,
      // A person posting is always HUMAN. Agent entries are written by the
      // server elsewhere and can never be forged through this route.
      authorKind: 'HUMAN',
      authorName: userName,
      body: text,
      mentions: mentioned.map((m) => m.id),
    },
  })

  if (mentioned.length) {
    await prisma.notification.createMany({
      data: mentioned
        .filter((m) => m.id !== userId) // never notify yourself
        .map((m) => ({
          tenantId: ctx.tenantId,
          userId: m.id,
          commentId: comment.id,
          subjectType,
          subjectId,
          preview: text.slice(0, 140),
        })),
    })
  }

  logWriteAttempt({
    route: 'comments.create', userId, tenantId: ctx.tenantId,
    subjectId, outcome: 'allowed',
  })

  // Replying to a thread means you read it. Without this the author's own
  // comment would leave the thread looking unread to everyone including them,
  // because the watermark still predates what they just wrote.
  try {
    await markThreadRead({
      tenantId: ctx.tenantId, userId, subjectType, subjectId,
      upTo: comment.createdAt,
    })
  } catch {
    // The comment is committed. A stale watermark shows one extra badge; it is
    // not worth failing the write the user actually asked for.
  }

  try {
    await publishEvent({
      tenantId: ctx.tenantId,
      channel: 'COMMENTS',
      type: 'comment.created',
      payload: { subjectType, subjectId, commentId: comment.id },
    })
  } catch {
    // The comment is committed; the notification about it is best-effort.
  }

  return NextResponse.json(comment)
}
