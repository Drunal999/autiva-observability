'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import { OK, WARN, ERR, T } from '@/lib/ops/tokens'
import type { RunDetail, LogLine, WorkspaceFile } from '@/types/agentOps'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const FILE_TONE: Record<string, string> = {
  WRITING: '#22d3ee',
  MODIFIED: WARN,
  READING: T(0.45),
  COMMITTED: OK,
}

function lineTone(l: LogLine): string {
  if (l.level === 'ERROR') return '#fca5a5'
  if (l.level === 'WARN') return WARN
  if (l.stream === 'SYSTEM') return '#22d3ee'
  if (l.text.startsWith('✓')) return OK
  if (l.text.startsWith('$')) return T(0.85)
  return T(0.68)
}

function ts(iso: string) {
  const d = new Date(iso)
  const p2 = (n: number) => String(n).padStart(2, '0')
  return `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`
}

function ToolBlock({ line }: { line: LogLine }) {
  return (
    <div className="my-1 flex items-center gap-2 rounded-[8px] border border-white/[0.07] bg-white/[0.03] px-2.5 py-1.5">
      <span className="rounded-[4px] bg-cyan-400/15 px-1.5 py-[1px] font-mono text-[9px] font-bold uppercase text-cyan-400">
        {line.text}
      </span>
      <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-white/60">{line.args}</span>
      {line.meta && (
        <span className="font-mono text-[10px] tabular-nums text-white/30">{line.meta}</span>
      )}
    </div>
  )
}

