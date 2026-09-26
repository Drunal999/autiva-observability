'use client'

import { useEffect, useRef, useState } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import { useEventListener } from '@/lib/realtime/client'
import { CityView } from './CityView'
import styles from './CityWorkspace.module.css'
import { DEPARTMENTS, DEPARTMENT_PURPOSE, type Department } from '@/lib/ops/districts'

interface ModuleActivity {
  id: string
  displayName: string
  district: string
  department: Department
  pendingApprovals: number
  runs: { id: string; ref: string; status: string; summary: string | null; project: string | null; startedAt: string }[]
}
interface CityData { districts: ModuleActivity[]; sample: boolean }

const fetchCity = async (url: string) => {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`City data unavailable (${response.status})`)
  return response.json()
}

export function ImmersiveCityView() {
  const frame = useRef<HTMLIFrameElement>(null)
  const [localClock, setLocalClock] = useState('')
  useEffect(() => {
    const update = () => setLocalClock(new Intl.DateTimeFormat(undefined, {
      hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
    }).format(new Date()))
    update()
    const timer = setInterval(update, 30000)
    return () => clearInterval(timer)
  }, [])
  const [view, setView] = useState<'city' | 'runs'>('city')
  const [selected, setSelected] = useState<string | null>(null)
  const { data, error, mutate } = useSWR<CityData>('/api/city', fetchCity, { refreshInterval: 15000 })
  useEventListener(() => { void mutate() }, ['RUNS', 'FLEET'])
  useEffect(() => {
    const send = () => frame.current?.contentWindow?.postMessage(
      { type: 'autiva:city', payload: error ? { districts: [] } : data }, location.origin)
    const ready = (event: MessageEvent) => {
      if (event.origin === location.origin && event.source === frame.current?.contentWindow &&
          event.data?.type === 'autiva:city-ready') send()
    }
    window.addEventListener('message', ready)
    send()
    return () => window.removeEventListener('message', ready)
  }, [data, error, view])
  const active = error ? undefined : data?.districts.find(module => module.id === selected)
  return <section className={styles.workspace}>
    <header className={styles.header}><div><h1>Your business, at a glance.</h1><p>A place for your work, your agents and your next decision.</p></div><div className={styles.controls}>

      <button onClick={() => setView('city')} aria-pressed={view === 'city'} className="rounded border border-white/20 px-3 py-2">City</button>
      <button onClick={() => setView('runs')} aria-pressed={view === 'runs'} className="rounded border border-white/20 px-3 py-2">Recorded activity</button>
      <span role="status" className={error ? 'text-red-300' : 'text-slate-300'}>
        {error ? error.message : !data ? 'Connecting to activity…' : data.sample ? 'Sample workspace' : 'Workspace connected'}
      </span>
    </div></header>
    <p className="text-xs text-slate-400">{localClock && `Device time: ${localClock}. `}Lighting follows your device clock. Weather and city movement are illustrative; recorded activity comes from your workspace.</p>
    {view === 'city' ? <iframe ref={frame} title="Agentic City 3D simulation with recorded activity" src="/city/agentic-city.html?dashboard=1" className={styles.city} /> : <div className={styles.recorded}><CityView /></div>}
    <div className={styles.details}>
      <section className={styles.panel} aria-label="Business work">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-lg font-semibold text-slate-100">Your team at work</h2><p className="mt-1 text-sm text-slate-400">Choose a module to inspect its recorded activity.</p></div><Link href="/approvals" className="rounded-full bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950">Review approvals</Link></div>
        {error ? <div role="alert" className="text-sm text-red-300">Activity could not be loaded. <button onClick={() => void mutate()} className="underline">Retry</button></div> : !data ? <p role="status" className="text-sm text-slate-400">Loading work...</p> : (
          <div className="space-y-5">
            {DEPARTMENTS.map(dept => {
              const modules = data.districts.filter(m => m.department === dept)
              return (
                <div key={dept}>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">{dept}</h3>
                  {modules.length === 0 ? (
                    <p className="mt-2 rounded-lg border border-dashed border-white/10 px-3 py-2 text-xs text-slate-500">
                      {DEPARTMENT_PURPOSE[dept]} No workflow connected yet — Set up.
                    </p>
                  ) : (
                    <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                      {modules.map(module => (
                        <button key={module.id} onClick={() => setSelected(module.id)} aria-pressed={selected === module.id} className={styles.module}>
                          <span className="block text-xs text-slate-400">{module.district}</span>
                          <span className="mt-1 block font-medium text-slate-100">{module.displayName}</span>
                          <span className="mt-3 block text-xs text-slate-400">{module.runs.length ? `${module.runs.length} recent recorded runs` : 'No recent recorded runs'}</span>
                          {module.pendingApprovals > 0 && (
                            <span className="mt-2 inline-block rounded-full bg-amber-400/20 px-2 py-0.5 text-xs font-semibold text-amber-300">
                              {module.pendingApprovals} awaiting approval
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>
      <aside className={styles.panel} aria-label="Selected work details" aria-live="polite">
        <h2 className="text-lg font-semibold text-slate-100">{active?.displayName ?? 'Work details'}</h2>
        {!active ? <p className="mt-3 text-sm leading-6 text-slate-400">Select a module to see recorded outcomes. City movement is simulated; these records come from your workspace.</p> : <><p className="mt-1 text-xs text-slate-400">{data?.sample ? 'Sample workspace records' : 'Workspace records'}</p>{active.pendingApprovals > 0 && <p className="mt-2 rounded-lg bg-amber-400/10 px-3 py-2 text-xs text-amber-200">{active.pendingApprovals} decision{active.pendingApprovals === 1 ? '' : 's'} waiting on the owner. <Link href="/approvals" className="underline">Review in Approvals</Link></p>}<div className="mt-4 max-h-80 space-y-3 overflow-y-auto">{active.runs.length === 0 ? <p className="text-sm text-slate-400">No recent runs returned. This does not mean the module has never run.</p> : active.runs.map(run => <article key={run.id} className={styles.run}><div className="flex justify-between gap-3 text-xs"><span className="text-cyan-200">{run.ref}</span><span className={run.status === 'FAILED' ? 'text-red-300' : 'text-slate-300'}>{run.status}</span></div><p className="mt-2 text-sm text-slate-200">{run.summary || 'No summary recorded.'}</p><p className="mt-2 text-xs text-slate-400">{run.project || 'No project recorded'}</p><time className="text-xs text-slate-400" dateTime={run.startedAt}>{run.startedAt}</time></article>)}</div><Link href="/trace" className="mt-4 inline-block text-sm text-cyan-200 underline">Explore activity traces</Link></>}
      </aside>
    </div>
  </section>
}
