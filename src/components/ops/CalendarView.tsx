'use client'

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import { OK, WARN, ERR, BLOCKED, T } from '@/lib/ops/tokens'
import { describeRRule } from '@/lib/ops/recurrence'
import { EmptyState } from './Panel'

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
  const { data, isLoading } = useSWR<{ items: TimelineItem[] }>(key, fetcher, {
    keepPreviousData: true,
  })

  const [enabled, setEnabled] = useState<Record<string, boolean>>({
    human: true, scheduled: true, run: true, deadline: true,
  })

  const items = (data?.items ?? []).filter((i) => enabled[i.layer])
  const today = startOfDay(new Date()).getTime()

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

            return (
              <div
                key={key}
                className="flex min-h-[120px] flex-col gap-1 rounded-[12px] border p-2"
                style={{
                  borderColor: isToday ? 'rgba(34,211,238,0.45)' : 'rgba(255,255,255,0.05)',
                  // The past is dimmer than the future: it is history, not a plan.
                  background: isPast ? 'rgba(255,255,255,0.012)' : 'rgba(255,255,255,0.025)',
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
