'use client'

import { useEffect, useRef, useState } from 'react'
import { OK, WARN, ERR } from '@/lib/ops/tokens'

const TABLE = [
  { token: 'enter / reveal', duration: '160ms', easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
  { token: 'state change', duration: '200ms', easing: 'cubic-bezier(0.4, 0, 0.2, 1)' },
  { token: 'layout / expand', duration: '280ms', easing: 'cubic-bezier(0.4, 0, 0.2, 1)' },
  { token: 'exit', duration: '120ms', easing: 'cubic-bezier(0.4, 0, 1, 1)' },
  { token: 'number roll', duration: '320ms', easing: 'tabular-nums, counters only' },
  { token: 'stagger', duration: '12–24ms', easing: 'per item, capped at 8' },
]

const RULES = [
  { text: 'Motion carries meaning. A loop is permitted only where the underlying work is genuinely continuous — four bindings, no fifth.', tone: '#22d3ee' },
  { text: 'Feedback within 100ms on every control. Past 400ms, show a determinate indicator or an elapsed timer — never a fake progress bar.', tone: '#22d3ee' },
  { text: 'Alarm states are drawn, not animated: border plus a 2px rail. A pulsing card is unreadable after eight hours.', tone: ERR },
  { text: 'Panels load independently. One slow query never freezes the surface.', tone: WARN },
  { text: 'prefers-reduced-motion drops every loop to a static state and collapses transitions to 0ms; opacity crossfades survive.', tone: OK },
]

const LOOPS = [
  { name: 'Running status dot', binding: 'an agent is executing', spec: '2.4s breathe' },
  { name: 'Packet in flight', binding: 'an automation edge is carrying work', spec: '1.2s dash-offset' },
  { name: 'File being written', binding: 'a workspace write is open', spec: '1.8s rail shimmer' },
  { name: 'Terminal caret', binding: 'a stream head is live', spec: '1.06s blink' },
]

/** Counter that rolls to a new value over 320ms, tabular so digits never reflow. */
function RollingNumber({ value }: { value: number }) {
  const [shown, setShown] = useState(value)
  const raf = useRef<number>()
  const from = useRef(value)

  useEffect(() => {
    const start = performance.now()
    const a = from.current
    const b = value
    const step = (t: number) => {
      const p = Math.min((t - start) / 320, 1)
      const eased = 1 - Math.pow(1 - p, 3)
      setShown(Math.round(a + (b - a) * eased))
      if (p < 1) raf.current = requestAnimationFrame(step)
      else from.current = b
    }
    raf.current = requestAnimationFrame(step)
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current)
    }
  }, [value])

  return <span className="font-mono text-[26px] font-bold tabular-nums text-white/90">{shown}</span>
}

function DemoCard({
  title,
  spec,
  children,
  onReplay,
}: {
  title: string
  spec: string
  children: React.ReactNode
  onReplay: () => void
}) {
  return (
    <div className="flex flex-col rounded-[13px] border border-white/[0.06] bg-white/[0.02] p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[13.5px] font-semibold text-white/80">{title}</span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={onReplay}
          className="rounded-[6px] border border-white/10 px-1.5 py-[2px] font-mono text-[11px] text-white/45 transition hover:border-cyan-400/40 hover:text-cyan-300"
        >
          replay
        </button>
      </div>
      <div className="flex min-h-[68px] flex-1 items-center">{children}</div>
      <p className="mt-2 font-mono text-[11px] text-white/28">{spec}</p>
    </div>
  )
}

