'use client'

import { useEffect, useRef, useState } from 'react'
import { T } from '@/lib/ops/tokens'
import { runTone, type TimelineItem, type Tier } from './Timeline'

const MINUTE = 60_000
const HOUR = 3_600_000

/** Rows within one lane, so overlapping items do not hide each other. */
const MAX_ROWS = 3
/** Above this, individual bars are slivers and the lane becomes a histogram. */
const DENSITY_THRESHOLD = 60
const ROW_H = 19

interface Placed extends TimelineItem {
  row: number
  from: number
  to: number
}

/**
 * Greedy row packing: an item goes in the first row whose previous item has
 * finished, plus a gap wide enough for a label.
 *
 * The gap is measured in time rather than pixels because the caller works in
 * time; it is a fraction of the window, so it stays a constant width on screen
 * at every zoom level.
 */
export function packRows(items: TimelineItem[], span: number, maxRows = MAX_ROWS): {
  placed: Placed[]
  overflow: number
} {
  const gap = span * 0.06
  const rowEnds: number[] = []
  const placed: Placed[] = []
  let overflow = 0

  const sorted = [...items].sort(
    (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
  )

  for (const item of sorted) {
    const from = new Date(item.startsAt).getTime()
    const to = Math.max(new Date(item.endsAt).getTime(), from)
    let row = rowEnds.findIndex((end) => end <= from)
    if (row === -1) {
      if (rowEnds.length >= maxRows) {
        overflow += 1
        continue
      }
      rowEnds.push(0)
      row = rowEnds.length - 1
    }
    rowEnds[row] = to + gap
    placed.push({ ...item, row, from, to })
  }

  return { placed, overflow }
}

/**
 * Aggregate columns for a lane too dense to draw item by item.
 *
 * Drawing 400 half-pixel bars is not more information than "42 runs, 3 failed"
 * — it is the same information rendered illegibly, and it costs 400 nodes.
 */
export function densify(
  items: TimelineItem[],
  winStart: number,
  winEnd: number,
  columns = 48
): { count: number; failed: number }[] {
  const width = (winEnd - winStart) / columns
  const out = Array.from({ length: columns }, () => ({ count: 0, failed: 0 }))
  for (const i of items) {
    const idx = Math.floor((new Date(i.startsAt).getTime() - winStart) / width)
    if (idx < 0 || idx >= columns) continue
    out[idx].count += 1
    if (i.status === 'FAILED') out[idx].failed += 1
  }
  return out
}

/**
 * Snap a dragged instant to something a person would have meant.
 *
 * At hour zoom the useful unit is a quarter hour; any coarser and the axis is
 * showing detail the gesture cannot express. Above that the unit is the day,
 * because a day-scale drag carries no information about clock time.
 */
export function snapTo(t: number, tier: Tier): number {
  if (tier === 'hour') return Math.round(t / (15 * MINUTE)) * (15 * MINUTE)
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function Lane({
  layer, items, pct, winStart, winEnd, span, tier, onPan, onCreated,
}: {
  layer: { key: TimelineItem['layer']; label: string; tone: string; hint: string }
  items: TimelineItem[]
  pct: (t: number) => number
  winStart: number
  winEnd: number
  span: number
  tier: Tier
  onPan: (clientX: number) => void
  onCreated: () => void
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLInputElement>(null)
  const dense = items.length > DENSITY_THRESHOLD

  // Creating is only meaningful on the layer you own. A run already happened
  // and a scheduled row belongs to Automations, so neither accepts a drag.
  const creatable = layer.key === 'human'

  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null)
  const [pending, setPending] = useState<{ from: number; to: number } | null>(null)
  const [draft, setDraft] = useState('')
  const [undo, setUndo] = useState<{ id: string; title: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const timeAt = (clientX: number) => {
    const el = trackRef.current
    if (!el) return winStart
    const rect = el.getBoundingClientRect()
    const fraction = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    return snapTo(winStart + fraction * span, tier)
  }

  useEffect(() => {
    if (!drag) return
    const move = (e: MouseEvent) => setDrag((d) => (d ? { ...d, to: timeAt(e.clientX) } : d))
    const up = () => {
      setDrag((d) => {
        if (!d) return null
        const from = Math.min(d.from, d.to)
        let to = Math.max(d.from, d.to)
        // A click rather than a drag still means something: one unit.
        if (to === from) to = from + (tier === 'hour' ? HOUR : 86_400_000)
        setPending({ from, to })
        setTimeout(() => titleRef.current?.focus(), 0)
        return null
      })
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    return () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
  })

  useEffect(() => {
    if (!undo) return
    const id = setTimeout(() => setUndo(null), 8000)
    return () => clearTimeout(id)
  }, [undo])

  async function create() {
    if (!pending || !draft.trim()) return
    // At day zoom and coarser the drag carries no clock time, so the event is
    // all-day. Inventing a start of 09:00 nobody chose is the guess this UI
    // exists to avoid.
    const allDay = tier !== 'hour'
    const end = new Date(pending.to)
    if (allDay) end.setHours(23, 59, 0, 0)

    setError(null)
    const res = await fetch('/api/calendar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: draft.trim(),
        startsAt: new Date(pending.from).toISOString(),
        endsAt: end.toISOString(),
        allDay,
      }),
    })
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}))
      setError(payload.error ?? 'Could not create that event.')
      return
    }
    const created = await res.json().catch(() => null)
    if (created?.id) setUndo({ id: created.id, title: draft.trim() })
    setPending(null)
    setDraft('')
    onCreated()
  }

  const { placed, overflow } = dense
    ? { placed: [] as Placed[], overflow: 0 }
    : packRows(items, span)
  const rows = dense ? 2 : Math.max(1, Math.min(MAX_ROWS, placed.length ? Math.max(...placed.map((p) => p.row)) + 1 : 1))
  const height = rows * ROW_H + 10

  const selection = drag
    ? { from: Math.min(drag.from, drag.to), to: Math.max(drag.from, drag.to) }
    : pending

  return (
    <div className="relative flex border-b border-white/[0.05] last:border-b-0">
      <div
        className="z-10 flex w-[74px] shrink-0 items-center gap-1.5 border-r border-white/[0.05] px-2"
        title={layer.hint}
      >
        <span className="h-[6px] w-[6px] shrink-0 rounded-sm" style={{ background: layer.tone }} />
        <span className="truncate font-mono text-[9px] uppercase tracking-[0.08em] text-white/40">
          {layer.label}
        </span>
      </div>

      <div
        ref={trackRef}
        className="relative min-w-0 flex-1"
        style={{ height, cursor: creatable ? 'cell' : 'grab' }}
        onMouseDown={(e) => {
          if (e.button !== 0) return
          if (!creatable) {
            // Lanes you cannot write to still pan, so the whole surface is
            // draggable rather than only the gaps between lanes.
            onPan(e.clientX)
            return
          }
          setPending(null)
          const t = timeAt(e.clientX)
          setDrag({ from: t, to: t })
        }}
      >
        {selection && (
          <span
            className="pointer-events-none absolute inset-y-[3px] rounded-[4px] border border-cyan-400/60 bg-cyan-400/15"
            style={{
              left: pct(selection.from) + '%',
              width: 'max(' + (pct(selection.to) - pct(selection.from)) + '%, 2px)',
            }}
          />
        )}

        {dense ? (
          <DensityLane items={items} winStart={winStart} winEnd={winEnd} tone={layer.tone} height={height} />
        ) : (
          placed.map((item) => {
            const left = pct(item.from)
            const width = pct(item.to) - left
            const tone = item.layer === 'run' ? runTone(item.status) : layer.tone
            const label =
              item.title + (item.moduleName ? ' · ' + item.moduleName : '')

            const bar = (
              <>
                <span
                  className="absolute inset-y-0 rounded-[3px]"
                  style={{
                    left: 0,
                    width: 'max(' + width + '%, 3px)',
                    background: item.layer === 'run' ? tone : tone + '33',
                    borderLeft: '2px solid ' + tone,
                    opacity: item.readOnly ? 0.65 : 1,
                  }}
                />
                <span
                  className="pointer-events-none absolute inset-y-0 flex items-center truncate pl-1 text-[10px] leading-none"
                  style={{ left: 'max(' + width + '%, 3px)', color: T(0.7), paddingLeft: 4 }}
                >
                  {item.readOnly && <span className="mr-[3px] opacity-60">🔒</span>}
                  {item.recurring && <span className="mr-[3px] opacity-60">↻</span>}
                  {item.title}
                </span>
              </>
            )

            const style = {
              left: left + '%',
              right: 'auto',
              top: item.row * ROW_H + 5,
              height: ROW_H - 4,
              width: 'max(' + width + '%, 3px)',
            } as const

            return item.href ? (
              <a
                key={item.id}
                href={item.href}
                title={label}
                onMouseDown={(e) => e.stopPropagation()}
                className="absolute focus:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400/70"
                style={style}
              >
                {bar}
              </a>
            ) : (
              <span
                key={item.id}
                title={item.readOnly ? label + ' — ' + item.readOnlyReason : label}
                onMouseDown={(e) => e.stopPropagation()}
                className="absolute"
                style={style}
              >
                {bar}
              </span>
            )
          })
        )}

        {overflow > 0 && (
          <span
            className="absolute right-1 top-1 rounded-[4px] bg-white/[0.08] px-1 font-mono text-[8.5px] text-white/45"
            title="Zoom in to see these"
          >
            +{overflow} more
          </span>
        )}
      </div>

      {pending && (
        <div className="absolute inset-x-0 top-full z-40 mt-1 flex items-center gap-2 rounded-[10px] border border-cyan-400/35 bg-[#0b1220] px-2 py-1.5 shadow-lg">
          <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-cyan-300/70">
            new {tier === 'hour' ? 'event' : 'all-day event'}
          </span>
          <input
            ref={titleRef}
            value={draft}
            maxLength={200}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); void create() }
              if (e.key === 'Escape') { setPending(null); setDraft('') }
            }}
            placeholder="Name it, then Enter"
            aria-label="New event title"
            className="min-w-0 flex-1 bg-transparent text-[12px] text-white/85 outline-none placeholder:text-white/25"
          />
          {error && <span className="font-mono text-[9px] text-red-300">{error}</span>}
          <button
            type="button"
            onClick={() => { setPending(null); setDraft('') }}
            className="font-mono text-[9px] text-white/35 hover:text-white/70"
          >
            esc
          </button>
        </div>
      )}

      {undo && (
        <div className="absolute inset-x-0 top-full z-40 mt-1 flex items-center gap-2 rounded-[10px] border border-white/10 bg-[#0b1220] px-2 py-1.5">
          <span className="truncate text-[11.5px] text-white/70">Added “{undo.title}”</span>
          <span className="flex-1" />
          <button
            type="button"
            onClick={async () => {
              await fetch('/api/calendar/' + undo.id, { method: 'DELETE' })
              setUndo(null)
              onCreated()
            }}
            className="font-mono text-[10px] text-cyan-300 hover:text-cyan-200"
          >
            Undo
          </button>
        </div>
      )}
    </div>
  )
}

