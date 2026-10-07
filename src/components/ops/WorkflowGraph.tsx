'use client'
import { useState, type CSSProperties } from 'react'
import graphs from '@/lib/ops/workflowGraphs.json'
import { TOOLS } from '@/lib/ops/connections'
import styles from './WorkflowGraph.module.css'

/**
 * "How it works": the automation's real n8n workflow, redrawn as glowing
 * nodes and wires. Shape only (names, kinds, positions, connections) — see
 * scripts/export-workflow-graphs.mjs. Wires carry a moving pulse only while
 * the automation is Running, so motion always means something real.
 */
type Graph = { source: string; nodes: { id: number; name: string; kind: string; x: number; y: number }[]; edges: { from: number; to: number; label: string | null }[] }
const ALL = graphs as Record<string, Graph>
const W = 168, H = 58, PAD = 40, STEP = 240, PER_ROW = 5
const GLYPH: Record<string, string> = {
 trigger: 'M13 2L4 14h7l-1 8 9-12h-7z', http: 'M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18',
 code: 'M8 7l-5 5 5 5M16 7l5 5-5 5', branch: 'M6 3v6a6 6 0 0 0 6 6h6M18 15l-3-3M18 15l-3 3',
 send: 'M22 2L11 13M22 2l-7 20-4-9-9-4z', step: 'M5 12h14',
}

export const hasWorkflow = (key: string) => key in ALL

export function WorkflowGraph({ moduleKey, running, zoom = 1 }: { moduleKey: string; running: boolean; zoom?: number }) {
 const g = ALL[moduleKey]
 if (!g) return <p className={styles.none}>This automation’s workflow hasn’t been mapped here yet, so there’s nothing real to draw.</p>
 // n8n lays a workflow out as one long line. Fold it into rows of PER_ROW columns,
 // keeping each node's column order and its offset within the column; the
 // connections are untouched, so the drawing is the same workflow, wrapped.
 const y0 = Math.min(...g.nodes.map(n => n.y)), band = Math.max(...g.nodes.map(n => n.y)) - y0 + H + 70
 const laid = g.nodes.map(n => { const c = Math.round(n.x / STEP); return { ...n, x: (c % PER_ROW) * STEP, y: Math.floor(c / PER_ROW) * band + (n.y - y0) } })
 const minX = -PAD, minY = -PAD
 const width = Math.max(...laid.map(n => n.x)) + W + 2 * PAD, height = Math.max(...laid.map(n => n.y)) + H + 2 * PAD
 const at = (id: number) => laid[id]
 return <figure className={styles.wrap} data-running={running}>
  <div className={styles.scroll}>
   <svg viewBox={`${minX} ${minY} ${width} ${height}`} style={{ width: `${zoom * 100}%`, minWidth: 760 * zoom }} role="img" aria-label={`Workflow ${g.source}: ${g.nodes.length} steps`}>
    <defs>
     <filter id="wf-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4" /></filter>
     <linearGradient id="wf-fill" x1="0" y1="0" x2="1" y2="1"><stop offset="0" className={styles.fillA} /><stop offset="1" className={styles.fillB} /></linearGradient>
     {/* Frosted node: a pale fill that fades down, and a rim that catches light at the top-left. */}
     <linearGradient id="wf-glass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity="0.16" /><stop offset="1" stopColor="#fff" stopOpacity="0.04" /></linearGradient>
     <linearGradient id="wf-rim" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fff" stopOpacity="0.6" /><stop offset="0.35" stopColor="#fff" stopOpacity="0.12" /><stop offset="1" stopColor="#fff" stopOpacity="0.22" /></linearGradient>
    </defs>
    {g.edges.map((e, i) => {
     const a = at(e.from), b = at(e.to)
     const x1 = a.x + W, y1 = a.y + H / 2, x2 = b.x, y2 = b.y + H / 2, dx = Math.max(40, Math.abs(x2 - x1) / 2)
     const d = x2 > x1 - 20 ? `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`
      : `M${x1},${y1} C${x1 + 60},${y1} ${x1 + 60},${(y1 + y2) / 2} ${(x1 + x2) / 2},${(y1 + y2) / 2} S${x2 - 60},${y2} ${x2},${y2}`
     return <g key={i} className={styles.edge} data-label={e.label ?? undefined}>
      <path d={d} className={styles.halo} filter="url(#wf-glow)" /><path d={d} className={styles.wire} /><path d={d} className={styles.pulse} />
      <circle cx={x1} cy={y1} r={3.5} className={styles.port} /><circle cx={x2} cy={y2} r={3.5} className={styles.port} />
      {e.label && <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 8} className={styles.label}>{e.label}</text>}
     </g>
    })}
    {laid.map(n => <g key={n.id} transform={`translate(${n.x} ${n.y})`} className={styles.node} data-kind={n.kind}>
     <rect width={W} height={H} rx={16} className={styles.card} />
     <rect x={10} y={13} width={32} height={32} rx={10} className={styles.chip} />
     <path d={GLYPH[n.kind] ?? GLYPH.step} transform="translate(14 17)" className={styles.glyph} />
     <text x={52} y={28} className={styles.name}>{n.name.length > 17 ? n.name.slice(0, 16) + '…' : n.name}</text>
     <text x={52} y={44} className={styles.kind}>{n.kind}</text>
     <title>{n.name}</title>
    </g>)}
   </svg>
  </div>
  <figcaption>Drawn from the real n8n workflow <b>{g.source}</b> · {g.nodes.length} steps{running ? ' · pulses show it is running now' : ''}</figcaption>
 </figure>
}

