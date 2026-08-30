import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  parseAllowlist,
  isAllowedLogin,
  allowedLogins,
  assertAllowlistConfigured,
  ALLOWLIST_VAR,
} from '../allowlist'

let saved: string | undefined
beforeEach(() => {
  saved = process.env[ALLOWLIST_VAR]
})
afterEach(() => {
  if (saved === undefined) delete process.env[ALLOWLIST_VAR]
  else process.env[ALLOWLIST_VAR] = saved
})

const set = (v: string | undefined) => {
  if (v === undefined) delete process.env[ALLOWLIST_VAR]
  else process.env[ALLOWLIST_VAR] = v
}

describe('the allowlist fails closed', () => {
  it('admits nobody when unset', () => {
    // The opposite default looks fine in testing and is a breach in
    // production. A locked-out team notices in seconds; an open door may not
    // be noticed at all.
    set(undefined)
    expect(isAllowedLogin('drunal999')).toBe(false)
    expect(allowedLogins()).toEqual([])
  })

  it('admits nobody when empty or only separators', () => {
    for (const v of ['', '   ', ',', ' , , ']) {
      set(v)
      expect(isAllowedLogin('drunal999'), v).toBe(false)
    }
  })

  it('refuses to boot with nobody allowed, and says how to fix it', () => {
    set('')
    expect(() => assertAllowlistConfigured()).toThrow(new RegExp(ALLOWLIST_VAR))
    expect(() => assertAllowlistConfigured()).toThrow(/fails closed/i)
  })

  it('boots once a list exists', () => {
    set('drunal999')
    expect(() => assertAllowlistConfigured()).not.toThrow()
  })
})

describe('who is admitted', () => {
  beforeEach(() => set('drunal999,hardikwork05,adityamondal-ai-spec'))

  it('admits exactly the three configured accounts', () => {
    expect(isAllowedLogin('drunal999')).toBe(true)
    expect(isAllowedLogin('hardikwork05')).toBe(true)
    expect(isAllowedLogin('adityamondal-ai-spec')).toBe(true)
  })

  it('refuses everybody else', () => {
    for (const other of ['octocat', 'torvalds', 'devarshirunal44-cloud', 'hardikwork06']) {
      expect(isAllowedLogin(other), other).toBe(false)
    }
  })

  it('folds case, because GitHub logins are case-insensitive', () => {
    // Someone typing HardikWork05 into the env file must not lock Hardik out.
    set('DRUNAL999, HardikWork05')
    expect(isAllowedLogin('drunal999')).toBe(true)
    expect(isAllowedLogin('HARDIKWORK05')).toBe(true)
  })

  it('tolerates spacing in the list', () => {
    set('  drunal999 ,hardikwork05 ')
    expect(allowedLogins()).toEqual(['drunal999', 'hardikwork05'])
  })

  it('refuses a missing or blank login rather than matching a blank entry', () => {
    expect(isAllowedLogin(null)).toBe(false)
    expect(isAllowedLogin(undefined)).toBe(false)
    expect(isAllowedLogin('')).toBe(false)
    expect(isAllowedLogin('   ')).toBe(false)
  })

  it('does not match on a prefix or substring', () => {
    // "drunal99" must not be admitted by "drunal999" being present.
    expect(isAllowedLogin('drunal99')).toBe(false)
    expect(isAllowedLogin('drunal9999')).toBe(false)
    expect(isAllowedLogin('xdrunal999')).toBe(false)
  })
})

describe('parseAllowlist', () => {
  it('drops empties rather than producing a blank entry that matches nothing usefully', () => {
    expect(parseAllowlist('a,,b, ,c')).toEqual(['a', 'b', 'c'])
  })
})
