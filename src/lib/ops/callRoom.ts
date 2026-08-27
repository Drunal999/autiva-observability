import { createHmac } from 'crypto'

/**
 * Room naming for embedded calls.
 *
 * We do NOT run WebRTC signalling ourselves. That means a signalling server,
 * STUN/TURN, NAT traversal and reconnection logic — weeks of work plus ongoing
 * TURN bandwidth, to rebuild something already available. Jitsi Meet is
 * embedded instead. See ADR-004.
 *
 * The consequence that shapes this file: on a public Jitsi instance, ANYONE
 * WHO KNOWS THE ROOM NAME CAN JOIN. So a room name must never be derivable
 * from anything a stranger can guess. `autiva-approval-1` would be trivially
 * enumerable and would put an outsider in a call about a customer's money.
 *
 * The name is therefore an HMAC of tenant + subject under a server-side
 * secret: stable for the same subject (so two people reach the same room),
 * unguessable without the secret, and revocable by rotating it.
 */

const ROOM_PREFIX = 'autiva'

function secret(): string {
  // Falls back to NEXTAUTH_SECRET so a dev environment works without extra
  // setup; production should set CALL_ROOM_SECRET explicitly so rotating call
  // rooms does not invalidate every session.
  const s = process.env.CALL_ROOM_SECRET ?? process.env.NEXTAUTH_SECRET
  if (!s) throw new Error('CALL_ROOM_SECRET or NEXTAUTH_SECRET must be set to create call rooms')
  return s
}

export function callRoomName(tenantId: string, subjectType: string, subjectId: string): string {
  const digest = createHmac('sha256', secret())
    .update(`${tenantId}:${subjectType}:${subjectId}`)
    .digest('base64url')
    // 128 bits of the digest is far beyond guessable and keeps the URL short.
    .slice(0, 22)
  return `${ROOM_PREFIX}-${digest}`
}

/** Public Jitsi instance. Swap for a self-hosted domain when one exists. */
export const JITSI_DOMAIN = process.env.NEXT_PUBLIC_JITSI_DOMAIN ?? 'meet.jit.si'
