'use client'
import { useEffect, useRef, useState } from 'react'
import { BoloOrb } from './BoloOrb'
import { ACCENTS, CARDS, DEFAULT_PREFS, PALETTES, savePrefs, usePrefs, type Accent, type Prefs } from '@/lib/ops/prefs'
import styles from './SettingsSheet.module.css'

/**
 * "Make it yours": the assistant's name and orb, the accent colour, glass
 * strength, and which Home cards show. Every change applies live, so the page
 * behind the sheet is the preview; Reset puts everything back.
 */
const TABS = ['Assistant', 'Look', 'Home'] as const

export function SettingsSheet({ onClose }: { onClose: () => void }) {
 const prefs = usePrefs()
 const [tab, setTab] = useState<(typeof TABS)[number]>('Assistant')
 const [name, setName] = useState(prefs.assistantName)
 const first = useRef<HTMLButtonElement>(null)
 useEffect(() => setName(prefs.assistantName), [prefs.assistantName])
 useEffect(() => {
  first.current?.focus()
  const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
  window.addEventListener('keydown', esc)
  return () => window.removeEventListener('keydown', esc)
 }, [onClose])
 const set = (patch: Partial<Prefs>) => savePrefs({ ...prefs, ...patch })

 return <div className={styles.backdrop} onClick={onClose}>
  <div role="dialog" aria-modal="true" aria-labelledby="settings-title" className={`liquid-glass ${styles.sheet}`} onClick={e => e.stopPropagation()}>
   <header className={styles.head}>
    <div><p className={styles.kicker}>Make it yours</p><h2 id="settings-title">Customise</h2></div>
    <button type="button" className={styles.done} onClick={onClose}>Done</button>
   </header>
   <div className={styles.tabs} role="tablist">
    {TABS.map((t, i) => <button key={t} ref={i === 0 ? first : undefined} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>{t}</button>)}
   </div>

   {tab === 'Assistant' && <section className={styles.panel}>
    <div className={styles.preview}><BoloOrb size={72} palette={prefs.palette} /><div><b>{prefs.assistantName}</b><small>Your assistant</small></div></div>
    <label className={styles.field}><span>Name</span>
     <input value={name} maxLength={20} onChange={e => setName(e.target.value)} onBlur={() => set({ assistantName: name })}
      onKeyDown={e => { if (e.key === 'Enter') set({ assistantName: name }) }} placeholder="Bolo" />
    </label>
    <p className={styles.label}>Orb</p>
    <div className={styles.orbs} role="radiogroup" aria-label="Orb colours">
     {PALETTES.map(p => <button key={p} type="button" role="radio" aria-checked={prefs.palette === p} aria-label={p} onClick={() => set({ palette: p })}>
      <BoloOrb size={44} palette={p} /><span>{p[0].toUpperCase() + p.slice(1)}</span></button>)}
    </div>
    <p className={styles.hint}>Voice choice arrives with the ElevenLabs step. It answers in whatever language you speak.</p>
   </section>}

   {tab === 'Look' && <section className={styles.panel}>
    <p className={styles.label}>Accent colour</p>
    <div className={styles.swatches} role="radiogroup" aria-label="Accent colour">
     {(Object.keys(ACCENTS) as Accent[]).map(a => <button key={a} type="button" role="radio" aria-checked={prefs.accent === a} aria-label={a} style={{ background: ACCENTS[a] }} onClick={() => set({ accent: a })} />)}
    </div>
    <p className={styles.label}>Glass</p>
    <div className={styles.segment} role="radiogroup" aria-label="Glass strength">
     {(['clear', 'frosted'] as const).map(g => <button key={g} type="button" role="radio" aria-checked={prefs.glass === g} onClick={() => set({ glass: g })}>
      <b>{g === 'clear' ? 'Clear' : 'Frosted'}</b><small>{g === 'clear' ? 'See the city through every panel' : 'Calmer, easier to read'}</small></button>)}
    </div>
   </section>}

   {tab === 'Home' && <section className={styles.panel}>
    <p className={styles.label}>Cards on Home</p>
    {CARDS.map(c => { const on = !prefs.hidden.includes(c.id); return <label key={c.id} className={styles.toggle}>
     <span>{c.label}</span>
     <input type="checkbox" role="switch" checked={on} onChange={() => set({ hidden: on ? [...prefs.hidden, c.id] : prefs.hidden.filter(x => x !== c.id) })} />
    </label> })}
    <p className={styles.hint}>A hidden card leaves more of your city showing.</p>
   </section>}

   <footer className={styles.foot}>
    <button type="button" className={styles.reset} onClick={() => savePrefs(DEFAULT_PREFS)}>Reset to default</button>
    <span>Saved on this device</span>
   </footer>
  </div>
 </div>
}
