import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import useSWR from 'swr'
import { FleetView } from '../FleetView'

vi.mock('swr', async (importOriginal) => {
  const actual = await importOriginal<typeof import('swr')>()
  return {
    ...actual,
    default: vi.fn(),
    // useCommentCounts destructures mutate from this; the auto-mock would
    // return undefined and throw before the component rendered.
    useSWRConfig: () => ({ mutate: vi.fn() }),
  }
})

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

const ENGINE = { key: 'inbox-triage', displayName: 'Inbox Triage', targetMs: 2500 }

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
      '/api/metrics': { data: { engines: [ENGINE], engine: ENGINE, buckets: [bucket] }, error: undefined, isLoading: false },
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
      '/api/metrics': { data: { engines: [ENGINE], engine: ENGINE, buckets: [bucket] }, error: undefined, isLoading: false },
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
      '/api/metrics': { data: { engines: [ENGINE], engine: ENGINE, buckets: [bucket] }, error: undefined, isLoading: false },
    })
    render(<FleetView />)
    expect(screen.getByText('Blocked')).toBeInTheDocument()
  })

  it('shows the empty state rather than a bare board when no agents exist', () => {
    mockSWR({
      '/api/agents': { data: { mode: 'internal', agents: [] }, error: undefined, isLoading: false },
      '/api/metrics': { data: { engines: [ENGINE], engine: ENGINE, buckets: [bucket] }, error: undefined, isLoading: false },
    })
    render(<FleetView />)
    expect(screen.getByText(/no agents registered/i)).toBeInTheDocument()
  })

  it('surfaces a retry affordance when the fleet query fails', () => {
    mockSWR({
      '/api/agents': { data: undefined, error: new Error('boom'), isLoading: false },
      '/api/metrics': { data: { engines: [ENGINE], engine: ENGINE, buckets: [bucket] }, error: undefined, isLoading: false },
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
      '/api/metrics': { data: { engines: [ENGINE], engine: ENGINE, buckets: [bucket] }, error: undefined, isLoading: false },
    })
    render(<FleetView />)
    expect(screen.getByText('--:--')).toBeInTheDocument()
    expect(screen.getByText('No run assigned')).toBeInTheDocument()
  })

  it('judges latency against the selected engine budget, not a global threshold', () => {
    // p99 2400ms against a 2500ms target — inside budget.
    mockSWR({
      '/api/agents': { data: { mode: 'internal', agents: [agent()] }, error: undefined, isLoading: false },
      '/api/metrics': { data: { engines: [ENGINE], engine: ENGINE, buckets: [bucket] }, error: undefined, isLoading: false },
    })
    render(<FleetView />)
    expect(screen.getByText(/WITHIN BUDGET/)).toBeInTheDocument()
    expect(screen.getByText(/Latency · Inbox Triage/)).toBeInTheDocument()
  })

  it('calls out a breach when p99 exceeds that engine own target', () => {
    // The same 2400ms p99 is a breach for an engine budgeted at 1000ms — the
    // number has not changed, only the engine it is judged against.
    const strict = { key: 'inbox-triage', displayName: 'Inbox Triage', targetMs: 1000 }
    mockSWR({
      '/api/agents': { data: { mode: 'internal', agents: [agent()] }, error: undefined, isLoading: false },
      '/api/metrics': { data: { engines: [strict], engine: strict, buckets: [bucket] }, error: undefined, isLoading: false },
    })
    render(<FleetView />)
    expect(screen.getByText(/OVER BUDGET/)).toBeInTheDocument()
  })

  it('claims no target at all for the fleet rollup rather than inventing one', () => {
    mockSWR({
      '/api/agents': { data: { mode: 'internal', agents: [agent()] }, error: undefined, isLoading: false },
      '/api/metrics': { data: { engines: [ENGINE], engine: null, buckets: [bucket] }, error: undefined, isLoading: false },
    })
    render(<FleetView />)
    expect(screen.getByText(/NO SINGLE TARGET ACROSS ENGINES/)).toBeInTheDocument()
    expect(screen.queryByText(/OVER BUDGET|WITHIN BUDGET/)).not.toBeInTheDocument()
  })

  it('offers every engine as a filter, each labelled with its own budget', () => {
    const engines = [
      { key: 'inbox-triage', displayName: 'Inbox Triage', targetMs: 2500 },
      { key: 'weekly-digest', displayName: 'Weekly Digest', targetMs: 45000 },
    ]
    mockSWR({
      '/api/agents': { data: { mode: 'internal', agents: [agent()] }, error: undefined, isLoading: false },
      '/api/metrics': { data: { engines, engine: engines[0], buckets: [bucket] }, error: undefined, isLoading: false },
    })
    render(<FleetView />)
    expect(screen.getByText('2.5s')).toBeInTheDocument()
    expect(screen.getByText('45s')).toBeInTheDocument()
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

describe('FleetView with no telemetry in the window', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders instead of crashing when buckets is empty', () => {
    // `buckets` is non-null but EMPTY for a new tenant, or for an engine
    // filter matching nothing in the last 24h. The "NOW" captions indexed
    // length-1 on it, and because they are computed in FleetView's own render
    // the throw escaped PanelBoundary and took the whole /fleet page down.
    mockSWR({
      '/api/agents': { data: { mode: 'internal', agents: [agent()] }, error: undefined, isLoading: false },
      '/api/metrics': {
        data: { engines: [ENGINE], engine: ENGINE, buckets: [] },
        error: undefined,
        isLoading: false,
      },
    })
    expect(() => render(<FleetView />)).not.toThrow()
    expect(screen.getByText('orion')).toBeInTheDocument()
  })

  it('says there is nothing rather than printing a misleading zero', () => {
    mockSWR({
      '/api/agents': { data: { mode: 'internal', agents: [agent()] }, error: undefined, isLoading: false },
      '/api/metrics': {
        data: { engines: [ENGINE], engine: ENGINE, buckets: [] },
        error: undefined,
        isLoading: false,
      },
    })
    render(<FleetView />)
    expect(screen.getByText(/NO LATENCY IN THE LAST 24H/i)).toBeInTheDocument()
    expect(screen.getByText(/NO RUNS IN THE LAST 24H/i)).toBeInTheDocument()
  })

  it('still renders the charts when telemetry is present', () => {
    mockSWR({
      '/api/agents': { data: { mode: 'internal', agents: [agent()] }, error: undefined, isLoading: false },
      '/api/metrics': {
        data: { engines: [ENGINE], engine: ENGINE, buckets: [bucket] },
        error: undefined,
        isLoading: false,
      },
    })
    render(<FleetView />)
    expect(screen.queryByText(/NO LATENCY IN THE LAST 24H/i)).not.toBeInTheDocument()
  })
})
