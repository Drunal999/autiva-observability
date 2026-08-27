/**
 * Token-bucket rate limiting for write endpoints (rule 7).
 *
 * CAVEAT, stated plainly: the buckets live in this process's memory. On a
 * single instance that is correct. On a serverless platform where requests
 * land on different containers, each container keeps its own bucket, so the
 * effective limit is (limit x instances). It raises the cost of a flood; it is
 * not a hard guarantee. Move to Redis or the database when the limit has to
 * hold across instances — same caveat as the SSE bus in lib/realtime/bus.ts.
 */

interface Bucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

/** Drop expired buckets so a long-lived process does not grow unbounded. */
function sweep(now: number) {
  if (buckets.size < 500) return
  buckets.forEach((b, k) => {
    if (b.resetAt <= now) buckets.delete(k)
  })
}

export interface RateLimitResult {
  ok: boolean
  remaining: number
  /** Seconds until the window resets — surfaced as Retry-After. */
  retryAfter: number
}

/**
 * @param key    Identity to limit on. Always include the user id; never limit
 *               on IP alone, which collides behind corporate NAT.
 * @param limit  Requests allowed per window.
 * @param windowMs Window length.
 */
export function rateLimit(key: string, limit = 20, windowMs = 60_000): RateLimitResult {
  const now = Date.now()
  sweep(now)

  const existing = buckets.get(key)
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { ok: true, remaining: limit - 1, retryAfter: 0 }
  }

  existing.count += 1
  const retryAfter = Math.ceil((existing.resetAt - now) / 1000)
  if (existing.count > limit) {
    return { ok: false, remaining: 0, retryAfter }
  }
  return { ok: true, remaining: limit - existing.count, retryAfter }
}

/** Test seam — the buckets are module state and would otherwise leak between tests. */
export function __resetRateLimits() {
  buckets.clear()
}

/**
 * Attempt log for write endpoints (rule 7: log attempts, successful or not).
 * Structured single-line output so it greps cleanly; never logs the payload,
 * which may contain customer text.
 */
export function logWriteAttempt(fields: {
  route: string
  userId: string
  tenantId: string
  subjectId?: string
  outcome: 'allowed' | 'rate_limited' | 'denied' | 'conflict' | 'not_found' | 'invalid'
  detail?: string
}) {
  // eslint-disable-next-line no-console
  console.info(
    '[write] ' +
      JSON.stringify({ at: new Date().toISOString(), ...fields })
  )
}
