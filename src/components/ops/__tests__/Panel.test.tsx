import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PanelBoundary, EmptyState } from '../Panel'

function Boom(): JSX.Element {
  throw new Error('series is not iterable')
}

describe('PanelBoundary', () => {
  beforeEach(() => {
    // React logs the caught error; silence it so a passing run stays readable.
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => vi.restoreAllMocks())

  it('contains a throwing panel instead of blanking the page', () => {
    render(
      <div>
        <p>Fleet strip still here</p>
        <PanelBoundary label="Latency">
          <Boom />
        </PanelBoundary>
      </div>
    )
    // The sibling survives — that is the whole point of a per-panel boundary.
    expect(screen.getByText('Fleet strip still here')).toBeInTheDocument()
    expect(screen.getByText(/Latency stopped working/)).toBeInTheDocument()
  })

  it('names the panel that failed, so the operator knows what is missing', () => {
    render(
      <PanelBoundary label="Token burn & spend">
        <Boom />
      </PanelBoundary>
    )
    expect(screen.getByText(/Token burn & spend stopped working/)).toBeInTheDocument()
  })

  it('never shows the raw error message to the viewer', () => {
    const { container } = render(
      <PanelBoundary label="Latency">
        <Boom />
      </PanelBoundary>
    )
    // The message could carry a file path, which must never reach client mode.
    expect(container.textContent).not.toContain('series is not iterable')
  })

  it('offers recovery rather than a dead end', () => {
    render(
      <PanelBoundary label="Latency">
        <Boom />
      </PanelBoundary>
    )
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reload/i })).toBeInTheDocument()
  })

  it('renders children untouched when nothing throws', () => {
    render(
      <PanelBoundary label="Latency">
        <p>chart</p>
      </PanelBoundary>
    )
    expect(screen.getByText('chart')).toBeInTheDocument()
    expect(screen.queryByText(/stopped working/)).not.toBeInTheDocument()
  })

  it('recovers when Try again is pressed and the child no longer throws', () => {
    let shouldThrow = true
    function Flaky() {
      if (shouldThrow) throw new Error('transient')
      return <p>recovered</p>
    }
    render(
      <PanelBoundary label="Latency">
        <Flaky />
      </PanelBoundary>
    )
    expect(screen.getByText(/stopped working/)).toBeInTheDocument()
    shouldThrow = false
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(screen.getByText('recovered')).toBeInTheDocument()
  })
})

describe('EmptyState', () => {
  it('explains what would appear here rather than showing an empty box', () => {
    render(
      <EmptyState
        title="No automations running yet"
        detail="Once your automations are switched on, each one appears here."
      />
    )
    expect(screen.getByText('No automations running yet')).toBeInTheDocument()
    expect(screen.getByText(/each one appears here/)).toBeInTheDocument()
  })

  it('surfaces an action when there is one worth offering', () => {
    const onClick = vi.fn()
    render(<EmptyState title="t" detail="d" action={{ label: 'Attach agent', onClick }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Attach agent' }))
    expect(onClick).toHaveBeenCalled()
  })
})
