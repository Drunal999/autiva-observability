'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import useSWR from 'swr'
import { NAV, fmtClock } from '@/lib/ops/tokens'
import type { FleetResponse } from '@/types/agentOps'
import type { ApprovalsResponse } from '@/types/approvals'
import { usePresence, PresenceBar } from './Presence'
import { Dock } from './Dock'
import { FactBubble } from './FactBubble'
import { useEventListener } from '@/lib/realtime/client'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

/**
 * Whether the figures on screen are seeded rather than production activity.
 *
 * Defaults to TRUE and must be switched off explicitly. A missing or
 * misspelled env var therefore over-warns rather than silently presenting
 * mock numbers as real — the failure mode has to be the harmless one.
 */
const IS_SAMPLE_DATA = process.env.NEXT_PUBLIC_SAMPLE_DATA !== 'false'

/** Ticking clock in the header. Starts null so server and client agree on the
 *  first paint — the time only appears once the client is running. */
function Clock() {
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    setNow(new Date())
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  return (
    <span className="font-mono text-[13px] tabular-nums text-white/45">
      {now ? fmtClock(now) : '--:--:--'}
    </span>
  )
}

export function OpsShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  // /api/agents returns { mode, agents } — the mode is decided server-side, so
  // the payload is an object, not a bare array.
  const { data } = useSWR<FleetResponse>('/api/agents', fetcher, { refreshInterval: 20000 })
  const agents = data?.agents

  const { data: approvals } = useSWR<ApprovalsResponse>('/api/approvals', fetcher, {
    refreshInterval: 20000,
  })
  const pendingApprovals = approvals?.pending?.length ?? 0

  const LOCATION: Record<string, string> = {
    '/': 'the task board',
    '/board': 'mission control',
    '/approvals': 'the approvals queue',
    '/calendar': 'the calendar',
    '/fleet': 'the fleet',
    '/trace': 'a trace',
    '/terminal': 'a terminal',
    '/automations': 'automations',
    '/states': 'the states sheet',
    '/motion': 'the motion spec',
  }
  const roster = usePresence(LOCATION[pathname] ?? 'the dashboard')

  // Unread mentions. Refreshed on the shared COMMENTS channel rather than a
  // dedicated poll — a mention should land quickly without another socket.
  const { data: notifs, mutate: refreshNotifs } = useSWR<{ unread: { id: string; kind?: string }[] }>(
    '/api/notifications',
    fetcher,
    { refreshInterval: 60000 }
  )
  useEventListener(() => void refreshNotifs(), ['COMMENTS'])
  /**
   * Does the nav have more to the right than is showing?
   *
   * The nav scrolls so the status cluster always fits, which means at narrower
   * widths the last few destinations sit out of sight. A hard cut mid-word
   * reads as a rendering fault, not as "there is more" — so the edge fades
   * only while there is actually something behind it.
   */
  const navRef = useRef<HTMLElement>(null)
  const [navMore, setNavMore] = useState(false)
  const measureNav = useCallback(() => {
    const el = navRef.current
    if (!el) return
    setNavMore(el.scrollWidth - el.clientWidth - el.scrollLeft > 4)
  }, [])
  useEffect(() => {
    const el = navRef.current
    if (!el) return
    measureNav()
    // Width changes come from the window AND from the badges appearing, which
    // happens after a fetch rather than at first paint — a resize listener
    // alone would miss that entirely.
    const ro = new ResizeObserver(measureNav)
    ro.observe(el)
    el.addEventListener('scroll', measureNav, { passive: true })
    return () => {
      ro.disconnect()
      el.removeEventListener('scroll', measureNav)
    }
  }, [measureNav])

  // Counted apart on purpose. A mention is a person asking YOU for something;
  // an alert is the system saying something broke. One badge for both trains
  // people to dismiss it without looking, and the one that mattered goes too.
  const all = notifs?.unread ?? []
  const mentions = all.filter((n) => (n.kind ?? 'MENTION') === 'MENTION').length
  const alerts = all.length - mentions

  const failing = agents?.filter((a) => a.status === 'FAILED').length ?? 0

  return (
    <div className="flex min-h-screen w-full max-w-full flex-col overflow-x-hidden text-[#f5f5f7]">
      {/* Two rows on a phone: status chrome that must never scroll out of
          reach, then the nav which may. On desktop it collapses back to one. */}
      <header className="flex shrink-0 flex-col border-b border-white/5 md:h-14 md:flex-row md:items-center md:gap-4 md:px-5">
        {/* Status row. On a phone this is its own line so nothing here can be
            scrolled out of reach; on desktop it dissolves into the single bar. */}
        <div className="flex shrink-0 items-center gap-2.5 px-4 pt-2.5 md:contents md:px-0 md:pt-0">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg border border-cyan-400/55">
            <span className="h-2 w-2 rounded-sm bg-cyan-400" />
          </span>
          <span className="text-[17px] font-extrabold tracking-tight">AUTIVA</span>
          <span className="hidden font-mono text-[12px] uppercase tracking-[0.16em] text-white/35 lg:inline">
            Mission Control
          </span>

          <span className="flex-1 md:hidden" />

          {IS_SAMPLE_DATA && (
            <span
              className="shrink-0 rounded-[5px] bg-amber-400/15 px-1.5 py-[3px] font-mono text-[11px] font-bold tracking-[0.08em] text-amber-300 md:hidden"
              title="Figures on this dashboard come from seeded sample data, not production activity."
            >
              SAMPLE
            </span>
          )}
          {agents && (
            <span
              className={`shrink-0 rounded-[5px] px-1.5 py-[3px] font-mono text-[11px] tracking-[0.08em] md:hidden ${
                failing ? 'bg-red-400/12 text-red-400' : 'bg-emerald-400/12 text-emerald-400'
              }`}
            >
              {failing ? `${failing} FAILING` : 'HEALTHY'}
            </span>
          )}
        </div>

        {/* `min-w-0 flex-1`, NOT `shrink-0`.
            While this was shrink-0 the nav took its full content width and
            pushed the status cluster past the right edge: at 1280px, 122px of
            header — both badges, the roster and the clock — sat off-screen,
            and `overflow-x-auto` never engaged because the nav was never
            asked to be smaller than its contents. An alert nobody can see is
            not an alert. The nav scrolls; the status cluster stays. */}
        <nav
          ref={navRef}
          className={`flex min-w-0 flex-1 items-center gap-1 overflow-x-auto px-4 pb-2 pt-2 md:ml-3 md:px-0 md:py-0 ${
            navMore
              ? '[mask-image:linear-gradient(to_right,#000_calc(100%-28px),transparent)]'
              : ''
          }`}
        >
          {NAV.map((n) => {
            const active = pathname === n.href
            const badge = n.href === '/approvals' ? pendingApprovals : 0
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`flex h-8 items-center gap-1.5 rounded-[11px] px-3 text-[14.5px] transition ${
                  active
                    ? 'bg-cyan-400/10 font-bold text-cyan-400'
                    : 'font-medium text-white/60 hover:text-white/85'
                }`}
              >
                {n.label}
                {/* Pending approvals are the one thing that always needs
                    attention, so the count rides the nav on every screen. */}
                {badge > 0 && (
                  <span
                    className="flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-amber-400 px-1 font-mono text-[12px] font-bold tabular-nums text-amber-950"
                    aria-label={`${badge} approvals waiting`}
                  >
                    {badge}
                  </span>
                )}
              </Link>
            )
          })}
        </nav>

        {/* Never responsively hidden. Demoing mocked numbers as real is how
            trust dies, and the client view — the one most likely to be read as
            real — is the narrow one. It shrinks on small screens; it does not
            disappear. */}
        {IS_SAMPLE_DATA && (
          <span
            className="hidden shrink-0 rounded-[5px] bg-amber-400/15 px-2 py-[5px] font-mono text-[12px] font-bold tracking-[0.08em] text-amber-300 md:inline"
            title="Figures on this dashboard come from seeded sample data, not production activity."
          >
            SAMPLE DATA
          </span>
        )}
        {agents && (
          <span
            className={`hidden shrink-0 rounded-[5px] px-2 py-[5px] font-mono text-[12px] tracking-[0.08em] md:inline ${
              failing
                ? 'bg-red-400/12 text-red-400'
                : 'bg-emerald-400/12 text-emerald-400'
            }`}
          >
            {failing ? `${failing} AGENT FAILING` : 'FLEET HEALTHY'}
          </span>
        )}
        {alerts > 0 && (
          <button
            type="button"
            onClick={async () => {
              await fetch('/api/notifications', { method: 'POST' })
              void refreshNotifs()
            }}
            title={`${alerts} thing${alerts === 1 ? "" : "s"} need${alerts === 1 ? "s" : ""} attention — click to clear`}
            aria-label={`${alerts} alerts, click to clear`}
            className="flex h-[22px] shrink-0 items-center gap-1 rounded-full bg-amber-400/20 px-2 font-mono text-[12px] font-bold text-amber-300 transition hover:bg-amber-400/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60"
          >
            <span aria-hidden="true">!</span>
            {alerts}
          </button>
        )}
        {mentions > 0 && (
          <button
            type="button"
            onClick={async () => {
              await fetch('/api/notifications', { method: 'POST' })
              void refreshNotifs()
            }}
            title={`${mentions} unread mention${mentions === 1 ? '' : 's'} — click to clear`}
            aria-label={`${mentions} unread mentions, click to clear`}
            className="flex h-[22px] shrink-0 items-center gap-1 rounded-full bg-cyan-400/20 px-2 font-mono text-[12px] font-bold text-cyan-300 transition hover:bg-cyan-400/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
          >
            <span aria-hidden="true">@</span>
            {mentions}
          </button>
        )}
        <PresenceBar roster={roster} />
        <span className="hidden md:inline"><Clock /></span>
      </header>

      {/*
        A flex COLUMN, not a plain block. The shell root is `min-h-screen`, so
        it has no definite height, and a child asking for `h-full` inside it
        collapses to its own content — which is why the chat composer floated
        under the messages at the top of the page instead of sitting at the
        bottom of the viewport. As a column flex parent, `flex-1` here gives the
        region a real height for its children to fill.
      */}
      <main className="flex min-h-0 flex-1 flex-col">{children}</main>

      {/*
        Pointer-only, by design. Magnification reacts to a cursor and says
        nothing on a touchscreen, so on touch this is simply absent and the
        labelled top nav — which is the wayfinding, and carries the approvals
        badge — remains the whole story. `pointer-events-none` on the wrapper
        keeps the strip from swallowing clicks meant for the content beneath.
      */}
      <FactBubble />

      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 hidden justify-center [@media(hover:hover)_and_(pointer:fine)]:flex">
        <Dock
          className="pointer-events-auto"
          onNavigate={(href) => router.push(href)}
          items={NAV.map((n) => ({
            href: n.href,
            label: n.label,
            glyph: n.glyph,
            active: pathname === n.href,
            badge: n.href === '/approvals' ? pendingApprovals : undefined,
          }))}
        />
      </div>
    </div>
  )
}
