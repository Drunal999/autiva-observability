'use client'

import { useEffect, useState } from 'react'
import { OpsShell } from '@/components/ops/OpsShell'
import { AutomationsView } from '@/components/ops/AutomationsView'

// Served by AUTIVA's brain/server.mjs, which keeps the ElevenLabs key and the computer permissions local.
// ponytail: localhost only; production needs the brain behind the tenant API (shared-brain PRD, acceptance 5).
const BRAIN = 'http://127.0.0.1:8095'

/** The shared brain and the automation workflows it describes, as one section. */
export default function BrainPage() {
  const [local, setLocal] = useState<boolean | null>(null)
  const [view, setView] = useState<'brain' | 'workflows'>('brain')
  useEffect(() => {
    setLocal(['localhost', '127.0.0.1', '[::1]'].includes(location.hostname))
    if (new URLSearchParams(location.search).get('view') === 'workflows') setView('workflows')
  }, [])
  const tab = (id: typeof view, label: string) => (
    <button onClick={() => setView(id)} aria-pressed={view === id}
      className={`rounded border px-3 py-2 ${view === id ? 'border-cyan-300/60 bg-cyan-300/10' : 'border-white/20'}`}>{label}</button>
  )
  return (
    <OpsShell>
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex flex-wrap items-center gap-3 px-3 pt-3 text-sm md:px-5">
          {tab('brain', 'Brain')}
          {tab('workflows', 'Workflows')}
          <span className="text-xs text-slate-400">
            {view === 'brain' ? 'Talk with the orb at the bottom right; this view shows the same conversation.' : 'Choose a flow on the right to see its steps and recorded runs.'}
          </span>
        </div>
        {view === 'workflows' ? <AutomationsView /> : (
          // A mirror only: the orb owns the voice session, so switching tabs never cuts a conversation.
          <section className="space-y-3 p-3 md:p-5">
            <p className="text-xs text-slate-400">
              Runs locally; start it from the AUTIVA repo with{' '}
              <code className="text-slate-300">node --env-file=.env brain/server.mjs</code>
            </p>
            {local === false ? (
              <p role="status" className="text-sm text-slate-400">The shared brain is only available on a local machine.</p>
            ) : local ? (
              <iframe title="AUTIVA shared brain" src={`${BRAIN}/?mirror=1`}
                className="h-[calc(100dvh-200px)] min-h-[420px] w-full rounded-xl border border-white/10" />
            ) : null}
          </section>
        )}
      </div>
    </OpsShell>
  )
}
