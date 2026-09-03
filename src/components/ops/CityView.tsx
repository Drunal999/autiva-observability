'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import { useEventListener } from '@/lib/realtime/client'
import { DISTRICTS, type District } from '@/lib/ops/districts'

/**
 * The city — every module as a building, agents walking out to do the work.
 *
 * This adds no table and invents no row. A window is lit because a Run exists;
 * a dark building means no tenant has switched that module on. An operator who
 * sees three buildings glowing out of two hundred is reading the truth, and a
 * city that cannot show a lie is worth more than one that looks busy.
 *
 * Rendering is plain SVG, deliberately. Twenty-five buildings and a handful of
 * walkers do not need a WebGL scene graph, and the data layer would not change
 * if one were added later — swap the renderer then, at a few hundred buildings,
 * not now.
 */

const TW = 54
const TH = 27
const BLOCK_COLS = 4

interface CityModule {
  id: string
  key: string
  displayName: string
  targetMs: number
  district: District
  agents: { id: string; name: string; status: string }[]
  runs: {
    id: string
    ref: string
    status: string
    summary: string | null
    project: string | null
    startedAt: string
  }[]
}

interface Plot {
  mod: CityModule
  c: number
  r: number
  h: number
}

interface Walker {
  id: number
  moduleId: string
  label: string
  bad: boolean
  born: number
  phase: 'out' | 'back'
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())
const iso = (c: number, r: number) => ({ x: ((c - r) * TW) / 2, y: ((c + r) * TH) / 2 })

/** Deterministic height per module, so a building does not resize on refresh. */
function heightFor(key: string) {
  let n = 0
  for (let i = 0; i < key.length; i++) n = (n * 31 + key.charCodeAt(i)) % 97
  return 30 + (n % 5) * 13
}

