'use client'

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import { OK, WARN, ERR, T, fmtDuration } from '@/lib/ops/tokens'
import type { Flow, FlowNode } from '@/types/agentOps'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const NODE_W = 232
const NODE_H = 74
const R = 6 // edge corner radius

const KIND_TONE: Record<string, string> = {
  TRIGGER: '#22d3ee',
  CONDITION: '#a78bfa',
  ACTION: T(0.35),
}

/**
 * Orthogonal edge with rounded corners — no bezier spaghetti. Routes out of
 * the source's right edge, turns at the midpoint, and enters the target's
 * left edge.
 */
function edgePath(a: FlowNode, b: FlowNode): string {
  const x1 = a.x + NODE_W
  const y1 = a.y + NODE_H / 2
  const x2 = b.x
  const y2 = b.y + NODE_H / 2
  const midX = x1 + Math.max((x2 - x1) / 2, 16)

  if (Math.abs(y1 - y2) < 2) return `M${x1},${y1} L${x2},${y2}`

  const down = y2 > y1
  const r = Math.min(R, Math.abs(y2 - y1) / 2)
  return [
    `M${x1},${y1}`,
    `L${midX - r},${y1}`,
    `Q${midX},${y1} ${midX},${y1 + (down ? r : -r)}`,
    `L${midX},${y2 + (down ? -r : r)}`,
    `Q${midX},${y2} ${midX + r},${y2}`,
    `L${x2},${y2}`,
  ].join(' ')
}

function NodeCard({
  node,
  active,
  onFocus,
  focused,
}: {
  node: FlowNode
  active: boolean
  onFocus: () => void
  focused: boolean
}) {
  const tone = KIND_TONE[node.kind]
  return (
    <button
      type="button"
      onClick={onFocus}
      className="absolute overflow-hidden rounded-[13px] border bg-[#0e0e12]/85 p-2.5 text-left backdrop-blur transition"
      style={{
        left: node.x,
        top: node.y,
        width: NODE_W,
        height: NODE_H,
        borderColor: focused ? 'rgba(34,211,238,0.5)' : 'rgba(255,255,255,0.07)',
        boxShadow: focused ? '0 0 0 3px rgba(34,211,238,0.12)' : undefined,
      }}
    >
      {node.kind === 'TRIGGER' && (
        <span className="absolute inset-y-2 left-0 w-[2px] rounded-r-sm bg-cyan-400" />
      )}
      <div className="flex items-center gap-1.5">
        <span
          className="font-mono text-[8.5px] font-bold uppercase tracking-[0.1em]"
          style={{ color: tone }}
        >
          {node.kind}
        </span>
        {node.failures > 0 && (
          <span className="rounded-[4px] bg-red-400/15 px-1 py-[1px] font-mono text-[8.5px] font-bold text-red-400">
            {node.failures} FAIL
          </span>
        )}
        <span className="flex-1" />
        {active && (
          <span
            className="h-[5px] w-[5px] rounded-full bg-cyan-400"
            style={{ animation: 'breathe 2.4s ease-in-out infinite' }}
          />
        )}
      </div>
      <p className="mt-1 line-clamp-2 text-[11.5px] font-semibold leading-[1.3] text-white/85">
        {node.title}
      </p>
      <div className="mt-1 flex items-center gap-2 font-mono text-[9px] text-white/30">
        <span className="truncate">{node.meta}</span>
        <span className="flex-1" />
        <span className="tabular-nums">{node.runs}×</span>
        <span className="tabular-nums">p95 {fmtDuration(node.p95Ms)}</span>
      </div>
    </button>
  )
}

