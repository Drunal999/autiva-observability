import { describe, it, expect, beforeEach } from 'vitest'
import { callRoomName } from '../callRoom'

beforeEach(() => {
  process.env.CALL_ROOM_SECRET = 'test-secret-for-room-naming'
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
    process.env.CALL_ROOM_SECRET = 'a-different-secret'
    expect(callRoomName('t1', 'APPROVAL', 'ap1')).not.toBe(before)
  })

  it('produces a URL-safe name of usable length', () => {
    const room = callRoomName('t1', 'APPROVAL', 'ap1')
    expect(room).toMatch(/^autiva-[A-Za-z0-9_-]{22}$/)
  })

  it('refuses to mint a room with no secret configured', () => {
    delete process.env.CALL_ROOM_SECRET
    const saved = process.env.NEXTAUTH_SECRET
    delete process.env.NEXTAUTH_SECRET
    expect(() => callRoomName('t1', 'APPROVAL', 'ap1')).toThrow(/secret/i)
    if (saved) process.env.NEXTAUTH_SECRET = saved
  })
})
