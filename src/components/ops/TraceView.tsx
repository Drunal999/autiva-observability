'use client'

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import { ERR, T, fmtDuration, fmtTokens } from '@/lib/ops/tokens'
import type { RunDetail, Span } from '@/types/agentOps'
import { ThreadToggle } from './Thread'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

// Bar colour encodes span TYPE at low saturation. Only failure is saturated,
// so a red bar is the only red thing on screen.
const TYPE: Record<string, { glyph: string; fill: string; label: string }> = {
  LLM: { glyph: '◇', fill: T(0.2), label: 'LLM' },
  TOOL: { glyph: '▸', fill: T(0.15), label: 'TOOL' },
  SHELL: { glyph: '$', fill: T(0.12), label: 'SHELL' },
  FILE: { glyph: '▤', fill: T(0.1), label: 'FILE' },
  SUBAGENT: { glyph: '◈', fill: 'rgba(167,139,250,0.28)', label: 'SUBAGENT' },
}

interface TreeSpan extends Span {
  depth: number
}

/** Flattens the parent/child span tree into render order, honouring collapse. */
function flatten(spans: Span[], collapsed: Set<string>): TreeSpan[] {
  const byParent = new Map<string | null, Span[]>()
  for (const s of spans) {
    const k = s.parentId
    if (!byParent.has(k)) byParent.set(k, [])
    byParent.get(k)!.push(s)
  }
  byParent.forEach((list) => list.sort((a, b) => a.startMs - b.startMs))

  const out: TreeSpan[] = []
  const walk = (parentId: string | null, depth: number) => {
    for (const s of byParent.get(parentId) ?? []) {
      out.push({ ...s, depth })
      if (!collapsed.has(s.id)) walk(s.id, depth + 1)
    }
  }
  walk(null, 0)
  return out
}

function hasChildren(spans: Span[], id: string) {
  return spans.some((s) => s.parentId === id)
}

