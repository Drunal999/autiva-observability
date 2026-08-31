import { describe, it, expect } from 'vitest'
import { NAV } from '@/lib/ops/tokens'
import { config } from '@/middleware'

/**
 * Every page in the navigation must be behind the session middleware.
 *
 * `/chat` was added to NAV and not to the matcher, so it answered 200 to
 * anyone while every other page redirected to sign-in. The data was still
 * safe — the APIs refuse without a session — but the shell rendered for
 * strangers, and nothing anywhere said so.
 *
 * The matcher is a literal array in a config object, so it cannot be derived
 * from NAV at runtime: Next reads it statically at build time. This test is
 * the link between the two lists instead.
 *
 * It reads the exported `config`, not the file's text. The first version
 * grepped the source and passed on a COMMENT that happened to mention a path —
 * a test that reads prose and calls it configuration.
 */
function isCovered(href: string): boolean {
  const patterns = config.matcher as readonly string[]
  return patterns.some((m) => m === href || m === `${href}/:path*`)
}

describe('every navigable page requires a session', () => {
  for (const item of NAV) {
    it(`${item.href} (${item.label}) is in the middleware matcher`, () => {
      expect(isCovered(item.href), `add '${item.href}' to the matcher in src/middleware.ts`).toBe(true)
    })
  }

  it('covers the root, which redirects to the board', () => {
    expect(isCovered('/')).toBe(true)
  })

  it('does NOT cover the token-authenticated endpoints', () => {
    // These authenticate with their own bearer token or feed token and are
    // called with no browser session — by a calendar client, or by a reporter
    // running on somebody's laptop. Putting them behind the session middleware
    // turns every one of those requests into an HTML sign-in page.
    expect(isCovered('/api/calendar/feed')).toBe(false)
    expect(isCovered('/api/ingest/runs')).toBe(false)
  })
})
