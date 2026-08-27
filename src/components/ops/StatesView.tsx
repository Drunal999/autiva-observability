'use client'

import { useState } from 'react'
import { OK, WARN, ERR, T, MONO } from '@/lib/ops/tokens'

type StateKey = 'loading' | 'streaming' | 'ready' | 'empty' | 'error'

const STATES: { key: StateKey; label: string; rule: string }[] = [
  { key: 'loading', label: 'Loading', rule: 'skeletons at real geometry' },
  { key: 'streaming', label: 'Streaming', rule: 'partial + live, layout settled' },
  { key: 'ready', label: 'Ready', rule: 'the happy path' },
  { key: 'empty', label: 'Empty', rule: 'one cause, one action' },
  { key: 'error', label: 'Error', rule: 'what, when, retry, trace' },
]

interface Panel {
  key: string
  title: string
  sub: string
  head: string
  mono: boolean
  ready: string[]
  streaming: string[]
  foot: string
  emptyCause: string
  emptyAction: string
  errorWhat: string
  errorWhen: string
}

const PANELS: Panel[] = [
  {
    key: 'fleet', title: 'Fleet card', sub: 'AGENT', head: 'ORION · SONNET-4.5', mono: false,
    ready: ['Patching backoff in realtime/client.ts', 'ELAPSED 01:36 · 71.4k in · 9.8k out · ₹72.15'],
    streaming: ['Reading src/lib/realtime/bus.ts', 'ELAPSED 00:04 · 2.1k in · 0 out · ₹1.76'],
    foot: 'STEP 7/11', emptyCause: 'No agent attached to this slot.', emptyAction: 'Attach agent',
    errorWhat: 'Worker heartbeat lost', errorWhen: '14:58:11 · 3 misses · trace 8f2c-91ab',
  },
  {
    key: 'trace', title: 'Run trace', sub: 'SPANS', head: 'r-8f2c · 14 SPANS', mono: true,
    ready: ['◈ run r-8f2c            38.40s', '$ playwright --grep board  12.10s', '◇ hypothesise race      4.55s'],
    streaming: ['◈ run r-91ab            00.00s', '◇ plan: reproduce      running', '· awaiting first tool span'],
    foot: 'CRITICAL PATH 33.1s (86%)', emptyCause: 'This run produced no spans.', emptyAction: 'Open raw log',
    errorWhat: 'Trace fetch failed', errorWhen: '502 from /api/events · 14:58:11 · r-8f2c',
  },
  {
    key: 'terminal', title: 'Live terminal', sub: 'STDOUT', head: 'r-91ab · STDOUT', mono: true,
    ready: ['✓ client.test.ts (9 tests) 386ms', '› 2 files changed, 0 failing', '› awaiting operator approval'],
    streaming: ['$ pnpm vitest run src/lib/realtime', 'resolving workspace jarvis@0.1.0'],
    foot: '› streaming', emptyCause: 'No output on this stream yet.', emptyAction: 'Switch to stdout',
    errorWhat: 'Stream closed by worker', errorWhen: 'exit 137 · OOM at 14:57:02 · r-91ab',
  },
  {
    key: 'chart', title: 'Telemetry', sub: 'RUNS / 24H', head: 'RUNS OVER TIME', mono: true,
    ready: ['312 RUNS · 18 FAILED', 'P95 1.98s · P50 0.58s', 'SPEND ₹721.60'],
    streaming: ['184 RUNS · 9 FAILED', 'BUCKET 14:00 FILLING'],
    foot: 'LAST BUCKET IN ACCENT', emptyCause: 'No runs in this window.', emptyAction: 'Widen to 7d',
    errorWhat: 'Metrics query timed out', errorWhen: '30s advisory lock · 14:22:04 · q-2283',
  },
]

function PanelBody({ panel, state }: { panel: Panel; state: StateKey }) {
  const font = panel.mono ? { fontFamily: MONO, fontSize: 10.5 } : { fontSize: 11.5 }

  if (state === 'loading') {
    // Skeletons sit at the real content's geometry — a layout that shifts
    // between loading and ready is a defect.
    return (
      <div className="flex flex-col gap-2 p-3">
        {[72, 54, 40].map((w, i) => (
          <div
            key={i}
            className="h-3 rounded-sm bg-white/[0.06]"
            style={{ width: `${w}%`, animation: `skel 1.6s ease-in-out ${i * 0.06}s infinite` }}
          />
        ))}
      </div>
    )
  }

  if (state === 'empty') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-3 text-center">
        <p className="text-[11.5px] text-white/40">{panel.emptyCause}</p>
        <button
          type="button"
          className="rounded-[8px] border border-white/10 px-2.5 py-1 font-mono text-[10px] text-white/60 transition hover:border-cyan-400/40 hover:text-cyan-300"
        >
          {panel.emptyAction}
        </button>
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div className="flex flex-col gap-1.5 p-3">
        <p className="text-[11.5px] font-semibold text-red-300">{panel.errorWhat}</p>
        <p className="font-mono text-[9.5px] leading-[1.5] text-white/40">{panel.errorWhen}</p>
        <div className="mt-1 flex gap-1.5">
          <button
            type="button"
            className="rounded-[7px] border border-red-400/35 bg-red-400/10 px-2 py-[3px] font-mono text-[9.5px] text-red-300"
          >
            Retry
          </button>
          <button
            type="button"
            className="rounded-[7px] border border-white/10 px-2 py-[3px] font-mono text-[9.5px] text-white/50"
          >
            Copy trace
          </button>
        </div>
      </div>
    )
  }

  const lines = state === 'streaming' ? panel.streaming : panel.ready
  return (
    <div className="flex flex-col gap-1.5 p-3">
      {lines.map((l, i) => (
        <p key={i} className="whitespace-pre leading-[1.45] text-white/70" style={font}>
          {l}
        </p>
      ))}
      {state === 'streaming' && (
        <span
          className="mt-0.5 inline-block h-[12px] w-[6px] bg-cyan-400"
          style={{ animation: 'caret 1.06s step-end infinite' }}
        />
      )}
    </div>
  )
}

