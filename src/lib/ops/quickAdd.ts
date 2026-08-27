/**
 * Natural-language quick add: "standup every weekday 9:30".
 *
 * Deliberately a small deterministic parser, not a model. It handles the
 * phrasings people actually type for a work calendar, and REFUSES anything it
 * is not sure about rather than guessing — because the caller is required to
 * show the parse back for confirmation, and a confident wrong answer is worse
 * than an honest "I could not read that". A silently guessed date means an
 * automation fires at the wrong time and nobody finds out until it has.
 */

export interface QuickAddResult {
  ok: boolean
  title?: string
  startsAt?: Date
  endsAt?: Date
  rrule?: string | null
  allDay?: boolean
  /** Plain-English read-back, always shown before saving. */
  summary?: string
  error?: string
  /** Parts the parser could not account for — surfaced, never ignored. */
  unparsed?: string
}

const WEEKDAY: Record<string, number> = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thur: 4, thurs: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
}

const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']

/** "9:30", "9.30", "0930", "9am", "9 pm", "14:00" */
function parseTime(text: string): { hour: number; minute: number; raw: string } | null {
  const m = text.match(/\b(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?\b/i)
  if (!m) return null

  let hour = parseInt(m[1], 10)
  const minute = m[2] ? parseInt(m[2], 10) : 0
  const meridiem = m[3]?.toLowerCase()

  // A bare number with no minutes and no am/pm is too ambiguous to use as a
  // time — "standup 5" is more likely a typo than 05:00.
  if (!m[2] && !meridiem) return null
  if (hour > 23 || minute > 59) return null

  if (meridiem === 'pm' && hour < 12) hour += 12
  if (meridiem === 'am' && hour === 12) hour = 0

  return { hour, minute, raw: m[0] }
}

function parseRecurrence(text: string): { rrule: string; label: string; matched: string } | null {
  const lower = text.toLowerCase()

  const weekday = lower.match(/\bevery\s+(weekday|working day|business day)s?\b/)
  if (weekday) {
    return {
      rrule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
      label: 'every weekday',
      matched: weekday[0],
    }
  }

  const daily = lower.match(/\bevery\s+day\b|\bdaily\b/)
  if (daily) return { rrule: 'FREQ=DAILY', label: 'every day', matched: daily[0] }

  const weekly = lower.match(/\bevery\s+week\b|\bweekly\b/)
  if (weekly) return { rrule: 'FREQ=WEEKLY', label: 'every week', matched: weekly[0] }

  const named = lower.match(
    /\bevery\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)s?\b/
  )
  if (named) {
    const day = BYDAY[WEEKDAY[named[1]]]
    return { rrule: `FREQ=WEEKLY;BYDAY=${day}`, label: `every ${named[1]}`, matched: named[0] }
  }

  const monthly = lower.match(/\bevery\s+month\b|\bmonthly\b/)
  if (monthly) return { rrule: 'FREQ=MONTHLY', label: 'every month', matched: monthly[0] }

  return null
}

function parseDay(text: string, now: Date): { date: Date; label: string; matched: string } | null {
  const lower = text.toLowerCase()

  if (/\btoday\b/.test(lower)) return { date: new Date(now), label: 'today', matched: 'today' }

  if (/\btomorrow\b/.test(lower)) {
    const d = new Date(now)
    d.setDate(d.getDate() + 1)
    return { date: d, label: 'tomorrow', matched: 'tomorrow' }
  }

  // "on friday" / "next friday" — the coming instance of that weekday.
  const named = lower.match(
    /\b(?:on|next)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)\b/
  )
  if (named) {
    const target = WEEKDAY[named[1]]
    const d = new Date(now)
    const delta = (target - d.getDay() + 7) % 7 || 7
    d.setDate(d.getDate() + delta)
    return { date: d, label: named[0], matched: named[0] }
  }

  return null
}

export const DEFAULT_DURATION_MIN = 30

export function quickAdd(input: string, now: Date = new Date()): QuickAddResult {
  const raw = input.trim()
  if (!raw) return { ok: false, error: 'Type something like "standup every weekday 9:30".' }

  let remaining = raw
  const consumed: string[] = []

  const recurrence = parseRecurrence(remaining)
  if (recurrence) {
    remaining = remaining.replace(new RegExp(recurrence.matched, 'i'), ' ')
    consumed.push(recurrence.label)
  }

  const day = !recurrence ? parseDay(remaining, now) : null
  if (day) {
    remaining = remaining.replace(new RegExp(day.matched, 'i'), ' ')
    consumed.push(day.label)
  }

  const time = parseTime(remaining)
  if (time) {
    remaining = remaining.replace(time.raw, ' ')
    consumed.push(`at ${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}`)
  }

  // Strip filler left behind by the pieces already consumed.
  const title = remaining.replace(/\b(at|on|every|from)\b/gi, ' ').replace(/\s+/g, ' ').trim()

  if (!title) {
    return { ok: false, error: 'That needs a name — try "standup every weekday 9:30".' }
  }

  const start = day ? new Date(day.date) : new Date(now)
  if (time) start.setHours(time.hour, time.minute, 0, 0)
  else start.setSeconds(0, 0)

  // A recurring series with no time is ambiguous, and defaulting it silently
  // is exactly the guess this parser exists to avoid.
  if (recurrence && !time) {
    return {
      ok: false,
      error: `"${title}" repeats ${recurrence.label}, but no time was given. Add one, like "9:30".`,
    }
  }

  const allDay = !time && !recurrence
  const end = new Date(start)
  if (allDay) end.setHours(23, 59, 0, 0)
  else end.setMinutes(end.getMinutes() + DEFAULT_DURATION_MIN)

  const when = allDay
    ? `all day ${day?.label ?? 'today'}`
    : consumed.filter((c) => c !== title).join(', ')

  return {
    ok: true,
    title,
    startsAt: start,
    endsAt: end,
    rrule: recurrence?.rrule ?? null,
    allDay,
    summary: `“${title}” — ${when || 'now'}`,
  }
}
