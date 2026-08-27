'use client'

import { useState } from 'react'
import useSWR, { type KeyedMutator } from 'swr'
import { TaskCard } from './TaskCard'
import { CompletionAnimation } from './CompletionAnimation'
import {
  Kanban,
  KanbanBoard as KanbanRoot,
  KanbanColumn,
  KanbanColumnContent,
  KanbanItem,
  KanbanOverlay,
} from '@/components/reui/kanban'
import { useBoardEvents } from '@/lib/realtime/client'
import { playSound } from '@/lib/sounds'
import type { Task, TaskStatus } from '@/types/task'

const fetcher = (url: string) => fetch(url).then((res) => res.json())
const COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: 'TODO', label: 'To Do' },
  { status: 'IN_PROGRESS', label: 'In Progress' },
  { status: 'DONE', label: 'Done' },
]

export async function moveTaskStatus(
  taskId: string,
  status: TaskStatus,
  currentTasks: Task[],
  mutate: KeyedMutator<Task[]>
) {
  const optimistic = currentTasks.map((t) => (t.id === taskId ? { ...t, status } : t))
  await mutate(optimistic, { revalidate: false })

  const res = await fetch(`/api/tasks/${taskId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  })

  if (!res.ok) {
    await mutate(currentTasks, { revalidate: false })
    return { ok: false as const }
  }
  return { ok: true as const }
}

function BoardColumn({ status, label, tasks }: { status: TaskStatus; label: string; tasks: Task[] }) {
  return (
    <KanbanColumn
      value={status}
      data-testid={`column-${status}`}
      className="glass min-h-[200px] rounded-3xl p-5 transition duration-300 ease-fluid"
    >
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xs font-bold uppercase tracking-widest text-white/40">{label}</h2>
        <span className="rounded-full bg-white/5 px-2 py-0.5 font-mono text-[10px] text-white/50">
          {tasks.length}
        </span>
      </div>
      <KanbanColumnContent value={status} className="space-y-3">
        {tasks.map((task) => (
          <KanbanItem key={task.id} value={task.id}>
            <TaskCard task={task} onClick={() => {}} />
          </KanbanItem>
        ))}
      </KanbanColumnContent>
    </KanbanColumn>
  )
}

export function KanbanBoard({ muteSounds = false }: { muteSounds?: boolean }) {
  const { data: tasks, mutate } = useSWR<Task[]>('/api/tasks', fetcher, {
    refreshInterval: 20000,
    revalidateOnFocus: true,
  })
  const [celebrating, setCelebrating] = useState<string | null>(null)

  useBoardEvents({
    onCreated: (task) => {
      mutate((current) => (current ? [...current, task] : [task]), { revalidate: false })
    },
    onUpdated: (task) => {
      mutate((current) => current?.map((t) => (t.id === task.id ? task : t)), { revalidate: false })
    },
    onDeleted: (id) => {
      mutate((current) => current?.filter((t) => t.id !== id), { revalidate: false })
    },
  })

  // Kanban owns a Record<status, Task[]>; the board's source of truth stays the
  // flat SWR list, so group on the way in and diff on the way out.
  const grouped = COLUMNS.reduce<Record<string, Task[]>>((acc, col) => {
    acc[col.status] = (tasks ?? []).filter((t) => t.status === col.status)
    return acc
  }, {})

  async function handleValueChange(next: Record<string, Task[]>) {
    if (!tasks) return

    // The moved card is the one now sitting under a key that disagrees with its
    // own status field.
    let movedId: string | undefined
    let newStatus: TaskStatus | undefined
    for (const status of Object.keys(next) as TaskStatus[]) {
      for (const task of next[status]) {
        if (task.status !== status) {
          movedId = task.id
          newStatus = status
        }
      }
    }
    if (!movedId || !newStatus) return

    const result = await moveTaskStatus(movedId, newStatus, tasks, mutate)
    if (result.ok && newStatus === 'DONE') {
      setCelebrating(movedId)
      playSound('success', muteSounds)
    }
  }

  return (
    <Kanban value={grouped} onValueChange={handleValueChange} getItemValue={(task) => task.id}>
      <KanbanRoot className="grid grid-cols-1 gap-5 md:grid-cols-3">
        {COLUMNS.map((col) => (
          <BoardColumn
            key={col.status}
            status={col.status}
            label={col.label}
            tasks={grouped[col.status]}
          />
        ))}
      </KanbanRoot>
      <KanbanOverlay />
      {celebrating && (
        <CompletionAnimation taskId={celebrating} onComplete={() => setCelebrating(null)} />
      )}
    </Kanban>
  )
}
