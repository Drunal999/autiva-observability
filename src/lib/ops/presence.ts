/**
 * Who is online and what they are looking at.
 *
 * EPHEMERAL BY DESIGN. This never touches the database. Presence is worthless
 * five minutes after the fact, and persisting "who was looking at what, when"
 * would create a surveillance record nobody asked for and everybody would have
 * to reason about in a privacy review. It lives in process memory and dies
 * with the process.
 *
 * CAVEAT, same as the bus and the rate limiter: on multiple instances each
 * container sees only its own connections, so the roster is partial rather
 * than wrong. Presence degrades gracefully in a way a queue or a limit does
 * not, which is why it is acceptable here and not there.
 */

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

// tenantId -> userId -> entry. Tenant is the outer key so a lookup can never
// accidentally span tenants: there is no query that returns everyone.
const byTenant = new Map<string, Map<string, PresenceEntry>>()

function fresh(entries: Map<string, PresenceEntry>, now: number) {
  entries.forEach((e, k) => {
    if (now - e.lastSeen > PRESENCE_TTL_MS) entries.delete(k)
  })
}

export function heartbeat(input: {
  tenantId: string
  userId: string
  name: string
  viewing: string
}): PresenceEntry[] {
  const now = Date.now()
  let entries = byTenant.get(input.tenantId)
  if (!entries) {
    entries = new Map()
    byTenant.set(input.tenantId, entries)
  }

  entries.set(input.userId, {
    userId: input.userId,
    name: input.name,
    viewing: input.viewing,
    lastSeen: now,
  })

  fresh(entries, now)
  const out: PresenceEntry[] = []
  entries.forEach((e) => out.push(e))
  return out
}

/** Roster for one tenant, expired entries already dropped. */
export function roster(tenantId: string): PresenceEntry[] {
  const entries = byTenant.get(tenantId)
  if (!entries) return []
  fresh(entries, Date.now())
  const out: PresenceEntry[] = []
  entries.forEach((e) => out.push(e))
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

/** Explicit departure, so closing a tab does not leave a ghost for 45s. */
export function leave(tenantId: string, userId: string): void {
  byTenant.get(tenantId)?.delete(userId)
}

/** Test seam. */
export function __resetPresence(): void {
  byTenant.clear()
}
