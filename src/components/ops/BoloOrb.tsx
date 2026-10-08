'use client'
import { useEffect, useState } from 'react'
import { usePrefs, type Palette } from '@/lib/ops/prefs'
import styles from './BoloOrb.module.css'

/**
 * Bolo's face: one iridescent orb (after the Aura reference), shared by the
 * home card and the floating pill. AutivaAssistant owns the voice connection;
 * it broadcasts its state and listens for a toggle, so any orb on the page
 * drives the same session.
 */
export type BoloState = { ready: boolean; active: boolean; status: string; local: boolean }
export const BOLO_STATE = 'autiva:bolo-state'
export const BOLO_TOGGLE = 'autiva:bolo-toggle'

export function useBolo(): BoloState & { toggle: () => void } {
 const [s, setS] = useState<BoloState>({ ready: false, active: false, status: 'Connecting…', local: false })
 useEffect(() => {
  const on = (e: Event) => setS((e as CustomEvent<BoloState>).detail)
  // Voice lives on the owner's machine; on a hosted page no assistant ever announces itself.
  if (!['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) setS({ ready: false, active: false, status: 'Voice works on your own machine', local: false })
  window.addEventListener(BOLO_STATE, on)
  window.dispatchEvent(new Event('autiva:bolo-hello')) // ask the assistant to re-announce its state
  return () => window.removeEventListener(BOLO_STATE, on)
 }, [])
 return { ...s, toggle: () => window.dispatchEvent(new Event(BOLO_TOGGLE)) }
}

/** listening / speaking / thinking / idle, read from the voice's own status words. */
export function moodOf(status: string, active: boolean) {
 if (!active) return 'idle'
 if (/listen|hearing/i.test(status)) return 'listening'
 if (/speak/i.test(status)) return 'speaking'
 return 'thinking'
}

export function BoloOrb({ size = 64, mood = 'idle', palette }: { size?: number; mood?: string; palette?: Palette }) {
 const prefs = usePrefs()
 return <span className={styles.orb} data-mood={mood} data-palette={palette ?? prefs.palette} style={{ width: size, height: size }} aria-hidden="true">
  <span className={styles.swirl} /><span className={styles.core} /><span className={styles.shine} />
 </span>
}
