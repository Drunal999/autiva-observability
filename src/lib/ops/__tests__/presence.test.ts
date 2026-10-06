import { describe, it, expect, beforeEach } from 'vitest'
import { heartbeat, roster, leave, PRESENCE_TTL_MS, type PresenceDb } from '../presence'

/**
 * In-memory stand-in for the Presence table: the three calls presence.ts makes,
 * with the same keying (tenantId + userId) and filters the real queries use.
 */
type Row = { tenantId: string; userId: string; name: string; viewing: string; lastSeen: Date }
let rows: Row[] = []
const db = {
  presence: {
    upsert: async ({ where, create, update }: { where: { tenantId_userId: { tenantId: string; userId: string } }; create: Row; update: Partial<Row> }) => {
      const k = where.tenantId_userId
      const hit = rows.find((r) => r.tenantId === k.tenantId && r.userId === k.userId)
      if (hit) Object.assign(hit, update)
      else rows.push({ ...create })
      return hit ?? create
    },
    deleteMany: async ({ where }: { where: { tenantId: string; userId?: string; lastSeen?: { lt: Date } } }) => {
      const before = rows.length
      rows = rows.filter((r) => !(r.tenantId === where.tenantId
        && (where.userId === undefined || r.userId === where.userId)
        && (where.lastSeen === undefined || r.lastSeen < where.lastSeen.lt)))
      return { count: before - rows.length }
    },
    findMany: async ({ where }: { where: { tenantId: string } }) =>
      rows.filter((r) => r.tenantId === where.tenantId).sort((a, b) => a.name.localeCompare(b.name)),
  },
} as unknown as PresenceDb

let now = 1_000_000
const beat = (tenantId: string, userId: string, name = userId, viewing = 'the fleet') =>
  heartbeat({ tenantId, userId, name, viewing }, db, now)
const list = (tenantId: string) => roster(tenantId, db, now)

describe('presence', () => {
  beforeEach(() => { rows = []; now = 1_000_000 })

  it('records who is online and what they are viewing', async () => {
    await beat('t1', 'u1', 'Ana', 'run r-8f2c')
    expect(await list('t1')).toEqual([
      expect.objectContaining({ userId: 'u1', name: 'Ana', viewing: 'run r-8f2c' }),
    ])
  })

  it('never leaks presence across tenants', async () => {
    await beat('t1', 'u1', 'Ana')
    await beat('t2', 'u2', 'Kenji')
    expect((await list('t1')).map((r) => r.userId)).toEqual(['u1'])
    expect((await list('t2')).map((r) => r.userId)).toEqual(['u2'])
  })

  it('returns an empty roster for a tenant nobody is in', async () => {
    expect(await list('nobody-here')).toEqual([])
  })

  it('updates location on the next heartbeat rather than duplicating a person', async () => {
    await beat('t1', 'u1', 'Ana', 'the fleet')
    await beat('t1', 'u1', 'Ana', 'the approvals queue')
    const r = await list('t1')
    expect(r).toHaveLength(1)
    expect(r[0].viewing).toBe('the approvals queue')
  })

  it('drops someone who has stopped checking in, and keeps no row for them', async () => {
    await beat('t1', 'u1', 'Ana')
    expect(await list('t1')).toHaveLength(1)
    now += PRESENCE_TTL_MS + 1000
    expect(await list('t1')).toHaveLength(0)
    // "Current only": the stale row is gone from the table, not merely hidden.
    expect(rows).toHaveLength(0)
  })

  it('keeps someone who is still checking in', async () => {
    await beat('t1', 'u1', 'Ana')
    now += PRESENCE_TTL_MS - 5000
    await beat('t1', 'u1', 'Ana')
    now += PRESENCE_TTL_MS - 5000
    expect(await list('t1')).toHaveLength(1)
  })

  it('removes someone immediately on explicit leave, without waiting for TTL', async () => {
    await beat('t1', 'u1', 'Ana')
    await leave('t1', 'u1', db)
    expect(await list('t1')).toHaveLength(0)
  })

  it('leaving one tenant does not remove the same user id elsewhere', async () => {
    await beat('t1', 'u1', 'Ana')
    await beat('t2', 'u1', 'Ana')
    await leave('t1', 'u1', db)
    expect(await list('t1')).toHaveLength(0)
    expect(await list('t2')).toHaveLength(1)
  })

  it('sorts the roster by name so avatars do not shuffle between polls', async () => {
    await beat('t1', 'u3', 'Zara')
    await beat('t1', 'u1', 'Ana')
    await beat('t1', 'u2', 'Kenji')
    expect((await list('t1')).map((r) => r.name)).toEqual(['Ana', 'Kenji', 'Zara'])
  })
})