export function AutomationsView() {
  const { data: flows, isLoading } = useSWR<Flow[]>('/api/flows', fetcher)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [focusedNode, setFocusedNode] = useState<string | null>(null)

  const flow = flows?.find((f) => f.id === selectedId) ?? flows?.find((f) => f.nodes.length > 0) ?? flows?.[0]
  const nodes = useMemo(() => flow?.nodes ?? [], [flow])

  const edges = useMemo(() => {
    const byId = new Map(nodes.map((n) => [n.id, n]))
    const out: { from: FlowNode; to: FlowNode; live: boolean }[] = []
    for (const n of nodes) {
      for (const targetId of n.edgesTo) {
        const t = byId.get(targetId)
        // An edge only animates while its flow is enabled — an idle DAG is
        // completely still.
        if (t) out.push({ from: n, to: t, live: !!flow?.enabled })
      }
    }
    return out
  }, [nodes, flow])

  const bounds = useMemo(() => {
    if (!nodes.length) return { w: 1100, h: 420 }
    return {
      w: Math.max(...nodes.map((n) => n.x + NODE_W)) + 40,
      h: Math.max(...nodes.map((n) => n.y + NODE_H)) + 40,
    }
  }, [nodes])

  if (isLoading) {
    return (
      <div className="p-5">
        <div
          className="h-[420px] rounded-[20px] border border-white/5 bg-white/[0.02]"
          style={{ animation: 'skel 1.6s ease-in-out infinite' }}
        />
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-3 border-b border-white/5 px-5 py-3">
          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-white/45">
            Automations
          </span>
          {flow && (
            <>
              <span className="rounded-[5px] border border-white/[0.08] px-1.5 py-[2px] font-mono text-[10px] text-white/50">
                {flow.name}
              </span>
              <span
                className="rounded-[5px] px-1.5 py-[2px] font-mono text-[9px] font-bold"
                style={{
                  color: flow.enabled ? OK : T(0.4),
                  background: flow.enabled ? 'rgba(52,211,153,0.12)' : 'rgba(255,255,255,0.06)',
                }}
              >
                {flow.enabled ? 'ENABLED' : 'PAUSED'}
              </span>
              <span className="font-mono text-[10px] text-white/30">
                {flow.runsToday} RUNS TODAY · p95 {fmtDuration(flow.p95Ms)}
              </span>
            </>
          )}
        </div>

        {/* DAG canvas */}
        <div className="min-h-0 flex-1 overflow-auto p-5">
          <div className="relative" style={{ width: bounds.w, height: bounds.h }}>
            <svg
              width={bounds.w}
              height={bounds.h}
              className="pointer-events-none absolute inset-0"
              aria-hidden="true"
            >
              {edges.map((e, i) => (
                <g key={i}>
                  <path
                    d={edgePath(e.from, e.to)}
                    fill="none"
                    stroke="rgba(255,255,255,0.12)"
                    strokeWidth="1.5"
                  />
                  {e.live && (
                    <path
                      d={edgePath(e.from, e.to)}
                      fill="none"
                      stroke="rgba(34,211,238,0.75)"
                      strokeWidth="1.5"
                      strokeDasharray="4 8"
                      style={{ animation: 'flow 1.2s linear infinite' }}
                    />
                  )}
                </g>
              ))}
            </svg>

            {nodes.map((n) => (
              <NodeCard
                key={n.id}
                node={n}
                active={!!flow?.enabled && n.kind === 'TRIGGER'}
                focused={focusedNode === n.id}
                onFocus={() => setFocusedNode(n.id)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* ── flows + history ── */}
      <aside className="flex w-[340px] shrink-0 flex-col border-l border-white/5">
        <div className="flex flex-col gap-1 border-b border-white/5 p-3">
          <p className="mb-1 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">
            Flows
          </p>
          {flows?.map((f) => {
            const sel = flow?.id === f.id
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => {
                  setSelectedId(f.id)
                  setFocusedNode(null)
                }}
                className="flex items-center gap-2 rounded-[9px] px-2 py-2 text-left transition hover:bg-white/[0.04]"
                style={{ background: sel ? 'rgba(255,255,255,0.05)' : undefined }}
              >
                <span
                  className="h-[6px] w-[6px] shrink-0 rounded-full"
                  style={{ background: f.enabled ? OK : T(0.25) }}
                />
                <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-white/75">
                  {f.name}
                </span>
                {f.failures1h > 0 && (
                  <span className="rounded-[4px] bg-red-400/15 px-1 font-mono text-[9px] text-red-400">
                    {f.failures1h}
                  </span>
                )}
                <span className="font-mono text-[10px] tabular-nums text-white/30">{f.runsToday}×</span>
              </button>
            )
          })}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">
            Run history
          </p>
          <div className="flex flex-col">
            {flow?.runsLog.map((r) => {
              const tone = r.status === 'ERROR' ? ERR : r.status === 'WARN' ? WARN : OK
              return (
                <div key={r.id} className="flex gap-2.5 border-b border-white/[0.04] py-2 last:border-0">
                  <span className="mt-[6px] h-[5px] w-[5px] shrink-0 rounded-full" style={{ background: tone }} />
                  <div className="min-w-0 flex-1 leading-[1.4]">
                    <p className="truncate text-[11.5px] text-white/65">{r.summary}</p>
                    <p className="font-mono text-[9px] text-white/25">
                      {r.ref} · {fmtDuration(r.durMs)} ·{' '}
                      {new Date(r.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              )
            })}
            {flow && flow.runsLog.length === 0 && (
              <p className="py-6 text-center font-mono text-[11px] text-white/25">No runs recorded</p>
            )}
          </div>
        </div>
      </aside>
    </div>
  )
}
