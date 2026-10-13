'use client'
import type { BuildingId } from '@/lib/ops/cityMarketplace'
import { LoopVideo } from './MarketplaceAds'
import styles from './BusinessCity.module.css'

/**
 * "Inside the building": a short film of the building at work and the same
 * scene as a still, with each part of the picture leading to the automation
 * that does it. Written for someone who has never heard of AI: they should see
 * bills, reminders and money, recognise their own day, and know what to tap.
 * Spots only appear for automations this building actually offers, so a tap
 * never leads nowhere. Positions are percentages of the still.
 */
type Spot = { key: string; label: string; x: number; y: number }
type Tour = { video: string; poster: string; still: string; alt: string; title: string; line: string; spots: Spot[] }

const TOURS: Partial<Record<BuildingId, Tour>> = {
  finance: {
    video: '/buildings/finance.mp4', poster: '/buildings/finance-poster.jpg', still: '/buildings/finance.jpg',
    alt: 'The Finance building: bills go into a machine and come out as receipts, a reminder goes out on a phone, and rupees flow into the vault.',
    title: 'Inside Finance',
    line: 'Bills, reminders and payments get handled while you work. Tap a part of the building to see what does it.',
    spots: [
      { key: 'ca-compliance-reminders', label: 'Reminders sent for you', x: 77, y: 47 },
      { key: 'ca-document-chaser', label: 'Missing papers collected', x: 40, y: 32 },
      { key: 'ca-bank-ledger', label: 'Bank statement into your books', x: 37, y: 57 },
      { key: 'ca-gst-recon', label: 'GST bills matched', x: 64, y: 45 },
    ],
  },
}

export const hasTour = (building: BuildingId) => Boolean(TOURS[building])

export function BuildingTour({ building, offered, onOpen }: { building: BuildingId; offered: Set<string>; onOpen: (key: string) => void }) {
  const tour = TOURS[building]
  if (!tour) return null
  const spots = tour.spots.filter(s => offered.has(s.key))
  return <section className={styles.tour} aria-label={tour.title}>
    <article className={styles.ad}>
      <LoopVideo src={tour.video} poster={tour.poster} active />
      <div className={styles.adText}>
        <p className={styles.adEyebrow}>Marketplace · inside the building</p>
        <h3>{tour.title}</h3>
        <p>{tour.line}</p>
      </div>
      <span className={styles.adNote}>AI-generated video</span>
    </article>
    <figure className={styles.tourStill}>
      {/* The spots are placed against the picture alone, not the picture plus the list under it. */}
      <div className={styles.tourPic}>
        {/* eslint-disable-next-line @next/next/no-img-element -- a static local render */}
        <img src={tour.still} alt={tour.alt} />
        {/* Numbers on the picture, names in the list below: labels on the picture covered each other. */}
        {spots.map((s, i) => <button key={s.key} type="button" className={styles.spot} style={{ left: `${s.x}%`, top: `${s.y}%` }} onClick={() => onOpen(s.key)} aria-label={`${s.label}: see how it works`}>
          <b aria-hidden="true">{i + 1}</b>
        </button>)}
      </div>
      <figcaption className={styles.spotList}>{spots.map((s, i) => <button key={s.key} type="button" onClick={() => onOpen(s.key)}><b aria-hidden="true">{i + 1}</b>{s.label}</button>)}</figcaption>
    </figure>
  </section>
}
