import type { Task } from '@/types/task'

const DUE_SOON_WINDOW_MS = 24 * 60 * 60 * 1000
const STALE_THRESHOLD_MS = 3 * 24 * 60 * 60 * 1000

export interface TaskVisualState {
  dueBadge: 'none' | 'due-soon' | 'overdue'
  isStale: boolean
}

export function getTaskVisualState(task: Task, now: Date = new Date()): TaskVisualState {
  const isDone = task.status === 'DONE'

  let dueBadge: TaskVisualState['dueBadge'] = 'none'
  if (!isDone) {
    if (task.overdueFlaggedAt) {
      dueBadge = 'overdue'
    } else if (task.dueDate) {
      const due = new Date(task.dueDate).getTime()
      const diff = due - now.getTime()
      if (diff <= 0) {
        dueBadge = 'overdue'
      } else if (diff <= DUE_SOON_WINDOW_MS) {
        dueBadge = 'due-soon'
      }
    }
  }

  const isStale =
    !isDone && now.getTime() - new Date(task.lastStatusChangeAt).getTime() > STALE_THRESHOLD_MS

  return { dueBadge, isStale }
}
