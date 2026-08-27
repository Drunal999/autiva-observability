'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import { OK, WARN, ERR, BLOCKED, T } from '@/lib/ops/tokens'
import { describeRRule } from '@/lib/ops/recurrence'
import { EmptyState } from './Panel'
import { DensityStrip, CostRibbon } from './DensityStrip'
import { QuickAdd } from './QuickAdd'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface TimelineItem {
  id: string
  layer: 'human' | 'scheduled' | 'run' | 'deadline'
  title: string
  startsAt: string
  endsAt: string
  allDay?: boolean
  status?: string
  moduleName?: string | null
  recurring?: boolean
  /** Scheduled runs cannot be edited here — see the API for why. */
  readOnly?: boolean
  readOnlyReason?: string
  href?: string
}

/**
 * Four layers on one axis, each visually distinct and independently toggleable.
 *
 * The point of this calendar over a normal one: the PAST half populates itself.
 * Human events are planned; run bars are what actually happened, read live from
 * the run table rather than copied here.
 */
const LAYERS: { key: TimelineItem['layer']; label: string; tone: string; hint: string }[] = [
  { key: 'human', label: 'Events', tone: '#22d3ee', hint: 'meetings and milestones' },
  { key: 'scheduled', label: 'Scheduled', tone: BLOCKED, hint: 'automations due to run' },
  { key: 'run', label: 'Runs', tone: T(0.45), hint: 'what actually happened' },
  { key: 'deadline', label: 'Waiting', tone: WARN, hint: 'approvals with a clock on them' },
]

function runTone(status?: string): string {
  if (status === 'FAILED') return ERR
  if (status === 'RUNNING') return '#22d3ee'
  if (status === 'AWAITING_APPROVAL') return BLOCKED
  return OK
}

function startOfDay(d: Date) {
  const c = new Date(d)
  c.setHours(0, 0, 0, 0)
  return c
}

