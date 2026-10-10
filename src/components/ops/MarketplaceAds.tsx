'use client'
import { useEffect, useRef } from 'react'
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

function Clip({ ad }: { ad: Ad }) {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const v = ref.current
    if (v && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) v.pause()
  }, [])
  return <video ref={ref} className={styles.adVideo} src={ad.video} poster={ad.poster} autoPlay muted loop playsInline preload="metadata" aria-hidden="true" />
}

export function MarketplaceAds({ onOpen }: { onOpen: (building: BuildingId, key: string) => void }) {
  return <div className={styles.ads} aria-label="Featured automations">
    {ADS.map(ad => <article key={ad.id} className={styles.ad}>
      <Clip ad={ad} />
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
