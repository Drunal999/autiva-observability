import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getTenantContext } from '@/lib/ops/tenant'
import { rateLimit, logWriteAttempt } from '@/lib/ops/rateLimit'
import { MAX_COMMENT_LENGTH } from '@/lib/ops/safeMarkdown'

/**
 * Edit or soft-delete one comment.
 *
 * On Supabase this would be an RLS policy of `author_id = auth.uid()`. On Neon
 * the equivalent is enforced here, and — as everywhere in this codebase — the
 * ownership check is part of the WHERE clause rather than an `if` above the
 * query, so there is no window in which a wrong row could be written.
 *
 * Agent and system entries are never editable by anyone: authorId is null on
 * those rows, so the ownership predicate can never match.
 */

async function authorise(id: string) {
  const session = await getServerSession(authOptions)
  const ctx = await getTenantContext()
  const userId = (session?.user as { id?: string } | undefined)?.id
  if (!session?.user || !ctx || !userId) return null
  return { ctx, userId, id }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const auth = await authorise(params.id)
  if (!auth) return NextResponse.json({ error: 'unauthorised' }, { status: 401 })
  const { ctx, userId } = auth

  const limited = rateLimit(`comments.edit:${userId}`, 30, 60_000)
  if (!limited.ok) {
    return NextResponse.json(
      { error: 'Too many edits too quickly. Try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfter) } }
    )
  }

  let body: { body?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  const text = typeof body.body === 'string' ? body.body.trim() : ''
  if (!text) return NextResponse.json({ error: 'A comment cannot be empty.' }, { status: 400 })
  if (text.length > MAX_COMMENT_LENGTH) {
    return NextResponse.json(
      { error: `Comments are limited to ${MAX_COMMENT_LENGTH} characters.` },
      { status: 400 }
    )
  }

  // Ownership, tenancy and not-already-deleted are all in the predicate.
  const result = await prisma.comment.updateMany({
    where: { id: params.id, tenantId: ctx.tenantId, authorId: userId, deletedAt: null },
    data: { body: text, editedAt: new Date() },
  })

  if (result.count === 0) {
    logWriteAttempt({
      route: 'comments.edit', userId, tenantId: ctx.tenantId,
      subjectId: params.id, outcome: 'denied', detail: 'not author, not found, or deleted',
    })
    // Deliberately indistinguishable from "does not exist": confirming that
    // someone else's comment exists is itself a disclosure.
    return NextResponse.json({ error: 'comment not found' }, { status: 404 })
  }

  logWriteAttempt({
    route: 'comments.edit', userId, tenantId: ctx.tenantId,
    subjectId: params.id, outcome: 'allowed',
  })
  return NextResponse.json(await prisma.comment.findUnique({ where: { id: params.id } }))
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const auth = await authorise(params.id)
  if (!auth) return NextResponse.json({ error: 'unauthorised' }, { status: 401 })
  const { ctx, userId } = auth

  const limited = rateLimit(`comments.delete:${userId}`, 30, 60_000)
  if (!limited.ok) {
    return NextResponse.json(
      { error: 'Too many deletions too quickly. Try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfter) } }
    )
  }

  // Soft delete only. A thread hanging off an approval is part of the audit
  // trail, so the row survives; the body is cleared so the text is genuinely
  // gone rather than merely hidden by the UI.
  const result = await prisma.comment.updateMany({
    where: { id: params.id, tenantId: ctx.tenantId, authorId: userId, deletedAt: null },
    data: { deletedAt: new Date(), body: '', mentions: [] },
  })

  if (result.count === 0) {
    logWriteAttempt({
      route: 'comments.delete', userId, tenantId: ctx.tenantId,
      subjectId: params.id, outcome: 'denied',
    })
    return NextResponse.json({ error: 'comment not found' }, { status: 404 })
  }

  logWriteAttempt({
    route: 'comments.delete', userId, tenantId: ctx.tenantId,
    subjectId: params.id, outcome: 'allowed',
  })
  return NextResponse.json({ ok: true })
}
