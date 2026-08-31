'use client'

import { Component, type ReactNode } from 'react'

/**
 * Per-panel error boundary.
 *
 * A dashboard is a grid of independent questions. If the latency query throws,
 * the operator should lose the latency panel and keep the fleet strip — losing
 * the whole page means losing the one thing that might have explained the
 * failure. Boundaries are therefore placed per panel, not once around the app.
 *
 * React only supports boundaries as class components; there is no hook form.
 */
interface BoundaryProps {
  /** Named in the fallback so the operator knows which panel died. */
  label: string
  children: ReactNode
}

interface BoundaryState {
  error: Error | null
}

export class PanelBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error }
  }

  componentDidCatch(error: Error) {
    // Structured so it greps alongside the write log. The message only —
    // a stack could carry file paths, which must never reach a client view.
    // eslint-disable-next-line no-console
    console.error(
      '[panel] ' + JSON.stringify({ at: new Date().toISOString(), panel: this.props.label, error: error.message })
    )
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="flex min-h-[140px] flex-col justify-center gap-2 rounded-[18px] border border-red-400/30 border-l-2 border-l-red-400 bg-red-400/[0.06] p-4">
        <p className="text-[15px] font-semibold text-red-300">{this.props.label} stopped working</p>
        <p className="font-mono text-[12.5px] leading-[1.5] text-white/45">
          The rest of this page is still live. Reloading usually clears it.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            className="h-7 rounded-[8px] border border-white/12 px-2.5 font-mono text-[12px] text-white/65 transition hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={() => location.reload()}
            className="h-7 rounded-[8px] border border-white/12 px-2.5 font-mono text-[12px] text-white/65 transition hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
          >
            Reload
          </button>
        </div>
      </div>
    )
  }
}

/**
 * Designed zero-state. A brand-new tenant with no runs must look deliberate,
 * not broken — so it says what would appear here and offers the one action
 * that would make it appear, rather than showing an empty box.
 */
export function EmptyState({
  title,
  detail,
  action,
}: {
  title: string
  detail: string
  action?: { label: string; onClick: () => void }
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-[18px] border border-dashed border-white/[0.09] px-5 py-12 text-center">
      <p className="text-[15px] text-white/55">{title}</p>
      <p className="max-w-[46ch] text-[13.5px] leading-[1.6] text-white/32">{detail}</p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-1 h-8 rounded-[9px] border border-cyan-400/40 bg-cyan-400/10 px-3 text-[14px] font-semibold text-cyan-300 transition hover:bg-cyan-400/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
