'use client'

import useSWR from 'swr'
import { CircularMeter } from './CircularMeter'
import { useRealtimeConnectionState, type RealtimeConnectionState } from '@/lib/realtime/client'
import type { Task } from '@/types/task'

const fetcher = (url: string) => fetch(url).then((res) => res.json())

const connectionLabel: Record<RealtimeConnectionState, string> = {
  connected: 'OS Stable',
  connecting: 'Syncing',
  disconnected: 'Offline',
}

const connectionDot: Record<RealtimeConnectionState, string> = {
  connected: 'bg-emerald-400',
  connecting: 'bg-amber-400 animate-pulse',
  disconnected: 'bg-red-400',
}

export function SystemStatusBar() {
  // Shares SWR's '/api/tasks' cache key with KanbanBoard — no duplicate
  // network request, just a second reader of the same real data.
  const { data: tasks } = useSWR<Task[]>('/api/tasks', fetcher)
  const connectionState = useRealtimeConnectionState()

  const total = tasks?.length ?? 0
  const done = tasks?.filter((t) => t.status === 'DONE').length ?? 0
  const inProgress = tasks?.filter((t) => t.status === 'IN_PROGRESS').length ?? 0
  const todo = tasks?.filter((t) => t.status === 'TODO').length ?? 0
  const pct = (n: number) => (total === 0 ? 0 : (n / total) * 100)

  return (
    <div className="glass fixed inset-x-0 bottom-0 z-30 flex h-20 items-center justify-between px-6 md:left-64">
      <div className="flex items-center gap-6">
        <CircularMeter value={pct(todo)} label="To Do" color="#0ea5e9" />
        <CircularMeter value={pct(inProgress)} label="In Progress" color="#22d3ee" />
        <CircularMeter value={pct(done)} label="Done" color="#4ade80" />
      </div>
      <div className="flex items-center gap-4">
        <span className="rounded-lg bg-white/5 px-3 py-1.5 font-mono text-xs text-white/50">
          {total} task{total === 1 ? '' : 's'}
        </span>
        <span className="flex items-center gap-2 text-xs font-semibold text-white/60">
          <span className={`h-2 w-2 rounded-full ${connectionDot[connectionState]}`} />
          {connectionLabel[connectionState]}
        </span>
      </div>
    </div>
  )
}
