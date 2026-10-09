'use client'
import { useEffect, useState } from 'react'

/**
 * How this person wants their workspace to look. Saved on their user record
 * (GET/PUT /api/user/prefs) so it follows them to every device; this browser
 * keeps a copy so the page paints in their colours before the request returns.
 */
export * from './prefsShape'
import { clean, ACCENTS, DEFAULT_PREFS, type Prefs } from './prefsShape'

const KEY = 'autiva.prefs.v1'
const EVENT = 'autiva:prefs'

function read(): Prefs {
 try { return clean(JSON.parse(localStorage.getItem(KEY) ?? 'null')) } catch { return DEFAULT_PREFS }
}

/** The page-wide parts (accent colour, glass strength) live on <html> so every component picks them up. */
function apply(p: Prefs) {
 const html = document.documentElement
 html.style.setProperty('--accent', ACCENTS[p.accent])
 html.dataset.glass = p.glass
}

function local(next: Prefs) {
 try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* private window: still applies for this visit */ }
 apply(next)
 window.dispatchEvent(new CustomEvent(EVENT, { detail: next }))
}

/** Applies at once, then stores on the account. Throws if the account could not be updated, so the sheet can say so. */
export async function savePrefs(p: Prefs) {
 const next = clean(p)
 local(next)
 const r = await fetch('/api/user/prefs', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next) })
 if (!r.ok) throw new Error(`Not saved to your account (HTTP ${r.status})`)
}

let synced = false
/** Once per page load: the account's copy wins; an account with none adopts this browser's (step 1) settings. */
async function syncFromAccount() {
 if (synced) return
 synced = true
 try {
  const r = await fetch('/api/user/prefs', { cache: 'no-store' })
  if (!r.ok) return
  const body = (await r.json()) as { prefs: unknown | null }
  if (body.prefs) local(clean(body.prefs))
  else if (localStorage.getItem(KEY)) await savePrefs(read())
 } catch { synced = false /* offline: try again on the next mount */ }
}

export function usePrefs(): Prefs {
 const [p, setP] = useState<Prefs>(DEFAULT_PREFS)
 useEffect(() => {
  const now = read(); setP(now); apply(now)
  void syncFromAccount()
  const on = (e: Event) => setP((e as CustomEvent<Prefs>).detail)
  window.addEventListener(EVENT, on)
  return () => window.removeEventListener(EVENT, on)
 }, [])
 return p
}