export function CityView() {
  const { data } = useSWR<{ districts: CityModule[]; sample: boolean }>('/api/city', fetcher, {
    refreshInterval: 60_000,
  })
  const modules = useMemo(() => data?.districts ?? [], [data])

  const [selected, setSelected] = useState<string | null>(null)
  const [walkers, setWalkers] = useState<Walker[]>([])
  const [hits, setHits] = useState<Record<string, number>>({})
  const walkerId = useRef(0)

  /** Lay districts out in blocks of 3 plots wide, one tile of road between. */
  const plots = useMemo<Plot[]>(() => {
    const out: Plot[] = []
    DISTRICTS.forEach((d, di) => {
      const oc = (di % BLOCK_COLS) * 4
      const or = Math.floor(di / BLOCK_COLS) * 3
      modules
        .filter((m) => m.district === d)
        .forEach((mod, k) => {
          out.push({ mod, c: oc + (k % 3), r: or + Math.floor(k / 3), h: heightFor(mod.key) })
        })
    })
    // Painter's order: back to front, or the near buildings sit behind the far ones.
    return out.sort((a, b) => a.c + a.r - (b.c + b.r))
  }, [modules])

  const byId = useMemo(() => {
    const m = new Map<string, Plot>()
    for (const p of plots) m.set(p.mod.id, p)
    return m
  }, [plots])

  /** FLEET events name the agent, not the module, so resolve through the roster. */
  const moduleByAgent = useMemo(() => {
    const m = new Map<string, string>()
    for (const mod of modules) for (const a of mod.agents) m.set(a.name.toLowerCase(), mod.id)
    return m
  }, [modules])

  const send = useCallback(
    (moduleId: string, label: string, bad: boolean) => {
      const id = ++walkerId.current
      setWalkers((w) => [...w, { id, moduleId, label, bad, born: performance.now(), phase: 'out' }])
      setHits((h) => ({ ...h, [moduleId]: (h[moduleId] ?? 0) + 1 }))
    },
    []
  )

  useEventListener(
    useCallback(
      (ev) => {
        const p = (ev.payload ?? {}) as { agent?: string; status?: string; ref?: string }
        if (!p.agent) return
        const moduleId = moduleByAgent.get(String(p.agent).toLowerCase())
        if (!moduleId) return
        const bad = p.status === 'ERROR' || p.status === 'FAILED' || p.status === 'failed'
        send(moduleId, p.ref ? String(p.ref) : String(p.status ?? 'ran'), bad)
      },
      [moduleByAgent, send]
    ),
    ['RUNS', 'FLEET']
  )

  /* Walkers are time-based rather than per-frame state, so the component is not
     re-rendering sixty times a second for an animation the DOM can interpolate. */
  useEffect(() => {
    if (!walkers.length) return
    const t = setInterval(() => {
      const now = performance.now()
      setWalkers((w) => w.filter((x) => now - x.born < 3400))
    }, 400)
    return () => clearInterval(t)
  }, [walkers.length])

  const depot = iso(BLOCK_COLS * 2 - 1.5, 8.4)
  const lit = plots.filter((p) => p.mod.runs.length || hits[p.mod.id]).length
  const sel = selected ? byId.get(selected) : null

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end gap-5">
        <div className="min-w-[240px] flex-1">
          <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-white/35">
            god mode
          </div>
          <h1 className="mt-1 text-[28px] font-extrabold tracking-tight">City</h1>
          <p className="mt-1 max-w-[62ch] text-[13.5px] text-white/45">
            One building per module. An agent walks out when that module actually runs, so a
            dark building means nobody has switched it on — not that the view is unfinished.
          </p>
        </div>
        <div className="flex gap-6">
          <div>
            <b className="block font-mono text-2xl font-semibold tabular-nums text-amber-300">
              {lit}
            </b>
            <span className="font-mono text-[10px] uppercase tracking-widest text-white/35">lit</span>
          </div>
          <div>
            <b className="block font-mono text-2xl font-semibold tabular-nums text-white/35">
              {plots.length - lit}
            </b>
            <span className="font-mono text-[10px] uppercase tracking-widest text-white/35">dark</span>
          </div>
        </div>
      </header>

      {!modules.length && (
        <p className="rounded-lg border border-white/10 bg-white/[0.02] p-4 text-[13px] text-white/45">
          No modules for this tenant yet. The city fills in as the catalog does — it does not
          invent buildings to look populated.
        </p>
      )}

      <div className="overflow-hidden rounded-xl border border-white/10 bg-[radial-gradient(120%_90%_at_50%_12%,#14203a_0%,#0a1020_68%)]">
        <svg viewBox="-300 -150 820 560" className="block h-auto w-full" role="img"
          aria-label={`City of ${plots.length} modules across ${DISTRICTS.length} districts`}>
          {/* ground */}
          {DISTRICTS.map((d, di) => {
            const oc = (di % BLOCK_COLS) * 4
            const or = Math.floor(di / BLOCK_COLS) * 3
            const tiles = []
            for (let cc = -1; cc < 3; cc++)
              for (let rr = -1; rr < 2; rr++) {
                const p = iso(oc + cc, or + rr)
                tiles.push(
                  <polygon
                    key={`${d}-${cc}-${rr}`}
                    points={`${p.x},${p.y - TH / 2} ${p.x + TW / 2},${p.y} ${p.x},${p.y + TH / 2} ${p.x - TW / 2},${p.y}`}
                    fill={cc === -1 || rr === -1 ? '#0d1526' : '#131e36'}
                  />
                )
              }
            const lp = iso(oc + 1, or + 2.1)
            return (
              <g key={d}>
                {tiles}
                <text x={lp.x} y={lp.y} textAnchor="middle" fill="#4a5877"
                  className="font-mono" fontSize="10" letterSpacing="1.6">
                  {d.toUpperCase()}
                </text>
              </g>
            )
          })}

          {/* depot every walker leaves from */}
          <ellipse cx={depot.x} cy={depot.y} rx={26} ry={13} fill="#101c33" stroke="#1e2b47" />
          <text x={depot.x} y={depot.y + 3.5} textAnchor="middle" fill="#4a5877"
            className="font-mono" fontSize="9" letterSpacing="1.4">OPS</text>

          {/* buildings */}
          {plots.map((p) => {
            const o = iso(p.c, p.r)
            const on = p.mod.runs.length > 0 || (hits[p.mod.id] ?? 0) > 0
            const N = `${o.x},${o.y - TH / 2 - p.h}`
            const E = `${o.x + TW / 2},${o.y - p.h}`
            const S = `${o.x},${o.y + TH / 2 - p.h}`
            const W = `${o.x - TW / 2},${o.y - p.h}`
            return (
              <g key={p.mod.id} tabIndex={0} role="button" className="cursor-pointer outline-none"
                aria-label={`${p.mod.displayName}, ${p.mod.district} district`}
                onClick={() => setSelected(p.mod.id)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(p.mod.id) } }}>
                <ellipse cx={o.x} cy={o.y + 4} rx={TW / 2} ry={TH / 2.6} fill="#060a14" opacity=".55" />
                <polygon points={`${o.x - TW / 2},${o.y} ${o.x},${o.y + TH / 2} ${S} ${W}`}
                  fill={on ? '#2a2a3f' : '#16233e'} />
                <polygon points={`${o.x},${o.y + TH / 2} ${o.x + TW / 2},${o.y} ${E} ${S}`}
                  fill={on ? '#3a3552' : '#1d2c4c'} />
                <polygon points={`${N} ${E} ${S} ${W}`} fill={on ? '#463f63' : '#24365c'} />
                {on && (
                  <>
                    <rect x={o.x - 9} y={o.y - p.h - 4} width={5} height={5} fill="#ffc663" />
                    <rect x={o.x + 3} y={o.y - p.h - 4} width={5} height={5} fill="#ffc663" />
                    <circle cx={o.x} cy={o.y - TH / 2 - p.h - 6} r={2.6} fill="#ffc663" />
                  </>
                )}
                {selected === p.mod.id && (
                  <polygon points={`${N} ${E} ${S} ${W}`} fill="none" stroke="#ffc663" strokeWidth="1.5" />
                )}
              </g>
            )
          })}

          {/* walkers + their bubble */}
          {walkers.map((w) => {
            const target = byId.get(w.moduleId)
            if (!target) return null
            const to = iso(target.c, target.r)
            const age = 1 // CSS handles the motion; SVG gets the endpoints
            void age
            return (
              <g key={w.id}>
                <g style={{
                  transform: `translate(${to.x}px, ${to.y}px)`,
                  transition: 'transform 950ms cubic-bezier(.4,0,.2,1)',
                }}>
                  <ellipse rx={6} ry={3} fill="#060a14" opacity=".5" />
                  <path d="M0,-11 C4,-11 5,-6 5,-3 L5,0 C5,2 -5,2 -5,0 L-5,-3 C-5,-6 -4,-11 0,-11 Z"
                    fill={w.bad ? '#ff7a6b' : '#3ddc97'} />
                  <circle cx={0} cy={-14} r={3.4} fill="#e8edf7" />
                </g>
                <g opacity={0.95}>
                  <rect x={to.x - (w.label.length * 3 + 8)} y={to.y - TH / 2 - target.h - 34}
                    width={w.label.length * 6 + 16} height={21} rx={6}
                    fill="#0e1628" stroke={w.bad ? '#ff7a6b' : '#3ddc97'} />
                  <text x={to.x} y={to.y - TH / 2 - target.h - 19.5} textAnchor="middle"
                    className="font-mono" fontSize="10.5" fill={w.bad ? '#ff7a6b' : '#3ddc97'}>
                    {w.label}
                  </text>
                </g>
              </g>
            )
          })}
        </svg>
      </div>

      {sel && (
        <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
          <h2 className="text-[15px] font-bold tracking-tight">{sel.mod.displayName}</h2>
          <div className="mt-1 font-mono text-[11px] tracking-wide text-white/35">
            {sel.mod.district} district · {sel.mod.key} · target {sel.mod.targetMs}ms
          </div>
          {sel.mod.runs.length === 0 ? (
            <p className="mt-3 text-[13px] text-white/40">
              Never lit. No run in the last 24 hours — the honest answer, not an empty state.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {sel.mod.runs.map((r) => (
                <li key={r.id} className="flex gap-3 border-t border-white/5 pt-2 text-[13px]">
                  <span className="font-mono text-[11px] text-white/35">{r.ref}</span>
                  <span className="text-white/70">{r.summary ?? r.status}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
