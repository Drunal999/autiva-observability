import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getTenantContext, tenantScope } from '@/lib/ops/tenant'
import { rateLimit, logWriteAttempt } from '@/lib/ops/rateLimit'
import { publishEvent } from '@/lib/realtime/bus'
import {
  summariseChat,
  isChatAgentConfigured,
  AGENT_NAME,
  CHAT_AGENT_MODEL,
} from '@/lib/ops/chatAgent'

const ROOM = { subjectType: 'TENANT' as const, subjectId: 'team' }

/** How many earlier summaries the agent is given as memory. */
const MEMORY_DEPTH = 3

/**
 * Summarises today's chat and posts it back into the room.
 *
 * The result is a normal message with `authorKind: AGENT`, so it renders with
 * the AGENT label and tint the room already applies. An entry that looked
 * human but was written by a model is how bad decisions get made — the
 * distinction is stored, not styled in afterwards.
 *
 * GET reports whether the agent is switched on, so the button can say "not
 * configured" instead of failing when pressed.
 */
export async function GET() {
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: 'unauthorised' }, { status: 401 })
  return NextResponse.json({ configured: isChatAgentConfigured(), model: CHAT_AGENT_MODEL })
}

export async function POST() {
  const session = await getServerSession(authOptions)
  const ctx = await getTenantContext()
  const userId = (session?.user as { id?: string } | undefined)?.id
  if (!session?.user || !ctx || !userId) {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 })
  }

  // Tighter than the other limits, because this one spends money. Six a
  // minute is plenty for a button somebody presses when they get back.
  const limited = rateLimit(`chat.summary:${ctx.tenantId}`, 6, 60_000)
  if (!limited.ok) {
    return NextResponse.json(
      { error: 'That has been summarised a few times just now. Give it a minute.' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfter) } }
    )
  }

  if (!isChatAgentConfigured()) {
    // 503, not 500: nothing is broken, a capability is switched off.
    return NextResponse.json(
      {
        error:
          'The room agent is not configured. Set ANTHROPIC_API_KEY to switch it on — ' +
          'it is billed per use, separately from any Claude subscription.',
        configured: false,
      },
      { status: 503 }
    )
  }

  const since = new Date()
  since.setHours(0, 0, 0, 0)

  const todays = await prisma.comment.findMany({
    where: { ...tenantScope(ctx), ...ROOM, deletedAt: null, createdAt: { gte: since } },
    orderBy: { createdAt: 'asc' },
    select: { authorName: true, authorKind: true, body: true, createdAt: true },
  })

  // The agent's own summaries are excluded from the input. Feeding them back in
  // would have it summarising its own summary, which drifts further from what
  // anybody actually said with every pass.
  const lines = todays
    .filter((c) => c.authorKind === 'HUMAN')
    .map((c) => ({ author: c.authorName, at: c.createdAt.toISOString(), body: c.body }))

  if (lines.length === 0) {
    return NextResponse.json(
      { error: 'Nobody has said anything today, so there is nothing to summarise.' },
      { status: 400 }
    )
  }

  // Memory: earlier summaries, oldest first, so it builds on them rather than
  // repeating them. This is continuity we supply, not learning the model does.
  const prior = await prisma.comment.findMany({
    where: { ...tenantScope(ctx), ...ROOM, authorKind: 'AGENT', deletedAt: null },
    orderBy: { createdAt: 'desc' },
    take: MEMORY_DEPTH,
    select: { body: true },
  })

  const result = await summariseChat(lines, prior.map((p) => p.body).reverse())
  if (!result.ok || !result.text) {
    return NextResponse.json({ error: result.error ?? 'The agent could not summarise.' }, { status: 502 })
  }

  const comment = await prisma.comment.create({
    data: {
      tenantId: ctx.tenantId,
      ...ROOM,
      authorId: null,
      authorKind: 'AGENT',
      authorName: AGENT_NAME,
      body: result.text,
    },
  })

  logWriteAttempt({
    route: 'chat.summary', userId, tenantId: ctx.tenantId,
    subjectId: comment.id, outcome: 'allowed',
  })

  try {
    await publishEvent({
      tenantId: ctx.tenantId,
      channel: 'COMMENTS',
      type: 'chat.summary',
      payload: { id: comment.id },
    })
  } catch {
    // The summary is posted; announcing it is best-effort.
  }

  return NextResponse.json({
    id: comment.id,
    messages: lines.length,
    // Surfaced so the cost of pressing this is visible rather than hidden.
    usage: result.usage,
  })
}
