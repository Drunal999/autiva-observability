/**
 * Display formatting. Currency is INR everywhere — no `$` anywhere in the UI —
 * and token counts use compact notation so columns of digits stay scannable.
 */

const INR = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
})

const INR_COMPACT = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  notation: 'compact',
  maximumFractionDigits: 1,
})

/** ₹1,23,456.78 — Indian digit grouping, not thousands separators. */
export function inr(amount: number): string {
  return INR.format(amount)
}

/** ₹1.2L for header totals where the full figure would crowd the row. */
export function inrCompact(amount: number): string {
  return amount >= 100_000 ? INR_COMPACT.format(amount) : INR.format(amount)
}

/** 184.2k / 1.8M — compact token counts, consistent to one decimal. */
export function tokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

/**
 * Store UTC, render in the viewer's timezone. Relative on screen, absolute on
 * hover — pair this with `absolute()` in a `title` attribute.
 */
export function relative(iso: string | Date): string {
  const then = typeof iso === 'string' ? new Date(iso) : iso
  const secs = Math.round((Date.now() - then.getTime()) / 1000)
  if (secs < 45) return 'just now'
  const mins = Math.round(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  return `${days}d ago`
}

/** Full timestamp in the viewer's own timezone, for tooltips. */
export function absolute(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  return d.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'medium',
  })
}
