'use client'

import { useEffect, useState } from 'react'
import { OpsShell } from '@/components/ops/OpsShell'
import { AutomationsView } from '@/components/ops/AutomationsView'
import { BRAIN_URL, useBrainStatus } from '@/lib/ops/brain'
import styles from './BrainPage.module.css'

/** The shared brain and the automation workflows it describes, as one section. */
export default function BrainPage() {
  const brain = useBrainStatus()
  const [view, setView] = useState<'brain' | 'workflows'>('brain')
  useEffect(() => {
    if (new URLSearchParams(location.search).get('view') === 'workflows') setView('workflows')
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
        {view === 'workflows' ? <AutomationsView /> : brain === 'remote' ? (
          <section className={`liquid-glass ${styles.offline}`}>
            <h2>Only on your own machine</h2>
            <p>The shared brain runs locally, so it isn’t available from here.</p>
          </section>
        ) : brain === 'offline' ? (
          <section className={`liquid-glass ${styles.offline}`} role="status">
            <h2>The brain isn’t running</h2>
            <p>Start it from the AUTIVA repo, then reload this page.</p>
            <code>node --env-file=.env brain/server.mjs</code>
          </section>
        ) : brain === 'online' ? (
          // A mirror only: the orb owns the voice session, so switching tabs never cuts a conversation.
          <div className={`liquid-glass ${styles.frame}`}>
            <iframe title="AUTIVA shared brain" src={`${BRAIN_URL}/?mirror=1`} />
          </div>
        ) : null}
      </div>
    </OpsShell>
  )
}