export function MotionView() {
  // Each demo has a nonce; bumping it remounts the node so the one-shot
  // animation replays.
  const [nonce, setNonce] = useState<Record<string, number>>({})
  const bump = (k: string) => setNonce((n) => ({ ...n, [k]: (n[k] ?? 0) + 1 }))
  const [count, setCount] = useState(312)

  return (
    <div className="flex h-full flex-col gap-5 overflow-auto p-5">
      <div className="flex items-center gap-3">
        <h1 className="font-mono text-[13px] font-bold uppercase tracking-[0.16em] text-white/45">
          Motion
        </h1>
        <span className="font-mono text-[12px] text-white/30">
          DURATIONS · EASINGS · SEMANTIC BINDINGS
        </span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => {
            ;['enter', 'state', 'expand', 'exit', 'stagger'].forEach(bump)
            setCount((c) => (c === 312 ? 348 : 312))
          }}
          className="rounded-[10px] border border-cyan-400/45 bg-cyan-400/[0.12] px-3 py-1.5 font-mono text-[13px] font-bold text-cyan-300"
        >
          Play all
        </button>
      </div>

      {/* token table */}
      <div className="overflow-hidden rounded-[16px] border border-white/[0.06]">
        <div className="grid grid-cols-[160px_100px_1fr] gap-3 border-b border-white/[0.06] bg-white/[0.03] px-4 py-2 font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-white/30">
          <span>Token</span>
          <span>Duration</span>
          <span>Easing</span>
        </div>
        {TABLE.map((r) => (
          <div
            key={r.token}
            className="grid grid-cols-[160px_100px_1fr] gap-3 border-b border-white/[0.04] px-4 py-2 last:border-0"
          >
            <span className="text-[13.5px] text-white/75">{r.token}</span>
            <span className="font-mono text-[13px] tabular-nums text-cyan-300">{r.duration}</span>
            <span className="font-mono text-[12.5px] text-white/40">{r.easing}</span>
          </div>
        ))}
      </div>

      {/* one-shot demos */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <DemoCard title="Enter" spec="160ms · (0.16, 1, 0.3, 1)" onReplay={() => bump('enter')}>
          <div
            key={nonce.enter}
            className="h-[52px] w-full rounded-[10px] border border-white/[0.08] bg-white/[0.05]"
            style={{ animation: 'enter 160ms cubic-bezier(0.16,1,0.3,1) both' }}
          />
        </DemoCard>

        <DemoCard title="State change" spec="200ms · (0.4, 0, 0.2, 1)" onReplay={() => bump('state')}>
          <div
            key={nonce.state}
            className="h-[52px] w-full rounded-[10px] border"
            style={{
              animation: 'stateFlip 200ms cubic-bezier(0.4,0,0.2,1) both',
              borderColor: 'rgba(52,211,153,0.45)',
              background: 'rgba(52,211,153,0.10)',
            }}
          />
        </DemoCard>

        <DemoCard title="Layout / expand" spec="280ms · (0.4, 0, 0.2, 1)" onReplay={() => bump('expand')}>
          <div
            key={nonce.expand}
            className="w-full overflow-hidden rounded-[10px] border border-white/[0.08] bg-white/[0.04]"
            style={{ animation: 'demoExpand 280ms cubic-bezier(0.4,0,0.2,1) both' }}
          />
        </DemoCard>

        <DemoCard title="Exit" spec="120ms · (0.4, 0, 1, 1)" onReplay={() => bump('exit')}>
          <div
            key={nonce.exit}
            className="h-[52px] w-full rounded-[10px] border border-white/[0.08] bg-white/[0.05]"
            style={{ animation: 'demoExit 120ms cubic-bezier(0.4,0,1,1) both' }}
          />
        </DemoCard>

        <DemoCard title="Number roll" spec="320ms · tabular-nums" onReplay={() => setCount((c) => (c === 312 ? 348 : 312))}>
          <div className="flex w-full items-baseline gap-2">
            <RollingNumber value={count} />
            <span className="font-mono text-[12px] text-white/30">RUNS</span>
          </div>
        </DemoCard>
      </div>

      {/* stagger */}
      <div className="rounded-[16px] border border-white/[0.06] bg-white/[0.02] p-4">
        <div className="mb-3 flex items-center gap-2">
          <span className="text-[13.5px] font-semibold text-white/80">Stagger</span>
          <span className="font-mono text-[11px] text-white/28">12–24ms per item, capped at 8</span>
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => bump('stagger')}
            className="rounded-[6px] border border-white/10 px-1.5 py-[2px] font-mono text-[11px] text-white/45 hover:text-cyan-300"
          >
            replay
          </button>
        </div>
        <div key={nonce.stagger} className="flex gap-2">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="h-[42px] flex-1 rounded-[8px] border border-white/[0.07] bg-white/[0.05]"
              style={{
                animation: `enter 160ms cubic-bezier(0.16,1,0.3,1) ${Math.min(i, 8) * 0.018}s both`,
              }}
            />
          ))}
        </div>
      </div>

      {/* the four permitted loops */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {LOOPS.map((l, i) => (
          <div key={l.name} className="rounded-[13px] border border-white/[0.06] bg-white/[0.02] p-3">
            <div className="flex items-center gap-2">
              {i === 0 && (
                <span
                  className="h-[7px] w-[7px] rounded-full bg-cyan-400"
                  style={{ animation: 'breathe 2.4s ease-in-out infinite' }}
                />
              )}
              {i === 1 && (
                <svg width="16" height="8" aria-hidden="true">
                  <line
                    x1="0" y1="4" x2="16" y2="4"
                    stroke="#22d3ee" strokeWidth="1.5" strokeDasharray="4 4"
                    style={{ animation: 'flow 1.2s linear infinite' }}
                  />
                </svg>
              )}
              {i === 2 && (
                <span
                  className="h-[14px] w-[2px] rounded-sm"
                  style={{
                    backgroundImage:
                      'linear-gradient(180deg, rgba(34,211,238,0) 0%, #22d3ee 50%, rgba(34,211,238,0) 100%)',
                    backgroundSize: '100% 40px',
                    animation: 'shimmerRail 1.8s linear infinite',
                  }}
                />
              )}
              {i === 3 && (
                <span
                  className="inline-block h-[12px] w-[6px] bg-cyan-400"
                  style={{ animation: 'caret 1.06s step-end infinite' }}
                />
              )}
              <span className="text-[13.5px] font-semibold text-white/80">{l.name}</span>
            </div>
            <p className="mt-1.5 text-[13px] leading-[1.4] text-white/45">
              loops because <span className="text-white/70">{l.binding}</span>
            </p>
            <p className="mt-1 font-mono text-[11px] text-cyan-300/70">{l.spec}</p>
          </div>
        ))}
      </div>

      {/* rules */}
      <div className="flex flex-col gap-2">
        {RULES.map((r) => (
          <div
            key={r.text}
            className="flex gap-2.5 rounded-[11px] border border-white/[0.05] bg-white/[0.02] px-3.5 py-2.5"
            style={{ borderLeft: `2px solid ${r.tone}` }}
          >
            <p className="text-[13.5px] leading-[1.5] text-white/60">{r.text}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
