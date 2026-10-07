'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { DecideControls } from './ApprovalsView'
import { useBrainStatus } from '@/lib/ops/brain'
import { moduleStatus, type CityModule } from '@/lib/ops/cityMarketplace'
import type { ApprovalsResponse, ApprovalRisk } from '@/types/approvals'
import styles from './HomeBento.module.css'

/**
 * The working bento under the city: who is up, what needs a yes, today, the
 * brain, and the automations. Every row is read from a real source; where a
 * source cannot be reached from here, the widget says that instead of guessing.
 */
const json = async (url: string) => { const r = await fetch(url, { cache: 'no-store' }); if (!r.ok) throw new Error(String(r.status)); return r.json() }
const json2 = async (url: string) => { const r = await fetch(url, { method: 'POST' }); if (!r.ok) throw new Error(String(r.status)); return r.json() }
const RISK: Record<ApprovalRisk, string> = { MONEY: 'Money', PUBLISH: 'Publishes publicly', BULK_MESSAGE: 'Messages many people', DATA_DELETE: 'Deletes data', OTHER: 'Needs review' }
type Stack = { reachable: boolean; agents: { id: string; name: string; role: string; ready: boolean; label: string }[] }
type Item = { id: string; layer: string; title: string; startsAt: string; allDay?: boolean }

export function Agents() {
 const { data, error, mutate } = useSWR<Stack>('/api/stack-status', json)
 const [busy, setBusy] = useState(false)
 const [local, setLocal] = useState(false)
 useEffect(() => { setLocal(['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) }, [])
 const recheck = async () => { setBusy(true); try { await mutate(await json2('/api/stack-status')) } finally { setBusy(false) } }
 return <section className={`liquid-glass ${styles.card}`} aria-label="Agents">
  <header><h3>Agents</h3>{(data?.reachable || local) && <button className={styles.link} disabled={busy} onClick={recheck}>{busy ? 'Checking…' : 'Recheck'}</button>}</header>
  {error ? <p className={styles.muted}>Couldn’t read agent status.</p>
   : !data ? <p className={styles.muted}>Checking…</p>
   : !data.reachable ? <p className={styles.muted}>{local ? 'Jarvis isn’t running on this machine, so agent status can’t be read. Start Jarvis and press Recheck.' : 'Your agents run on your own machine. Open the dashboard there, with Jarvis running, to see who’s up.'}</p>
   : <ul className={styles.rows}>{data.agents.map(a => {
      const tone = a.ready ? 'live' : a.label === 'checking' ? 'checking' : 'down'
      return <li key={a.id}><span className={styles.dot} data-tone={tone} /><div><b>{a.name}</b><small>{a.role}</small></div><em data-tone={tone}>{a.ready ? 'Live' : a.label === 'checking' ? 'Checking' : a.label === 'not started' || a.label === 'offline' ? 'Down' : a.label}</em></li>
     })}</ul>}
 </section>
}

export function NeedsOk() {
 const { data, error, mutate } = useSWR<ApprovalsResponse>('/api/approvals', json, { refreshInterval: 20000 })
 const [busy, setBusy] = useState<string | null>(null)
 const [note, setNote] = useState<string | null>(null)
 const pending = data?.pending ?? []
 const decide = async (id: string, decision: 'APPROVED' | 'REJECTED', reason: string) => {
  setBusy(id); setNote(null)
  try {
   const r = await fetch(`/api/approvals/${id}/decide`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision, reason }) })
   const body = await r.json().catch(() => ({}))
   setNote(r.ok ? (decision === 'APPROVED' ? 'Approved.' : 'Declined.') : body.error ?? 'Could not record that decision.')
   void mutate()
  } catch { setNote('Network problem — the decision was not recorded.') } finally { setBusy(null) }
 }
 return <section className={`liquid-glass ${styles.card}`} aria-label="Needs your OK">
  <header><h3>Needs your OK</h3>{data && <span className={styles.count}>{pending.length} pending</span>}</header>
  {error ? <p className={styles.muted}>Couldn’t load approvals. Nothing was approved or declined.</p>
   : !data ? <p className={styles.muted}>Loading…</p>
   : pending.length === 0 ? <p className={styles.muted}>Nothing waiting on you.</p>
   : <div className={styles.asks}>{pending.slice(0, 2).map(a => <div key={a.id} className={styles.ask}>
      <small>{a.module?.displayName ?? 'Workspace'} · {RISK[a.risk]}</small>
      <p>{a.action}</p>
      <DecideControls approval={a} busy={busy === a.id} onDecide={(d, r) => decide(a.id, d, r)} />
     </div>)}</div>}
  {note && <p role="status" className={styles.note}>{note}</p>}
  {pending.length > 2 && <Link className={styles.link} href="/approvals">See all {pending.length}</Link>}
 </section>
}

export function Today() {
 const [win] = useState(() => { const s = new Date(); s.setHours(0, 0, 0, 0); const e = new Date(s); e.setDate(e.getDate() + 1); return `from=${s.toISOString()}&to=${e.toISOString()}` })
 const { data, error } = useSWR<{ items: Item[] }>(`/api/calendar?${win}`, json)
 const items = (data?.items ?? []).slice().sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)).slice(0, 4)
 const when = (i: Item) => i.layer === 'deadline' ? 'Due' : i.allDay ? 'All day' : new Date(i.startsAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
 return <section className={`liquid-glass ${styles.card}`} aria-label="Today">
  <header><h3>Today</h3><Link className={styles.link} href="/calendar">Calendar</Link></header>
  {error ? <p className={styles.muted}>Couldn’t load today’s calendar.</p>
   : !data ? <p className={styles.muted}>Loading…</p>
   : items.length === 0 ? <p className={styles.muted}>Nothing on today’s calendar.</p>
   : <ul className={styles.rows}>{items.map(i => <li key={i.id}><em className={styles.when} data-due={i.layer === 'deadline'}>{when(i)}</em><div><b>{i.title}</b><small>{i.layer === 'run' ? 'Automation run' : i.layer === 'deadline' ? 'Waiting on a decision' : i.layer === 'scheduled' ? 'Scheduled' : 'Event'}</small></div></li>)}</ul>}
 </section>
}

