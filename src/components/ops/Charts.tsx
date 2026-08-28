'use client'

import { ACCENT, T, MONO, ERR, WARN } from '@/lib/ops/tokens'
import { PanelBoundary } from './Panel'

/**
 * Shared chart frame: title, sub-caption, and an axis-labelled plot area.
 *
 * The error boundary lives here rather than at each call site, so a panel
 * cannot be added without one. A chart that throws on a malformed series takes
 * out its own tile and nothing else — the operator keeps every other panel,
 * including the ones that might explain the failure.
 */
export function ChartPanel({
  title,
  caption,
  children,
  leftLabel,
  rightLabel,
}: {
  title: string
  caption: string
  children: React.ReactNode
  leftLabel: string
  rightLabel: string
}) {
  return (
    <PanelBoundary label={title}>
      <div className="flex min-w-0 flex-col rounded-[18px] border border-white/5 bg-white/[0.02] p-4">
        <p className="text-[13px] font-semibold">{title}</p>
        <p className="mt-0.5 font-mono text-[10px] tracking-[0.06em] text-white/35">{caption}</p>
        <div className="mt-3 min-h-0 flex-1">{children}</div>
        <div className="mt-1.5 flex justify-between font-mono text-[9px] text-white/25">
          <span>{leftLabel}</span>
          <span>{rightLabel}</span>
        </div>
      </div>
    </PanelBoundary>
  )
}

/**
 * Stacked run bars. The most recent bucket paints in accent and history in
 * near-transparent white, so "now" is findable without a title or legend.
 */
export function RunBars({ runs, fails }: { runs: number[]; fails: number[] }) {
  const W = 320
  const H = 110
  const barW = W / runs.length
  const max = Math.max(...runs, 1)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-[110px] w-full" preserveAspectRatio="none">
      {runs.map((v, i) => {
        const total = (v / max) * 100
        const errH = (fails[i] / max) * 100
        const okH = Math.max(total - errH, 0)
        const isLast = i === runs.length - 1
        return (
          <g key={i}>
            <rect
              x={i * barW + 1}
              y={H - total}
              width={barW - 2}
              height={okH}
              fill={isLast ? ACCENT : T(0.1)}
              rx="1.5"
            />
            {errH > 0 && (
              <rect x={i * barW + 1} y={H - errH} width={barW - 2} height={errH} fill="#f87171" rx="1.5" />
            )}
          </g>
        )
      })}
    </svg>
  )
}

/**
 * Latency percentiles. p99 is the emphasised series — the tail is what an
 * operator acts on — and each line is direct-labelled at its end rather than
 * pushed into a legend.
 */
