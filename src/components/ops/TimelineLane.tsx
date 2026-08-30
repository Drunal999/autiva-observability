'use client'

import { useEffect, useRef, useState } from 'react'
import { T } from '@/lib/ops/tokens'
import { runTone, type TimelineItem, type Tier } from './Timeline'
import { toDateOnly } from '@/lib/ops/allDay'

const MINUTE = 60_000
const HOUR = 3_600_000
const DAY = 86_400_000

/** Rows within one lane, so overlapping items do not hide each other. */
const MAX_ROWS = 3
/** Above this, individual bars are slivers and the lane becomes a histogram. */
const DENSITY_THRESHOLD = 60
const ROW_H = 19
/** Grab zone for a resize, in pixels at either end of a bar. */
const EDGE_PX = 7

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

/** The smallest an event can be dragged down to at this zoom. */
export function minDuration(tier: Tier): number {
  return tier === 'hour' ? 15 * MINUTE : DAY
}

/**
 * What a drag on this item would mean, or why it means nothing.
 *
 * A recurring occurrence has a DERIVED id (`eventId@instant`) and no row of its
 * own. Dragging one would have to either move the whole series or invent an
 * exception, and silently doing the first is the kind of guess that loses
 * somebody's standup. Until there is an exception model, it says so instead.
 */
export function editability(item: TimelineItem): { can: boolean; why?: string } {
  if (item.layer !== 'human') {
    return {
      can: false,
      why:
        item.layer === 'run'
          ? 'A run already happened — the past is not editable'
          : 'Managed in Automations',
    }
  }
  if (item.readOnly) return { can: false, why: item.readOnlyReason ?? 'Read only' }
  // Recurring occurrences ARE editable now. Dropping one asks whether the
  // change is for that occurrence or the whole series, because the gesture
  // genuinely does not say and the two produce very different calendars.
  return { can: true }
}

type Edit = {
  id: string
  title: string
  allDay: boolean
  /** Set when this is one occurrence of a series, so the drop needs a scope. */
  recurring: boolean
  mode: 'move' | 'start' | 'end'
  from: number
  to: number
  origFrom: number
  origTo: number
  grabbedAt: number
}

/**
 * A computed occurrence carries a DERIVED id (`seriesId@instant`); an override
 * row carries a plain cuid. Only the former needs a scope, because only the
 * former still belongs to the series. An override has already been detached,
 * so dragging it moves that event and nothing else — asking "all of them"
 * about a detached occurrence would be a question with no honest answer, and
 * the plain edit path ignores `scope` anyway, so it silently moved one.
 */
function isComputedOccurrence(id: string): boolean {
  return id.includes('@')
}

type Undo =
  | { kind: 'create'; id: string; title: string }
  | { kind: 'move'; id: string; title: string; from: number; to: number; allDay: boolean }
  /** An occurrence was promoted to an override row; the inverse is removing it. */
  | { kind: 'detach'; overrideId: string; title: string }
  /** The whole series moved; the inverse is moving it back by the same delta. */
  | { kind: 'series'; seriesId: string; movedTo: number; from: number; to: number; title: string; allDay: boolean }

/**
 * Applies a pointer position to an in-flight edit.
 *
 * Kept pure so the rules — a move preserves duration, a resize cannot invert
 * the event or shrink it below the zoom's smallest unit — are testable without
 * a mouse.
 */
