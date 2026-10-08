'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { BoloOrb, BOLO_STATE, BOLO_TOGGLE, moodOf } from './BoloOrb'
import { requestCityFocus } from '@/lib/ops/cityFocus'
import { usePrefs } from '@/lib/ops/prefs'

// The ElevenLabs voice, run by AUTIVA's brain/server.mjs. The Brain section mirrors this same session.
const VOICE = 'http://127.0.0.1:8095'

/** A computer action the assistant wants to take; nothing runs until someone clicks here. */
interface Approval { id: string; summary: string }

export function AutivaAssistant() {
  const frame = useRef<HTMLIFrameElement>(null)
  const name = usePrefs().assistantName
  const [local, setLocal] = useState(false)
  const [ready, setReady] = useState(false)
  const [active, setActive] = useState(false)
  const [status, setStatus] = useState('Waking Bolo up…')
  const [approvals, setApprovals] = useState<Approval[]>([])
  // The voice asks the dashboard (which holds the session) for this workspace's automations, and
  // may then ask to show one in the City. Only ids from the last list it was given are accepted.
  const router = useRouter(), pathname = usePathname()
  const nav = useRef({ router, pathname })
  nav.current = { router, pathname }
  const known = useRef(new Set<string>())
  useEffect(() => {
    setLocal(['localhost', '127.0.0.1', '[::1]'].includes(location.hostname))
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.origin !== VOICE) return
      if (event.data?.type === 'autiva:voice-ready') { setReady(true); setStatus('Tap to talk') }
      if (event.data?.type === 'autiva:voice-state' && typeof event.data.name === 'string') {
        setStatus(event.data.name === 'Needs attention' ? String(event.data.note || 'Voice unavailable').slice(0,180) : event.data.name)
        if (['Standing by','Needs attention'].includes(event.data.name)) setActive(false)
      }
      const a = event.data?.approval
      if (event.data?.type === 'autiva:approval' && typeof a?.id === 'string' && typeof a?.summary === 'string')
        setApprovals(list => list.some(x => x.id === a.id) ? list : [...list, { id: a.id, summary: a.summary.slice(0, 400) }])
      if (event.data?.type === 'autiva:approval-done') setApprovals(list => list.filter(x => x.id !== event.data.id))
      if (event.data?.type === 'autiva:automations-request') void listAutomations(String(event.data.nonce))
      if (event.data?.type === 'autiva:show-in-city' && known.current.has(event.data.moduleId)) {
        requestCityFocus(event.data.moduleId)
        if (nav.current.pathname !== '/city') nav.current.router.push('/city')
      }
    }
    const reply = (body: object) => frame.current?.contentWindow?.postMessage({ type: 'autiva:automations-result', ...body }, VOICE)
    async function listAutomations(nonce: string) {
      try {
        const r = await fetch('/api/city')
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const data: { sample: boolean; districts: { id: string; displayName: string; district: string; department?: string; pendingApprovals?: number; runs: { status: string }[] }[] } = await r.json()
        known.current = new Set(data.districts.map(m => m.id))
        reply({ nonce, sample: data.sample, modules: data.districts.map(m => ({
          id: m.id, name: m.displayName, area: m.district, department: m.department ?? null,
          recentRuns: m.runs.length, lastStatus: m.runs[0]?.status ?? null, pendingApprovals: m.pendingApprovals ?? 0,
        })) })
      } catch (e) {
        reply({ nonce, error: `The workspace automations could not be loaded (${(e as Error).message}).` })
      }
    }
    window.addEventListener('message', receive)
    const timer = setTimeout(() => setStatus(value => value === 'Waking Bolo up…' ? 'Bolo is offline right now. Try again in a moment.' : value), 10000)
    return () => { clearTimeout(timer); window.removeEventListener('message', receive) }
  }, [])
  function toggle() {
    if (!ready) return
    if (active) {
      // Unmounting terminates pending capture/playback as well as active audio.
      setActive(false); setReady(false); setStatus('Muted'); setApprovals([])
      frame.current?.contentWindow?.postMessage({type:'autiva:voice-command',action:'stop'}, VOICE)
      if (frame.current) frame.current.src = `${VOICE}/?voiceBridge=1`
    } else {
      setActive(true); setStatus('Requesting microphone...')
      frame.current?.contentWindow?.postMessage({type:'autiva:voice-command',action:'start'}, VOICE)
    }
  }
  const toggleRef = useRef(toggle); toggleRef.current = toggle
  useEffect(() => {
    const announce = () => window.dispatchEvent(new CustomEvent(BOLO_STATE, { detail: { ready, active, status, local } }))
    announce()
    const onToggle = () => toggleRef.current()
    window.addEventListener('autiva:bolo-hello', announce)
    window.addEventListener(BOLO_TOGGLE, onToggle)
    return () => { window.removeEventListener('autiva:bolo-hello', announce); window.removeEventListener(BOLO_TOGGLE, onToggle) }
  }, [ready, active, status, local])
  function decide(id: string, decision: 'once' | 'always' | 'deny') {
    frame.current?.contentWindow?.postMessage({ type: 'autiva:approval-decision', id, decision }, VOICE)
  }
  if (!local) return null
  const home = pathname === '/city' || pathname === '/'
  return <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-2 max-[700px]:bottom-28">
    {approvals.map(a => <div key={a.id} role="alertdialog" aria-label={`${name} asks for permission`} className="liquid-glass relative w-80 rounded-3xl p-4 text-sm text-white">
      <p className="text-xs font-semibold uppercase tracking-wide text-white/60">{name} asks</p>
      <p className="mt-1 break-words font-medium">Allow {name} to {a.summary}?</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => decide(a.id, 'once')} className="h-9 rounded-full bg-white px-4 text-xs font-semibold text-black focus-visible:ring-2 focus-visible:ring-white">Allow once</button>
        <button type="button" onClick={() => decide(a.id, 'always')} className="h-9 rounded-full border border-white/25 bg-white/10 px-4 text-xs font-semibold focus-visible:ring-2 focus-visible:ring-white">Always allow</button>
        <button type="button" onClick={() => decide(a.id, 'deny')} className="h-9 rounded-full border border-white/25 bg-white/10 px-4 text-xs font-semibold focus-visible:ring-2 focus-visible:ring-white">Deny</button>
      </div>
    </div>)}
    {!home && <button type="button" disabled={!ready} aria-label={active ? `Mute ${name}` : `Talk to ${name}`} aria-pressed={active} onClick={toggle}
      className="liquid-glass relative flex h-14 items-center gap-3 rounded-full py-2 pl-2 pr-5 text-left text-white focus-visible:ring-2 focus-visible:ring-white disabled:opacity-60 max-[700px]:hidden">
      <BoloOrb size={40} mood={moodOf(status, active)} />
      <span><b className="block text-sm font-semibold leading-tight">{name}</b><small className="block text-xs text-white/65">{active ? `${status} · tap to stop` : ready ? 'Tap to talk' : status}</small></span>
    </button>}
    <iframe ref={frame} title="AUTIVA audio connection" src={`${VOICE}/?voiceBridge=1`} allow="microphone; autoplay" aria-hidden="true" tabIndex={-1} className="pointer-events-none absolute h-px w-px opacity-0" />
  </div>
}
