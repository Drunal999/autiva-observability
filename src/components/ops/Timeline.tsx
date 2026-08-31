'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import { OK, WARN, ERR, BLOCKED, T } from '@/lib/ops/tokens'
import { Lane } from './TimelineLane'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const HOUR = 3_600_000
const DAY = 86_400_000

/**
 * The zoom range, as a continuous span of visible time.
 *
 * Two hours is the point where a single run bar is readable; 120 days is a
 * quarter. The API refuses a window over 400 days and this fetches 3x the
 * visible span, so the ceiling is set by that cap, not by taste.
 */
export const MIN_SPAN = 2 * HOUR
export const MAX_SPAN = 120 * DAY
export const DEFAULT_SPAN = 14 * DAY

export interface TimelineItem {
  id: string
  layer: 'human' | 'scheduled' | 'run' | 'deadline'
  title: string
  startsAt: string
  endsAt: string
  allDay?: boolean
  status?: string
  moduleName?: string | null
  recurring?: boolean
  readOnly?: boolean
  readOnlyReason?: string
  href?: string
}

export const LAYERS: { key: TimelineItem['layer']; label: string; tone: string; hint: string }[] = [
  { key: 'human', label: 'Events', tone: '#22d3ee', hint: 'meetings and milestones' },
  { key: 'scheduled', label: 'Scheduled', tone: BLOCKED, hint: 'automations due to run' },
  { key: 'run', label: 'Runs', tone: T(0.45), hint: 'what actually happened' },
  { key: 'deadline', label: 'Waiting', tone: WARN, hint: 'approvals with a clock on them' },
]

export function runTone(status?: string): string {
  if (status === 'FAILED') return ERR
  if (status === 'RUNNING') return '#22d3ee'
  if (status === 'AWAITING_APPROVAL') return BLOCKED
  return OK
}

/**
 * Zoom tier. The span is continuous; the REPRESENTATION changes at thresholds,
 * because an hour label every pixel is noise and a month label across a
 * six-hour window says nothing.
 */
export type Tier = 'hour' | 'day' | 'week' | 'month'

