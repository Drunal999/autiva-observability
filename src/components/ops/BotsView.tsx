'use client'

import useSWR from 'swr'
import { OK, WARN, ERR, T } from '@/lib/ops/tokens'
import { relative } from '@/lib/ops/format'
import { EmptyState } from './Panel'
import { d1Date } from './PipelineView'
import styles from './PipelineView.module.css'

// Every automation on the Instagram/leads worker: when it runs, when it last left a trace, what went wrong.
type Bot = { id: string; name: string; when: string; last: string | null; week?: number; failedToday?: number; waiting?: number; status?: string | null }

// Where to change each one. All of them live in the worker repo (agent-city-landing/instagram/agent).
const EDIT: Record<string, string> = {
  insta_dm: 'src/dm.js + src/cards.json', followups: 'src/dm.js (runFollowups)', leads: 'src/leads.js',
  report: 'src/dm.js (runChatReport)', ads: 'src/ads.js', feedback: 'src/feedback.js', captions: 'src/leads.js (/caption)',
}

const fetcher = async (url: string) => {
  const r = await fetch(url)
  const body = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(body.error ?? `Error ${r.status}`)
  return body
}

function detail(b: Bot) {
  const parts = []
  if (b.week !== undefined) parts.push(`${b.week} this week`)
  if (b.waiting) parts.push(`${b.waiting} waiting in Pipeline`)
  if (b.failedToday) parts.push(`${b.failedToday} failed today`)
  if (b.status) parts.push(`last plan: ${b.status}`)
  return parts.join(' · ')
}

export function BotsView() {
  const { data, error } = useSWR<{ bots: Bot[] }>('/api/leads/health', fetcher, { refreshInterval: 60_000 })
  if (error) return <EmptyState title="Bots did not load" detail={String(error.message ?? error)} />
  if (!data) return <p className={styles.loading}>Loading bots…</p>
  return (
    <div className={styles.page}>
      <header className={styles.top}><div><h1>Bots</h1><p>What runs on its own, and when it last did something.</p></div></header>
      <div className={styles.queue}>
        {data.bots.map((b) => {
          const tone = b.failedToday ? ERR : b.last ? OK : WARN
          return (
            <article key={b.id} className={`liquid-glass ${styles.card}`}>
              <div className={styles.head}>
                <h2><span aria-hidden="true" style={{ color: tone }}>●</span> {b.name}</h2>
                <span style={{ color: T(0.5) }}>{b.last ? `last ${relative(d1Date(b.last))}` : 'no trace yet'}</span>
              </div>
              <p className={styles.meta}>Runs {b.when}{detail(b) && ` · ${detail(b)}`}</p>
              <p className={styles.meta}>Edit: <code>{EDIT[b.id] ?? 'worker repo'}</code></p>
            </article>
          )
        })}
      </div>
    </div>
  )
}
