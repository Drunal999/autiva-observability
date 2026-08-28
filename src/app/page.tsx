'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { CalendarClient } from '@/components/CalendarClient'
import { KanbanBoard } from '@/components/KanbanBoard'
import { TaskDataGrid } from '@/components/TaskDataGrid'
import { TaskDetailModal } from '@/components/TaskDetailModal'
import { Sidebar } from '@/components/Sidebar'
import { LiveActivity } from '@/components/LiveActivity'
import { SystemStatusBar } from '@/components/SystemStatusBar'

function greeting(now: Date) {
  const hour = now.getHours()
  if (hour < 12) return 'Good Morning'
  if (hour < 18) return 'Good Afternoon'
  return 'Good Evening'
}

export default function Page() {
  const { data: session } = useSession()
  const [showCreate, setShowCreate] = useState(false)
  const [view, setView] = useState<'board' | 'list'>('board')
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined)
  const [muteSounds, setMuteSounds] = useState(false)
  const [now, setNow] = useState<Date | null>(null)

  useEffect(() => {
    setNow(new Date())
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

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

  const firstName = session?.user?.name?.split(' ')[0] ?? 'there'

  return (
    <div className="min-h-screen">
      <Sidebar />
      <div className="pb-28 md:pl-64">
        <div className="flex flex-col gap-6 p-6 xl:flex-row">
          <div className="min-w-0 flex-1">
            <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
              <div>
                <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
                  {now ? `${greeting(now)}, ${firstName}.` : 'Team Board'}
                </h1>
                <p className="mt-2 text-sm text-white/40">
                  Ready for today&apos;s mission ·{' '}
                  <span className="font-mono text-white/30">
                    {now?.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }) ?? ''}
                  </span>
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
                  {(['board', 'list'] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setView(v)}
                      className={`rounded-lg px-3 py-1 text-xs font-semibold capitalize transition ${
                        view === v ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70'
                      }`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={toggleMute}
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/50 transition hover:text-white/80"
                >
                  {muteSounds ? '🔇 Sounds off' : '🔊 Sounds on'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreate(true)}
                  className="rounded-xl bg-cyan-400 px-4 py-1.5 text-xs font-extrabold uppercase tracking-wide text-black transition hover:bg-cyan-300"
                >
                  New Task
                </button>
              </div>
            </div>
            <h2 className="sr-only">Team Board</h2>
            {view === 'board' ? <KanbanBoard muteSounds={muteSounds} /> : <TaskDataGrid />}
          </div>
          <div className="flex w-full shrink-0 flex-col gap-6 xl:w-80">
            <div className="glass rounded-3xl p-5">
              <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-white/40">
                Calendar
              </h2>
              <CalendarClient
                mode="single"
                selected={selectedDate}
                onSelect={setSelectedDate}
                className="w-full bg-transparent p-0"
              />
            </div>
            <LiveActivity />
          </div>
        </div>
      </div>
      <SystemStatusBar />
      {showCreate && (
        <TaskDetailModal task={null} onClose={() => setShowCreate(false)} onSaved={() => setShowCreate(false)} />
      )}
    </div>
  )
}
