import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import useSWR from 'swr'
import { TraceView } from '../TraceView'

vi.mock('swr', async (importOriginal) => {
  const actual = await importOriginal<typeof import('swr')>()
  return {
    ...actual,
    default: vi.fn(),
    // The unread badge destructures mutate from this; a bare auto-mock returns
    // undefined and throws before the waterfall renders.
    useSWRConfig: () => ({ mutate: vi.fn() }),
  }
})

const span = (over: Record<string, unknown>) => ({
  id: 's', runId: 'r1', parentId: null, type: 'TOOL', name: 'read file',
  startMs: 0, durMs: 100, status: 'OK', model: null, tokens: null,
  error: null, critical: false, ...over,
})

const RUN = {
  id: 'r1', ref: 'r-8f2c', agentId: 'a1',
  agent: { id: 'a1', name: 'vega', model: 'sonnet-4.5' },
  trigger: 'WEBHOOK', status: 'FAILED', summary: 'repair', exitCode: 1,
  tokens: 218400, costInr: 188.30,
  startedAt: new Date().toISOString(), endedAt: null,
  spans: [
    span({ id: 'root', type: 'SUBAGENT', name: 'run r-8f2c', durMs: 1000, status: 'ERROR', critical: true }),
    span({ id: 'kid1', parentId: 'root', name: 'child span A', startMs: 100, durMs: 400 }),
    span({ id: 'kid2', parentId: 'root', name: 'child span B', startMs: 500, durMs: 200, status: 'ERROR', error: 'TimeoutError: boom' }),
  ],
  logLines: [],
  files: [],
}

describe('TraceView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(useSWR as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      data: RUN, error: undefined, isLoading: false,
    })
  })

  it('flattens the parent/child span tree into render order', () => {
    render(<TraceView />)
    // The root name appears in both the waterfall row and the inspector head.
    expect(screen.getAllByText('run r-8f2c').length).toBeGreaterThan(0)
    expect(screen.getByText('child span A')).toBeInTheDocument()
    expect(screen.getByText('child span B')).toBeInTheDocument()
  })

  it('collapses a parent so its children leave the waterfall', () => {
    render(<TraceView />)
    // The root's chevron is the collapse control.
    fireEvent.click(screen.getAllByText('▾')[0])
    expect(screen.queryByText('child span A')).not.toBeInTheDocument()
    expect(screen.getAllByText('run r-8f2c').length).toBeGreaterThan(0)
  })

  it('computes self time as own duration minus direct children', () => {
    render(<TraceView />)
    // root = 1000ms, children = 400 + 200 = 600 → self 400ms
    expect(screen.getByText(/self 400ms/i)).toBeInTheDocument()
    expect(screen.getByText(/children 600ms/i)).toBeInTheDocument()
  })

  it('shows a span error only when one is present', () => {
    render(<TraceView />)
    // Root is selected by default and carries no error string.
    expect(screen.queryByText(/TimeoutError/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('child span B'))
    expect(screen.getByText(/TimeoutError: boom/)).toBeInTheDocument()
  })

  it('renders an error panel when the run cannot be fetched', () => {
    ;(useSWR as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      data: undefined, error: new Error('nope'), isLoading: false,
    })
    render(<TraceView />)
    expect(screen.getByText(/could not load run/i)).toBeInTheDocument()
  })
})
