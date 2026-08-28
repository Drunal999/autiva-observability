# 004 — Embed Jitsi rather than build WebRTC signalling

**Status:** Accepted

## Decision

Calls are an embedded **Jitsi Meet** iframe. We do not implement WebRTC
signalling.

## Why

Building it ourselves means a signalling server, STUN/TURN infrastructure, NAT
traversal and reconnection logic — weeks of work plus ongoing TURN bandwidth
cost, to rebuild something already available for free. The embed took an
afternoon.

## The consequence that shapes the design

**On a public Jitsi instance, anyone who knows the room name can join.**

So the room name must never be derivable from anything a stranger can guess.
`autiva-approval-1` would be trivially enumerable and would put an outsider in
a call about a customer's money.

The name is an HMAC of `tenantId + subjectType + subjectId` under a
server-side secret (`src/lib/ops/callRoom.ts`):

- stable for the same subject, so two people reach the same room
- unguessable without the secret
- revocable by rotating the secret

It is minted **server-side only**. A client-supplied room would allow joining
someone else's call, or making this dashboard mint a link into an arbitrary
room.

## Client mode

Calls are **disabled for client tenants** unless `ENABLE_CLIENT_CALLS=true`.
Turning them on is a product decision with support implications, not a UI
toggle.

## Known limitations

- `meet.jit.si` is the **public** instance. Fine internally; a customer call
  about their invoices should be on a self-hosted domain via
  `NEXT_PUBLIC_JITSI_DOMAIN`.
- `CALL_ROOM_SECRET` currently falls back to `NEXTAUTH_SECRET`. Set it
  explicitly in production, or rotating call rooms invalidates every session.
- Call start is logged as an event so the audit trail shows a discussion
  happened. Content is never recorded.

## When to revisit

Only if recording or transcripts become a real requirement. Then LiveKit or
Daily — still not our own signalling.
