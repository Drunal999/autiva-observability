import { prisma } from '@/lib/prisma'
import type { NotificationKind, SubjectType } from '@prisma/client'

/**
 * Telling the team something happened.
 *
 * Mentions already had a path here; this is the other half — the system
 * raising its hand rather than a person asking for you.
 *
 * TWO RULES SHAPE EVERYTHING BELOW, and both are about not being ignored:
 *
 *  1. Never notify somebody about their own action. Being told your own run
 *     failed, when you are sitting in the terminal watching it fail, is the
 *     kind of noise that teaches people to dismiss the badge without reading
 *     it — and then the one that mattered goes with it.
 *
 *  2. Never notify twice for the same thing. A reporter re-sends a whole
 *     session on every turn, so the same failure arrives again and again;
 *     without a guard the badge would climb all afternoon for one broken run.
 */

/** Anything raised for the whole team, rather than one named person. */
export async function notifyTeam(input: {
  tenantId: string
  kind: NotificationKind
  subjectType: SubjectType
  subjectId: string
  preview: string
  /** Whose action this was. They are not told about their own. */
  exceptUserId?: string | null
}): Promise<number> {
  const users = await prisma.user.findMany({ select: { id: true } })
  const recipients = users.filter((u) => u.id !== input.exceptUserId)
  if (recipients.length === 0) return 0

  // Already raised for this exact subject and not yet read? Then it is still on
  // screen, and saying it again adds nothing.
  const existing = await prisma.notification.findFirst({
    where: {
      tenantId: input.tenantId,
      kind: input.kind,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      readAt: null,
    },
    select: { id: true },
  })
  if (existing) return 0

  const created = await prisma.notification.createMany({
    data: recipients.map((u) => ({
      tenantId: input.tenantId,
      userId: u.id,
      kind: input.kind,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      preview: input.preview.slice(0, 140),
    })),
  })
  return created.count
}
