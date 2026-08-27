import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import useSWR from 'swr'
import { FleetView } from '../FleetView'

vi.mock('swr')

/** An agent carrying every kind of internal detail rule 8 forbids in client mode. */
const leakyAgent = (over: Record<string, unknown> = {}) => ({
  id: 'a1',
  name: 'vega',
  model: 'sonnet-4.5',
  status: 'FAILED',
  currentStep: 'e2e/board-flow.spec.ts exited 1 — drag assertion raced SWR revalidate',
  startedAt: new Date(Date.now() - 90_000).toISOString(),
  tokensIn: 184200,
  tokensOut: 21400,
  costInr: 188.3,
  stepMs: [100, 200],
  module: { key: 'seo-audit', displayName: 'SEO Audit', targetMs: 30000 },
  ...over,
})

const bucket = {
  id: 'b1', at: new Date().toISOString(), runs: 10, failed: 1,
  p50Ms: 400, p95Ms: 1200, p99Ms: 2400, tokens: 50000, costInr: 105.6, successRate: 90,
}

function mockFleet(mode: string, agents: unknown[]) {
  ;(useSWR as unknown as ReturnType<typeof vi.fn>).mockImplementation((key: string) => {
    if (key === '/api/agents') return { data: { mode, agents }, error: undefined, isLoading: false }
    if (key === '/api/metrics') return { data: [bucket], error: undefined, isLoading: false }
    return { data: undefined, error: undefined, isLoading: false }
  })
}

describe('FleetView — internal mode', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows agent codenames, model names and the raw step', () => {
    mockFleet('internal', [leakyAgent()])
    render(<FleetView />)
    expect(screen.getByText('vega')).toBeInTheDocument()
    expect(screen.getByText('sonnet-4.5')).toBeInTheDocument()
    expect(screen.getByText(/board-flow\.spec\.ts/)).toBeInTheDocument()
  })
})

describe('FleetView — client mode never leaks internals', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows the module display name instead of the agent codename', () => {
    mockFleet('client', [leakyAgent()])
    render(<FleetView />)
    expect(screen.getByText('SEO Audit')).toBeInTheDocument()
    expect(screen.queryByText('vega')).not.toBeInTheDocument()
  })

  it('never renders a model name', () => {
    mockFleet('client', [leakyAgent()])
    render(<FleetView />)
    expect(screen.queryByText('sonnet-4.5')).not.toBeInTheDocument()
  })

  it('never renders file paths, repo names or stack traces', () => {
    mockFleet('client', [leakyAgent()])
    const { container } = render(<FleetView />)
    const text = container.textContent ?? ''
    expect(text).not.toMatch(/\.spec\.ts|\.tsx|src\//)
    expect(text).not.toMatch(/SWR|revalidate/)
  })

  it('replaces the raw step with a customer-facing sentence', () => {
    mockFleet('client', [leakyAgent({ status: 'AWAITING_APPROVAL' })])
    render(<FleetView />)
    expect(screen.getByText('Waiting for your approval')).toBeInTheDocument()
  })

  it('falls back to a neutral label when an agent has no module', () => {
    mockFleet('client', [leakyAgent({ module: null })])
    render(<FleetView />)
    expect(screen.getByText('Automation')).toBeInTheDocument()
    expect(screen.queryByText('vega')).not.toBeInTheDocument()
  })

  it('defaults to client mode when the server sends no mode — fails closed', () => {
    ;(useSWR as unknown as ReturnType<typeof vi.fn>).mockImplementation((key: string) => {
      if (key === '/api/agents') {
        return { data: { agents: [leakyAgent()] }, error: undefined, isLoading: false }
      }
      if (key === '/api/metrics') return { data: [bucket], error: undefined, isLoading: false }
      return { data: undefined, error: undefined, isLoading: false }
    })
    render(<FleetView />)
    // No mode from the server must not silently expose internal detail.
    expect(screen.queryByText('vega')).not.toBeInTheDocument()
    expect(screen.getByText('SEO Audit')).toBeInTheDocument()
  })
})