function DiffBlock({ line }: { line: LogLine }) {
  return (
    <div className="my-1 overflow-hidden rounded-[8px] border border-white/[0.07]">
      <div className="flex items-center gap-2 bg-white/[0.04] px-2.5 py-1.5">
        <span className="rounded-[4px] bg-emerald-400/15 px-1.5 py-[1px] font-mono text-[9px] font-bold uppercase text-emerald-400">
          diff
        </span>
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-white/65">{line.text}</span>
        <span className="font-mono text-[10px] text-white/35">{line.meta}</span>
      </div>
      <div className="bg-black/25 py-1">
        {line.lines.map((d, i) => {
          const sign = d[0]
          const bg = sign === '+' ? 'rgba(52,211,153,0.10)' : sign === '-' ? 'rgba(248,113,113,0.10)' : 'transparent'
          const fg = sign === '+' ? '#6ee7b7' : sign === '-' ? '#fca5a5' : T(0.45)
          return (
            <div key={i} className="px-2.5 font-mono text-[11px] leading-[1.55]" style={{ background: bg, color: fg }}>
              {d}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function StackBlock({ line }: { line: LogLine }) {
  const [open, setOpen] = useState(false)
  const shown = open ? line.lines : line.lines.slice(0, 3)
  return (
    <div className="my-1 overflow-hidden rounded-[8px] border border-red-400/25 bg-red-400/[0.06]">
      <div className="px-2.5 py-1.5 font-mono text-[11px] text-red-300">{line.text}</div>
      <div className="pb-1">
        {shown.map((f, i) => (
          <div key={i} className="px-2.5 font-mono text-[10.5px] leading-[1.5] text-white/40">
            {f}
          </div>
        ))}
      </div>
      {line.lines.length > 3 && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="w-full px-2.5 pb-1.5 text-left font-mono text-[10px] text-white/35 hover:text-white/60"
        >
          {open ? '▾ collapse' : `▸ ${line.lines.length - 3} more frames`}
        </button>
      )}
    </div>
  )
}

export function TerminalView({ runRef = 'r-91ab' }: { runRef?: string }) {
  const { data: run, isLoading } = useSWR<RunDetail>(`/api/runs/${runRef}`, fetcher)

  const all = useMemo(() => run?.logLines ?? [], [run])
  const files = useMemo(() => run?.files ?? [], [run])

  // Replay the stored stream so the terminal reads as live output rather than
  // a static dump. Lines land one at a time, then the caret keeps blinking.
  const [shown, setShown] = useState(0)
  useEffect(() => {
    if (!all.length) return
    setShown(0)
    const t = setInterval(() => {
      setShown((n) => {
        if (n >= all.length) {
          clearInterval(t)
          return n
        }
        return n + 1
      })
    }, 260)
    return () => clearInterval(t)
  }, [all])

  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const selected: WorkspaceFile | undefined =
    files.find((f) => f.path === selectedPath) ?? files.find((f) => f.diff.length > 0) ?? files[0]

  // Autoscroll pins to the bottom, and detaches the moment the operator
  // scrolls up — a live tail that fights you is worse than no tail.
  const scrollRef = useRef<HTMLDivElement>(null)
  const [pinned, setPinned] = useState(true)
  useEffect(() => {
    if (pinned && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [shown, pinned])

  function onScroll() {
    const el = scrollRef.current
    if (!el) return
    setPinned(el.scrollHeight - el.scrollTop - el.clientHeight < 40)
  }

  const streaming = shown < all.length

  return (
    <div className="flex h-full min-h-0">
      {/* ── terminal ── */}
      <div className="relative flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-3 border-b border-white/5 px-5 py-3">
          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-white/45">
            Terminal
          </span>
          <span className="rounded-[5px] border border-white/[0.08] px-1.5 py-[2px] font-mono text-[10px] text-white/45">
            {run?.ref ?? runRef}
          </span>
          {run?.agent && (
            <span className="font-mono text-[10px] text-white/30">
              {run.agent.name} · {run.agent.model}
            </span>
          )}
          <span className="flex-1" />
          <span className="flex items-center gap-1.5 font-mono text-[10px] text-white/35">
            <span
              className="h-[5px] w-[5px] rounded-full"
              style={{
                background: streaming ? '#22d3ee' : OK,
                animation: streaming ? 'breathe 2.4s ease-in-out infinite' : undefined,
              }}
            />
            {streaming ? 'STREAMING' : 'IDLE'}
          </span>
        </div>

        <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          {isLoading && (
            <div className="flex flex-col gap-1.5">
              {Array.from({ length: 10 }).map((_, i) => (
                <div
                  key={i}
                  className="h-4 rounded-sm bg-white/[0.04]"
                  style={{ width: `${40 + ((i * 17) % 55)}%`, animation: `skel 1.6s ease-in-out ${i * 0.05}s infinite` }}
                />
              ))}
            </div>
          )}

          {all.slice(0, shown).map((l) => (
            <div key={l.id} style={{ animation: 'logLine 90ms ease-out both' }}>
              {l.kind === 'TOOL' ? (
                <ToolBlock line={l} />
              ) : l.kind === 'DIFF' ? (
                <DiffBlock line={l} />
              ) : l.kind === 'STACK' ? (
                <StackBlock line={l} />
              ) : (
                <div className="flex gap-3">
                  <span className="shrink-0 select-none font-mono text-[10.5px] leading-[1.55] tabular-nums text-white/25">
                    {ts(l.ts)}
                  </span>
                  <span
                    className="whitespace-pre-wrap font-mono text-[12px] leading-[1.55]"
                    style={{ color: lineTone(l) }}
                  >
                    {l.text}
                  </span>
                </div>
              )}
            </div>
          ))}

          {/* stream head */}
          {!isLoading && (
            <div className="flex gap-3">
              <span className="shrink-0 select-none font-mono text-[10.5px] leading-[1.55] text-white/25">
                {'        '}
              </span>
              <span
                className="inline-block h-[15px] w-[7px] bg-cyan-400"
                style={{ animation: 'caret 1.06s step-end infinite' }}
              />
            </div>
          )}
        </div>

        {!pinned && (
          <button
            type="button"
            onClick={() => {
              setPinned(true)
              if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
            }}
            className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-cyan-400/40 bg-cyan-400/15 px-3 py-1.5 font-mono text-[10px] text-cyan-300 backdrop-blur"
          >
            Jump to live ↓
          </button>
        )}
      </div>

      {/* ── workspace ── */}
      <aside className="flex w-[420px] shrink-0 flex-col border-l border-white/5">
        <div className="border-b border-white/5 px-4 py-3">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">
            Workspace
          </p>
        </div>

        <div className="flex flex-col gap-[1px] border-b border-white/5 p-2">
          {files.map((f) => {
            const tone = FILE_TONE[f.status]
            const sel = selected?.path === f.path
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setSelectedPath(f.path)}
                className="relative flex items-center gap-2 rounded-[7px] px-2 py-1.5 text-left transition hover:bg-white/[0.04]"
                style={{ background: sel ? 'rgba(255,255,255,0.05)' : undefined }}
              >
                {/* The only looping animation on this screen: a file actively
                    being written is genuinely continuous work. */}
                <span
                  className="h-[14px] w-[2px] shrink-0 rounded-sm"
                  style={
                    f.status === 'WRITING'
                      ? {
                          backgroundImage:
                            'linear-gradient(180deg, rgba(34,211,238,0) 0%, #22d3ee 50%, rgba(34,211,238,0) 100%)',
                          backgroundSize: '100% 40px',
                          animation: 'shimmerRail 1.8s linear infinite',
                        }
                      : { background: tone, opacity: 0.5 }
                  }
                />
                <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-white/70">
                  {f.path}
                </span>
                <span className="font-mono text-[9px] uppercase" style={{ color: tone }}>
                  {f.status}
                </span>
                {(f.added > 0 || f.removed > 0) && (
                  <span className="font-mono text-[10px] tabular-nums">
                    <span className="text-emerald-400">+{f.added}</span>{' '}
                    <span className="text-red-400">−{f.removed}</span>
                  </span>
                )}
              </button>
            )
          })}
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {selected && selected.diff.length > 0 ? (
            <>
              <div className="sticky top-0 flex items-center gap-2 bg-[#0a0a0c]/95 px-4 py-2 backdrop-blur">
                <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-white/55">
                  {selected.path}
                </span>
                <span className="font-mono text-[10px]">
                  <span className="text-emerald-400">+{selected.added}</span>{' '}
                  <span className="text-red-400">−{selected.removed}</span>
                </span>
              </div>
              {selected.diff.map((d, i) => {
                const sign = d[0]
                const bg = sign === '+' ? 'rgba(52,211,153,0.10)' : sign === '-' ? 'rgba(248,113,113,0.10)' : 'transparent'
                const fg = sign === '+' ? '#6ee7b7' : sign === '-' ? '#fca5a5' : T(0.45)
                return (
                  <div key={i} className="flex">
                    <span className="w-9 shrink-0 select-none px-2 text-right font-mono text-[10px] leading-[1.6] text-white/20">
                      {i + 38}
                    </span>
                    <span
                      className="min-w-0 flex-1 whitespace-pre px-2 font-mono text-[11px] leading-[1.6]"
                      style={{ background: bg, color: fg }}
                    >
                      {d}
                    </span>
                  </div>
                )
              })}
            </>
          ) : (
            <p className="px-4 py-6 text-center font-mono text-[11px] text-white/25">
              No diff for this file
            </p>
          )}
        </div>
      </aside>
    </div>
  )
}
