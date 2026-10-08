'use client'
import { BUILDINGS } from '@/lib/ops/cityMarketplace'
import type { CatalogItem } from '@/lib/ops/marketplaceCatalog'
import { WorkflowEditor } from './WorkflowGraph'
import styles from './BusinessCity.module.css'

const STAGE = { ready: 'Ready to set up', planned: 'Planned' } as const

/** "More for this building": automations this workspace can add. Shows the workflow, never a fake buy. */
export function MarketplaceShelf({ items, flow, setFlow }: { items: CatalogItem[]; flow: string | null; setFlow: (id: string | null) => void }) {
 if (!items.length) return null
 return <div className={styles.shelf}>
  <h3 className={styles.shelfHead}>More for this building</h3>
  <div className={styles.automationList}>{items.map(item => {
   const id = `catalog:${item.key}`, b = BUILDINGS.find(x => x.id === item.building)!
   return <article key={item.key} className={styles.automation} data-wide={flow === id} data-catalog>
    <div className={styles.tile} aria-hidden="true"><b>{item.name.charAt(0)}</b><span>{item.stage === 'ready' ? 'N8N' : 'PLAN'}</span></div>
    <div className={styles.floorBody}>
     <div className={styles.automationTop}><div><h3>{item.name}</h3><p>{item.purpose}</p></div><span className={styles.status} data-status={STAGE[item.stage]}>{STAGE[item.stage]}</span></div>
     <dl><div><dt>Good for</dt><dd>{item.audience}</dd></div><div><dt>Needs</dt><dd>{item.needs}</dd></div>{item.guard && <div><dt>Safeguard</dt><dd>{item.guard}</dd></div>}</dl>
     <div className={styles.automationActions}><button aria-expanded={flow === id} onClick={() => setFlow(flow === id ? null : id)}>{flow === id ? 'Hide how it works' : 'How it works'}</button></div>
     {flow === id && <WorkflowEditor name={item.name} moduleKey={item.key} building={b.name} glow={b.glow} running={false} runs={[]} />}
    </div>
   </article>
  })}</div>
 </div>
}
