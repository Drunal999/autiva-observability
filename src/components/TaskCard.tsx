'use client'

import { getTaskVisualState } from '@/lib/taskVisualState'
import type { Task } from '@/types/task'

const badgeStyles: Record<string, string> = {
  none: 'border-white/5',
  'due-soon': 'border-amber-400/60 ring-1 ring-amber-400/30',
  overdue: 'border-red-500/60 ring-1 ring-red-500/30 animate-pulse',
}

const priorityStyles: Record<Task['priority'], string> = {
  LOW: 'text-emerald-400 bg-emerald-400/10',
  MED: 'text-amber-400 bg-amber-400/10',
  HIGH: 'text-red-400 bg-red-400/10',
}

export function TaskCard({ task, onClick }: { task: Task; onClick: () => void }) {
  const { dueBadge, isStale } = getTaskVisualState(task)

  return (
    <button
      type="button"
      data-testid="task-card"
      data-due-badge={dueBadge}
      data-stale={isStale}
      onClick={onClick}
      className={`glass-sm w-full rounded-2xl p-4 text-left transition duration-300 ease-fluid hover:-translate-y-1 hover:border-cyan-400/30 ${badgeStyles[dueBadge]} ${
        isStale ? 'opacity-60' : ''
      }`}
    >
      <p className="font-semibold text-white/90">{task.title}</p>
      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs text-white/40">{task.assignee?.name ?? 'Unassigned'}</span>
        <span
          className={`rounded-md px-2 py-0.5 font-mono text-[10px] font-bold tracking-wide ${priorityStyles[task.priority]}`}
        >
          {task.priority}
        </span>
      </div>
    </button>
  )
}