function DensityLane({
  items, winStart, winEnd, tone, height,
}: {
  items: TimelineItem[]
  winStart: number
  winEnd: number
  tone: string
  height: number
}) {
  const cols = densify(items, winStart, winEnd)
  const peak = Math.max(1, ...cols.map((c) => c.count))
  const failed = items.filter((i) => i.status === 'FAILED').length

  return (
    <>
      <div className="absolute inset-0 flex items-end gap-[1px] px-[1px] pb-[3px]">
        {cols.map((c, i) => (
          <span
            key={i}
            className="flex-1 rounded-t-[2px]"
            style={{
              height: Math.max(2, (c.count / peak) * (height - 8)),
              // Failure keeps its saturation at every zoom level. A lane
              // summarised into columns must not summarise away the red.
              background: c.failed > 0 ? 'rgba(248,113,113,0.75)' : tone,
              opacity: c.count === 0 ? 0.12 : 1,
            }}
            title={c.count + ' in this slice' + (c.failed ? ', ' + c.failed + ' failed' : '')}
          />
        ))}
      </div>
      <span className="absolute right-1 top-1 rounded-[4px] bg-black/40 px-1 font-mono text-[8.5px] text-white/45">
        {items.length} total{failed > 0 ? ' · ' + failed + ' failed' : ''}
      </span>
    </>
  )
}