export function tierFor(span: number): Tier {
  if (span <= 3 * DAY) return 'hour'
  if (span <= 21 * DAY) return 'day'
  if (span <= 70 * DAY) return 'week'
  return 'month'
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const pad = (n: number) => String(n).padStart(2, '0')

export interface Tick {
  t: number
  label: string
  /** Majors get a brighter rule and a stronger label: day starts, months, years. */
  major: boolean
}

/**
 * Ticks land on real calendar boundaries, never on even fractions of the
 * window. A tick at 03:47 because that is where a fifth of the screen fell
 * would make the axis unreadable as time.
 *
 * All stepping goes through local Date arithmetic (setDate, setMonth) rather
 * than adding milliseconds, so month lengths and any DST shift are the
 * calendar's rather than an approximation that drifts.
 */
export function buildTicks(tier: Tier, from: number, to: number): Tick[] {
  const span = to - from
  const out: Tick[] = []
  const cursor = new Date(from)
  // A pathological window must not spin here.
  const LIMIT = 400

  if (tier === 'hour') {
    const step = [1, 2, 3, 6, 12, 24].find((h) => span / (h * HOUR) <= 16) ?? 24
    cursor.setMinutes(0, 0, 0)
    cursor.setHours(Math.floor(cursor.getHours() / step) * step)
    while (cursor.getTime() <= to && out.length < LIMIT) {
      const midnight = cursor.getHours() === 0
      out.push({
        t: cursor.getTime(),
        label: midnight
          ? WEEKDAYS[cursor.getDay()] + ' ' + cursor.getDate()
          : pad(cursor.getHours()) + ':00',
        major: midnight,
      })
      cursor.setHours(cursor.getHours() + step)
    }
    return out
  }

  if (tier === 'day') {
    const step = [1, 2, 3].find((d) => span / (d * DAY) <= 16) ?? 3
    cursor.setHours(0, 0, 0, 0)
    while (cursor.getTime() <= to && out.length < LIMIT) {
      const first = cursor.getDate() === 1
      out.push({
        t: cursor.getTime(),
        label: first
          ? MONTHS[cursor.getMonth()] + ' 1'
          : step === 1
            ? WEEKDAYS[cursor.getDay()] + ' ' + cursor.getDate()
            : String(cursor.getDate()),
        major: first,
      })
      cursor.setDate(cursor.getDate() + step)
    }
    return out
  }

  if (tier === 'week') {
    cursor.setHours(0, 0, 0, 0)
    // Back up to Monday. Weeks that begin mid-week read as arbitrary.
    cursor.setDate(cursor.getDate() - ((cursor.getDay() + 6) % 7))
    while (cursor.getTime() <= to && out.length < LIMIT) {
      out.push({
        t: cursor.getTime(),
        label: cursor.getDate() + ' ' + MONTHS[cursor.getMonth()],
        major: cursor.getDate() <= 7,
      })
      cursor.setDate(cursor.getDate() + 7)
    }
    return out
  }

  cursor.setHours(0, 0, 0, 0)
  cursor.setDate(1)
  while (cursor.getTime() <= to && out.length < LIMIT) {
    const jan = cursor.getMonth() === 0
    out.push({
      t: cursor.getTime(),
      label: jan ? String(cursor.getFullYear()) : MONTHS[cursor.getMonth()],
      major: jan,
    })
    cursor.setMonth(cursor.getMonth() + 1)
  }
  return out
}

/** Deterministic. Never Intl, so the server and the browser cannot disagree. */
function stamp(ms: number, withTime: boolean): string {
  const d = new Date(ms)
  const date = d.getDate() + ' ' + MONTHS[d.getMonth()]
  return withTime ? date + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) : date
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/**
 * Keeps the instant under the pointer fixed while the scale changes.
 *
 * Zooming about the centre instead makes whatever you were looking at slide
 * away, which is why a timeline that does it feels broken even when the
 * arithmetic is right.
 */
export function zoomWindow(
  center: number,
  span: number,
  factor: number,
  fraction: number
): { center: number; span: number } {
  const next = clamp(span * factor, MIN_SPAN, MAX_SPAN)
  const anchorT = center - span / 2 + span * fraction
  return { span: next, center: anchorT - fraction * next + next / 2 }
}

/**
 * One continuous time axis, zoomable from a quarter down to a couple of hours.
 *
 * The window is a (centre, span) pair rather than a set of discrete "week" and
 * "month" modes, so zoom is a smooth change of scale; the tier only decides how
 * the axis is LABELLED. Nothing snaps.
 */
export function Timeline({
  enabled,
  onCreated,
}: {
  enabled: Record<string, boolean>
  onCreated?: () => void
}) {
  /**
   * Centre and span are ONE piece of state, not two.
   *
   * They were two, and zooming updated the second from inside the first's
   * updater — which React is free to run at a different time, so the span it
   * returned was frequently the old one. The visible symptom was zoom-out
   * stalling at three weeks and pinch-zoom panning instead of zooming. A
   * window is a single value; storing it as one makes the update atomic.
   */
  const [win, setWin] = useState<{ center: number; span: number }>(() => ({
    center: Date.now(),
    span: DEFAULT_SPAN,
  }))
  const { center, span } = win
  const trackRef = useRef<HTMLDivElement>(null)

  const winStart = center - span / 2
  const winEnd = center + span / 2
  const tier = tierFor(span)

  // ── fetch window ────────────────────────────────────────────────
  // Three times the visible span, quantised, so panning and zooming inside the
  // current neighbourhood re-render from cache instead of firing a request per
  // frame. Without this, one wheel gesture is fifty requests.
  const fetchKey = useMemo(() => {
    const fetchSpan = Math.min(span * 3, 399 * DAY)
    const grid = fetchSpan / 6
    const anchor = Math.round(center / grid) * grid
    const from = new Date(anchor - fetchSpan / 2).toISOString()
    const to = new Date(anchor + fetchSpan / 2).toISOString()
    return '/api/calendar?from=' + from + '&to=' + to
  }, [center, span])

  const { data, isLoading, mutate } = useSWR<{ items: TimelineItem[] }>(fetchKey, fetcher, {
    keepPreviousData: true,
  })

  const items = useMemo(
    () => (data?.items ?? []).filter((i) => enabled[i.layer]),
    [data, enabled]
  )

  const applyZoom = useCallback((factor: number, fraction: number) => {
    setWin((w) => zoomWindow(w.center, w.span, factor, fraction))
  }, [])

  const panBy = useCallback((fractionOfWindow: number) => {
    setWin((w) => ({ ...w, center: w.center + w.span * fractionOfWindow }))
  }, [])

  const reset = useCallback(() => setWin({ center: Date.now(), span: DEFAULT_SPAN }), [])

  useEffect(() => {
    const el = trackRef.current
    if (!el) return
    // Registered by hand because React's onWheel is passive: preventDefault
    // there is ignored and the page scrolls out from under the zoom.
    const onWheel = (e: WheelEvent) => {
      const rect = el.getBoundingClientRect()
      const fraction = clamp((e.clientX - rect.left) / rect.width, 0, 1)
      if (e.ctrlKey || e.metaKey) {
        // A trackpad pinch arrives as ctrl+wheel, so this is also the pinch.
        e.preventDefault()
        applyZoom(Math.exp(e.deltaY * 0.008), fraction)
        return
      }
      const dx = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
      if (dx === 0) return
      e.preventDefault()
      setWin((w) => ({ ...w, center: w.center + (dx / rect.width) * w.span }))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [applyZoom])

  // ── pan ─────────────────────────────────────────────────────────
  const panRef = useRef<{ x: number; center: number } | null>(null)
  const [panning, setPanning] = useState(false)

  useEffect(() => {
    if (!panning) return
    const move = (e: MouseEvent) => {
      const el = trackRef.current
      if (!el || !panRef.current) return
      const dx = e.clientX - panRef.current.x
      const from = panRef.current.center
      setWin((w) => ({ ...w, center: from - (dx / el.clientWidth) * w.span }))
    }
    const up = () => {
      panRef.current = null
      setPanning(false)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    return () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
  }, [panning, span])

  // ── the now line ────────────────────────────────────────────────
  // The divider between what happened and what is merely scheduled, which is
  // the whole claim this view makes. It has to move on its own.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  const ticks = useMemo(() => buildTicks(tier, winStart, winEnd), [tier, winStart, winEnd])
  const pct = useCallback((t: number) => ((t - winStart) / span) * 100, [winStart, span])

  const byLayer = useMemo(() => {
    const map = new Map<string, TimelineItem[]>()
    LAYERS.forEach((l) => map.set(l.key, []))
    for (const i of items) map.get(i.layer)?.push(i)
    return map
  }, [items])

  const visibleLayers = LAYERS.filter((l) => enabled[l.key])

  return (
    <div className="flex flex-col gap-2">
      <TimelineControls
        span={span}
        tier={tier}
        winStart={winStart}
        winEnd={winEnd}
        onZoom={(f) => applyZoom(f, 0.5)}
        onReset={reset}
      />

      <div
        ref={trackRef}
        role="group"
        aria-label="Zoomable timeline"
        data-tier={tier}
        tabIndex={0}
        onKeyDown={(e) => {
          // Every gesture has a key. A wheel-only zoom is unusable for anyone
          // without a wheel, and unreachable by keyboard entirely.
          if (e.key === '+' || e.key === '=') { e.preventDefault(); applyZoom(1 / 1.5, 0.5) }
          else if (e.key === '-' || e.key === '_') { e.preventDefault(); applyZoom(1.5, 0.5) }
          else if (e.key === 'ArrowLeft') { e.preventDefault(); panBy(-0.25) }
          else if (e.key === 'ArrowRight') { e.preventDefault(); panBy(0.25) }
          else if (e.key === '0') { e.preventDefault(); reset() }
        }}
        className="relative select-none overflow-hidden rounded-[14px] border border-white/[0.07] bg-white/[0.015] focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40"
        style={{ cursor: panning ? 'grabbing' : undefined }}
      >
        <Axis ticks={ticks} pct={pct} />

        {/* Gridlines run behind every lane, so a bar is readable against time. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 top-[26px] z-0">
          {ticks.map((t) => (
            <span
              key={t.t}
              className="absolute top-0 h-full w-px"
              style={{
                left: pct(t.t) + '%',
                background: t.major ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.04)',
              }}
            />
          ))}
        </div>

        <div className="relative z-10">
          {visibleLayers.map((layer) => (
            <Lane
              key={layer.key}
              layer={layer}
              items={byLayer.get(layer.key) ?? []}
              pct={pct}
              winStart={winStart}
              winEnd={winEnd}
              span={span}
              tier={tier}
              onPan={(x) => {
                panRef.current = { x, center }
                setPanning(true)
              }}
              onCreated={() => {
                void mutate()
                onCreated?.()
              }}
            />
          ))}
          {visibleLayers.length === 0 && (
            <p className="px-3 py-6 text-center font-mono text-[12px] text-white/25">
              Every layer is switched off.
            </p>
          )}
        </div>

        {now >= winStart && now <= winEnd && (
          <div
            className="pointer-events-none absolute bottom-0 top-0 z-20 w-px"
            style={{ left: pct(now) + '%', background: 'rgba(34,211,238,0.85)' }}
            data-testid="now-line"
          >
            <span className="absolute -left-[3px] top-[19px] h-[7px] w-[7px] rounded-full bg-cyan-400" />
          </div>
        )}

        {isLoading && !data && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/25">
            <span className="font-mono text-[12px] text-white/40">loading timeline…</span>
          </div>
        )}
      </div>

      <p className="font-mono text-[11.5px] leading-relaxed text-white/25">
        Drag to pan · ⌘/ctrl-scroll or pinch to zoom · drag the Events lane to create · when
        focused: <span className="text-white/40">+ −</span> zoom,{' '}
        <span className="text-white/40">← →</span> pan, <span className="text-white/40">0</span> reset
      </p>
    </div>
  )
}

function TimelineControls({
  span, tier, winStart, winEnd, onZoom, onReset,
}: {
  span: number
  tier: Tier
  winStart: number
  winEnd: number
  onZoom: (factor: number) => void
  onReset: () => void
}) {
  const withTime = tier === 'hour'
  const label =
    span < DAY
      ? Math.round(span / HOUR) + ' hours'
      : span < 60 * DAY
        ? Math.round(span / DAY) + ' days'
        : (span / (30 * DAY)).toFixed(1) + ' months'

  const btn =
    'h-7 rounded-[8px] border border-white/10 px-2 font-mono text-[12px] text-white/55 transition hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30 disabled:opacity-30'

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-mono text-[12px] tabular-nums text-white/40" data-testid="window-label">
        {stamp(winStart, withTime)} → {stamp(winEnd, withTime)}
      </span>
      <span
        className="rounded-[5px] border border-white/[0.08] px-1.5 py-[2px] font-mono text-[11px] uppercase tracking-[0.1em] text-white/35"
        // The tier is shown because it explains why the axis just relabelled
        // itself. Without it the change reads as a glitch.
        title="Label density changes with zoom; the scale itself is continuous"
      >
        {tier} · {label}
      </span>
      <span className="flex-1" />
      <button type="button" className={btn} onClick={() => onZoom(1.6)} disabled={span >= MAX_SPAN}>
        − out
      </button>
      <button type="button" className={btn} onClick={onReset}>
        now
      </button>
      <button type="button" className={btn} onClick={() => onZoom(1 / 1.6)} disabled={span <= MIN_SPAN}>
        + in
      </button>
    </div>
  )
}

function Axis({ ticks, pct }: { ticks: Tick[]; pct: (t: number) => number }) {
  return (
    <div className="relative h-[26px] border-b border-white/[0.07]">
      {ticks.map((t) => (
        <span
          key={t.t}
          className="absolute top-[7px] whitespace-nowrap pl-1 font-mono text-[11px] tabular-nums"
          style={{
            left: pct(t.t) + '%',
            color: t.major ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.28)',
            fontWeight: t.major ? 700 : 400,
          }}
        >
          {t.label}
        </span>
      ))}
    </div>
  )
}