type Run = { id: string; status: string; startedAt: string }
const RUN_LABEL: Record<string, string> = { SUCCESS: 'Completed', FAILED: 'Failed', RUNNING: 'In progress', AWAITING_APPROVAL: 'Awaiting approval' }

/** The editor shell from the reference: title, building tag, Editor/Executions, the canvas in the
 *  building's neon colour, and a Tools rail. Executions are recorded runs only. */
export function WorkflowEditor({ name, moduleKey, building, glow, running, runs }:
 { name: string; moduleKey: string; building: string; glow: string; running: boolean; runs: Run[] }) {
 const [tab, setTab] = useState<'editor' | 'runs'>('editor')
 const [zoom, setZoom] = useState(1)
 return <section className={`liquid-glass ${styles.editor}`} style={{ '--c': glow } as CSSProperties} aria-label={`${name} workflow`}>
  <header className={styles.edHead}>
   <div><h4>{name}</h4><p>/{building.toLowerCase()}</p></div>
   <span className={styles.tag}>{building}</span>
  </header>
  <div className={styles.tabs} role="tablist">
   <button role="tab" aria-selected={tab === 'editor'} onClick={() => setTab('editor')}>Editor</button>
   <button role="tab" aria-selected={tab === 'runs'} onClick={() => setTab('runs')}>Executions</button>
  </div>
  <div className={styles.edBody}>
   <div className={styles.edMain}>
    {tab === 'editor' ? <>
     <WorkflowGraph moduleKey={moduleKey} running={running} zoom={zoom} />
     {hasWorkflow(moduleKey) && <div className={styles.zoom}>
      <button aria-label="Zoom out" onClick={() => setZoom(z => Math.max(0.7, +(z - 0.15).toFixed(2)))}>−</button>
      <button aria-label="Fit" onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button>
      <button aria-label="Zoom in" onClick={() => setZoom(z => Math.min(1.6, +(z + 0.15).toFixed(2)))}>+</button>
     </div>}
    </> : runs.length ? <ul className={styles.runs}>{runs.map(r => <li key={r.id}><span data-status={r.status}>{RUN_LABEL[r.status] ?? 'Status not reported'}</span><time dateTime={r.startedAt}>{new Date(r.startedAt).toLocaleString()}</time></li>)}</ul>
     : <p className={styles.none}>No runs recorded in the last 24 hours. That does not mean it has never run.</p>}
   </div>
   <aside className={styles.tools} aria-label="Tools">
    <p className={styles.toolsHead}>Tools</p>
    {(['stack', 'package'] as const).map(state => <div key={state}>
     <p className={styles.toolsGroup}>{state === 'stack' ? 'In your stack' : 'In packages · coming soon'}</p>
     {TOOLS.filter(t => t.state === state).map(t => <div key={t.id} className={styles.tool} data-state={t.state}>
      <span className={styles.toolMark} aria-hidden="true">{t.mark}</span>
      <span><b>{t.name}</b><small>{t.does}</small></span>
     </div>)}
    </div>)}
    <p className={styles.toolsNote}>Your stack tools run in AUTIVA today. Plugging a tool into a single workflow from here comes with packages.</p>
   </aside>
  </div>
 </section>
}
