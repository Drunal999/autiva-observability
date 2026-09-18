 'use client'

import { useEffect, useRef, useState } from 'react'
import useSWR from 'swr'
import { useEventListener } from '@/lib/realtime/client'
import { CityView } from './CityView'

const fetchCity = async (url: string) => {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`City data unavailable (${response.status})`)
  return response.json()
}

export function ImmersiveCityView() {
  const frame = useRef<HTMLIFrameElement>(null)
  const [view, setView] = useState<'city' | 'runs'>('city')
  const [jarvis, setJarvis] = useState(false)
  const [local, setLocal] = useState(false)
  const { data, error, mutate } = useSWR('/api/city', fetchCity, { refreshInterval: 15000 })
  useEventListener(() => { void mutate() }, ['RUNS', 'FLEET'])
  useEffect(() => {
    setLocal(['localhost', '127.0.0.1'].includes(location.hostname))
  }, [])
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
  return <section className="space-y-3">
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-slate-950 p-3 text-sm">
      <strong className="text-cyan-300">AUTIVA / Agentic City</strong>
      <button onClick={() => setView('city')} aria-pressed={view === 'city'} className="rounded border border-white/20 px-3 py-2">3D City</button>
      <button onClick={() => setView('runs')} aria-pressed={view === 'runs'} className="rounded border border-white/20 px-3 py-2">Actual runs</button>
      {local && <button onClick={() => setJarvis(!jarvis)} aria-expanded={jarvis} className="rounded border border-cyan-400/40 px-3 py-2">{jarvis ? 'Close Jarvis' : 'Open Jarvis'}</button>}
      <span role="status" className={error ? 'text-red-300' : 'text-slate-300'}>
        {error ? error.message : !data ? 'Connecting to activity…' : data.sample ? 'Local / sample dataset connected' : 'Tenant activity connected'}
      </span>
    </div>
    <p className="text-xs text-slate-400">City population, jobs and movement are simulation. District signal dots show recent recorded runs. Open Actual runs for verified details.</p>
    {jarvis && <div className="rounded-xl border border-cyan-400/20 p-3">
      <p className="mb-2 text-sm text-slate-300">Personal local Jarvis console. Its connection and agent availability are reported by the console itself.</p>
      <a href="http://127.0.0.1:8090/" target="_blank" rel="noreferrer" className="text-cyan-300 underline">Open voice console in its own tab</a>
      <iframe title="Local Jarvis console" src="http://127.0.0.1:8090/" allow="microphone" className="mt-3 h-[650px] w-full rounded-lg border-0" />
    </div>}
    {view === 'city' ? <iframe ref={frame} title="Agentic City 3D simulation with recorded activity" src="/city/agentic-city.html" className="h-[80vh] min-h-[640px] w-full rounded-xl border border-cyan-400/20" /> : <CityView />}
  </section>
}
