import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import useSWR from 'swr'
import { FleetView } from '../FleetView'

vi.mock('swr')

const agent = (over: Record<string, unknown> = {}) => ({
  id: 'a1',
  name: 'orion',
  model: 'sonnet-4.5',
  status: 'RUNNING',
  currentStep: 'Patching backoff',
  startedAt: new Date(Date.now() - 90_000).toISOString(),
  tokensIn: 71400,
  tokensOut: 9800,
  costInr: 72.15,
  stepMs: [100, 200, 300],
  ...over,
})

const bucket = {
  id: 'b1', at: new Date().toISOString(), runs: 10, failed: 1,
  p50Ms: 400, p95Ms: 1200, p99Ms: 2400, tokens: 50000, costInr: 105.60, successRate: 90,
}

function mockSWR(byKey: Record<string, unknown>) {
  ;(useSWR as unknown as ReturnType<typeof vi.fn>).mockImplementation((key: string) => {
    if (key in byKey) return byKey[key]
    return { data: undefined, error: undefined, isLoading: false }
  })
}

describe('FleetView', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders an agent card with its live status and cost', () => {
    mockSWR({
      '/api/agents': { data: { mode: 'internal', agents: [agent()] }, error: undefined, isLoading: false },
      '/api/metrics': { data: [bucket], error: undefined, isLoading: false },
    })
    render(<FleetView />)
    expect(screen.getByText('orion')).toBeInTheDocument()
    // Label comes from statusLabel(), not the raw backend value.
    expect(screen.getByText('Running')).toBeInTheDocument()
    // Currency is INR everywhere — no `$` in the UI.
    expect(screen.getByText('₹72.15')).toBeInTheDocument()
  })

  it('splits tokens into separate in and out figures', () => {
    mockSWR({
      '/api/agents': { data: { mode: 'internal', agents: [agent()] }, error: undefined, isLoading: false },
      '/api/metrics': { data: [bucket], error: undefined, isLoading: false },
    })
    render(<FleetView />)
    expect(screen.getByText('In')).toBeInTheDocument()
    expect(screen.getByText('Out')).toBeInTheDocument()
    expect(screen.getByText('71.4k')).toBeInTheDocument()
    expect(screen.getByText('9.8k')).toBeInTheDocument()
  })

  it('derives the blocked label from awaiting_approval, never a hardcoded string', () => {
    mockSWR({
      '/api/agents': { data: { mode: 'internal', agents: [agent({ status: 'AWAITING_APPROVAL' })] }, error: undefined, isLoading: false },
      '/api/metrics': { data: [bucket], error: undefined, isLoading: false },
    })
    render(<FleetView />)
    expect(screen.getByText('Blocked')).toBeInTheDocument()
  })

  it('shows the empty state rather than a bare board when no agents exist', () => {
    mockSWR({
      '/api/agents': { data: { mode: 'internal', agents: [] }, error: undefined, isLoading: false },
      '/api/metrics': { data: [bucket], error: undefined, isLoading: false },
    })
    render(<FleetView />)
    expect(screen.getByText(/no agents registered/i)).toBeInTheDocument()
  })

  it('surfaces a retry affordance when the fleet query fails', () => {
    mockSWR({
      '/api/agents': { data: undefined, error: new Error('boom'), isLoading: false },
      '/api/metrics': { data: [bucket], error: undefined, isLoading: false },
    })
    render(<FleetView />)
    expect(screen.getByText(/could not reach the fleet/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })

  it('renders an idle agent without inventing zeroed metrics', () => {
    mockSWR({
      '/api/agents': {
        data: { mode: 'internal', agents: [agent({ status: 'IDLE', currentStep: null, startedAt: null, tokensIn: 0, tokensOut: 0, costInr: 0, stepMs: [] })] },
        error: undefined,
        isLoading: false,
      },
      '/api/metrics': { data: [bucket], error: undefined, isLoading: false },
    })
    render(<FleetView />)
    expect(screen.getByText('--:--')).toBeInTheDocument()
    expect(screen.getByText('No run assigned')).toBeInTheDocument()
  })

  it('holds telemetry in a skeleton until buckets arrive, without blocking the fleet strip', () => {
    mockSWR({
      '/api/agents': { data: { mode: 'internal', agents: [agent()] }, error: undefined, isLoading: false },
      '/api/metrics': { data: undefined, error: undefined, isLoading: true },
    })
    render(<FleetView />)
    // Fleet strip still rendered even though telemetry has not resolved.
    expect(screen.getByText('orion')).toBeInTheDocument()
    expect(screen.queryByText('Runs over time')).not.toBeInTheDocument()
  })
})
