'use client'

import { useEffect } from 'react'
import useSWR from 'swr'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export interface PresenceEntry {
  userId: string
  name: string
  viewing: string
  lastSeen: number
}

const HEARTBEAT_MS = 20_000

/**
 * Reports what this tab is looking at and returns everyone else's.
 *
 * @param viewing Human-readable location, e.g. "run r-8f2c". Written for the
 *                person reading it, not the router — "the approvals queue",
 *                not "/approvals".
 */
export function usePresence(viewing: string): PresenceEntry[] {
  const { data, mutate } = useSWR<{ roster: PresenceEntry[] }>('/api/presence', fetcher, {
    refreshInterval: HEARTBEAT_MS,
  })

  useEffect(() => {
    let cancelled = false

    const beat = async () => {
      try {
        const res = await fetch('/api/presence', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ viewing }),
        })
        if (!cancelled && res.ok) void mutate()
      } catch {
        // Presence is a nicety. A failed heartbeat must never surface an error
        // to someone trying to do actual work.
      }
    }

    void beat()
    const timer = setInterval(beat, HEARTBEAT_MS)

    // Departure is signalled on pagehide only — a genuine navigation away or
    // tab close.
    //
    // Deliberately NOT in the effect cleanup: React 18 double-invokes effects
    // in development (mount, cleanup, mount), and a DELETE from that cleanup
    // races the remount's heartbeat. In practice the DELETE resolved last and
    // erased the entry the POST had just created, so nobody ever appeared
    // online. TTL expiry covers every case pagehide misses.
    const onHide = () => {
      void fetch('/api/presence', { method: 'DELETE', keepalive: true })
    }
    window.addEventListener('pagehide', onHide)

    // A backgrounded tab should stop claiming to be watching something, but it
    // has not left — let the entry lapse via TTL rather than deleting it.
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void beat()
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelled = true
      clearInterval(timer)
      window.removeEventListener('pagehide', onHide)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [viewing, mutate])

  return data?.roster ?? []
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0] ?? '')
    .join('')
    .toUpperCase()
}

/** Stable colour per person, so the same face keeps the same tint. */
function tintFor(userId: string): string {
  const hues = ['#22d3ee', '#a78bfa', '#34d399', '#fbbf24', '#f472b6']
  let h = 0
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) % hues.length
  return hues[h]
}

/** Avatar row for the header. Hover any face to see what they are looking at. */
export function PresenceBar({
  roster,
  currentUserId,
}: {
  roster: PresenceEntry[]
  currentUserId?: string
}) {
  const others = roster.filter((r) => r.userId !== currentUserId)
  if (others.length === 0) return null

  return (
    <div className="flex shrink-0 items-center gap-0">
      {others.slice(0, 5).map((r, i) => (
        <span
          key={r.userId}
          title={`${r.name} — viewing ${r.viewing}`}
          className="flex h-[22px] w-[22px] items-center justify-center rounded-full border border-white/[0.14] font-mono text-[11px] font-bold"
          style={{
            color: tintFor(r.userId),
            background: 'rgba(255,255,255,0.06)',
            marginLeft: i === 0 ? 0 : -6,
            boxShadow: '0 0 0 2px #0a1020',
          }}
        >
          {initials(r.name)}
        </span>
      ))}
      {others.length > 5 && (
        <span className="ml-1.5 font-mono text-[12px] text-white/35">+{others.length - 5}</span>
      )}
    </div>
  )
}

/** "Ana is viewing run r-8f2c" — shown beside the thing being looked at. */
export function ViewingHere({
  roster,
  currentUserId,
  location,
}: {
  roster: PresenceEntry[]
  currentUserId?: string
  location: string
}) {
  const here = roster.filter((r) => r.userId !== currentUserId && r.viewing === location)
  if (here.length === 0) return null

  const names =
    here.length === 1
      ? here[0].name
      : `${here.slice(0, -1).map((h) => h.name).join(', ')} and ${here[here.length - 1].name}`

  return (
    <span className="font-mono text-[11.5px] text-cyan-300/60">
      {names} {here.length === 1 ? 'is' : 'are'} here too
    </span>
  )
}