export function LatencyLines({
  p50,
  p95,
  p99,
  targetMs,
}: {
  p50: number[]
  p95: number[]
  p99: number[]
  /** This engine's own budget. Omitted for the fleet rollup, which has none. */
  targetMs?: number | null
}) {
  const W = 320
  const H = 120
  const all = [...p50, ...p95, ...p99, ...(targetMs ? [targetMs] : [])]
  const max = Math.max(...all)
  const min = Math.min(...all)
  const span = max - min || 1
  const x = (i: number, len: number) => (i / (len - 1)) * (W - 30)
  const y = (v: number) => H - 10 - ((v - min) / span) * (H - 26)
  const path = (arr: number[]) =>
    arr.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i, arr.length).toFixed(1)},${y(v).toFixed(1)}`).join(' ')

  // p99 is judged against this engine's target, not a global threshold. Over
  // budget turns the emphasised series red; there is no in-between colour,
  // because "slightly over" is still over.
  const overBudget = targetMs != null && p99[p99.length - 1] > targetMs
  const p99Stroke = overBudget ? ERR : ACCENT

  const series = [
    { key: 'p50', arr: p50, stroke: T(0.28), width: 1 },
    { key: 'p95', arr: p95, stroke: T(0.45), width: 1 },
    { key: 'p99', arr: p99, stroke: p99Stroke, width: 1.75 },
  ]

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-[120px] w-full" preserveAspectRatio="none">
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} x1="0" x2={W - 30} y1={H * f} y2={H * f} stroke={T(0.05)} strokeWidth="1" />
      ))}

      {targetMs != null && (
        <>
          {/* Everything above the budget line is time someone spent waiting. */}
          <rect
            x="0"
            y="0"
            width={W - 30}
            height={Math.max(y(targetMs), 0)}
            fill={overBudget ? 'rgba(248,113,113,0.07)' : 'rgba(255,255,255,0.03)'}
          />
          <line
            x1="0"
            x2={W - 30}
            y1={y(targetMs)}
            y2={y(targetMs)}
            stroke={overBudget ? ERR : WARN}
            strokeWidth="1"
            strokeDasharray="3 3"
            opacity="0.7"
          />
        </>
      )}

      {series.map((s) => (
        <g key={s.key}>
          <path d={path(s.arr)} fill="none" stroke={s.stroke} strokeWidth={s.width} strokeLinejoin="round" />
          <text
            x={W - 26}
            y={y(s.arr[s.arr.length - 1]) + 3}
            fill={s.stroke}
            style={{ fontFamily: MONO, fontSize: 9 }}
          >
            {s.key}
          </text>
        </g>
      ))}
    </svg>
  )
}

/** Filled area for token burn / spend. */
export function AreaChart({ values, unit }: { values: number[]; unit: string }) {
  const W = 320
  const H = 120
  const max = Math.max(...values)
  const min = Math.min(...values)
  const span = max - min || 1
  const x = (i: number) => (i / (values.length - 1)) * (W - 34)
  const y = (v: number) => H - 10 - ((v - min) / span) * (H - 26)
  const line = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const area = `${line} L${x(values.length - 1).toFixed(1)},${H} L0,${H} Z`

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-[120px] w-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id="burnFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={ACCENT} stopOpacity="0.22" />
          <stop offset="100%" stopColor={ACCENT} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#burnFill)" />
      <path d={line} fill="none" stroke={ACCENT} strokeWidth="1.5" strokeLinejoin="round" />
      <text x={W - 30} y={y(max) + 3} fill={T(0.4)} style={{ fontFamily: MONO, fontSize: 9 }}>
        {unit}
        {max.toFixed(2)}
      </text>
    </svg>
  )
}

/** Success rate with an SLO threshold rule drawn as a dashed reference line. */
export function SuccessRate({ values, slo }: { values: number[]; slo: number }) {
  const W = 320
  const H = 120
  const max = 100
  const min = Math.min(...values, slo) - 2
  const span = max - min || 1
  const x = (i: number) => (i / (values.length - 1)) * (W - 34)
  const y = (v: number) => H - 10 - ((v - min) / span) * (H - 26)
  const line = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-[120px] w-full" preserveAspectRatio="none">
      <line
        x1="0"
        x2={W - 34}
        y1={y(slo)}
        y2={y(slo)}
        stroke="#fbbf24"
        strokeWidth="1"
        strokeDasharray="3 3"
        opacity="0.55"
      />
      <text
        x={W - 36}
        y={y(slo) - 5}
        textAnchor="end"
        fill="#fbbf24"
        style={{ fontFamily: MONO, fontSize: 9 }}
      >
        {slo}% SLO
      </text>
      <path d={line} fill="none" stroke={ACCENT} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}

/** Per-agent step-duration sparkline on the fleet card. */
export function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (!values.length) {
    return <div className="h-7 w-full rounded-sm border border-dashed border-white/[0.07]" />
  }
  const max = Math.max(...values, 1)
  return (
    <div className="flex h-7 w-full items-end gap-[2px]">
      {values.map((v, i) => (
        <span
          key={i}
          className="flex-1 rounded-t-[1px]"
          style={{
            height: `${Math.max((v / max) * 100, 6)}%`,
            background: i === values.length - 1 ? color : T(0.12),
          }}
        />
      ))}
    </div>
  )
}
