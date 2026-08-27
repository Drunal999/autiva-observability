'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import useSWR from 'swr'
import { NAV, fmtClock } from '@/lib/ops/tokens'
import type { FleetResponse } from '@/types/agentOps'
import type { ApprovalsResponse } from '@/types/approvals'

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
    <span className="font-mono text-[11px] tabular-nums text-white/45">
      {now ? fmtClock(now) : '--:--:--'}
    </span>
  )
}

export function OpsShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  // /api/agents returns { mode, agents } — the mode is decided server-side, so
  // the payload is an object, not a bare array.
  const { data } = useSWR<FleetResponse>('/api/agents', fetcher, { refreshInterval: 20000 })
  const agents = data?.agents

  const { data: approvals } = useSWR<ApprovalsResponse>('/api/approvals', fetcher, {
    refreshInterval: 20000,
  })
  const pendingApprovals = approvals?.pending?.length ?? 0

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
          <span className="text-[15px] font-extrabold tracking-tight">AUTIVA</span>
          <span className="hidden font-mono text-[10px] uppercase tracking-[0.16em] text-white/35 lg:inline">
            Mission Control
          </span>

          <span className="flex-1 md:hidden" />

          {IS_SAMPLE_DATA && (
            <span
              className="shrink-0 rounded-[5px] bg-amber-400/15 px-1.5 py-[3px] font-mono text-[9px] font-bold tracking-[0.08em] text-amber-300 md:hidden"
              title="Figures on this dashboard come from seeded sample data, not production activity."
            >
              SAMPLE
            </span>
          )}
          {agents && (
            <span
              className={`shrink-0 rounded-[5px] px-1.5 py-[3px] font-mono text-[9px] tracking-[0.08em] md:hidden ${
                failing ? 'bg-red-400/12 text-red-400' : 'bg-emerald-400/12 text-emerald-400'
              }`}
            >
              {failing ? `${failing} FAILING` : 'HEALTHY'}
            </span>
          )}
        </div>

        <nav className="flex shrink-0 items-center gap-1 overflow-x-auto px-4 pb-2 pt-2 md:ml-3 md:px-0 md:py-0">
          {NAV.map((n) => {
            const active = pathname === n.href
            const badge = n.href === '/approvals' ? pendingApprovals : 0
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`flex h-8 items-center gap-1.5 rounded-[11px] px-3 text-[12.5px] transition ${
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
                    className="flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-amber-400 px-1 font-mono text-[10px] font-bold tabular-nums text-amber-950"
                    aria-label={`${badge} approvals waiting`}
                  >
                    {badge}
                  </span>
                )}
              </Link>
            )
          })}
        </nav>

        <div className="hidden flex-1 md:block" />

        {/* Never responsively hidden. Demoing mocked numbers as real is how
            trust dies, and the client view — the one most likely to be read as
            real — is the narrow one. It shrinks on small screens; it does not
            disappear. */}
        {IS_SAMPLE_DATA && (
          <span
            className="hidden shrink-0 rounded-[5px] bg-amber-400/15 px-2 py-[5px] font-mono text-[10px] font-bold tracking-[0.08em] text-amber-300 md:inline"
            title="Figures on this dashboard come from seeded sample data, not production activity."
          >
            SAMPLE DATA
          </span>
        )}
        {agents && (
          <span
            className={`hidden shrink-0 rounded-[5px] px-2 py-[5px] font-mono text-[10px] tracking-[0.08em] md:inline ${
              failing
                ? 'bg-red-400/12 text-red-400'
                : 'bg-emerald-400/12 text-emerald-400'
            }`}
          >
            {failing ? `${failing} AGENT FAILING` : 'FLEET HEALTHY'}
          </span>
        )}
        <span className="hidden md:inline"><Clock /></span>
      </header>

      <main className="min-h-0 flex-1">{children}</main>
    </div>
  )
}
