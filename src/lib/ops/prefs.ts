'use client'
import { useEffect, useState } from 'react'

/**
 * How this person wants their workspace to look. Step 1 of the
 * personalisation plan keeps it in this browser; step 2 moves the same shape
 * into a UserPreference row so it follows them across devices.
 */
export type Palette = 'aurora' | 'sunset' | 'ocean' | 'mint' | 'mono'
export type Accent = 'amber' | 'blue' | 'violet' | 'green' | 'pink'
export type HomeCard = 'agents' | 'ok' | 'today' | 'brain' | 'autos'
export interface Prefs { assistantName: string; palette: Palette; accent: Accent; glass: 'clear' | 'frosted'; hidden: HomeCard[] }

export const DEFAULT_PREFS: Prefs = { assistantName: 'Bolo', palette: 'aurora', accent: 'amber', glass: 'clear', hidden: [] }
export const ACCENTS: Record<Accent, string> = { amber: '#ff9f0a', blue: '#0a84ff', violet: '#bf5af2', green: '#30d158', pink: '#ff375f' }
export const PALETTES: Palette[] = ['aurora', 'sunset', 'ocean', 'mint', 'mono']
export const CARDS: { id: HomeCard; label: string }[] = [
 { id: 'agents', label: 'Agents' }, { id: 'ok', label: 'Needs your OK' }, { id: 'today', label: 'Today' },
 { id: 'brain', label: 'Brain' }, { id: 'autos', label: 'Automations' },
]
const KEY = 'autiva.prefs.v1'
const EVENT = 'autiva:prefs'

/** Keeps only known values, so a hand-edited or stale entry can never break the page. */
export function clean(raw: unknown): Prefs {
 const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Prefs>
 const name = typeof r.assistantName === 'string' ? r.assistantName.trim().slice(0, 20) : ''
 return {
  assistantName: name || DEFAULT_PREFS.assistantName,
  palette: PALETTES.includes(r.palette as Palette) ? r.palette as Palette : DEFAULT_PREFS.palette,
  accent: r.accent && r.accent in ACCENTS ? r.accent : DEFAULT_PREFS.accent,
  glass: r.glass === 'frosted' ? 'frosted' : 'clear',
  hidden: Array.isArray(r.hidden) ? r.hidden.filter((c): c is HomeCard => CARDS.some(x => x.id === c)) : [],
 }
}

function read(): Prefs {
 try { return clean(JSON.parse(localStorage.getItem(KEY) ?? 'null')) } catch { return DEFAULT_PREFS }
}

/** The page-wide parts (accent colour, glass strength) live on <html> so every component picks them up. */
function apply(p: Prefs) {
 const html = document.documentElement
 html.style.setProperty('--accent', ACCENTS[p.accent])
 html.dataset.glass = p.glass
}

export function savePrefs(p: Prefs) {
 const next = clean(p)
 try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* private window: still applies for this visit */ }
 apply(next)
 window.dispatchEvent(new CustomEvent(EVENT, { detail: next }))
}

export function usePrefs(): Prefs {
 const [p, setP] = useState<Prefs>(DEFAULT_PREFS)
 useEffect(() => {
  const now = read(); setP(now); apply(now)
  const on = (e: Event) => setP((e as CustomEvent<Prefs>).detail)
  window.addEventListener(EVENT, on)
  return () => window.removeEventListener(EVENT, on)
 }, [])
 return p
}
