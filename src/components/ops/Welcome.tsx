'use client'
import { useEffect, useRef, useState } from 'react'
import { BoloOrb } from './BoloOrb'
import { usePrefs } from '@/lib/ops/prefs'
import styles from './Welcome.module.css'

/**
 * First open: three short steps that say what this place is, before anyone
 * has to guess. Shown once per browser (a per-viewer convenience, so
 * localStorage is fine); Skip and Esc always work.
 */
const KEY = 'autiva.welcome.v1'
const STEPS = [
 { kicker: 'Welcome to AUTIVA', title: 'Your business, as a living city', body: 'Every light in the city is part of your business. Your agents walk it by name, coloured by what they are really doing. The faint crowd around them is just city life.' },
 { kicker: 'The marketplace', title: 'Every building is a category', body: 'Sales, Marketing, Finance, Support… Tap a building to see the automations inside it, what they did today, and how each one works.' },
 { kicker: 'Meet Bolo', title: 'Just talk to it', body: 'Bolo is your assistant. Tap the orb and say what you need. Anything that spends money or messages people waits for your OK first.' },
]

export function Welcome({ previews }: { previews: Record<string, string> }) {
 const [step, setStep] = useState(-1)
 const name = usePrefs().assistantName
 const primary = useRef<HTMLButtonElement>(null)
 useEffect(() => { try { if (!localStorage.getItem(KEY)) setStep(0) } catch { /* no storage: just don't show it */ } }, [])
 useEffect(() => {
  if (step < 0) return
  primary.current?.focus()
  const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') done() }
  window.addEventListener('keydown', esc)
  return () => window.removeEventListener('keydown', esc)
 }, [step])
 function done() { setStep(-1); try { localStorage.setItem(KEY, '1') } catch { /* ignore */ } }
 if (step < 0) return null
 const base = STEPS[step], last = step === STEPS.length - 1
 const s = step === 2 ? { ...base, kicker: `Meet ${name}`, body: base.body.replace('Bolo', name) } : base
 const shots = Object.values(previews).slice(0, 3)
 return <div className={styles.backdrop}>
  <div role="dialog" aria-modal="true" aria-labelledby="welcome-title" className={`liquid-glass ${styles.card}`}>
   <div className={styles.visual} aria-hidden="true">
    {step === 0 && <div className={styles.lights}>{Array.from({ length: 18 }, (_, i) => <i key={i} style={{ animationDelay: `${(i * 0.37) % 2.4}s` }} />)}<img className={styles.logo} src="/brand/autiva-full.png?v=2" alt="" /></div>}
    {step === 1 && (shots.length ? <div className={styles.shots}>{shots.map((src, i) => <img key={i} src={src} alt="" />)}</div> : <div className={styles.lights} />)}
    {step === 2 && <BoloOrb size={104} mood="listening" />}
   </div>
   <p className={styles.kicker}>{s.kicker}</p>
   <h2 id="welcome-title">{s.title}</h2>
   <p className={styles.body}>{s.body}</p>
   <div className={styles.dots} aria-label={`Step ${step + 1} of ${STEPS.length}`}>{STEPS.map((_, i) => <span key={i} data-on={i === step} />)}</div>
   <div className={styles.actions}>
    <button type="button" className={styles.skip} onClick={done}>Skip</button>
    <button type="button" ref={primary} className={styles.next} onClick={() => last ? done() : setStep(step + 1)}>{last ? 'Start exploring' : 'Next'}</button>
   </div>
  </div>
 </div>
}
