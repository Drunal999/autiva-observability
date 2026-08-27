import { RRule, rrulestr } from 'rrule'

/**
 * RRULE expansion.
 *
 * Recurrence, timezones and DST are a deep pit, so this file does not
 * implement any of it — it wraps rrule.js and spends its effort on the layer
 * that is actually ours: refusing rules that would take the server down.
 */

/**
 * A rule like `FREQ=MINUTELY` over a year is 525,600 occurrences. Expanding
 * that on a request thread is a denial of service someone can trigger by
 * typing. Every expansion is capped, and validation rejects the rule outright
 * so a user finds out at save time rather than when the calendar stops
 * loading.
 */
export const MAX_OCCURRENCES_PER_WINDOW = 400
/** Ceiling used at validation time, over a representative year. */
export const MAX_OCCURRENCES_PER_YEAR = 2000

export interface RRuleValidation {
  ok: boolean
  /** Written for the person who typed the rule, not for a log. */
  error?: string
  /** Plain-English reading, shown back for confirmation before saving. */
  text?: string
  occurrencesPerYear?: number
}

/**
 * Validates a rule and reports what it will actually do.
 *
 * The caller is expected to show `text` to the user before saving: a guessed
 * schedule that silently differs from what someone meant is worse than an
 * error, because nobody finds out until the automation fires at the wrong
 * time.
 */
export function validateRRule(rule: string, dtstart: Date): RRuleValidation {
  const trimmed = rule.trim()
  if (!trimmed) return { ok: false, error: 'A repeat rule cannot be empty.' }

  let parsed: RRule
  try {
    const result = rrulestr(trimmed, { dtstart })
    // rrulestr can return a RRuleSet; only a plain rule is supported here.
    parsed = result instanceof RRule ? result : RRule.fromString(trimmed)
  } catch {
    return { ok: false, error: 'That repeat rule is not valid.' }
  }

  const yearEnd = new Date(dtstart.getTime() + 365 * 24 * 3600 * 1000)
  // `between` is bounded, so a runaway rule cannot spin here.
  const inYear = parsed.between(dtstart, yearEnd, true, (_d, i) => i < MAX_OCCURRENCES_PER_YEAR + 1)

  if (inYear.length > MAX_OCCURRENCES_PER_YEAR) {
    return {
      ok: false,
      error: `That repeats more than ${MAX_OCCURRENCES_PER_YEAR} times a year. Choose a less frequent schedule.`,
      occurrencesPerYear: inYear.length,
    }
  }

  return { ok: true, text: parsed.toText(), occurrencesPerYear: inYear.length }
}

/** Occurrences of one rule inside a window, hard-capped. */
export function expandInWindow(
  rule: string,
  dtstart: Date,
  from: Date,
  to: Date
): Date[] {
  try {
    const result = rrulestr(rule.trim(), { dtstart })
    const parsed = result instanceof RRule ? result : RRule.fromString(rule.trim())
    return parsed.between(from, to, true, (_d, i) => i < MAX_OCCURRENCES_PER_WINDOW)
  } catch {
    // A stored rule that no longer parses must not break the whole grid.
    return []
  }
}

/** Plain-English reading of a rule, for confirmation UI. */
export function describeRRule(rule: string): string | null {
  try {
    return RRule.fromString(rule.trim()).toText()
  } catch {
    return null
  }
}
