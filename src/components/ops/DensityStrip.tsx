'use client'

import { useEffect, useState } from 'react'
import { ACCENT, ERR, T } from '@/lib/ops/tokens'
import { inrCompact } from '@/lib/ops/format'

interface Bucket {
  at: string
  runs: number
  failed: number
  costInr: number
}

/**
 * Run volume and failure rate per hour across the visible range.
 *
 * This is the element that makes the calendar worth opening over Google
 * Calendar: it shows the rhythm of the business at a glance — when work
 * actually happens, and when it goes wrong — from data nobody typed.
 *
 * Height is volume, red is failure. Both are needed: a quiet hour with one
 * failure and a busy hour with one failure are different problems.
 */
export function DensityStrip({
  buckets,
  onScrub,
}: {
  buckets: Bucket[]
  /** Click a column to jump the grid to that hour. */
  onScrub?: (at: string) => void
}) {
  const max = Math.max(...buckets.map((b) => b.runs), 1)
  const totalRuns = buckets.reduce((s, b) => s + b.runs, 0)
  const totalFailed = buckets.reduce((s, b) => s + b.failed, 0)
  const totalCost = buckets.reduce((s, b) => s + b.costInr, 0)

  // The now-line moves. Recomputed each minute rather than each frame: this is
  // a position, not an animation, and a 60s tick is imperceptibly different
  // while costing nothing.
  const [nowPct, setNowPct] = useState<number | null>(null)
  useEffect(() => {
    if (buckets.length === 0) return
    const compute = () => {
      const first = new Date(buckets[0].at).getTime()
      const last = new Date(buckets[buckets.length - 1].at).getTime() + 3600_000
      const now = Date.now()
      if (now < first || now > last) return setNowPct(null)
      setNowPct(((now - first) / (last - first)) * 100)
    }
    compute()
    const t = setInterval(compute, 60_000)
    return () => clearInterval(t)
  }, [buckets])

  if (buckets.length === 0) return null

  return (
    <div className="flex flex-col gap-1.5 rounded-[14px] border border-white/[0.06] bg-white/[0.02] p-3">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <span className="font-mono text-[12px] font-bold uppercase tracking-[0.14em] text-white/40">
          Activity
        </span>
        <span className="font-mono text-[11.5px] tracking-[0.06em] text-white/28">
          {totalRuns} RUNS · {totalFailed} FAILED · {inrCompact(totalCost)} · LAST {buckets.length}H
        </span>
      </div>

      <div className="relative flex h-[46px] items-end gap-[2px]">
        {buckets.map((b) => {
          const h = (b.runs / max) * 100
          const failH = b.runs > 0 ? (b.failed / max) * 100 : 0
          const hour = new Date(b.at).toLocaleTimeString([], { hour: '2-digit' })
          return (
            <button
              key={b.at}
              type="button"
              onClick={() => onScrub?.(b.at)}
              title={`${hour} — ${b.runs} runs, ${b.failed} failed`}
              className="group relative flex-1 rounded-t-[2px] focus:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400/60"
              style={{ height: `${Math.max(h, 3)}%`, background: T(0.1) }}
            >
              {failH > 0 && (
                <span
                  className="absolute inset-x-0 bottom-0 rounded-t-[2px]"
                  style={{ height: `${(b.failed / Math.max(b.runs, 1)) * 100}%`, background: ERR }}
                />
              )}
              <span
                className="absolute inset-0 rounded-t-[2px] opacity-0 transition group-hover:opacity-100"
                style={{ background: `${ACCENT}44` }}
              />
            </button>
          )
        })}

        {/* Live now-line. It actually moves. */}
        {nowPct !== null && (
          <span
            className="pointer-events-none absolute inset-y-0 w-[1px]"
            style={{ left: `${nowPct}%`, background: ACCENT, boxShadow: `0 0 6px ${ACCENT}` }}
            aria-hidden="true"
          />
        )}
      </div>

      <div className="flex justify-between font-mono text-[11px] text-white/22">
        <span>{new Date(buckets[0].at).toLocaleTimeString([], { hour: '2-digit' })}</span>
        <span>now</span>
      </div>
    </div>
  )
}

/**
 * Spend per day along the bottom of the grid, with the next seven days shaded
 * as a projection.
 *
 * The forecast is drawn faintly and labelled, because an expensive day that
 * has not happened yet is a different fact from one that has. Presenting a
 * projection as history is exactly the "data slop" the brief forbids.
 */
export function CostRibbon({
  buckets,
  forecastDays = 7,
}: {
  buckets: Bucket[]
  forecastDays?: number
}) {
  if (buckets.length === 0) return null

  // Group hourly buckets into days.
  const byDay = new Map<string, number>()
  for (const b of buckets) {
    const key = new Date(b.at).toISOString().slice(0, 10)
    byDay.set(key, (byDay.get(key) ?? 0) + b.costInr)
  }
  const actual: [string, number][] = []
  byDay.forEach((v, k) => actual.push([k, v]))
  actual.sort((a, b) => a[0].localeCompare(b[0]))
  if (actual.length === 0) return null

  // Projection is a plain mean of what is known. A cleverer model would imply
  // a confidence this data does not support.
  const mean = actual.reduce((s, [, v]) => s + v, 0) / actual.length
  const lastDay = new Date(actual[actual.length - 1][0])
  const forecast = Array.from({ length: forecastDays }, (_, i) => {
    const d = new Date(lastDay.getTime() + (i + 1) * 86400_000)
    return [d.toISOString().slice(0, 10), mean] as const
  })

  const all = [...actual, ...forecast]
  const max = Math.max(...all.map(([, v]) => v), 1)

  return (
    <div className="flex flex-col gap-1.5 rounded-[14px] border border-white/[0.06] bg-white/[0.02] p-3">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <span className="font-mono text-[12px] font-bold uppercase tracking-[0.14em] text-white/40">
          Spend
        </span>
        <span className="font-mono text-[11.5px] text-white/28">
          {inrCompact(actual.reduce((s, [, v]) => s + v, 0))} SO FAR ·{' '}
          {inrCompact(mean)}/DAY AVERAGE
        </span>
        <span className="flex-1" />
        <span className="font-mono text-[11px] tracking-[0.06em] text-white/25">
          HATCHED = PROJECTION, NOT ACTUAL
        </span>
      </div>

      <div className="flex h-[34px] items-end gap-[2px]">
        {all.map(([day, value], i) => {
          const isForecast = i >= actual.length
          return (
            <span
              key={day}
              title={`${day} — ${inrCompact(value)}${isForecast ? ' (projected)' : ''}`}
              className="flex-1 rounded-t-[2px]"
              style={{
                height: `${Math.max((value / max) * 100, 4)}%`,
                background: isForecast ? 'transparent' : `${ACCENT}55`,
                border: isForecast ? `1px dashed ${T(0.22)}` : 'none',
              }}
            />
          )
        })}
      </div>
    </div>
  )
}
