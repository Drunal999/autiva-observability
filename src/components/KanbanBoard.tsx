'use client'

import { useEffect } from 'react'
import useSWR from 'swr'
import { TaskCard } from './TaskCard'
import { getPusherClient, BOARD_CHANNEL } from '@/lib/pusher/client'
import type { Task, TaskStatus } from '@/types/task'

const fetcher = (url: string) => fetch(url).then((res) => res.json())
const COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: 'TODO', label: 'To Do' },
  { status: 'IN_PROGRESS', label: 'In Progress' },
  { status: 'DONE', label: 'Done' },
]

export function KanbanBoard() {
  const { data: tasks, mutate } = useSWR<Task[]>('/api/tasks', fetcher, {
    refreshInterval: 20000,
    revalidateOnFocus: true,
  })

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

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {COLUMNS.map((col) => (
        <div key={col.status} data-testid={`column-${col.status}`} className="rounded-lg bg-gray-50 p-3">
          <h2 className="mb-3 font-semibold">{col.label}</h2>
          <div className="space-y-2">
            {(tasks ?? [])
              .filter((t) => t.status === col.status)
              .map((task) => (
                <TaskCard key={task.id} task={task} onClick={() => {}} />
              ))}
          </div>
        </div>
      ))}
    </div>
  )
}
