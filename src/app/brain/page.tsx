'use client'

import { useEffect, useState } from 'react'
import { OpsShell } from '@/components/ops/OpsShell'
import { AutomationsView } from '@/components/ops/AutomationsView'
import styles from './BrainPage.module.css'

// Served by AUTIVA's brain/server.mjs, which keeps the ElevenLabs key and the computer permissions local.
// ponytail: localhost only; production needs the brain behind the tenant API (shared-brain PRD, acceptance 5).
const BRAIN = 'http://127.0.0.1:8095'

/** The shared brain and the automation workflows it describes, as one section. */
export default function BrainPage() {
  const [local, setLocal] = useState<boolean | null>(null)
  // Whether brain/server.mjs answered. null while checking; the start command shows only when it did not.
  const [reachable, setReachable] = useState<boolean | null>(null)
  const [view, setView] = useState<'brain' | 'workflows'>('brain')
  useEffect(() => {
    const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)
    setLocal(isLocal)
    if (new URLSearchParams(location.search).get('view') === 'workflows') setView('workflows')
    // An opaque no-cors response still proves something is listening; a network error proves nothing is.
    if (isLocal) fetch(BRAIN, { mode: 'no-cors' }).then(() => setReachable(true), () => setReachable(false))
  }, [])
  const tab = (id: typeof view, label: string) => (
    <button onClick={() => setView(id)} aria-pressed={view === id}>{label}</button>
  )
  return (
    <OpsShell>
      <div className={styles.page}>
        <header className={styles.top}>
          <div><p className={styles.kicker}>Shared memory</p><h1>Brain</h1></div>
          <div className={styles.segment} role="group" aria-label="Brain views">{tab('brain', 'Brain')}{tab('workflows', 'Workflows')}</div>
        </header>
        <p className={styles.hint}>
          {view === 'brain' ? 'Talk to Bolo with the voice button; this view mirrors the same conversation.' : 'Choose a flow on the right to see its steps and recorded runs.'}
        </p>
        {view === 'workflows' ? <AutomationsView /> : local === false ? (
          <section className={`liquid-glass ${styles.offline}`}>
            <h2>Only on your own machine</h2>
            <p>The shared brain runs locally, so it isn’t available from here.</p>
          </section>
        ) : reachable === false ? (
          <section className={`liquid-glass ${styles.offline}`} role="status">
            <h2>The brain isn’t running</h2>
            <p>Start it from the AUTIVA repo, then reload this page.</p>
            <code>node --env-file=.env brain/server.mjs</code>
          </section>
        ) : reachable ? (
          // A mirror only: the orb owns the voice session, so switching tabs never cuts a conversation.
          <div className={`liquid-glass ${styles.frame}`}>
            <iframe title="AUTIVA shared brain" src={`${BRAIN}/?mirror=1`} />
          </div>
        ) : null}
      </div>
    </OpsShell>
  )
}
