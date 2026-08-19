'use client'

import { useState } from 'react'
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
        body: JSON.stringify({ title, description }),
      })
    } else {
      await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description }),
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
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-lg bg-white p-4 shadow-lg">
        <label className="block text-sm font-medium" htmlFor="task-title">
          Title
        </label>
        <input
          id="task-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mb-3 w-full rounded border p-2"
        />
        <label className="block text-sm font-medium" htmlFor="task-description">
          Description
        </label>
        <textarea
          id="task-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="mb-3 w-full rounded border p-2"
        />
        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
        <div className="flex justify-between">
          <div>
            {task && (
              <button type="button" onClick={handleDelete} className="text-red-600">
                Delete
              </button>
            )}
          </div>
          <div className="space-x-2">
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button type="button" onClick={handleSave} className="rounded bg-blue-600 px-3 py-1 text-white">
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
