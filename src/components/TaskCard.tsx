'use client'

import { getTaskVisualState } from '@/lib/taskVisualState'
import type { Task } from '@/types/task'

const badgeStyles: Record<string, string> = {
  none: '',
  'due-soon': 'border-amber-400 ring-1 ring-amber-300',
  overdue: 'border-red-500 ring-1 ring-red-400 animate-pulse',
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
      className={`w-full text-left rounded-lg border p-3 shadow-sm transition ${badgeStyles[dueBadge]} ${
        isStale ? 'opacity-70' : ''
      }`}
    >
      <p className="font-medium">{task.title}</p>
      <div className="mt-2 flex items-center justify-between text-sm text-gray-500">
        <span>{task.assignee?.name ?? 'Unassigned'}</span>
        <span>{task.priority}</span>
      </div>
    </button>
  )
}
