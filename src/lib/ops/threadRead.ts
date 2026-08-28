import { prisma } from '@/lib/prisma'

export type ThreadSubject = 'RUN' | 'APPROVAL' | 'AGENT' | 'MODULE' | 'TENANT'

/**
 * Moves a user's read watermark forward on one thread.
 *
 * Two rules make this safe to call from anywhere:
 *
 *  1. The watermark only ever moves FORWARD. Opening a stale view of a thread
 *     must not un-read comments you have already seen, so an older `upTo` is
 *     discarded rather than written.
 *
 *  2. `upTo` is clamped to now. It is client-supplied — the client sends the
 *     timestamp of the newest comment it actually rendered, so a comment that
 *     lands mid-render stays unread — and an unclamped future value would mark
 *     every comment read forever.
 *
 * The create-after-update shape is deliberate: the unique constraint turns a
 * concurrent first-open in two tabs into a caught duplicate rather than two
 * rows.
 */
export async function markThreadRead(args: {
  tenantId: string
  userId: string
  subjectType: ThreadSubject
  subjectId: string
  upTo?: Date
}): Promise<void> {
  const now = new Date()
  const upTo = args.upTo && !Number.isNaN(args.upTo.getTime()) && args.upTo < now ? args.upTo : now

  const moved = await prisma.threadRead.updateMany({
    where: {
      tenantId: args.tenantId,
      userId: args.userId,
      subjectType: args.subjectType,
      subjectId: args.subjectId,
      lastReadAt: { lt: upTo },
    },
    data: { lastReadAt: upTo },
  })
  if (moved.count > 0) return

  try {
    await prisma.threadRead.create({
      data: {
        tenantId: args.tenantId,
        userId: args.userId,
        subjectType: args.subjectType,
        subjectId: args.subjectId,
        lastReadAt: upTo,
      },
    })
  } catch (err) {
    // P2002: a row already exists and its watermark was not older than `upTo`,
    // so there is nothing to move. Any other failure is real.
    if ((err as { code?: string }).code !== 'P2002') throw err
  }
}