export function applyEdit(edit: Edit, pointerT: number, tier: Tier): { from: number; to: number } {
  const min = minDuration(tier)
  if (edit.mode === 'move') {
    const delta = pointerT - edit.grabbedAt
    return { from: edit.origFrom + delta, to: edit.origTo + delta }
  }
  if (edit.mode === 'start') {
    return { from: Math.min(pointerT, edit.origTo - min), to: edit.origTo }
  }
  return { from: edit.origFrom, to: Math.max(pointerT, edit.origFrom + min) }
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
  const [undo, setUndo] = useState<Undo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [edit, setEdit] = useState<Edit | null>(null)
  /** A finished drag on a repeating occurrence, waiting for "this or all?". */
  const [askScope, setAskScope] = useState<Edit | null>(null)
  // Mirrors `edit` so mouseup can read the final position without doing work
  // inside a state updater. See the note in the mouseup handler.
  const editRef = useRef<Edit | null>(null)
  editRef.current = edit

  const timeAt = (clientX: number, snap = true) => {
    const el = trackRef.current
    if (!el) return winStart
    const rect = el.getBoundingClientRect()
    const fraction = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    const t = winStart + fraction * span
    return snap ? snapTo(t, tier) : t
  }

  // ── creating ────────────────────────────────────────────────────
  useEffect(() => {
    if (!drag) return
    const move = (e: MouseEvent) => setDrag((d) => (d ? { ...d, to: timeAt(e.clientX) } : d))
    const up = () => {
      setDrag((d) => {
        if (!d) return null
        const from = Math.min(d.from, d.to)
        let to = Math.max(d.from, d.to)
        // A click rather than a drag still means something: one unit.
        if (to === from) to = from + (tier === 'hour' ? HOUR : DAY)
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

  // ── moving and resizing ─────────────────────────────────────────
  useEffect(() => {
    if (!edit) return
    const move = (e: MouseEvent) =>
      setEdit((current) =>
        current ? { ...current, ...applyEdit(current, timeAt(e.clientX), tier) } : current
      )
    const up = () => {
      // Read the edit from a ref and commit OUTSIDE the updater.
      //
      // This previously fired the PATCH from inside setEdit's updater. React
      // is free to invoke an updater more than once — Strict Mode does it on
      // every render in development — so one drag became two writes and two
      // undo entries. An updater must be pure; a network call is not. This is
      // the same mistake as the zoom window, in a different costume.
      const current = editRef.current
      setEdit(null)
      if (!current) return
      // A click that moved nothing is not an edit; do not write a no-op.
      if (current.from !== current.origFrom || current.to !== current.origTo) {
        void commitEdit(current)
      }
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

  async function patchTimes(
    id: string,
    from: number,
    to: number,
    allDay = false,
    scope?: 'occurrence' | 'series'
    // The created/updated row comes back, because the id that CHANGED is not
    // always the id that was dragged: promoting an occurrence returns a new
    // override row, and that is what undo has to address.
  ): Promise<{ ok: boolean; body?: Record<string, unknown> }> {
    const res = await fetch('/api/calendar/' + id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      // An all-day event is rescheduled by DATE. Sending an instant would ask
      // the server which timezone it was, and it has no way to know.
      body: JSON.stringify({
        ...(allDay
          ? { startsAt: toDateOnly(new Date(from)), endsAt: toDateOnly(new Date(to)) }
          : { startsAt: new Date(from).toISOString(), endsAt: new Date(to).toISOString() }),
        ...(scope ? { scope } : {}),
      }),
    })
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}))
      setError(payload.error ?? 'Could not move that event.')
      return { ok: false }
    }
    setError(null)
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null
    return { ok: true, body: body ?? undefined }
  }

  async function commitEdit(current: Edit, scope?: 'occurrence' | 'series') {
    // Only a COMPUTED occurrence needs a scope. An override row is already
    // detached from its series, so it edits like any other event.
    const needsScope = isComputedOccurrence(current.id)
    if (needsScope && !scope) {
      setAskScope(current)
      return
    }

    const res = await patchTimes(
      current.id, current.from, current.to, current.allDay, needsScope ? scope : undefined
    )
    // Refresh either way: on failure the server's times are the truth, and the
    // bar must snap back to them rather than sit where the pointer left it.
    onCreated()
    if (!res.ok) return

    // Each of the three outcomes has a different inverse, and the id that was
    // dragged is not always the id that changed.
    if (scope === 'occurrence' && res.body?.id) {
      // The occurrence became an override row. Undoing it means removing that
      // row, which restores the computed occurrence exactly where it was —
      // PATCHing the derived id again would only 409 without a scope.
      setUndo({ kind: 'detach', overrideId: String(res.body.id), title: current.title })
    } else if (scope === 'series') {
      // The anchor moved. The inverse is the same move in reverse, addressed
      // through the occurrence's NEW instant.
      setUndo({
        kind: 'series',
        seriesId: current.id.slice(0, current.id.indexOf('@')),
        movedTo: current.from,
        from: current.origFrom,
        to: current.origTo,
        title: current.title,
        allDay: current.allDay,
      })
    } else {
      setUndo({
        kind: 'move',
        id: current.id,
        title: current.title,
        from: current.origFrom,
        to: current.origTo,
        allDay: current.allDay,
      })
    }
  }

  function beginEdit(e: React.MouseEvent, item: Placed, mode: Edit['mode']) {
    e.stopPropagation()
    e.preventDefault()
    setUndo(null)
    setEdit({
      id: item.id,
      title: item.title,
      allDay: item.allDay === true,
      recurring: item.recurring === true,
      mode,
      from: item.from,
      to: item.to,
      origFrom: item.from,
      origTo: item.to,
      grabbedAt: timeAt(e.clientX),
    })
  }

  /**
   * Keyboard equivalent, so rescheduling is not a mouse-only capability.
   * Alt+arrow moves the event; Alt+Shift+arrow resizes its end.
   */
  function nudge(item: Placed, e: React.KeyboardEvent) {
    if (!e.altKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return
    e.preventDefault()
    const step = (tier === 'hour' ? 15 * MINUTE : DAY) * (e.key === 'ArrowLeft' ? -1 : 1)

    const next = e.shiftKey
      ? { from: item.from, to: Math.max(item.to + step, item.from + minDuration(tier)) }
      : { from: item.from + step, to: item.to + step }

    // A repeating occurrence needs a scope, and the keyboard path has to ask
    // for it exactly as the drag does. It used to PATCH the derived id with no
    // scope, so the server answered 409 every time and alt+arrow simply never
    // worked on a repeating event — silently.
    void commitEdit({
      id: item.id,
      title: item.title,
      allDay: item.allDay === true,
      recurring: item.recurring === true,
      mode: 'move',
      from: next.from,
      to: next.to,
      origFrom: item.from,
      origTo: item.to,
      grabbedAt: item.from,
    })
  }

  async function create() {
    if (!pending || !draft.trim()) return
    // At day zoom and coarser the drag carries no clock time, so the event is
    // all-day. Inventing a start of 09:00 nobody chose is the guess this UI
    // exists to avoid.
    const allDay = tier !== 'hour'
    const start = new Date(pending.from)
    const end = new Date(pending.to)

    setError(null)
    const res = await fetch('/api/calendar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: draft.trim(),
        // An all-day range is submitted as DATES; only this browser knows
        // which days the drag covered.
        startsAt: allDay ? toDateOnly(start) : start.toISOString(),
        endsAt: allDay ? toDateOnly(end) : end.toISOString(),
        allDay,
      }),
    })
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}))
      setError(payload.error ?? 'Could not create that event.')
      return
    }
    const created = await res.json().catch(() => null)
    if (created?.id) setUndo({ kind: 'create', id: created.id, title: draft.trim() })
    setPending(null)
    setDraft('')
    onCreated()
  }

  async function runUndo() {
    if (!undo) return
    if (undo.kind === 'create') {
      await fetch('/api/calendar/' + undo.id, { method: 'DELETE' })
    } else if (undo.kind === 'detach') {
      // Removing the override restores the computed occurrence at its original
      // instant — the exact inverse of promoting it.
      await fetch('/api/calendar/' + undo.overrideId, { method: 'DELETE' })
    } else if (undo.kind === 'series') {
      await patchTimes(
        `${undo.seriesId}@${new Date(undo.movedTo).toISOString()}`,
        undo.from, undo.to, undo.allDay, 'series'
      )
    } else {
      await patchTimes(undo.id, undo.from, undo.to, undo.allDay)
    }
    setUndo(null)
    onCreated()
  }

  const { placed, overflow } = dense
    ? { placed: [] as Placed[], overflow: 0 }
    : packRows(items, span)
  const rows = dense
    ? 2
    : Math.max(1, Math.min(MAX_ROWS, placed.length ? Math.max(...placed.map((p) => p.row)) + 1 : 1))
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
        style={{ height, cursor: edit ? 'grabbing' : creatable ? 'cell' : 'grab' }}
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
          <DensityLane
            items={items}
            winStart={winStart}
            winEnd={winEnd}
            tone={layer.tone}
            height={height}
          />
        ) : (
          placed.map((raw) => {
            // While an edit is in flight the bar follows the pointer, so the
            // gesture shows its own result rather than waiting for a round trip.
            const live = edit && edit.id === raw.id
            const item: Placed = live ? { ...raw, from: edit.from, to: edit.to } : raw

            const left = pct(item.from)
            const width = pct(item.to) - left
            const tone = item.layer === 'run' ? runTone(item.status) : layer.tone
            const { can, why } = editability(item)
            const label = item.title + (item.moduleName ? ' · ' + item.moduleName : '')
            const title = can
              ? label + ' — drag to move, edges to resize, alt+← → by keyboard'
              : label + (why ? ' — ' + why : '')

            const style = {
              left: left + '%',
              top: item.row * ROW_H + 5,
              height: ROW_H - 4,
              width: 'max(' + width + '%, 3px)',
              cursor: can ? 'grab' : undefined,
              zIndex: live ? 5 : undefined,
            } as const

            const bar = (
              <>
                <span
                  className="absolute inset-y-0 left-0 w-full rounded-[3px]"
                  style={{
                    background: item.layer === 'run' ? tone : tone + '33',
                    borderLeft: '2px solid ' + tone,
                    opacity: item.readOnly ? 0.65 : 1,
                    boxShadow: live ? '0 0 0 1px rgba(34,211,238,0.8)' : undefined,
                  }}
                />
                {can && (
                  <>
                    {/* Resize grips. Only on what can actually be resized —
                        a col-resize cursor over a run would promise an edit
                        the server would refuse.

                        Capped at 30% of the bar rather than a flat 7px. A
                        two-hour event at day zoom is about eight pixels wide,
                        and two fixed grips consumed the whole of it: there was
                        no middle left to grab, so dragging the body silently
                        resized instead of moving. */}
                    <span
                      className="absolute inset-y-0 left-0 cursor-col-resize"
                      style={{ width: 'min(' + EDGE_PX + 'px, 30%)' }}
                      onMouseDown={(e) => beginEdit(e, raw, 'start')}
                    />
                    <span
                      className="absolute inset-y-0 right-0 cursor-col-resize"
                      style={{ width: 'min(' + EDGE_PX + 'px, 30%)' }}
                      onMouseDown={(e) => beginEdit(e, raw, 'end')}
                    />
                  </>
                )}
                <span
                  className="pointer-events-none absolute inset-y-0 flex items-center truncate text-[10px] leading-none"
                  style={{ left: '100%', paddingLeft: 4, color: T(0.7) }}
                >
                  {item.readOnly && <span className="mr-[3px] opacity-60">🔒</span>}
                  {item.recurring && <span className="mr-[3px] opacity-60">↻</span>}
                  {item.title}
                </span>
              </>
            )

            if (item.href) {
              return (
                <a
                  key={item.id}
                  href={item.href}
                  title={title}
                  onMouseDown={(e) => e.stopPropagation()}
                  className="absolute focus:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400/70"
                  style={style}
                >
                  {bar}
                </a>
              )
            }

            return (
              <span
                key={item.id}
                title={title}
                role={can ? 'button' : undefined}
                tabIndex={can ? 0 : undefined}
                aria-label={can ? label + ', alt plus arrow keys to move' : undefined}
                onKeyDown={can ? (e) => nudge(raw, e) : undefined}
                onMouseDown={(e) => {
                  e.stopPropagation()
                  if (can) beginEdit(e, raw, 'move')
                }}
                className="absolute focus:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400/70"
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
          <button
            type="button"
            onClick={() => { setPending(null); setDraft('') }}
            className="font-mono text-[9px] text-white/35 hover:text-white/70"
          >
            esc
          </button>
        </div>
      )}

      {!pending && error && (
        <div className="absolute inset-x-0 top-full z-40 mt-1 rounded-[10px] border border-red-400/35 bg-[#0b1220] px-2 py-1.5">
          <span className="font-mono text-[10px] text-red-300">{error}</span>
        </div>
      )}

      {askScope && (
        <div className="absolute inset-x-0 top-full z-50 mt-1 flex flex-wrap items-center gap-2 rounded-[10px] border border-cyan-400/35 bg-[#0b1220] px-2 py-1.5 shadow-lg">
          {/* A disambiguation, not a confirmation. Dragging one instance of a
              weekly meeting could mean "just this week" or "it is Wednesdays
              now", and the two produce very different calendars for everyone
              else. Guessing would be wrong half the time, silently. */}
          <span className="truncate text-[11.5px] text-white/70">
            “{askScope.title}” repeats. Change which?
          </span>
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => {
              const current = askScope
              setAskScope(null)
              void commitEdit(current, 'occurrence')
            }}
            className="h-6 rounded-[7px] border border-cyan-400/40 bg-cyan-400/10 px-2 font-mono text-[10px] text-cyan-300 hover:bg-cyan-400/20"
          >
            This one
          </button>
          <button
            type="button"
            onClick={() => {
              const current = askScope
              setAskScope(null)
              void commitEdit(current, 'series')
            }}
            className="h-6 rounded-[7px] border border-white/15 px-2 font-mono text-[10px] text-white/60 hover:text-white"
          >
            All of them
          </button>
          <button
            type="button"
            onClick={() => {
              // Cancelling must put the bar back where it was, not leave it
              // where the pointer dropped it.
              setAskScope(null)
              onCreated()
            }}
            className="font-mono text-[10px] text-white/35 hover:text-white/70"
          >
            cancel
          </button>
        </div>
      )}

      {undo && !error && (
        <div className="absolute inset-x-0 top-full z-40 mt-1 flex items-center gap-2 rounded-[10px] border border-white/10 bg-[#0b1220] px-2 py-1.5">
          <span className="truncate text-[11.5px] text-white/70">
            {undo.kind === 'create' ? 'Added' : 'Moved'} “{undo.title}”
          </span>
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => void runUndo()}
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
