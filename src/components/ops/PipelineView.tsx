'use client'

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import { OK, WARN, T } from '@/lib/ops/tokens'
import { relative } from '@/lib/ops/format'
import { EmptyState } from './Panel'
import styles from './PipelineView.module.css'

// The lead finder's sheet, live. Same three moves as the Telegram buttons: Approve (you will message them
// by hand), Skip, Done (sent). Nothing here sends anything. A row leaves the queue once it is handled.
export type Lead = { id: string; kind: string; name: string; place: string; url: string | null; phone: string | null
  gaps: string | null; status: 'new' | 'approved' | 'skipped' | 'done'; created: string; sent_at: string | null }

/** D1 stores UTC as "YYYY-MM-DD HH:MM:SS" with no zone. */
export const d1Date = (s: string) => new Date(s.replace(' ', 'T') + 'Z').toISOString()
// The towns LEAD_QUERIES searches (worker wrangler.toml). `place` is Google's full address, so match by name.
// Siliguri sits before Jalpaiguri: Siliguri addresses often name Jalpaiguri district too.
const TOWNS: [string, RegExp][] = [['Malda', /malda|english bazar/i], ['Siliguri', /siliguri/i], ['Jalpaiguri', /jalpaiguri/i],
  ['Kolkata', /kolkata/i], ['Bangalore', /bangalore|bengaluru/i], ['Guwahati', /guwahati/i], ['Durgapur', /durgapur/i],
  ['Asansol', /asansol/i], ['Patna', /patna/i], ['Bhubaneswar', /bhubaneswar/i], ['Ranchi', /ranchi/i],
  ['Berhampore', /berhampore|baharampur/i], ['Krishnanagar', /krishnanagar/i]]
export const townOf = (place: string) => TOWNS.find(([, re]) => re.test(place))?.[0] ?? 'Other'
/** Who covers which town: Runal has Bangalore and Guwahati, Aditya the rest (West Bengal). */
export const ownerOf = (town: string) => (/bangalore|bengaluru|guwahati/i.test(town) ? 'Runal' : 'Aditya')

const fetcher = async (url: string) => {
  const r = await fetch(url)
  const body = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(body.error ?? `Error ${r.status}`)
  return body
}
const STATUS = { new: 'To check', approved: 'Message by hand', skipped: 'Skipped', done: 'Sent' } as const

export function PipelineView() {
  const { data, error, mutate } = useSWR<{ leads: Lead[] }>('/api/leads/list', fetcher, { refreshInterval: 30_000 })
  const [town, setTown] = useState('All')
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const leads = data?.leads ?? []
  const towns = useMemo(() => {
    const count = new Map<string, number>()
    for (const l of leads) if (l.status === 'new' || l.status === 'approved') count.set(townOf(l.place), (count.get(townOf(l.place)) ?? 0) + 1)
    return Array.from(count).sort((a, b) => b[1] - a[1])
  }, [leads])
  const inTown = leads.filter((l) => town === 'All' || townOf(l.place) === town)
  const queue = inTown.filter((l) => l.status === 'new' || l.status === 'approved')
    .sort((a, b) => (a.status === b.status ? 0 : a.status === 'approved' ? -1 : 1))

  async function act(l: Lead, a: 'a' | 's' | 'd') {
    setBusy(l.id); setNote(null)
    try {
      const r = await fetch('/api/leads/move', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: l.id, act: a }) })
      const body = await r.json().catch(() => ({}))
      if (r.status === 409) setNote(`${l.name} was already handled (maybe from Telegram).`)
      else if (!r.ok) setNote(body.error ?? `Could not update ${l.name}.`)
      await mutate()
    } finally { setBusy(null) }
  }

  if (error) return <EmptyState title="Pipeline did not load" detail={String(error.message ?? error)} />
  if (!data) return <p className={styles.loading}>Loading leads…</p>

  return (
    <div className={styles.page}>
      <header className={styles.top}>
        <div>
          <h1>Pipeline</h1>
          <p>{queue.length} to work on{town === 'All' ? '' : ` in ${town}`}. Approve = you message them yourself, then press Sent.</p>
        </div>
        <div className={styles.towns} role="tablist" aria-label="Town">
          {[['All', queue.length] as const, ...towns].map(([t, n]) => (
            <button key={t} role="tab" aria-selected={town === t} onClick={() => setTown(t)}>
              {t}{t !== 'All' && <small>{ownerOf(t)}</small>}<b>{t === 'All' ? leads.filter((l) => l.status === 'new' || l.status === 'approved').length : n}</b>
            </button>
          ))}
        </div>
      </header>
      {note && <p className={styles.note} role="status">{note}</p>}

      <div className={styles.split}>
        <section aria-label="Queue" className={styles.queue}>
          {queue.length === 0 && <EmptyState title="Queue is clear" detail="New leads arrive at 9 AM and 7 PM." />}
          {queue.map((l) => (
            <article key={l.id} className={`liquid-glass ${styles.card}`} data-status={l.status}>
              <div className={styles.head}>
                <h2>{l.name}</h2>
                <span style={{ color: l.status === 'approved' ? WARN : T(0.45) }}>{STATUS[l.status]}</span>
              </div>
              <p className={styles.meta}>{l.kind} · {l.place} · {relative(d1Date(l.created))}</p>
              {l.gaps && <p className={styles.gaps}>{l.gaps}</p>}
              <div className={styles.links}>
                {l.url && <a href={l.url} target="_blank" rel="noreferrer">Open profile</a>}
                {l.phone && <a href={`tel:${l.phone}`}>{l.phone}</a>}
              </div>
              <div className={styles.foot}>
                {l.status === 'new' ? <>
                  <button className={styles.light} disabled={busy === l.id} onClick={() => act(l, 'a')}>Approve</button>
                  <button className={styles.dark} disabled={busy === l.id} onClick={() => act(l, 's')}>Skip</button>
                </> : <button className={styles.green} disabled={busy === l.id} onClick={() => act(l, 'd')}>Sent</button>}
              </div>
            </article>
          ))}
        </section>

        <section aria-label="Sheet" className={`liquid-glass ${styles.sheet}`}>
          <h2>Sheet <small>{inTown.length} rows</small></h2>
          <div className={styles.scroll}>
            <table>
              <thead><tr><th>Name</th><th>Town</th><th>Status</th><th>When</th></tr></thead>
              <tbody>
                {inTown.map((l) => (
                  <tr key={l.id} data-gone={l.status === 'done' || l.status === 'skipped' || undefined}>
                    <td>{l.name}</td><td>{townOf(l.place)}</td>
                    <td style={{ color: l.status === 'done' ? OK : l.status === 'approved' ? WARN : undefined }}>{STATUS[l.status]}</td>
                    <td>{relative(d1Date(l.sent_at ?? l.created))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  )
}
