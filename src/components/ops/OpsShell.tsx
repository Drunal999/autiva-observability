'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import useSWR from 'swr'
import { NAV, fmtClock } from '@/lib/ops/tokens'
import type { Agent } from '@/types/agentOps'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

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
  const { data: agents } = useSWR<Agent[]>('/api/agents', fetcher, { refreshInterval: 20000 })

  const failing = agents?.filter((a) => a.status === 'FAILED').length ?? 0

  return (
    <div className="flex min-h-screen flex-col text-[#f5f5f7]">
      <header className="flex h-14 shrink-0 items-center gap-3 overflow-x-auto border-b border-white/5 px-4 md:gap-4 md:px-5">
        <div className="flex shrink-0 items-center gap-2.5">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg border border-cyan-400/55">
            <span className="h-2 w-2 rounded-sm bg-cyan-400" />
          </span>
          <span className="text-[15px] font-extrabold tracking-tight">AUTIVA</span>
          <span className="hidden font-mono text-[10px] uppercase tracking-[0.16em] text-white/35 lg:inline">
            Mission Control
          </span>
        </div>

        <nav className="flex shrink-0 items-center gap-1 md:ml-3">
          {NAV.map((n) => {
            const active = pathname === n.href
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`flex h-8 items-center rounded-[11px] px-3 text-[12.5px] transition ${
                  active
                    ? 'bg-cyan-400/10 font-bold text-cyan-400'
                    : 'font-medium text-white/60 hover:text-white/85'
                }`}
              >
                {n.label}
              </Link>
            )
          })}
        </nav>

        <div className="flex-1" />

        <span className="hidden shrink-0 rounded-[5px] bg-white/5 px-2 py-[5px] font-mono text-[10px] tracking-[0.08em] text-white/40 xl:inline">
          SAMPLE DATA
        </span>
        {agents && (
          <span
            className={`shrink-0 rounded-[5px] px-2 py-[5px] font-mono text-[10px] tracking-[0.08em] ${
              failing
                ? 'bg-red-400/12 text-red-400'
                : 'bg-emerald-400/12 text-emerald-400'
            }`}
          >
            {failing ? `${failing} AGENT FAILING` : 'FLEET HEALTHY'}
          </span>
        )}
        <Clock />
      </header>

      <main className="min-h-0 flex-1">{children}</main>
    </div>
  )
}
