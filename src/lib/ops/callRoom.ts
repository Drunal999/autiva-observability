import { createHmac } from 'crypto'
import { requireSecret } from './secrets'

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
  // No fallback to NEXTAUTH_SECRET. Rotating that is routine — it logs
  // everyone out — and it must not also rename every call room, sending two
  // people who follow an old link into different, empty rooms.
  return requireSecret('CALL_ROOM_SECRET')
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
