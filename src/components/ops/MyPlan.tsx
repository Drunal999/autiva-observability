'use client'
import { useState } from 'react'
import { BUILDINGS } from '@/lib/ops/cityMarketplace'
import { myPlan, useMyPlan, type PlanItem } from '@/lib/ops/myPlan'
import { planFor, priceLabel, inr, SETUP_INR, SETUP_FREE_FOR_FIRST } from '@/lib/ops/plans'
import styles from './BusinessCity.module.css'

/** Add an automation to My plan. Something not built yet is "Reserve", never "Buy". */
export function PlanToggle({ item }: { item: PlanItem }) {
  const inPlan = useMyPlan().some(i => i.key === item.key)
  return <button type="button" className={styles.planToggle} data-on={inPlan} aria-pressed={inPlan} onClick={() => myPlan.toggle(item)}>
    {inPlan ? '✓ In my plan' : item.ready ? 'Add to my plan' : 'Reserve'}
  </button>
}

/** The plan line for a building: what it costs to get it, at the launch price. */
export function BuildingPrice() {
  const starter = planFor(1)
  return <p className={styles.buildingPrice}><b>{starter.name} · {priceLabel(starter)}</b><span>Launch price · {starter.line}</span></p>
}

/**
 * My plan: what was picked, the plan it adds up to, and "Request setup". The
 * request goes to the team's approvals; nothing is charged in the app.
 */
export function MyPlanBar() {
  const items = useMyPlan()
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  if (items.length === 0 && state !== 'sent') return null
  const buildings = Array.from(new Set(items.map(i => i.building)))
  const plan = planFor(Math.max(1, buildings.length))
  async function request() {
    setState('sending')
    try {
      const r = await fetch('/api/setup-requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ keys: items.map(i => i.key) }) })
      if (!r.ok) throw new Error(String(r.status))
      myPlan.clear(); setState('sent')
    } catch { setState('error') }
  }
  if (state === 'sent') return <div className={styles.planBar} role="status">
    <p className={styles.planSent}>Request sent ✓ We’ll call you to set it up. Nothing has been charged.</p>
    <button type="button" className={styles.planClose} onClick={() => { setState('idle'); setOpen(false) }} aria-label="Close">✕</button>
  </div>
  return <div className={styles.planBar} data-open={open}>
    <button type="button" className={styles.planPill} aria-expanded={open} onClick={() => setOpen(!open)}>
      <b>My plan · {items.length}</b><span>{plan.name} {priceLabel(plan)}</span>
    </button>
    {open && <section className={styles.planPanel} aria-label="My plan">
      {buildings.map(id => <div key={id}>
        <h4>{BUILDINGS.find(b => b.id === id)?.name ?? id}</h4>
        <ul>{items.filter(i => i.building === id).map(i => <li key={i.key}><span>{i.name}{!i.ready && <em> · coming soon</em>}</span><button type="button" onClick={() => myPlan.remove(i.key)} aria-label={`Remove ${i.name}`}>✕</button></li>)}</ul>
      </div>)}
      <div className={styles.planTotal}>
        <p><b>{plan.name}</b> · {plan.line}<br /><strong>{priceLabel(plan)}</strong> <small>Launch price</small></p>
        <p className={styles.planSetup}>Setup {inr(SETUP_INR)} once, free for the first {SETUP_FREE_FOR_FIRST} businesses.</p>
      </div>
      <p className={styles.planNote}>No payment now. We’ll call you, set it up with you, and you start when it works for you.</p>
      {state === 'error' && <p role="alert" className={styles.planError}>Couldn’t send. Nothing was saved; please try again.</p>}
      <button type="button" className={styles.planRequest} disabled={state === 'sending'} onClick={request}>{state === 'sending' ? 'Sending…' : 'Request setup'}</button>
    </section>}
  </div>
}
