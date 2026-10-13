'use client'
import { useState, type CSSProperties } from 'react'
import { BUILDINGS, moduleStatus, type BuildingId, type CityModule } from '@/lib/ops/cityMarketplace'
import type { CatalogItem } from '@/lib/ops/marketplaceCatalog'
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
    // Rendered from the city's own Finance district, so tapping the building in the city leads to the same place, closer.
    alt: 'The Finance building in your city: robot agents feed bills into a machine, a reminder goes out on a phone, and rupees flow into the vault.',
    title: 'Inside Finance',
    line: 'Bills, reminders and payments get handled while you work. Tap a part of the building to see what does it.',
    spots: [
      { key: 'ca-compliance-reminders', label: 'Reminders sent for you', x: 66, y: 62 },
      { key: 'ca-document-chaser', label: 'Missing papers collected', x: 43, y: 30 },
      { key: 'ca-bank-ledger', label: 'Bank statement into your books', x: 56, y: 45 },
      { key: 'ca-gst-recon', label: 'GST bills matched', x: 58, y: 60 },
    ],
  },
}

export const hasTour = (building: BuildingId) => Boolean(TOURS[building])

/** The still with numbered spots, and the spots' names listed under it. */
function TourPicture({ tour, offered, onOpen, film = false }: { tour: Tour; offered: Set<string>; onOpen: (key: string) => void; film?: boolean }) {
  const spots = tour.spots.filter(s => offered.has(s.key))
  return <figure className={styles.tourStill}>
    {/* The spots are placed against the picture alone, not the picture plus the list under it. */}
    <div className={styles.tourPic}>
      {film
        ? <LoopVideo src={tour.video} poster={tour.poster} active className={styles.tourFilm} />
        : <>
          {/* eslint-disable-next-line @next/next/no-img-element -- a static local render */}
          <img src={tour.still} alt={tour.alt} />
          {/* Numbers on the picture, names in the list below: labels on the picture covered each other. */}
          {spots.map((s, i) => <button key={s.key} type="button" className={styles.spot} style={{ left: `${s.x}%`, top: `${s.y}%` }} onClick={() => onOpen(s.key)} aria-label={`${s.label}: see how it works`}>
            <b aria-hidden="true">{i + 1}</b>
          </button>)}
        </>}
    </div>
    <figcaption className={styles.spotList}>{spots.map((s, i) => <button key={s.key} type="button" onClick={() => onOpen(s.key)}><b aria-hidden="true">{i + 1}</b>{s.label}</button>)}</figcaption>
  </figure>
}

/** In the marketplace sheet: the film beside the tappable still. */
export function BuildingTour({ building, offered, onOpen }: { building: BuildingId; offered: Set<string>; onOpen: (key: string) => void }) {
  const tour = TOURS[building]
  if (!tour) return null
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
    <TourPicture tour={tour} offered={offered} onOpen={onOpen} />
  </section>
}

/**
 * Explore the city: tap a building and this card opens beside it while the city
 * keeps moving. It answers "what is this building and what can it do for me" in
 * plain words, and every line leads into the marketplace. The still is shown by
 * default (no video decoding over a running city); "Watch it work" swaps in the film.
 */
export function BuildingPeek({ building, live, offer, onOpenLive, onOpenItem, onOpenAll, onClose }: {
  building: BuildingId; live: CityModule[]; offer: CatalogItem[]
  onOpenLive: (id: string) => void; onOpenItem: (key: string) => void; onOpenAll: () => void; onClose: () => void
}) {
  const b = BUILDINGS.find(x => x.id === building)!
  const tour = TOURS[building]
  const [film, setFilm] = useState(false)
  return <aside className={styles.peek} aria-label={`${b.name} building`} style={{ '--c': b.glow } as CSSProperties}>
    <header>
      <div><p className={styles.eyebrow}>You tapped</p><h2>{b.name}</h2><p>{b.purpose}</p></div>
      <button type="button" className={styles.peekClose} onClick={onClose} aria-label="Close building card">✕</button>
    </header>
    {tour && <>
      <TourPicture tour={tour} offered={new Set(offer.map(c => c.key))} onOpen={onOpenItem} film={film} />
      <button type="button" className={styles.peekWatch} onClick={() => setFilm(!film)} aria-pressed={film}>{film ? 'Show the picture' : '▶ Watch it work'}</button>
    </>}
    <h3>What it can do for you</h3>
    {live.length + offer.length === 0 ? <p className={styles.peekEmpty}>Nothing here yet. New automations for this building are on the way.</p>
      : <ul className={styles.peekList}>
        {live.map(m => <li key={m.id}><button type="button" onClick={() => onOpenLive(m.id)}><span>{m.displayName}</span><em>{moduleStatus(m)}</em></button></li>)}
        {offer.map(c => <li key={c.key}><button type="button" onClick={() => onOpenItem(c.key)}><span>{c.name}<small>{c.purpose}</small></span><em>{c.stage === 'ready' ? 'Ready to set up' : 'Coming soon'}</em></button></li>)}
      </ul>}
    <button type="button" className={styles.peekAll} onClick={onOpenAll}>See everything in {b.name}</button>
  </aside>
}
