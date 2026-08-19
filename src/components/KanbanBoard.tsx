'use client'

import { useEffect, useState } from 'react'
import useSWR, { type KeyedMutator } from 'swr'
import { DndContext, type DragEndEvent, useDraggable, useDroppable } from '@dnd-kit/core'
import { TaskCard } from './TaskCard'
import { CompletionAnimation } from './CompletionAnimation'
import { getPusherClient, BOARD_CHANNEL } from '@/lib/pusher/client'
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

function DraggableTaskCard({ task, onClick }: { task: Task; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: task.id })
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined
  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      <TaskCard task={task} onClick={onClick} />
    </div>
  )
}

function DroppableColumn({ status, label, tasks }: { status: TaskStatus; label: string; tasks: Task[] }) {
  const { setNodeRef } = useDroppable({ id: status })
  return (
    <div ref={setNodeRef} data-testid={`column-${status}`} className="rounded-lg bg-gray-50 p-3">
      <h2 className="mb-3 font-semibold">{label}</h2>
      <div className="space-y-2">
        {tasks.map((task) => (
          <DraggableTaskCard key={task.id} task={task} onClick={() => {}} />
        ))}
      </div>
    </div>
  )
}

export function KanbanBoard({ muteSounds = false }: { muteSounds?: boolean }) {
  const { data: tasks, mutate } = useSWR<Task[]>('/api/tasks', fetcher, {
    refreshInterval: 20000,
    revalidateOnFocus: true,
  })
  const [celebrating, setCelebrating] = useState<string | null>(null)

  useEffect(() => {
    const pusher = getPusherClient()
    const channel = pusher.subscribe(BOARD_CHANNEL)
    channel.bind('task-created', (task: Task) => {
      mutate((current) => (current ? [...current, task] : [task]), { revalidate: false })
    })
    channel.bind('task-updated', (task: Task) => {
      mutate((current) => current?.map((t) => (t.id === task.id ? task : t)), { revalidate: false })
    })
    channel.bind('task-deleted', ({ id }: { id: string }) => {
      mutate((current) => current?.filter((t) => t.id !== id), { revalidate: false })
    })
    return () => {
      channel.unbind_all()
      pusher.unsubscribe(BOARD_CHANNEL)
    }
  }, [mutate])

  async function handleDragEnd(event: DragEndEvent) {
    const taskId = String(event.active.id)
    const newStatus = event.over?.id as TaskStatus | undefined
    if (!newStatus || !tasks) return

    const previous = tasks
    const result = await moveTaskStatus(taskId, newStatus, tasks, mutate)
    if (result.ok && newStatus === 'DONE') {
      setCelebrating(taskId)
      playSound('success', muteSounds)
    }
    void previous
  }

  return (
    <DndContext onDragEnd={handleDragEnd}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {COLUMNS.map((col) => (
          <DroppableColumn
            key={col.status}
            status={col.status}
            label={col.label}
            tasks={(tasks ?? []).filter((t) => t.status === col.status)}
          />
        ))}
      </div>
      {celebrating && (
        <CompletionAnimation taskId={celebrating} onComplete={() => setCelebrating(null)} />
      )}
    </DndContext>
  )
}
