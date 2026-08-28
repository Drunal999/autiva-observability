import { describe, it, expect, beforeEach } from 'vitest'
import { callRoomName } from '../callRoom'

beforeEach(() => {
  process.env.CALL_ROOM_SECRET = 'test-secret-for-room-naming-0123456789'
})

describe('callRoomName', () => {
  it('is stable for the same subject, so two people reach the same room', () => {
    const a = callRoomName('t1', 'APPROVAL', 'ap1')
    const b = callRoomName('t1', 'APPROVAL', 'ap1')
    expect(a).toBe(b)
  })

  it('differs per subject', () => {
    expect(callRoomName('t1', 'APPROVAL', 'ap1')).not.toBe(callRoomName('t1', 'APPROVAL', 'ap2'))
  })

  it('differs per tenant, so the same subject id in two tenants is two rooms', () => {
    expect(callRoomName('t1', 'APPROVAL', 'ap1')).not.toBe(callRoomName('t2', 'APPROVAL', 'ap1'))
  })

  it('differs per subject type', () => {
    expect(callRoomName('t1', 'APPROVAL', 'x')).not.toBe(callRoomName('t1', 'RUN', 'x'))
  })

  it('never contains the raw ids — the name must not be enumerable', () => {
    const room = callRoomName('tnt_internal', 'APPROVAL', 'ap-000123')
    // Anyone who knows the room name can join a public Jitsi room, so a name
    // derived from a sequential id would let an outsider walk the range.
    expect(room).not.toContain('ap-000123')
    expect(room).not.toContain('tnt_internal')
    expect(room).not.toContain('APPROVAL')
  })

  it('changes completely when the secret is rotated, so rooms are revocable', () => {
    const before = callRoomName('t1', 'APPROVAL', 'ap1')
    process.env.CALL_ROOM_SECRET = 'a-different-secret-0123456789abcdefgh'
    expect(callRoomName('t1', 'APPROVAL', 'ap1')).not.toBe(before)
  })

  it('produces a URL-safe name of usable length', () => {
    const room = callRoomName('t1', 'APPROVAL', 'ap1')
    expect(room).toMatch(/^autiva-[A-Za-z0-9_-]{22}$/)
  })

  it('refuses to mint a room with no secret configured', () => {
    delete process.env.CALL_ROOM_SECRET
    expect(() => callRoomName('t1', 'APPROVAL', 'ap1')).toThrow(/CALL_ROOM_SECRET is not set/)
  })

  it('does NOT borrow NEXTAUTH_SECRET when its own secret is missing', () => {
    // The old behaviour. Rotating NEXTAUTH_SECRET is routine — it logs
    // everyone out — and it must not silently rename every call room as a
    // side effect, which would send two people following the same link into
    // different empty rooms.
    delete process.env.CALL_ROOM_SECRET
    process.env.NEXTAUTH_SECRET = 'a-perfectly-good-session-secret-0123456789'
    expect(() => callRoomName('t1', 'APPROVAL', 'ap1')).toThrow(/CALL_ROOM_SECRET/)
  })

  it('refuses a secret short enough to guess', () => {
    process.env.CALL_ROOM_SECRET = 'changeme'
    expect(() => callRoomName('t1', 'APPROVAL', 'ap1')).toThrow(/too short/)
  })
})
