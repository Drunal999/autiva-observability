'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { KanbanBoard } from '@/components/KanbanBoard'
import { TaskDetailModal } from '@/components/TaskDetailModal'

export default function Page() {
  const { data: session } = useSession()
  const [showCreate, setShowCreate] = useState(false)
  const [muteSounds, setMuteSounds] = useState(false)

  useEffect(() => {
    const sessionMuted = (session?.user as { muteSounds?: boolean } | undefined)?.muteSounds
    if (sessionMuted !== undefined) {
      setMuteSounds(sessionMuted)
    }
  }, [session])

  async function toggleMute() {
    const next = !muteSounds
    setMuteSounds(next)
    await fetch('/api/user/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ muteSounds: next }),
    })
  }

  return (
    <main className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Team Board</h1>
        <div className="flex items-center gap-3">
          <button type="button" onClick={toggleMute} className="text-sm text-gray-600">
            {muteSounds ? '🔇 Sounds off' : '🔊 Sounds on'}
          </button>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="rounded bg-blue-600 px-3 py-1 text-white"
          >
            New Task
          </button>
        </div>
      </div>
      <KanbanBoard muteSounds={muteSounds} />
      {showCreate && (
        <TaskDetailModal task={null} onClose={() => setShowCreate(false)} onSaved={() => setShowCreate(false)} />
      )}
    </main>
  )
}
