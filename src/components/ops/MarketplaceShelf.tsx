'use client'
import { BUILDINGS } from '@/lib/ops/cityMarketplace'
import { CATALOG, PACKAGES, type CatalogItem } from '@/lib/ops/marketplaceCatalog'
import { WorkflowEditor } from './WorkflowGraph'
import styles from './BusinessCity.module.css'

const STAGE = { ready: 'Ready to set up', planned: 'Planned' } as const

/** "More for this building": automations this workspace can add. Shows the workflow, never a fake buy. */
export function MarketplaceShelf({ items, flow, setFlow, title = 'More for this building' }: { items: CatalogItem[]; flow: string | null; setFlow: (id: string | null) => void; title?: string }) {
 if (!items.length) return null
 const here = new Set(items.map(i => i.key))
 const packs = PACKAGES.filter(p => p.keys.some(k => here.has(k)))
 return <div className={styles.shelf}>
  {packs.length > 0 && <>
   <h3 className={styles.shelfHead}>Packages</h3>
   <div className={styles.packages}>{packs.map(p => {
    const parts = p.keys.map(k => CATALOG.find(c => c.key === k)!), ready = parts.filter(x => x.stage === 'ready').length
    return <section key={p.id} className={`liquid-glass ${styles.package}`} aria-label={p.name}>
     <div className={styles.automationTop}><div><h3>{p.name}</h3><p>{p.pitch}</p></div>
      <span className={styles.status} data-status={ready === parts.length ? STAGE.ready : STAGE.planned}>{ready === parts.length ? STAGE.ready : ready ? `${ready} of ${parts.length} ready` : STAGE.planned}</span></div>
     <ul className={styles.parts}>{parts.map(x => <li key={x.key}>{x.name}</li>)}</ul>
     <p className={styles.partsNote}>{parts.length} automations · each is also available on its own</p>
    </section>
   })}</div>
  </>}
  <h3 className={styles.shelfHead}>{title}</h3>
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
