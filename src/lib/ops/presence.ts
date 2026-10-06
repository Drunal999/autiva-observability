/**
 * Who is online and what they are looking at.
 *
 * "CURRENT ONLY" BY DESIGN. Each person has one row, overwritten by every
 * heartbeat and deleted once it is older than the TTL, so the table holds who
 * is here now and nothing else. Presence is worthless five minutes after the
 * fact, and keeping "who was looking at what, when" would be a surveillance
 * record nobody asked for.
 *
 * It lives in the database rather than process memory so every server
 * instance sees the same roster. In memory, two people served by different
 * instances (normal on Vercel) could never see each other.
 */
import { prisma } from '../prisma'

export interface PresenceEntry {
  userId: string
  name: string
  /** Human-readable location, e.g. "run r-8f2c" or "the approvals queue". */
  viewing: string
  /** Epoch ms of the last heartbeat. */
  lastSeen: number
}

/** A client that has not checked in for this long is treated as gone. */
export const PRESENCE_TTL_MS = 45_000

/** The slice of the Prisma client presence uses; tests pass an in-memory stand-in. */
export type PresenceDb = { presence: Pick<typeof prisma.presence, 'upsert' | 'deleteMany' | 'findMany'> }

export async function heartbeat(
  input: { tenantId: string; userId: string; name: string; viewing: string },
  db: PresenceDb = prisma,
  now = Date.now(),
): Promise<PresenceEntry[]> {
  const fields = { name: input.name, viewing: input.viewing, lastSeen: new Date(now) }
  await db.presence.upsert({
    where: { tenantId_userId: { tenantId: input.tenantId, userId: input.userId } },
    create: { tenantId: input.tenantId, userId: input.userId, ...fields },
    update: fields,
  })
  return roster(input.tenantId, db, now)
}

/**
 * Roster for one tenant, sorted by name so avatars do not shuffle between
 * polls. Stale rows are deleted on the way, which is what keeps the table
 * "current only". Every query is scoped by tenant: none returns everyone.
 */
export async function roster(tenantId: string, db: PresenceDb = prisma, now = Date.now()): Promise<PresenceEntry[]> {
  await db.presence.deleteMany({ where: { tenantId, lastSeen: { lt: new Date(now - PRESENCE_TTL_MS) } } })
  const rows = await db.presence.findMany({ where: { tenantId }, orderBy: { name: 'asc' } })
  return rows.map((r) => ({ userId: r.userId, name: r.name, viewing: r.viewing, lastSeen: r.lastSeen.getTime() }))
}

/** Explicit departure, so closing a tab does not leave a ghost for 45s. */
export async function leave(tenantId: string, userId: string, db: PresenceDb = prisma): Promise<void> {
  await db.presence.deleteMany({ where: { tenantId, userId } })
}