export function StatesView() {
  const [only, setOnly] = useState<StateKey | null>(null)
  const shown = only ? STATES.filter((s) => s.key === only) : STATES

  return (
    <div className="flex h-full flex-col overflow-auto p-5">
      <div className="mb-4 flex items-center gap-3">
        <h1 className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-white/45">
          States
        </h1>
        <span className="font-mono text-[10px] text-white/30">
          EVERY PANEL · ALL FIVE · A LAYOUT THAT SHIFTS BETWEEN LOADING AND READY IS A DEFECT
        </span>
        <span className="flex-1" />
        <div className="flex gap-1 rounded-[10px] border border-white/[0.07] bg-white/[0.03] p-1">
          <button
            type="button"
            onClick={() => setOnly(null)}
            className={`rounded-[7px] px-2.5 py-1 font-mono text-[10px] transition ${
              only === null ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70'
            }`}
          >
            ALL
          </button>
          {STATES.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setOnly(s.key)}
              className={`rounded-[7px] px-2.5 py-1 font-mono text-[10px] uppercase transition ${
                only === s.key ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70'
              }`}
            >
              {s.key}
            </button>
          ))}
        </div>
      </div>

      {/* column headers */}
      <div
        className="mb-2 grid gap-3"
        style={{ gridTemplateColumns: `120px repeat(${shown.length}, minmax(0, 1fr))` }}
      >
        <span />
        {shown.map((s) => (
          <div key={s.key} className="leading-tight">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-white/55">
              {s.label}
            </p>
            <p className="font-mono text-[9px] text-white/28">{s.rule}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        {PANELS.map((p) => (
          <div
            key={p.key}
            className="grid items-stretch gap-3"
            style={{ gridTemplateColumns: `120px repeat(${shown.length}, minmax(0, 1fr))` }}
          >
            <div className="flex flex-col justify-center leading-tight">
              <p className="text-[12px] font-semibold text-white/80">{p.title}</p>
              <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-white/28">{p.sub}</p>
            </div>

            {shown.map((s) => (
              <div
                key={s.key}
                className="flex min-h-[124px] flex-col overflow-hidden rounded-[13px] border bg-white/[0.02]"
                style={{
                  borderColor:
                    s.key === 'error' ? 'rgba(248,113,113,0.28)' : 'rgba(255,255,255,0.05)',
                  borderLeftWidth: s.key === 'error' ? 2 : 1,
                  borderLeftColor: s.key === 'error' ? ERR : 'rgba(255,255,255,0.05)',
                }}
              >
                <div className="flex items-center gap-1.5 border-b border-white/[0.05] px-3 py-1.5">
                  <span
                    className="h-[5px] w-[5px] rounded-full"
                    style={{
                      background:
                        s.key === 'error' ? ERR : s.key === 'streaming' ? '#22d3ee' : s.key === 'empty' ? T(0.25) : OK,
                      animation: s.key === 'streaming' ? 'breathe 2.4s ease-in-out infinite' : undefined,
                    }}
                  />
                  <span className="truncate font-mono text-[9px] tracking-[0.06em] text-white/35">
                    {p.head}
                  </span>
                </div>

                <div className="min-h-0 flex-1">
                  <PanelBody panel={p} state={s.key} />
                </div>

                {(s.key === 'ready' || s.key === 'streaming') && (
                  <div className="border-t border-white/[0.05] px-3 py-1">
                    <span className="font-mono text-[9px] text-white/28">
                      {s.key === 'streaming' ? '› streaming' : p.foot}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap gap-4 rounded-[13px] border border-white/[0.05] bg-white/[0.02] px-4 py-3">
        {[
          { c: OK, t: 'Ready — the happy path, nothing borrowed from other states' },
          { c: '#22d3ee', t: 'Streaming — partial content, layout already settled' },
          { c: WARN, t: 'Loading — skeletons at the real content geometry' },
          { c: ERR, t: 'Error — what failed, when, the retry, and a trace to copy' },
        ].map((r) => (
          <span key={r.t} className="flex items-center gap-2">
            <span className="h-[6px] w-[6px] rounded-full" style={{ background: r.c }} />
            <span className="text-[11px] text-white/50">{r.t}</span>
          </span>
        ))}
      </div>
    </div>
  )
}