export function CalendarView() {
  // A 14-day window centred on today: recent history plus the week ahead is
  // what an operator actually acts on.
  const [offsetDays, setOffsetDays] = useState(0)
  const { from, to, days } = useMemo(() => {
    const anchor = startOfDay(new Date(Date.now() + offsetDays * 86400_000))
    const start = new Date(anchor.getTime() - 6 * 86400_000)
    const end = new Date(anchor.getTime() + 8 * 86400_000)
    const list: Date[] = []
    for (let i = 0; i < 14; i++) list.push(new Date(start.getTime() + i * 86400_000))
    return { from: start, to: end, days: list }
  }, [offsetDays])

  const key = `/api/calendar?from=${from.toISOString()}&to=${to.toISOString()}`
  const { data, isLoading, mutate } = useSWR<{ items: TimelineItem[] }>(key, fetcher, {
    keepPreviousData: true,
  })

  // Activity and spend read the same hourly buckets the fleet telemetry uses.
  const { data: metrics } = useSWR<{ buckets: { at: string; runs: number; failed: number; costInr: number }[] }>(
    '/api/metrics',
    fetcher
  )
  const buckets = metrics?.buckets ?? []

  const [enabled, setEnabled] = useState<Record<string, boolean>>({
    human: true, scheduled: true, run: true, deadline: true,
  })

  const items = (data?.items ?? []).filter((i) => enabled[i.layer])
  const today = startOfDay(new Date()).getTime()

  // ── drag-to-create ──────────────────────────────────────────────
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const [dragTo, setDragTo] = useState<number | null>(null)
  const [pending, setPending] = useState<{ from: number; to: number } | null>(null)
  const [draftTitle, setDraftTitle] = useState('')
  const [undo, setUndo] = useState<{ id: string; title: string } | null>(null)
  const titleRef = useRef<HTMLInputElement>(null)

  function beginSelect(day: number) {
    setPending(null)
    setDragFrom(day)
    setDragTo(day)
  }
  function extendSelect(day: number) {
    if (dragFrom !== null) setDragTo(day)
  }
  function endSelect() {
    if (dragFrom === null || dragTo === null) return
    setPending({ from: Math.min(dragFrom, dragTo), to: Math.max(dragFrom, dragTo) })
    setDragFrom(null)
    setDragTo(null)
    // Focus lands in the title box, so the gesture is drag then type.
    setTimeout(() => titleRef.current?.focus(), 0)
  }
  function cancelPending() {
    setPending(null)
    setDraftTitle('')
  }

  function selectionCovers(day: number): boolean {
    if (dragFrom !== null && dragTo !== null) {
      return day >= Math.min(dragFrom, dragTo) && day <= Math.max(dragFrom, dragTo)
    }
    return !!pending && day >= pending.from && day <= pending.to
  }

  async function createFromSelection() {
    if (!pending || !draftTitle.trim()) return
    const start = new Date(pending.from)
    const end = new Date(pending.to)
    // A range picked on a day grid is an all-day event. Inventing a clock time
    // nobody chose is exactly the guess this UI avoids.
    end.setHours(23, 59, 0, 0)

    const res = await fetch('/api/calendar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: draftTitle.trim(),
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        allDay: true,
      }),
    })
    if (res.ok) {
      const created = await res.json().catch(() => null)
      // Undo rather than a confirmation dialog: creating an event is cheap to
      // reverse, so let it happen and offer the way back.
      if (created?.id) setUndo({ id: created.id, title: draftTitle.trim() })
      cancelPending()
      void mutate()
    }
  }

  useEffect(() => {
    if (!undo) return
    const t = setTimeout(() => setUndo(null), 8000)
    return () => clearTimeout(t)
  }, [undo])

  // A drag released outside the grid must not leave a selection stuck on.
  useEffect(() => {
    const onUp = () => {
      if (dragFrom !== null) endSelect()
    }
    window.addEventListener('mouseup', onUp)
    return () => window.removeEventListener('mouseup', onUp)
  })

  const byDay = useMemo(() => {
    const map = new Map<number, TimelineItem[]>()
    days.forEach((d) => map.set(d.getTime(), []))
    for (const item of items) {
      const k = startOfDay(new Date(item.startsAt)).getTime()
      map.get(k)?.push(item)
    }
    return map
  }, [items, days])

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-3 md:p-5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
        <h1 className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-white/45">
          Calendar
        </h1>
        <span className="font-mono text-[10px] tracking-[0.06em] text-white/30">
          {/* The claim this calendar makes over a normal one. */}
          PAST IS WHAT HAPPENED · FUTURE IS WHAT IS SCHEDULED
        </span>
        <span className="flex-1" />

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setOffsetDays((d) => d - 7)}
            className="h-7 rounded-[8px] border border-white/10 px-2 font-mono text-[10px] text-white/55 transition hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
          >
            ← week
          </button>
          <button
            type="button"
            onClick={() => setOffsetDays(0)}
            className="h-7 rounded-[8px] border border-white/10 px-2 font-mono text-[10px] text-white/55 transition hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
          >
            today
          </button>
          <button
            type="button"
            onClick={() => setOffsetDays((d) => d + 7)}
            className="h-7 rounded-[8px] border border-white/10 px-2 font-mono text-[10px] text-white/55 transition hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
          >
            week →
          </button>
        </div>
      </div>

      {/* Layer toggles. Each says what it is, so nobody has to learn a colour. */}
      <div className="flex flex-wrap items-center gap-2">
        {LAYERS.map((l) => {
          const on = enabled[l.key]
          return (
            <button
              key={l.key}
              type="button"
              title={l.hint}
              onClick={() => setEnabled((e) => ({ ...e, [l.key]: !e[l.key] }))}
              className="flex h-7 items-center gap-1.5 rounded-[8px] border px-2.5 font-mono text-[10px] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50"
              style={{
                borderColor: on ? `${l.tone}66` : 'rgba(255,255,255,0.08)',
                background: on ? `${l.tone}14` : 'transparent',
                color: on ? l.tone : T(0.35),
              }}
            >
              <span
                className="h-[6px] w-[6px] rounded-sm"
                style={{ background: on ? l.tone : T(0.2) }}
              />
              {l.label}
            </button>
          )
        })}
        <span className="flex-1" />
        <span className="font-mono text-[9.5px] text-white/25">
          times shown in your timezone
        </span>
      </div>

      <QuickAdd onCreated={() => void mutate()} />

      {buckets.length > 0 && <DensityStrip buckets={buckets} />}

      {isLoading && !data && (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-7">
          {Array.from({ length: 14 }).map((_, i) => (
            <div
              key={i}
              className="h-[120px] rounded-[12px] border border-white/5 bg-white/[0.02]"
              style={{ animation: `skel 1.6s ease-in-out ${i * 0.04}s infinite` }}
            />
          ))}
        </div>
      )}

      {data && items.length === 0 && (
        <EmptyState
          title="Nothing on the timeline yet"
          detail="Runs appear here on their own as agents work. Add a meeting or a milestone and it sits alongside them."
        />
      )}

      {data && (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-7">
          {days.map((d) => {
            const key = d.getTime()
            const dayItems = byDay.get(key) ?? []
            const isToday = key === today
            const isPast = key < today

            const inSelection = selectionCovers(key)

            return (
              <div
                key={key}
                // Drag across cells to pick a range, release to name it. No
                // modal for the simple case — a dialog to type four words is
                // friction for its own sake.
                onMouseDown={() => beginSelect(key)}
                onMouseEnter={() => extendSelect(key)}
                onMouseUp={endSelect}
                className="flex min-h-[120px] cursor-cell flex-col gap-1 rounded-[12px] border p-2 transition-colors"
                style={{
                  borderColor: inSelection
                    ? 'rgba(34,211,238,0.65)'
                    : isToday
                      ? 'rgba(34,211,238,0.45)'
                      : 'rgba(255,255,255,0.05)',
                  // The past is dimmer than the future: it is history, not a plan.
                  background: inSelection
                    ? 'rgba(34,211,238,0.10)'
                    : isPast
                      ? 'rgba(255,255,255,0.012)'
                      : 'rgba(255,255,255,0.025)',
                }}
              >
                <div className="flex items-baseline gap-1.5">
                  <span
                    className="font-mono text-[11px] font-bold tabular-nums"
                    style={{ color: isToday ? '#22d3ee' : T(0.5) }}
                  >
                    {d.getDate()}
                  </span>
                  <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-white/25">
                    {d.toLocaleDateString(undefined, { weekday: 'short' })}
                  </span>
                  {isToday && (
                    <span className="ml-auto font-mono text-[8.5px] tracking-[0.1em] text-cyan-300/70">
                      TODAY
                    </span>
                  )}
                </div>

                {dayItems.slice(0, 6).map((item) => {
                  const layer = LAYERS.find((l) => l.key === item.layer)!
                  const tone = item.layer === 'run' ? runTone(item.status) : layer.tone
                  const time = new Date(item.startsAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })

                  const inner = (
                    <>
                      <span
                        className="mt-[5px] h-[6px] w-[6px] shrink-0 rounded-sm"
                        style={{ background: tone }}
                      />
                      <span className="min-w-0 flex-1 leading-[1.35]">
                        <span className="block truncate text-[11px] text-white/78">
                          {item.title}
                        </span>
                        <span className="font-mono text-[9px] text-white/28">
                          {/* Visible before someone tries to edit, not only
                              after the attempt fails. */}
                          {item.readOnly && (
                            <span title={item.readOnlyReason} aria-label="read only">
                              🔒{' '}
                            </span>
                          )}
                          {item.allDay ? 'all day' : time}
                          {item.recurring && ' · repeats'}
                          {item.moduleName && ` · ${item.moduleName}`}
                        </span>
                      </span>
                    </>
                  )

                  return item.href ? (
                    <a
                      key={item.id}
                      href={item.href}
                      className="flex gap-1.5 rounded-[7px] px-1 py-0.5 transition hover:bg-white/[0.05] focus:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400/60"
                    >
                      {inner}
                    </a>
                  ) : (
                    <div key={item.id} className="flex gap-1.5 px-1 py-0.5">
                      {inner}
                    </div>
                  )
                })}

                {dayItems.length > 6 && (
                  <span className="mt-auto font-mono text-[9px] text-white/25">
                    +{dayItems.length - 6} more
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}
      {buckets.length > 0 && <CostRibbon buckets={buckets} />}

      {/* Inline naming for a dragged range. Appears where the eye already is,
          rather than throwing a dialog over the grid you just selected on. */}
      {pending && (
        <div className="sticky bottom-3 z-20 flex flex-wrap items-center gap-2 rounded-[12px] border border-cyan-400/40 bg-[#0a1020]/95 p-2.5 backdrop-blur">
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-cyan-300">
            {pending.from === pending.to
              ? new Date(pending.from).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
              : `${new Date(pending.from).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${new Date(pending.to).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`}
          </span>
          <input
            ref={titleRef}
            value={draftTitle}
            maxLength={200}
            onChange={(e) => setDraftTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && draftTitle.trim()) void createFromSelection()
              if (e.key === 'Escape') cancelPending()
            }}
            placeholder="Name it, then press Enter"
            aria-label="New event title"
            className="h-8 min-w-[220px] flex-1 rounded-[8px] border border-white/10 bg-white/5 px-2.5 text-[12.5px] text-white/85 outline-none placeholder:text-white/25 focus:border-cyan-400/45"
          />
          <button
            type="button"
            disabled={!draftTitle.trim()}
            onClick={() => void createFromSelection()}
            className="h-8 rounded-[8px] border border-cyan-400/40 bg-cyan-400/10 px-3 text-[12px] font-semibold text-cyan-300 transition hover:bg-cyan-400/20 disabled:opacity-35"
          >
            Add
          </button>
          <button
            type="button"
            onClick={cancelPending}
            className="h-8 rounded-[8px] border border-white/10 px-3 text-[12px] text-white/55 transition hover:text-white"
          >
            Cancel
          </button>
        </div>
      )}

      {undo && (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-[12px] border border-emerald-400/40 bg-emerald-400/15 px-4 py-2.5 text-[12.5px] text-emerald-200 backdrop-blur"
          style={{ animation: 'riseIn 160ms cubic-bezier(0.16,1,0.3,1) both' }}
        >
          <span>Added “{undo.title}”.</span>
          <button
            type="button"
            onClick={async () => {
              await fetch(`/api/calendar/${undo.id}`, { method: 'DELETE' })
              setUndo(null)
              void mutate()
            }}
            className="font-semibold underline underline-offset-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60"
          >
            Undo
          </button>
        </div>
      )}
    </div>
  )
}

/** Exported for the create form: shows a rule back before anything is saved. */
export function RRulePreview({ rule }: { rule: string }) {
  const text = describeRRule(rule)
  if (!rule.trim()) return null
  return (
    <span className="font-mono text-[10px] text-white/40">
      {text ? `repeats ${text}` : 'that repeat rule is not valid'}
    </span>
  )
}
