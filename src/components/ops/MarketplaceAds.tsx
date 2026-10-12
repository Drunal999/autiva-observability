'use client'
import { useEffect, useRef, useState } from 'react'
import type { BuildingId } from '@/lib/ops/cityMarketplace'
import styles from './BusinessCity.module.css'

/**
 * The marketplace's shop window: short looping videos for automations worth a
 * second look. A planned automation says "Coming soon", and an AI-made video
 * says so on the card. Muted autoplay only; reduced motion shows the poster.
 */
type Ad = { id: string; video: string; poster: string; eyebrow: string; title: string; line: string; note?: string; open?: { building: BuildingId; key: string } }

const ADS: Ad[] = [
  { id: 'city', video: '/ads/city.mp4', poster: '/ads/city.jpg', eyebrow: 'AUTIVA', title: 'Your business, running itself',
    line: 'Every light in the city is an automation at work. Every person walking is one of your agents.' },
  { id: 'voice', video: '/ads/voice-receptionist.mp4', poster: '/ads/voice-receptionist.jpg', eyebrow: 'Coming soon · Customer Support', title: 'Your phone, answered',
    line: 'Voice Receptionist picks up, answers the usual questions and books tables while you keep working.',
    note: 'AI-generated video', open: { building: 'support', key: 'voice-receptionist' } },
]

function Clip({ ad, active }: { ad: Ad; active: boolean }) {
  const ref = useRef<HTMLVideoElement>(null)
  const [onScreen, setOnScreen] = useState(false)
  // Decoding video is not free: one clip costs the marketplace little, two at once
  // dropped it from ~50 to ~30 fps. So only the active clip plays, only while on
  // screen, and never under reduced motion; the others show their poster.
  useEffect(() => {
    const v = ref.current
    if (!v) return
    if (typeof IntersectionObserver === 'undefined') { setOnScreen(true); return }
    const io = new IntersectionObserver(([e]) => setOnScreen(e.isIntersecting), { threshold: 0.25 })
    io.observe(v)
    return () => io.disconnect()
  }, [])
  useEffect(() => {
    const v = ref.current
    if (!v) return
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (active && onScreen && !still) { try { void v.play()?.catch(() => {}) } catch { /* autoplay refused: the poster stays */ } }
    else v.pause()
  }, [active, onScreen])
  return <video ref={ref} className={styles.adVideo} src={ad.video} poster={ad.poster} muted loop playsInline preload="metadata" aria-hidden="true" />
}

export function MarketplaceAds({ onOpen }: { onOpen: (building: BuildingId, key: string) => void }) {
  // The automation ad plays first; pointing at or focusing another card hands playback to it.
  const [active, setActive] = useState('voice')
  return <div className={styles.ads} aria-label="Featured automations">
    {ADS.map(ad => <article key={ad.id} className={styles.ad} onPointerEnter={() => setActive(ad.id)} onFocusCapture={() => setActive(ad.id)}>
      <Clip ad={ad} active={active === ad.id} />
      <div className={styles.adText}>
        <p className={styles.adEyebrow}>{ad.eyebrow}</p>
        <h3>{ad.title}</h3>
        <p>{ad.line}</p>
        {ad.open && <button type="button" onClick={() => onOpen(ad.open!.building, ad.open!.key)}>See how it works</button>}
      </div>
      {ad.note && <span className={styles.adNote}>{ad.note}</span>}
    </article>)}
  </div>
}
