'use client'

import { useEffect, useState } from 'react'
import { getPusherClient, usePusherConnectionState, BOARD_CHANNEL } from '@/lib/pusher/client'
import type { Task } from '@/types/task'

interface ActivityEntry {
  id: string
  text: string
  at: Date
}

const MAX_ENTRIES = 30

function describeCreated(task: Pick<Task, 'title'>) {
  return `Task created: "${task.title}"`
}

function describeUpdated(task: Pick<Task, 'title' | 'status'>) {
  if (task.status) {
    const label = task.status === 'IN_PROGRESS' ? 'In Progress' : task.status === 'DONE' ? 'Done' : 'To Do'
    return `"${task.title}" moved to ${label}`
  }
  return `Task updated: "${task.title}"`
}

const statusDotClass: Record<ReturnType<typeof usePusherConnectionState>, string> = {
  connected: 'bg-emerald-400',
  connecting: 'bg-amber-400 animate-pulse',
  unavailable: 'bg-red-400',
  disconnected: 'bg-red-400',
}

const statusLabel: Record<ReturnType<typeof usePusherConnectionState>, string> = {
  connected: 'Live',
  connecting: 'Connecting',
  unavailable: 'Offline',
  disconnected: 'Offline',
}

export function LiveActivity() {
  const [entries, setEntries] = useState<ActivityEntry[]>([])
  const connectionState = usePusherConnectionState()

  useEffect(() => {
    const pusher = getPusherClient()
    const channel = pusher.subscribe(BOARD_CHANNEL)

    function push(text: string) {
      setEntries((current) => [{ id: crypto.randomUUID(), text, at: new Date() }, ...current].slice(0, MAX_ENTRIES))
    }

    channel.bind('task-created', (task: Task) => push(describeCreated(task)))
    channel.bind('task-updated', (task: Task) => push(describeUpdated(task)))
    channel.bind('task-deleted', ({ id }: { id: string }) => push(`Task deleted (${id.slice(0, 6)})`))

    return () => {
      channel.unbind_all()
      pusher.unsubscribe(BOARD_CHANNEL)
    }
  }, [])

  return (
    <div className="glass flex h-full flex-col rounded-3xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xs font-bold uppercase tracking-widest text-white/40">Live Activity</h2>
        <span className="flex items-center gap-1.5 font-mono text-[10px] text-white/40">
          <span className={`h-1.5 w-1.5 rounded-full ${statusDotClass[connectionState]}`} />
          {statusLabel[connectionState]}
        </span>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto">
        {entries.length === 0 ? (
          <p className="text-sm text-white/30">No activity yet — changes teammates make will show up here.</p>
        ) : (
          entries.map((entry) => (
            <div key={entry.id} className="flex items-start gap-2.5">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-400" />
              <div>
                <p className="text-sm leading-tight text-white/70">{entry.text}</p>
                <p className="font-mono text-[10px] text-white/30">
                  {entry.at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
