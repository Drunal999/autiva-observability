import { timingSafeEqual } from 'crypto'
import { requireSecret, type SecretName } from './secrets'

/**
 * Compares a presented bearer token in constant time.
 *
 * The cron endpoint previously did a plain `!==` against
 * `Bearer ${process.env.CRON_SECRET}`. With the variable unset that compares
 * against the literal string "Bearer undefined" — which anyone can send. An
 * unset secret must DENY, never become a password.
 *
 * The constant-time compare stops the endpoint being used as an oracle to
 * recover the token byte by byte from response timing.
 *
 * Kept out of `secrets.ts` because that module is imported by
 * `instrumentation.ts`, which Next also bundles for the edge runtime where
 * `crypto` does not resolve.
 */
export function bearerMatches(header: string | null, name: SecretName): boolean {
  if (!header?.startsWith('Bearer ')) return false

  let expected: string
  try {
    expected = requireSecret(name)
  } catch {
    // Misconfiguration denies. It must never open the door.
    return false
  }

  const given = Buffer.from(header.slice('Bearer '.length))
  const want = Buffer.from(expected)
  // timingSafeEqual throws on a length mismatch, which would itself leak the
  // length, so lengths are checked first and both paths return false.
  if (given.length !== want.length) return false
  return timingSafeEqual(given, want)
}
