// Design tokens lifted verbatim from the Autiva Mission Control artboards.
// Kept as literal values (not CSS vars) because the charts hand these straight
// to SVG fill/stroke attributes, which do not resolve var() consistently.

export const FG = '#f5f5f7'
export const HAIR = 'rgba(255,255,255,0.05)'
export const CANVAS = '#0a1020'

export const ACCENT = '#22d3ee'
export const QUEUED = '#64748b'
export const BLOCKED = '#a78bfa'
export const OK = '#34d399'
export const WARN = '#fbbf24'
export const ERR = '#f87171'

/** White at a given opacity — the artboards' `T(o)` helper. */
export const T = (o: number) => `rgba(255,255,255,${o})`
/** Accent at a given opacity, for tinted fills and borders. */
export const A = (o: number) => `rgba(34,211,238,${o})`

export const MONO = "'JetBrains Mono', monospace"

export const STATUS_COLOR: Record<string, string> = {
  RUNNING: ACCENT,
  IDLE: QUEUED,
  BLOCKED: BLOCKED,
  FAILED: ERR,
  DONE: OK,
}

export const SPAN_COLOR: Record<string, string> = {
  LLM: BLOCKED,
  TOOL: ACCENT,
  SHELL: T(0.45),
  FILE: OK,
  SUBAGENT: WARN,
}

export const SPAN_STATUS_COLOR: Record<string, string> = {
  OK: T(0.35),
  RUNNING: ACCENT,
  ERROR: ERR,
  WARN: WARN,
}

/**
 * `glyph` keeps the dock in the same monospace vocabulary the rest of the app
 * speaks (the trace waterfall already reads in ◇ ▸ $ ▤ ◈), rather than pulling
 * in an icon library whose stroke style would sit apart from everything else.
 */
export const NAV = [
  // '/' used to have its own dashboard; it now redirects to /board, so a
  // separate "Board" entry pointed at the same place as "Mission".
  { label: 'Mission', href: '/board', glyph: '◈' },
  { label: 'Approvals', href: '/approvals', glyph: '✓' },
  { label: 'Calendar', href: '/calendar', glyph: '▦' },
  { label: 'Fleet', href: '/fleet', glyph: '◇' },
  { label: 'Trace', href: '/trace', glyph: '⑂' },
  { label: 'Terminal', href: '/terminal', glyph: '$' },
  { label: 'Automations', href: '/automations', glyph: '↻' },
  { label: 'States', href: '/states', glyph: '◐' },
  { label: 'Motion', href: '/motion', glyph: '∿' },
] as const

// ── formatters ───────────────────────────────────────────────────

export function fmtElapsed(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const p2 = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${p2(h)}:${p2(m)}:${p2(sec)}` : `${p2(m)}:${p2(sec)}`
}

export function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

export function fmtDuration(ms: number): string {
  if (ms >= 60_000) return `${Math.floor(ms / 60_000)}m${Math.round((ms % 60_000) / 1000)}s`
  if (ms >= 1_000) return `${(ms / 1000).toFixed(1)}s`
  return `${ms}ms`
}

export function fmtClock(d: Date): string {
  const p2 = (n: number) => String(n).padStart(2, '0')
  return `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`
}
