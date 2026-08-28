import { createHmac, timingSafeEqual } from 'crypto'
import { requireSecret } from './secrets'
import { utcDateStamp, exclusiveEndStamp } from './allDay'

/**
 * Read-only ICS feed.
 *
 * v1 is export only. Two-way sync would be eaten alive by conflict resolution
 * and token refresh, for a need that a subscribable feed covers (ADR-005).
 *
 * A FEED URL IS EFFECTIVELY A PASSWORD. Anyone holding it can read this
 * tenant's schedule forever, and calendar clients store it in plaintext and
 * fetch it unattended. So the token is a keyed digest — never sequential,
 * never guessable, and revocable by rotating the secret — and it is compared
 * in constant time so the endpoint cannot be used as an oracle.
 */

function secret(): string {
  // No fallback to NEXTAUTH_SECRET. A feed URL is a long-lived password stored
  // in plaintext by calendar clients; it must not share a key with sessions,
  // and a routine session-key rotation must not silently kill every
  // subscription somebody has already added.
  return requireSecret('ICS_FEED_SECRET')
}

export function icsToken(tenantId: string, userId: string): string {
  return createHmac('sha256', secret())
    .update(`ics:${tenantId}:${userId}`)
    .digest('base64url')
    .slice(0, 32)
}

/** Constant-time comparison, so a wrong token leaks nothing through timing. */
export function verifyIcsToken(tenantId: string, userId: string, presented: string): boolean {
  const expected = Buffer.from(icsToken(tenantId, userId))
  const given = Buffer.from(presented ?? '')
  if (expected.length !== given.length) return false
  return timingSafeEqual(expected, given)
}

export interface IcsEvent {
  uid: string
  title: string
  startsAt: Date
  endsAt: Date
  allDay?: boolean
  description?: string | null
  rrule?: string | null
}

/** RFC 5545 escaping: these five characters change the meaning of a line. */
function esc(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

function stamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
}

/**
 * Folds a line to 75 octets as RFC 5545 requires. Unfolded long lines are the
 * most common reason a feed silently fails to import.
 */
function fold(line: string): string {
  if (line.length <= 75) return line
  const parts: string[] = [line.slice(0, 75)]
  let rest = line.slice(75)
  while (rest.length > 74) {
    parts.push(' ' + rest.slice(0, 74))
    rest = rest.slice(74)
  }
  if (rest) parts.push(' ' + rest)
  return parts.join('\r\n')
}

export function buildIcs(events: IcsEvent[], calendarName: string): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Autiva//Mission Control//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(calendarName)}`,
    // Tells clients how often to poll. Without it they choose, often badly.
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ]

  for (const e of events) {
    lines.push('BEGIN:VEVENT')
    lines.push(`UID:${e.uid}@autiva`)
    lines.push(`DTSTAMP:${stamp(new Date())}`)
    if (e.allDay) {
      // Read in UTC, because all-day events are STORED at UTC midnight.
      // See src/lib/ops/allDay.ts for why no formatting-only fix works.
      lines.push(`DTSTART;VALUE=DATE:${utcDateStamp(e.startsAt)}`)
      lines.push(`DTEND;VALUE=DATE:${exclusiveEndStamp(e.startsAt, e.endsAt)}`)
    } else {
      lines.push(`DTSTART:${stamp(e.startsAt)}`)
      lines.push(`DTEND:${stamp(e.endsAt)}`)
    }
    lines.push(fold(`SUMMARY:${esc(e.title)}`))
    if (e.description) lines.push(fold(`DESCRIPTION:${esc(e.description)}`))
    if (e.rrule) lines.push(`RRULE:${e.rrule.replace(/^RRULE:/i, '')}`)
    lines.push('END:VEVENT')
  }

  lines.push('END:VCALENDAR')
  // RFC 5545 requires CRLF.
  return lines.join('\r\n') + '\r\n'
}
