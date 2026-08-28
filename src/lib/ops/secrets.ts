/**
 * Server-side secrets, resolved in exactly one place.
 *
 * Three of these used to fall back to `NEXTAUTH_SECRET` (or, worse, to
 * nothing) so a dev environment worked without extra setup. That convenience
 * cost more than it was worth, in three separate ways:
 *
 * 1. **Rotation becomes a trap.** `NEXTAUTH_SECRET` is rotated routinely — it
 *    logs everyone out, which is a normal thing to do. If ICS feeds are keyed
 *    off it, that rotation ALSO silently kills every calendar subscription
 *    people have already added to their clients, and renames every call room.
 *    Nothing reports it. Somebody's calendar just stops updating.
 *
 * 2. **One key, many purposes.** The session-signing key should not also be
 *    the key that mints long-lived, unauthenticated URL tokens. A feed URL is
 *    effectively a password that lives in plaintext in calendar clients; it
 *    must not share a key with sessions.
 *
 * 3. **It failed silently.** Dev worked, production "worked", and the coupling
 *    was invisible until a rotation broke something unrelated. A missing
 *    secret should stop the process, not quietly borrow another one.
 *
 * So: no fallbacks. A missing secret is a startup error with instructions.
 */

/**
 * Deliberately free of `crypto`, and of any Node built-in.
 *
 * `instrumentation.ts` imports this to check configuration at boot, and Next
 * bundles that file for the EDGE runtime as well as Node — statically, so a
 * `NEXT_RUNTIME` guard at runtime does not stop the bundler following the
 * import. One `import 'crypto'` here took the whole app down with
 * "Module not found: Can't resolve 'crypto'". Constant-time comparison
 * therefore lives in `bearerAuth.ts`, which nothing edge-bound imports.
 */
export type SecretName = 'CALL_ROOM_SECRET' | 'ICS_FEED_SECRET' | 'CRON_SECRET'

const PURPOSE: Record<SecretName, string> = {
  CALL_ROOM_SECRET: 'derive unguessable call room names',
  ICS_FEED_SECRET: 'sign calendar feed tokens',
  CRON_SECRET: 'authenticate the scheduled job endpoint',
}

/**
 * 32 characters. Short enough not to be annoying, long enough that a value
 * somebody typed by hand ("changeme", "secret123") does not pass.
 */
export const MIN_SECRET_LENGTH = 32

export function requireSecret(name: SecretName): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(
      `${name} is not set. It is needed to ${PURPOSE[name]}. ` +
        `Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))" ` +
        `— do not reuse NEXTAUTH_SECRET, because rotating that would invalidate this too.`
    )
  }
  if (value.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `${name} is too short (${value.length} chars, need ${MIN_SECRET_LENGTH}). ` +
        `A guessable secret here is the same as no secret.`
    )
  }
  return value
}

/**
 * Fails fast at startup rather than at the first request that needs a secret.
 *
 * Discovering a missing ICS secret when a customer subscribes to a feed is
 * strictly worse than discovering it when the process boots.
 */
export function assertSecretsPresent(): void {
  const missing: string[] = []
  for (const name of Object.keys(PURPOSE) as SecretName[]) {
    try {
      requireSecret(name)
    } catch (err) {
      missing.push((err as Error).message)
    }
  }
  if (missing.length > 0) {
    throw new Error('Server secrets are not configured:\n  - ' + missing.join('\n  - '))
  }
}
