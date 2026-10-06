'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { ThinkingOrb } from 'thinking-orbs'
import { requestCityFocus } from '@/lib/ops/cityFocus'

type Face = 'orb' | 'orca' | 'human' | 'robot'

function AssistantFace({ face }: { face: Face }) {
  return <svg viewBox="0 0 80 80" className="h-14 w-14" fill="none" aria-hidden="true">
    {face === 'orca' ? <>
      <path d="M12 48C17 33 29 29 38 28L45 13L51 30C64 32 70 43 68 49C64 54 52 56 42 52L30 60L33 49C24 52 18 52 12 48Z" fill="#091b2c" stroke="#67e8f9" strokeWidth="2" />
      <path d="M15 47C29 43 40 44 48 47C55 50 63 49 68 46C67 53 53 57 42 52L30 60L33 49C24 52 18 52 15 47Z" fill="#eefaff" />
      <ellipse cx="53" cy="39" rx="7" ry="4" fill="#eefaff" transform="rotate(-18 53 39)" />
      <circle cx="64" cy="42" r="1.6" fill="#67e8f9" />
    </> : face === 'robot' ? <>
      <path d="M40 17V10M35 10H45" stroke="#a5b4fc" strokeWidth="3" strokeLinecap="round" />
      <rect x="17" y="22" width="46" height="39" rx="14" fill="#172640" stroke="#a5b4fc" strokeWidth="2" />
      <rect x="24" y="31" width="32" height="17" rx="7" fill="#070f21" />
      <path d="M29 38H33M47 38H51M34 54H46" stroke="#67e8f9" strokeWidth="3" strokeLinecap="round" />
      <path d="M12 35V47M68 35V47" stroke="#a5b4fc" strokeWidth="3" strokeLinecap="round" />
    </> : <>
      <path d="M19 67C22 54 58 54 61 67" fill="#164e63" stroke="#67e8f9" strokeWidth="2" />
      <path d="M23 30C23 10 57 10 57 30V39C57 61 23 61 23 39Z" fill="#1a3449" stroke="#67e8f9" strokeWidth="2" />
      <path d="M23 30C38 29 43 24 46 20L57 32" stroke="#a5f3fc" strokeWidth="3" />
      <path d="M29 37H33M47 37H51M35 47Q40 51 45 47" stroke="#e0faff" strokeWidth="2.5" strokeLinecap="round" />
    </>}
  </svg>
}

// The ElevenLabs voice, run by AUTIVA's brain/server.mjs. The Brain section mirrors this same session.
const VOICE = 'http://127.0.0.1:8095'

/** A computer action the assistant wants to take; nothing runs until someone clicks here. */
interface Approval { id: string; summary: string }

export function AutivaAssistant() {
  const frame = useRef<HTMLIFrameElement>(null)
  const [local, setLocal] = useState(false)
  const [ready, setReady] = useState(false)
  const [active, setActive] = useState(false)
  const [status, setStatus] = useState('Connecting assistant...')
  const [face, setFace] = useState<Face>('orb')
  const [approvals, setApprovals] = useState<Approval[]>([])
  const down = useRef(0)
  const swiped = useRef(false)
  // The voice asks the dashboard (which holds the session) for this workspace's automations, and
  // may then ask to show one in the City. Only ids from the last list it was given are accepted.
  const router = useRouter(), pathname = usePathname()
  const nav = useRef({ router, pathname })
  nav.current = { router, pathname }
  const known = useRef(new Set<string>())
  useEffect(() => {
    setLocal(['localhost', '127.0.0.1', '[::1]'].includes(location.hostname))
    try { const saved = localStorage.getItem('autiva-assistant-face'); if (['orb','orca','human','robot'].includes(saved || '')) setFace(saved as Face) } catch {}
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
    const timer = setTimeout(() => setStatus(value => value === 'Connecting assistant...' ? 'Voice unavailable. Reload to reconnect.' : value), 10000)
    return () => { clearTimeout(timer); window.removeEventListener('message', receive) }
  }, [])
  function changeFace(direction: number) {
    const faces: Face[] = ['orb','orca','human','robot']
    const next = faces[(faces.indexOf(face)+direction+faces.length)%faces.length]
    setFace(next); try { localStorage.setItem('autiva-assistant-face',next) } catch {}
  }
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
  function decide(id: string, decision: 'once' | 'always' | 'deny') {
    frame.current?.contentWindow?.postMessage({ type: 'autiva:approval-decision', id, decision }, VOICE)
  }
  if (!local) return null
  return <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-2 max-[700px]:bottom-28">
    {approvals.map(a => <div key={a.id} role="alertdialog" aria-label="Bolo asks for permission" className="w-80 rounded-2xl border border-orange-300/50 bg-slate-950/95 p-3 text-sm text-slate-100 shadow-xl">
      <p className="break-words">Allow Bolo to: {a.summary}?</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" onClick={() => decide(a.id, 'once')} className="rounded-lg bg-emerald-300 px-3 py-1.5 text-xs font-semibold text-slate-950 focus-visible:ring-2 focus-visible:ring-white">Approve once</button>
        <button type="button" onClick={() => decide(a.id, 'always')} className="rounded-lg border border-white/20 px-3 py-1.5 text-xs font-semibold focus-visible:ring-2 focus-visible:ring-white">Always allow this</button>
        <button type="button" onClick={() => decide(a.id, 'deny')} className="rounded-lg border border-white/20 px-3 py-1.5 text-xs font-semibold focus-visible:ring-2 focus-visible:ring-white">Deny</button>
      </div>
    </div>)}
    <p role="status" className="max-w-64 rounded-2xl bg-slate-950/95 px-3 py-2 text-xs text-slate-200 max-[700px]:hidden">{status}{active ? ' · Tap to mute' : ''}</p>
    <button type="button" disabled={!ready} aria-label={active ? 'Mute Bolo' : 'Talk to Bolo'} aria-pressed={active} title="Tap to talk. Swipe or use arrow keys to change appearance."
      onPointerDown={event => {down.current=event.clientX; swiped.current=false; event.currentTarget.setPointerCapture(event.pointerId)}}
      onPointerUp={event => {const delta=event.clientX-down.current;if(Math.abs(delta)>28){swiped.current=true;changeFace(delta<0?1:-1)}}}
      onPointerCancel={() => {swiped.current=true}}
      onKeyDown={event => {if(event.key==='ArrowRight'||event.key==='ArrowLeft'){event.preventDefault();changeFace(event.key==='ArrowRight'?1:-1)}}}
      onClick={() => {if(swiped.current){swiped.current=false;return}toggle()}}
      className={`flex h-[76px] w-[76px] touch-pan-y max-[700px]:hidden items-center justify-center rounded-full border backdrop-blur-xl backdrop-saturate-150 shadow-xl transition-colors duration-300 focus-visible:ring-2 focus-visible:ring-[#ff9f0a] disabled:opacity-50 ${active ? 'border-[#ff9f0a]/80 bg-[#ff9f0a]/20 shadow-[0_0_44px_rgba(255,159,10,0.45)]' : 'border-white/25 bg-white/10'}`}>
      {face==='orb' ? <ThinkingOrb state={['Listening','Hearing you'].includes(status)?'listening':['Thinking','Understanding'].includes(status)?'working':status==='Speaking'?'composing':'breathing'} size={64} theme="dark" /> : <AssistantFace face={face} />}
    </button>
    <iframe ref={frame} title="AUTIVA audio connection" src={`${VOICE}/?voiceBridge=1`} allow="microphone; autoplay" aria-hidden="true" tabIndex={-1} className="pointer-events-none absolute h-px w-px opacity-0" />
  </div>
}
