import { createHmac, timingSafeEqual } from 'crypto'
import { requireSecret } from './secrets'

/**
 * Per-person tokens for reporting work into the dashboard.
 *
 * A reporter runs on somebody's laptop, outside any browser session, so it
 * cannot use a session cookie. It needs a bearer credential — and that
 * credential has to do TWO jobs, not one:
 *
 *   1. prove the caller may write runs at all, and
 *   2. say WHO the run belongs to.
 *
 * A single shared secret would only do the first. Every run would then arrive
 * anonymous, and the point of the whole exercise — seeing whose work is whose —
 * would be lost on the first day.
 *
 * So the token is keyed on the user: an HMAC of the tenant and the user id.
 * Deriving rather than storing means there is no token table to keep, and
 * rotating INGEST_SECRET revokes every token at once.
 *
 * WHAT THIS IS NOT: it is not a password, and it is not proof of identity
 * against a determined insider. Anyone holding another person's token can post
 * as them. That is the same trust model as the rest of this deployment (see
 * ADR-002 — there is no authorization model yet), and it is fine for a small
 * team who already trust each other. It would not be fine for strangers.
 */

const PREFIX = 'ingest'

export function ingestToken(tenantId: string, userId: string): string {
  return createHmac('sha256', requireSecret('INGEST_SECRET'))
    .update(`${PREFIX}:${tenantId}:${userId}`)
    .digest('base64url')
    .slice(0, 32)
}

/**
 * Constant-time comparison, so a wrong token leaks nothing through timing.
 *
 * Lengths are checked first because timingSafeEqual throws on a mismatch, and
 * that throw would itself be a signal.
 */
export function verifyIngestToken(tenantId: string, userId: string, presented: string): boolean {
  const expected = Buffer.from(ingestToken(tenantId, userId))
  const given = Buffer.from(presented ?? '')
  if (expected.length !== given.length) return false
  return timingSafeEqual(expected, given)
}

/**
 * Finds which user a presented token belongs to.
 *
 * Every candidate is checked even after a match, so the work done does not
 * depend on where in the list the right user sits.
 */
export function resolveIngestUser(
  tenantId: string,
  candidates: { id: string }[],
  presented: string
): string | null {
  let found: string | null = null
  for (const c of candidates) {
    if (verifyIngestToken(tenantId, c.id, presented)) found = c.id
  }
  return found
}
