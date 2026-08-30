import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { requireSecret, assertSecretsPresent, MIN_SECRET_LENGTH } from '../secrets'
import { bearerMatches } from '../bearerAuth'

const GOOD = 'x'.repeat(MIN_SECRET_LENGTH)
const NAMES = ['CALL_ROOM_SECRET', 'ICS_FEED_SECRET', 'CRON_SECRET', 'INGEST_SECRET'] as const

let saved: Record<string, string | undefined>

beforeEach(() => {
  saved = {}
  for (const n of [...NAMES, 'NEXTAUTH_SECRET']) {
    saved[n] = process.env[n]
    delete process.env[n]
  }
})
afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
})

describe('requireSecret', () => {
  it('returns a configured secret', () => {
    process.env.ICS_FEED_SECRET = GOOD
    expect(requireSecret('ICS_FEED_SECRET')).toBe(GOOD)
  })

  it('never falls back to NEXTAUTH_SECRET', () => {
    // The behaviour this file exists to remove. Sharing the session key means a
    // routine session rotation silently kills every calendar subscription
    // people have already added to their clients.
    process.env.NEXTAUTH_SECRET = GOOD
    for (const name of NAMES) {
      expect(() => requireSecret(name)).toThrow(new RegExp(name + ' is not set'))
    }
  })

  it('says what the secret is for and how to make one', () => {
    // An error that only says "missing" sends someone to grep the codebase.
    expect(() => requireSecret('ICS_FEED_SECRET')).toThrow(/calendar feed tokens/)
    expect(() => requireSecret('ICS_FEED_SECRET')).toThrow(/randomBytes/)
  })

  it('rejects a secret short enough for a person to have typed', () => {
    process.env.CRON_SECRET = 'changeme'
    expect(() => requireSecret('CRON_SECRET')).toThrow(/too short/)
  })

  it('accepts exactly the minimum length', () => {
    process.env.CRON_SECRET = GOOD
    expect(requireSecret('CRON_SECRET')).toHaveLength(MIN_SECRET_LENGTH)
  })
})

describe('bearerMatches', () => {
  it('accepts the right token', () => {
    process.env.CRON_SECRET = GOOD
    expect(bearerMatches('Bearer ' + GOOD, 'CRON_SECRET')).toBe(true)
  })

  it('rejects the wrong token', () => {
    process.env.CRON_SECRET = GOOD
    expect(bearerMatches('Bearer ' + 'y'.repeat(MIN_SECRET_LENGTH), 'CRON_SECRET')).toBe(false)
  })

  it('DENIES when the secret is unset, rather than accepting "undefined"', () => {
    // The real bug. The route compared against `Bearer ${process.env.CRON_SECRET}`,
    // so with the variable unset the password was the literal string
    // "Bearer undefined" — which anyone could send.
    expect(bearerMatches('Bearer undefined', 'CRON_SECRET')).toBe(false)
    expect(bearerMatches('Bearer ', 'CRON_SECRET')).toBe(false)
    expect(bearerMatches('Bearer null', 'CRON_SECRET')).toBe(false)
  })

  it('denies when the secret is configured but too short', () => {
    // A misconfiguration must fail closed. Falling back to "any token works"
    // is how a weak secret becomes no secret.
    process.env.CRON_SECRET = 'short'
    expect(bearerMatches('Bearer short', 'CRON_SECRET')).toBe(false)
  })

  it('rejects a missing or malformed header without throwing', () => {
    process.env.CRON_SECRET = GOOD
    expect(bearerMatches(null, 'CRON_SECRET')).toBe(false)
    expect(bearerMatches('', 'CRON_SECRET')).toBe(false)
    expect(bearerMatches(GOOD, 'CRON_SECRET')).toBe(false)
    expect(bearerMatches('Basic ' + GOOD, 'CRON_SECRET')).toBe(false)
  })

  it('does not throw on a length mismatch, which would leak the length', () => {
    process.env.CRON_SECRET = GOOD
    expect(() => bearerMatches('Bearer a', 'CRON_SECRET')).not.toThrow()
    expect(bearerMatches('Bearer a', 'CRON_SECRET')).toBe(false)
  })

  it('rejects a correct prefix, so a partial guess earns nothing', () => {
    process.env.CRON_SECRET = GOOD
    expect(bearerMatches('Bearer ' + GOOD.slice(0, -1), 'CRON_SECRET')).toBe(false)
  })
})

describe('assertSecretsPresent', () => {
  it('names every missing secret at once, not just the first', () => {
    // Fixing these one restart at a time is a bad afternoon.
    let message = ''
    try {
      assertSecretsPresent()
    } catch (e) {
      message = (e as Error).message
    }
    for (const name of NAMES) expect(message).toContain(name)
  })

  it('passes when every secret is configured', () => {
    for (const n of NAMES) process.env[n] = GOOD
    expect(() => assertSecretsPresent()).not.toThrow()
  })
})