export function TraceView({ runRef = 'r-8f2c' }: { runRef?: string }) {
  const { data: run, error, isLoading } = useSWR<RunDetail>(`/api/runs/${runRef}`, fetcher)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const spans = useMemo(() => run?.spans ?? [], [run])
  const rows = useMemo(() => flatten(spans, collapsed), [spans, collapsed])

  const total = useMemo(
    () => Math.max(...spans.map((s) => s.startMs + s.durMs), 1),
    [spans]
  )

  const selected = spans.find((s) => s.id === selectedId) ?? spans.find((s) => !s.parentId) ?? null

  // Self time = own duration minus what direct children accounted for.
  const childMs = selected
    ? spans.filter((s) => s.parentId === selected.id).reduce((sum, s) => sum + s.durMs, 0)
    : 0
  const selfMs = selected ? Math.max(selected.durMs - childMs, 0) : 0
  const selfPct = selected && selected.durMs ? (selfMs / selected.durMs) * 100 : 0

  function toggle(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2 p-5">
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="h-7 rounded-md border border-white/5 bg-white/[0.03]"
            style={{ animation: `skel 1.6s ease-in-out ${i * 0.05}s infinite` }}
          />
        ))}
      </div>
    )
  }

  if (error || !run) {
    return (
      <div className="p-5">
        <div className="rounded-[20px] border border-red-400/35 border-l-2 border-l-red-400 bg-red-400/[0.06] p-[22px]">
          <p className="text-[13px] font-semibold text-red-300">Could not load run {runRef}</p>
          <p className="mt-1 font-mono text-[11px] text-white/45">/api/runs/{runRef} did not respond</p>
        </div>
      </div>
    )
  }

  const ticks = [0, 0.25, 0.5, 0.75, 1]

  return (
    <div className="flex h-full min-h-0">
      {/* ── waterfall ── */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-3 border-b border-white/5 px-5 py-3">
          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-white/45">
            Trace
          </span>
          <span className="rounded-[5px] border border-white/[0.08] px-1.5 py-[2px] font-mono text-[10px] text-white/45">
            {run.ref}
          </span>
          <span
            className="rounded-[5px] px-1.5 py-[2px] font-mono text-[9px] font-bold"
            style={{
              color: run.status === 'FAILED' ? ERR : '#34d399',
              background: run.status === 'FAILED' ? 'rgba(248,113,113,0.12)' : 'rgba(52,211,153,0.12)',
            }}
          >
            {run.status}
          </span>
          <span className="font-mono text-[10px] text-white/30">
            {run.agent?.name} · {run.agent?.model} · {fmtDuration(total)} · {fmtTokens(run.tokens)} tok
          </span>
          <span className="flex-1" />
          <span className="font-mono text-[10px] text-white/25">{spans.length} SPANS</span>
        </div>

        {/* time axis */}
        <div className="relative ml-[300px] mr-5 h-5 shrink-0 border-b border-white/5">
          {ticks.map((f) => (
            <span
              key={f}
              className="absolute top-1 font-mono text-[9px] text-white/25"
              style={{ left: `${f * 100}%`, transform: f === 1 ? 'translateX(-100%)' : undefined }}
            >
              {fmtDuration(Math.round(total * f))}
            </span>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {rows.map((s, i) => {
            const type = TYPE[s.type]
            const isErr = s.status === 'ERROR'
            const isRunning = s.status === 'RUNNING'
            const sel = selected?.id === s.id
            const kids = hasChildren(spans, s.id)

            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setSelectedId(s.id)}
                className="flex w-full items-center gap-0 px-5 text-left transition hover:bg-white/[0.03]"
                style={{
                  background: sel ? 'rgba(255,255,255,0.05)' : undefined,
                  animation: `enter 160ms cubic-bezier(0.16,1,0.3,1) ${Math.min(i, 8) * 0.018}s both`,
                }}
              >
                {/* tree gutter */}
                <span
                  className="flex h-7 shrink-0 items-center gap-1.5 overflow-hidden"
                  style={{ width: 280, paddingLeft: s.depth * 14 }}
                >
                  {kids ? (
                    <span
                      role="presentation"
                      onClick={(e) => {
                        e.stopPropagation()
                        toggle(s.id)
                      }}
                      className="w-3 shrink-0 cursor-pointer text-center font-mono text-[9px] text-white/35 hover:text-white/70"
                    >
                      {collapsed.has(s.id) ? '▸' : '▾'}
                    </span>
                  ) : (
                    <span className="w-3 shrink-0" />
                  )}
                  <span
                    className="w-3 shrink-0 text-center font-mono text-[10px]"
                    style={{ color: s.type === 'SUBAGENT' ? '#a78bfa' : T(0.4) }}
                  >
                    {type.glyph}
                  </span>
                  <span
                    className="truncate text-[12px]"
                    style={{ color: isErr ? '#fca5a5' : T(0.75) }}
                  >
                    {s.name}
                  </span>
                </span>

                {/* bar lane */}
                <span className="relative h-7 min-w-0 flex-1">
                  <span
                    className="absolute top-1/2 h-[13px] -translate-y-1/2 rounded-[3px]"
                    style={{
                      left: `${(s.startMs / total) * 100}%`,
                      width: `${Math.max((s.durMs / total) * 100, 0.4)}%`,
                      background: isErr ? ERR : type.fill,
                      boxShadow: s.critical && isErr ? `0 0 0 1px rgba(248,113,113,0.5)` : undefined,
                      // A live span grows and fades at its leading edge rather
                      // than pulsing — it is still being written.
                      backgroundImage: isRunning
                        ? 'linear-gradient(90deg, rgba(34,211,238,0.55), rgba(34,211,238,0))'
                        : undefined,
                    }}
                  />
                </span>

                <span className="w-[62px] shrink-0 pl-2 text-right font-mono text-[10px] tabular-nums text-white/35">
                  {fmtDuration(s.durMs)}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── inspector ── */}
      <aside className="flex w-[360px] shrink-0 flex-col gap-4 overflow-y-auto border-l border-white/5 p-5">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">
          Span Inspector
        </p>

        {selected && (
          <>
            <div>
              <div className="flex items-center gap-2">
                <span
                  className="rounded-[5px] px-1.5 py-[2px] font-mono text-[9px] font-bold"
                  style={{ color: T(0.6), background: 'rgba(255,255,255,0.06)' }}
                >
                  {TYPE[selected.type].label}
                </span>
                <span
                  className="rounded-[5px] px-1.5 py-[2px] font-mono text-[9px] font-bold"
                  style={{
                    color: selected.status === 'ERROR' ? ERR : selected.status === 'RUNNING' ? '#22d3ee' : '#34d399',
                    background:
                      selected.status === 'ERROR'
                        ? 'rgba(248,113,113,0.12)'
                        : selected.status === 'RUNNING'
                          ? 'rgba(34,211,238,0.12)'
                          : 'rgba(52,211,153,0.12)',
                  }}
                >
                  {selected.status}
                </span>
                {selected.critical && (
                  <span className="font-mono text-[9px] tracking-[0.08em] text-amber-400">
                    CRITICAL PATH
                  </span>
                )}
              </div>
              <p className="mt-2 text-[14px] font-semibold leading-snug">{selected.name}</p>
            </div>

            <div className="grid grid-cols-[88px_1fr] gap-x-3 gap-y-2 text-[12px]">
              <span className="text-white/35">Duration</span>
              <span className="font-mono tabular-nums text-white/80">{fmtDuration(selected.durMs)}</span>
              <span className="text-white/35">Started</span>
              <span className="font-mono tabular-nums text-white/80">+{fmtDuration(selected.startMs)}</span>
              {selected.model && (
                <>
                  <span className="text-white/35">Model</span>
                  <span className="font-mono text-white/80">{selected.model}</span>
                </>
              )}
              {selected.tokens != null && (
                <>
                  <span className="text-white/35">Tokens</span>
                  <span className="font-mono tabular-nums text-white/80">{fmtTokens(selected.tokens)}</span>
                </>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <p className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-white/30">
                Self vs children
              </p>
              <div className="flex h-2 overflow-hidden rounded-full bg-white/[0.06]">
                <span className="bg-cyan-400" style={{ width: `${selfPct}%` }} />
                <span className="bg-violet-400/60" style={{ width: `${100 - selfPct}%` }} />
              </div>
              <div className="flex justify-between font-mono text-[9px] text-white/35">
                <span>self {fmtDuration(selfMs)}</span>
                <span>children {fmtDuration(childMs)}</span>
              </div>
            </div>

            {/* The fix and the reasoning belong next to the failure. */}
            <ThreadToggle subjectType="RUN" subjectId={run.id} />

            {selected.error && (
              <div className="flex flex-col gap-1.5">
                <p className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-red-400">
                  Error
                </p>
                <pre className="overflow-x-auto whitespace-pre-wrap rounded-[10px] border border-red-400/25 bg-red-400/[0.06] p-3 font-mono text-[11px] leading-[1.5] text-red-200">
                  {selected.error}
                </pre>
              </div>
            )}
          </>
        )}
      </aside>
    </div>
  )
}
