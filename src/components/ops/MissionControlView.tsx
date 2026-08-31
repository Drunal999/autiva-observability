'use client'

import { useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import useSWR from 'swr'
import { OK, WARN, ERR, T } from '@/lib/ops/tokens'
import { useBoardEvents } from '@/lib/realtime/client'
import type { Task, TaskStatus } from '@/types/task'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const COLUMNS: { status: TaskStatus; label: string; dot: string }[] = [
  { status: 'TODO', label: 'To Do', dot: '#38bdf8' },
  { status: 'IN_PROGRESS', label: 'In Progress', dot: '#22d3ee' },
  { status: 'DONE', label: 'Done', dot: OK },
]

const PRIO: Record<string, { fg: string; bg: string }> = {
  HIGH: { fg: ERR, bg: 'rgba(248,113,113,0.12)' },
  MED: { fg: WARN, bg: 'rgba(251,191,36,0.12)' },
  LOW: { fg: OK, bg: 'rgba(52,211,153,0.12)' },
}

/**
 * Short human ref derived from the cuid — the design's JV-nnn chrome. Cuids
 * are base36 and usually end in letters, so hash the whole id into a stable
 * three-digit number rather than slicing characters off the end.
 */
function refOf(task: Task) {
  let h = 0
  for (let i = 0; i < task.id.length; i++) {
    h = (h * 31 + task.id.charCodeAt(i)) % 900
  }
  return `JV-${h + 100}`
}

function staleDays(task: Task) {
  const ms = Date.now() - new Date(task.lastStatusChangeAt).getTime()
  return Math.floor(ms / 86_400_000)
}

function dueState(task: Task): 'overdue' | 'soon' | 'none' {
  if (task.overdueFlaggedAt) return 'overdue'
  if (!task.dueDate) return 'none'
  const diff = new Date(task.dueDate).getTime() - Date.now()
  if (diff < 0) return 'overdue'
  if (diff < 2 * 86_400_000) return 'soon'
  return 'none'
}

function dueLabel(task: Task) {
  if (!task.dueDate) return '—'
  return new Date(task.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

type ViewKey = 'all' | 'mine' | 'overdue' | 'stale' | 'unassigned' | 'shipped'

export function MissionControlView() {
  const { data: tasks, mutate, isLoading } = useSWR<Task[]>('/api/tasks', fetcher, {
    refreshInterval: 20000,
  })
  const [view, setView] = useState<ViewKey>('all')
  const [selected, setSelected] = useState<string | null>(null)

  useBoardEvents({
    onCreated: (t) => mutate((c) => (c ? [...c, t] : [t]), { revalidate: false }),
    onUpdated: (t) => mutate((c) => c?.map((x) => (x.id === t.id ? t : x)), { revalidate: false }),
    onDeleted: (id) => mutate((c) => c?.filter((x) => x.id !== id), { revalidate: false }),
  })

  const all = useMemo(() => tasks ?? [], [tasks])

  // "My tasks" needs to know whose. The component never read the session at
  // all, so the filter could only fall back to "assigned to anyone" — which
  // made it a near-duplicate of the full list.
  const { data: session } = useSession()
  const currentUserId = (session?.user as { id?: string } | undefined)?.id ?? null

  // Derived once so the chip's count and the list it opens cannot disagree.
  const mine = useMemo(
    () => (currentUserId ? all.filter((t) => t.assignee?.id === currentUserId) : []),
    [all, currentUserId]
  )

  const views: { key: ViewKey; label: string; dot: string; count: number }[] = useMemo(
    () => [
      { key: 'all', label: 'All tasks', dot: T(0.25), count: all.length },
      { key: 'mine', label: 'My tasks', dot: '#22d3ee', count: mine.length },
      { key: 'overdue', label: 'Overdue', dot: ERR, count: all.filter((t) => dueState(t) === 'overdue').length },
      { key: 'stale', label: 'Stale · 3d+', dot: WARN, count: all.filter((t) => staleDays(t) >= 3).length },
      { key: 'unassigned', label: 'Unassigned', dot: T(0.35), count: all.filter((t) => !t.assignee).length },
      { key: 'shipped', label: 'Shipped today', dot: OK, count: all.filter((t) => t.status === 'DONE' && staleDays(t) < 1).length },
    ],
    [all, mine]
  )

  const visible = useMemo(() => {
    switch (view) {
      case 'mine': return mine
      case 'overdue': return all.filter((t) => dueState(t) === 'overdue')
      case 'stale': return all.filter((t) => staleDays(t) >= 3)
      case 'unassigned': return all.filter((t) => !t.assignee)
      case 'shipped': return all.filter((t) => t.status === 'DONE' && staleDays(t) < 1)
      default: return all
    }
  }, [all, mine, view])

  const task = all.find((t) => t.id === selected) ?? null

  return (
    <div className="flex h-full min-h-0">
      {/* saved views */}
      <aside className="hidden w-[212px] shrink-0 flex-col gap-1 border-r border-white/5 p-3 lg:flex">
        <p className="mb-1 px-1 font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-white/28">
          Saved views
        </p>
        {views.map((v) => {
          const on = view === v.key
          return (
            <button
              key={v.key}
              type="button"
              onClick={() => setView(v.key)}
              className="flex h-9 items-center gap-2.5 rounded-[10px] px-2.5 text-left transition hover:bg-white/[0.04]"
              style={{ background: on ? 'rgba(255,255,255,0.06)' : undefined }}
            >
              <span className="h-[6px] w-[6px] shrink-0 rounded-full" style={{ background: v.dot }} />
              <span
                className="flex-1 truncate text-[14.5px]"
                style={{ color: on ? '#22d3ee' : T(0.6), fontWeight: on ? 600 : 500 }}
              >
                {v.label}
              </span>
              <span className="font-mono text-[12px] tabular-nums text-white/28">{v.count}</span>
            </button>
          )
        })}
      </aside>

      {/* board */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-3 border-b border-white/5 px-5 py-3">
          <span className="font-mono text-[13px] font-bold uppercase tracking-[0.16em] text-white/45">
            Team Board
          </span>
          <span className="font-mono text-[12px] text-white/30">
            {visible.length} OF {all.length}
          </span>
          <span className="flex-1" />
          <span className="font-mono text-[11px] tracking-[0.08em] text-white/25">
            SORTED BY PRIORITY, THEN DUE
          </span>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto p-4 md:grid-cols-3">
          {COLUMNS.map((col) => {
            const items = visible
              .filter((t) => t.status === col.status)
              .sort((a, b) => {
                const rank = { HIGH: 0, MED: 1, LOW: 2 }
                return rank[a.priority] - rank[b.priority]
              })
            return (
              <section
                key={col.status}
                data-testid={`mc-column-${col.status}`}
                className="flex min-h-0 flex-col rounded-[18px] border border-white/5 bg-white/[0.02]"
              >
                <div className="flex items-center gap-2 px-3.5 py-3">
                  <span className="h-[7px] w-[7px] rounded-sm" style={{ background: col.dot }} />
                  <h2 className="font-mono text-[12px] font-bold uppercase tracking-[0.14em] text-white/45">
                    {col.label}
                  </h2>
                  <span className="rounded-full bg-white/[0.06] px-1.5 font-mono text-[12px] text-white/40">
                    {items.length}
                  </span>
                </div>

                <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2.5 pb-2.5">
                  {isLoading &&
                    [0, 1, 2].map((i) => (
                      <div
                        key={i}
                        className="h-[84px] rounded-[12px] border border-white/5 bg-white/[0.03]"
                        style={{ animation: `skel 1.6s ease-in-out ${i * 0.06}s infinite` }}
                      />
                    ))}

                  {!isLoading &&
                    items.map((t, i) => {
                      const ds = dueState(t)
                      const sd = staleDays(t)
                      const p = PRIO[t.priority]
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setSelected(t.id)}
                          className="relative overflow-hidden rounded-[12px] border bg-white/[0.035] p-3 text-left transition hover:border-cyan-400/30"
                          style={{
                            borderColor: ds === 'overdue' ? 'rgba(248,113,113,0.3)' : 'rgba(255,255,255,0.06)',
                            opacity: t.status === 'DONE' ? 0.66 : 1,
                            animation: `enter 160ms cubic-bezier(0.16,1,0.3,1) ${Math.min(i, 8) * 0.018}s both`,
                          }}
                        >
                          {ds === 'overdue' && (
                            <span className="absolute inset-y-2.5 left-0 w-[2px] rounded-r-sm bg-red-400" />
                          )}
                          <div className="flex items-start gap-2">
                            <span className="font-mono text-[11px] text-white/25">{refOf(t)}</span>
                            <span className="flex-1" />
                            <span
                              className="rounded-[4px] px-1.5 font-mono text-[10.5px] font-bold"
                              style={{ color: p.fg, background: p.bg }}
                            >
                              {t.priority}
                            </span>
                          </div>
                          <p className="mt-1 text-[14.5px] font-semibold leading-[1.35] text-white/90">
                            {t.title}
                          </p>
                          <div className="mt-2 flex items-center gap-2">
                            <span className="truncate text-[13px] text-white/40">
                              {t.assignee?.name ?? 'Unassigned'}
                            </span>
                            <span className="flex-1" />
                            <span
                              className="rounded-[4px] px-1.5 font-mono text-[11.5px]"
                              style={{
                                color: ds === 'overdue' ? ERR : ds === 'soon' ? WARN : T(0.3),
                                background:
                                  ds === 'overdue'
                                    ? 'rgba(248,113,113,0.10)'
                                    : ds === 'soon'
                                      ? 'rgba(251,191,36,0.10)'
                                      : 'transparent',
                              }}
                            >
                              {dueLabel(t)}
                            </span>
                          </div>
                          {sd >= 3 && (
                            <p className="mt-1.5 font-mono text-[11px] text-amber-400/70">
                              STALE · no change in {sd}d
                            </p>
                          )}
                        </button>
                      )
                    })}

                  {!isLoading && items.length === 0 && (
                    <div className="flex flex-col items-center gap-1.5 rounded-[12px] border border-dashed border-white/[0.07] px-3 py-7">
                      <p className="text-center font-mono text-[12px] text-white/25">
                        Nothing matches this view
                      </p>
                    </div>
                  )}
                </div>
              </section>
            )
          })}
        </div>
      </div>

      {/* detail slide-over — never a centered modal, board context survives */}
      {task && (
        <aside className="flex w-[380px] shrink-0 flex-col border-l border-white/5 bg-[#0e0e12]/85 backdrop-blur">
          <div className="flex items-center gap-2 border-b border-white/5 px-4 py-3">
            <span className="rounded-[5px] border border-white/[0.08] px-1.5 py-[2px] font-mono text-[12px] text-white/45">
              {refOf(task)}
            </span>
            <span className="flex-1" />
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="flex h-7 w-7 items-center justify-center rounded-[8px] border border-white/[0.07] text-white/50 transition hover:text-white"
            >
              ✕
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <h3 className="text-[18px] font-bold leading-snug">{task.title}</h3>
            <div className="mt-4 grid grid-cols-[80px_1fr] gap-x-3 gap-y-2 text-[14px]">
              <span className="text-white/35">Assignee</span>
              <span className="text-white/80">{task.assignee?.name ?? 'Unassigned'}</span>
              <span className="text-white/35">Priority</span>
              <span style={{ color: PRIO[task.priority].fg }}>{task.priority}</span>
              <span className="text-white/35">Due</span>
              <span className="font-mono text-white/80">{dueLabel(task)}</span>
              <span className="text-white/35">Last moved</span>
              <span className="font-mono text-white/60">{staleDays(task)}d ago</span>
            </div>
            {task.description && (
              <>
                <p className="mt-4 font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-white/30">
                  Description
                </p>
                <p className="mt-1.5 text-[14.5px] leading-[1.6] text-white/60">{task.description}</p>
              </>
            )}
          </div>
        </aside>
      )}
    </div>
  )
}
