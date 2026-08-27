'use client'

import { useState } from 'react'
import { CalendarClient } from '@/components/CalendarClient'
import type { Task } from '@/types/task'

export function TaskDetailModal({
  task,
  onClose,
  onSaved,
}: {
  task: Task | null
  onClose: () => void
  onSaved: () => void
}) {
  const [title, setTitle] = useState(task?.title ?? '')
  const [description, setDescription] = useState(task?.description ?? '')
  const [dueDate, setDueDate] = useState<Date | undefined>(
    task?.dueDate ? new Date(task.dueDate) : undefined
  )
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    if (!title.trim()) {
      setError('Title is required')
      return
    }
    setError(null)

    if (task) {
      await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description, dueDate: dueDate?.toISOString() ?? null }),
      })
    } else {
      await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description, dueDate: dueDate?.toISOString() ?? null }),
      })
    }
    onSaved()
  }

  async function handleDelete() {
    if (!task) return
    await fetch(`/api/tasks/${task.id}`, { method: 'DELETE' })
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm">
      <div className="glass max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl p-6">
        <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-white/40" htmlFor="task-title">
          Title
        </label>
        <input
          id="task-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mb-4 w-full rounded-xl border border-white/10 bg-white/5 p-2.5 text-white/90 outline-none transition focus:border-cyan-400/50"
        />
        <label
          className="mb-1 block text-xs font-bold uppercase tracking-widest text-white/40"
          htmlFor="task-description"
        >
          Description
        </label>
        <textarea
          id="task-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="mb-4 w-full rounded-xl border border-white/10 bg-white/5 p-2.5 text-white/90 outline-none transition focus:border-cyan-400/50"
        />
        <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-white/40">
          Due date
        </label>
        <div className="mb-4 flex justify-center rounded-xl border border-white/10 bg-white/5">
          <CalendarClient
            mode="single"
            selected={dueDate}
            onSelect={setDueDate}
            className="bg-transparent"
          />
        </div>
        {error && <p className="mb-4 text-sm text-red-400">{error}</p>}
        <div className="flex justify-between">
          <div>
            {task && (
              <button type="button" onClick={handleDelete} className="text-sm text-red-400 hover:text-red-300">
                Delete
              </button>
            )}
          </div>
          <div className="space-x-3">
            <button type="button" onClick={onClose} className="text-sm text-white/50 hover:text-white/80">
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="rounded-xl bg-cyan-400 px-4 py-1.5 text-sm font-extrabold uppercase tracking-wide text-black transition hover:bg-cyan-300"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
