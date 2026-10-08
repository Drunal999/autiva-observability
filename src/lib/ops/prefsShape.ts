/**
 * The shape of a person's workspace preferences, shared by the browser and the
 * server. No React here, so API routes can import it; clean() is the single
 * gate every stored or received value passes through.
 */
export type Palette = 'orca' | 'aurora' | 'sunset' | 'ocean' | 'mint' | 'mono'
export type Accent = 'amber' | 'blue' | 'violet' | 'green' | 'pink'
export type HomeCard = 'agents' | 'ok' | 'today' | 'brain' | 'autos'
export interface Prefs { assistantName: string; palette: Palette; accent: Accent; glass: 'clear' | 'frosted'; hidden: HomeCard[] }

export const DEFAULT_PREFS: Prefs = { assistantName: 'Bolo', palette: 'orca', accent: 'amber', glass: 'clear', hidden: [] }
export const ACCENTS: Record<Accent, string> = { amber: '#ff9f0a', blue: '#0a84ff', violet: '#bf5af2', green: '#30d158', pink: '#ff375f' }
export const PALETTES: Palette[] = ['orca', 'aurora', 'sunset', 'ocean', 'mint', 'mono']
export const CARDS: { id: HomeCard; label: string }[] = [
 { id: 'agents', label: 'Agents' }, { id: 'ok', label: 'Needs your OK' }, { id: 'today', label: 'Today' },
 { id: 'brain', label: 'Brain' }, { id: 'autos', label: 'Automations' },
]
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

