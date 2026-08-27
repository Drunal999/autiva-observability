'use client'

import { useEffect, useState } from 'react'
import useSWR from 'swr'
import { ChartPanel, RunBars, LatencyLines, AreaChart, SuccessRate, Sparkline } from './Charts'
import { fmtElapsed } from '@/lib/ops/tokens'
import { statusLabel, statusColor, statusGlyph, statusIsLive } from '@/lib/ops/status'
import { inr, inrCompact, tokens as fmtTokens } from '@/lib/ops/format'
import type { Agent, ViewMode, FleetResponse } from '@/types/agentOps'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface MetricBucket {
  id: string
  at: string
  runs: number
  failed: number
  p50Ms: number
  p95Ms: number
  p99Ms: number
  tokens: number
  costInr: number
  successRate: number
}

function fmtM(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

function StatusDot({ status }: { status: Agent['status'] }) {
  // Only a running agent breathes. Motion means work.
  return (
    <span
      className="h-[7px] w-[7px] shrink-0 rounded-full"
      style={{
        background: statusColor(status),
        animation: statusIsLive(status) ? 'breathe 2.4s ease-in-out infinite' : undefined,
      }}
    />
  )
}

/**
 * Client mode must never leak internals: no agent codenames, file paths, repo
 * names, model names or stack traces. Rather than filtering strings — which
 * fails open the moment a new field appears — client mode reads from a
 * different set of fields entirely.
 */
function cardIdentity(agent: Agent, mode: ViewMode) {
  if (mode === 'internal') {
    return { title: agent.name, sub: agent.model }
  }
  return {
    title: agent.module?.displayName ?? 'Automation',
    // Never the model name in client mode — that is an internal detail.
    sub: agent.module?.key ? '' : '',
  }
}

/**
 * `currentStep` is internal prose ("Patching backoff in src/lib/..."), so client
 * mode gets a status sentence derived from the state instead of the raw step.
 */
function cardStep(agent: Agent, mode: ViewMode): string {
  if (mode === 'internal') return agent.currentStep ?? 'No run assigned'
  switch (agent.status) {
    case 'RUNNING': return 'Running now'
    case 'AWAITING_APPROVAL': return 'Waiting for your approval'
    case 'FAILED': return 'Needs attention — our team has been notified'
    case 'SUCCESS': return 'Completed successfully'
    default: return 'Not scheduled'
  }
}

function AgentCard({
  agent,
  index,
  tick,
  mode,
}: {
  agent: Agent
  index: number
  tick: number
  mode: ViewMode
}) {
  const color = statusColor(agent.status)
  const live = statusIsLive(agent.status)
  const identity = cardIdentity(agent, mode)
  const baseS = agent.startedAt
    ? Math.floor((Date.now() - new Date(agent.startedAt).getTime()) / 1000)
    : 0
  const elapsed = agent.status === 'IDLE' ? '--:--' : fmtElapsed(live ? baseS + tick : baseS)

  return (
    <div
      className="relative flex flex-col gap-2.5 overflow-hidden rounded-[13px] border bg-white/[0.03] p-3.5"
      style={{
        borderColor: agent.status === 'FAILED' ? 'rgba(248,113,113,0.35)' : 'rgba(255,255,255,0.05)',
        animation: `enter 160ms cubic-bezier(0.16,1,0.3,1) ${Math.min(index, 8) * 0.018}s both`,
      }}
    >
      {agent.status === 'FAILED' && (
        <span className="absolute inset-y-2.5 left-0 w-[2px] rounded-r-sm bg-red-400" />
      )}

      <div className="flex items-center gap-2">
        <StatusDot status={agent.status} />
        <span className="text-[13px] font-bold">{identity.title}</span>
        {/* Glyph plus label — status never rides on colour alone. */}
        <span
          className="flex items-center gap-1 rounded-[5px] px-1.5 py-[1px] font-mono text-[9px] font-bold uppercase tracking-[0.06em]"
          style={{ color, background: `${color}1f` }}
        >
          <span aria-hidden="true">{statusGlyph(agent.status)}</span>
          {statusLabel(agent.status)}
        </span>
        <span className="flex-1" />
        {identity.sub && (
          <span className="font-mono text-[10px] text-white/30">{identity.sub}</span>
        )}
      </div>

      <p className="line-clamp-2 min-h-[34px] text-[12.5px] leading-[1.35] text-white/70">
        {cardStep(agent, mode)}
      </p>

      <div className="flex items-end gap-4">
        <div className="leading-tight">
          <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-white/25">Elapsed</p>
          <p className="font-mono text-[12px] tabular-nums text-white/75">{elapsed}</p>
        </div>
        {/* tokens_in and tokens_out are separate columns, so they read as two
            separate figures rather than one slashed string. */}
        <div className="leading-tight">
          <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-white/25">In</p>
          <p className="font-mono text-[12px] tabular-nums text-white/75">
            {agent.tokensIn ? fmtTokens(agent.tokensIn) : '—'}
          </p>
        </div>
        <div className="leading-tight">
          <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-white/25">Out</p>
          <p className="font-mono text-[12px] tabular-nums text-white/75">
            {agent.tokensOut ? fmtTokens(agent.tokensOut) : '—'}
          </p>
        </div>
        <div className="leading-tight">
          <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-white/25">Cost</p>
          <p className="font-mono text-[12px] tabular-nums text-white/75">
            {agent.costInr ? inr(agent.costInr) : '—'}
          </p>
        </div>
        <div className="min-w-0 flex-1">
          <Sparkline values={agent.stepMs} color={color} />
        </div>
      </div>
    </div>
  )
}

function SkeletonCard({ index }: { index: number }) {
  return (
    <div
      className="h-[118px] rounded-[13px] border border-white/5 bg-white/[0.03]"
      style={{ animation: `skel 1.6s ease-in-out ${index * 0.06}s infinite` }}
    />
  )
}

export function FleetView({
  dataState = 'ready',
  mode: modeOverride,
}: {
  dataState?: string
  /** Demo/preview override only. The real mode always comes from the server. */
  mode?: ViewMode
}) {
  const { data, error, isLoading } = useSWR<FleetResponse>('/api/agents', fetcher, {
    refreshInterval: 15000,
  })
  const agents = data?.agents
  // The server decides the mode from the tenant; a prop can only override it
  // for previews, never escalate a client view into an internal one.
  const mode: ViewMode = modeOverride ?? data?.mode ?? 'client'
  // Telemetry loads independently of the fleet strip — one slow query must
  // never freeze the whole surface.
  const { data: buckets } = useSWR<MetricBucket[]>('/api/metrics', fetcher, {
    refreshInterval: 60000,
  })

  // 1Hz tick so running agents' elapsed timers advance without refetching.
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [])

  const state =
    dataState !== 'ready'
      ? dataState
      : error
        ? 'error'
        : isLoading
          ? 'loading'
          : (agents?.length ?? 0) === 0
            ? 'empty'
            : 'ready'

  const running = agents?.filter((a) => a.status === 'RUNNING').length ?? 0
  const failed = agents?.filter((a) => a.status === 'FAILED').length ?? 0
  // Header total sums the same column the cards read — never computed twice.
  const totalCost = agents?.reduce((s, a) => s + a.costInr, 0) ?? 0

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-5">
      <section className="flex flex-col gap-3">
        <div className="flex items-baseline gap-3">
          <h1 className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-white/45">
            Fleet
          </h1>
          {state === 'ready' && (
            <span className="font-mono text-[10px] tracking-[0.06em] text-white/30">
              {running} RUNNING · {failed} FAILED · {inrCompact(totalCost)} ACROSS CURRENT RUNS
            </span>
          )}
        </div>

        {state === 'loading' && (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <SkeletonCard key={i} index={i} />
            ))}
          </div>
        )}

        {state === 'error' && (
          <div className="flex items-center justify-between gap-5 rounded-[20px] border border-red-400/35 border-l-2 border-l-red-400 bg-red-400/[0.06] p-[22px]">
            <div>
              <p className="text-[13px] font-semibold text-red-300">Could not reach the fleet</p>
              <p className="mt-1 font-mono text-[11px] text-white/45">
                /api/agents did not respond · trace 7f58bce
              </p>
            </div>
            <button
              type="button"
              onClick={() => location.reload()}
              className="h-9 rounded-[11px] border border-cyan-400/55 bg-cyan-400/[0.12] px-3.5 text-[12.5px] font-bold text-cyan-400"
            >
              Retry
            </button>
          </div>
        )}

        {state === 'empty' && (
          <div className="flex flex-col items-center gap-2 rounded-[20px] border border-dashed border-white/[0.08] px-5 py-14">
            <p className="text-[13px] text-white/45">No agents registered</p>
            <p className="font-mono text-[11px] text-white/25">
              Start one with `autiva run --agent &lt;name&gt;`
            </p>
          </div>
        )}

        {state === 'ready' && (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {agents?.map((a, i) => (
              <AgentCard key={a.id} agent={a} index={i} tick={tick} mode={mode} />
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline gap-3">
          <h2 className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-white/45">
            Telemetry
          </h2>
          <span className="font-mono text-[10px] tracking-[0.06em] text-white/30">
            LAST 24H · 1H BUCKETS
          </span>
        </div>
        {!buckets ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-[196px] rounded-[18px] border border-white/5 bg-white/[0.02]"
                style={{ animation: `skel 1.6s ease-in-out ${i * 0.06}s infinite` }}
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <ChartPanel
              title="Runs over time"
              caption={`${buckets.reduce((a, b) => a + b.runs, 0)} RUNS · ${buckets.reduce((a, b) => a + b.failed, 0)} FAILED`}
              leftLabel="-24H"
              rightLabel="NOW"
            >
              <RunBars runs={buckets.map((b) => b.runs)} fails={buckets.map((b) => b.failed)} />
            </ChartPanel>
            <ChartPanel
              title="Latency"
              caption={`P99 ${buckets[buckets.length - 1].p99Ms}ms · P50 ${buckets[buckets.length - 1].p50Ms}ms`}
              leftLabel="-24H"
              rightLabel="NOW"
            >
              <LatencyLines
                p50={buckets.map((b) => b.p50Ms)}
                p95={buckets.map((b) => b.p95Ms)}
                p99={buckets.map((b) => b.p99Ms)}
              />
            </ChartPanel>
            <ChartPanel
              title="Token burn & spend"
              caption={`24H · ${fmtM(buckets.reduce((a, b) => a + b.tokens, 0))} TOK · ${inrCompact(
                buckets.reduce((a, b) => a + b.costInr, 0)
              )}`}
              leftLabel="-24H"
              rightLabel="NOW"
            >
              <AreaChart values={buckets.map((b) => b.costInr)} unit="₹" />
            </ChartPanel>
            <ChartPanel
              title="Success rate"
              caption={`${buckets[buckets.length - 1].successRate}% NOW · ${(
                buckets.reduce((a, b) => a + b.successRate, 0) / buckets.length
              ).toFixed(1)}% AVG`}
              leftLabel="-24H"
              rightLabel="NOW"
            >
              <SuccessRate values={buckets.map((b) => b.successRate)} slo={95} />
            </ChartPanel>
          </div>
        )}
      </section>
    </div>
  )
}