type Memory = { date: string; title: string; kind: string; source: string }
export function Brain() {
 const status = useBrainStatus()
 // Only ask for memories when the brain is on this machine; it never leaves it.
 const { data: mem } = useSWR<{ reachable: boolean; memories: Memory[] }>(status === 'online' ? '/api/brain-memories' : null, json)
 return <section className={`liquid-glass ${styles.card} ${styles.wide}`} aria-label="Brain">
  <header><h3>Brain</h3><span className={styles.count}>Shared memory · every agent reads the same store</span></header>
  {/* Opens Bolo, which asks the brain; a text box here would drop what was typed. */}
  <Link href="/brain" className={styles.search}>
   <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
   <span>Ask your brain anything</span>
  </Link>
  {mem?.reachable && mem.memories.length > 0 && <ul className={styles.memories}>{mem.memories.slice(0, 6).map(m => <li key={m.source + m.date + m.title}>
   <time dateTime={m.date}>{new Date(m.date + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</time>
   <div><b>{m.title}</b><small>{m.kind} · {m.source}</small></div></li>)}</ul>}
  {!(mem?.reachable && mem.memories.length) && <p className={styles.muted}>{status === 'online' ? 'The brain is running. Asking opens Bolo, which answers from the shared memory.'
   : status === 'offline' ? 'The brain server isn’t running on this machine right now.'
   : status === 'remote' ? 'The brain stays on your own machine; it is not reachable from this page.' : 'Checking the brain…'}</p>}
 </section>
}

export function Automations({ modules }: { modules: CityModule[] }) {
 return <section className={`liquid-glass ${styles.card}`} aria-label="Automations">
  <header><h3>Automations</h3><span className={styles.count}>{modules.length}</span></header>
  {modules.length === 0 ? <p className={styles.muted}>No automations in this workspace yet.</p>
   : <ul className={styles.rows}>{modules.slice(0, 4).map(m => { const s = moduleStatus(m); return <li key={m.id}><div><b>{m.displayName}</b><small className={styles.mono}>{m.key.includes('.') ? m.key : `${m.district}.${m.key}`}</small></div><em data-tone={s === 'Running' ? 'live' : s === 'Needs attention' ? 'checking' : undefined}>{s}</em></li> })}</ul>}
 </section>
}

export function HomeBento({ modules }: { modules: CityModule[] }) {
 return <section className={styles.bento} aria-label="Today at a glance">
  <Agents /><NeedsOk /><Today />
  <Brain /><Automations modules={modules} />
 </section>
}
