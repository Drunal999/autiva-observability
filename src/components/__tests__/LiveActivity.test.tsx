import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'

const handlers: Record<string, (payload: unknown) => void> = {}

vi.mock('@/lib/pusher/client', () => ({
  getPusherClient: () => ({
    subscribe: () => ({
      bind: (event: string, cb: (payload: unknown) => void) => {
        handlers[event] = cb
      },
      unbind_all: vi.fn(),
    }),
    unsubscribe: vi.fn(),
    connection: { state: 'connected', bind: vi.fn(), unbind: vi.fn() },
  }),
  usePusherConnectionState: () => 'connected',
  BOARD_CHANNEL: 'board',
}))

import { LiveActivity } from '../LiveActivity'

describe('LiveActivity', () => {
  beforeEach(() => {
    Object.keys(handlers).forEach((key) => delete handlers[key])
  })

  it('shows an empty state before any events arrive', () => {
    render(<LiveActivity />)
    expect(screen.getByText(/no activity yet/i)).toBeInTheDocument()
  })

  it('logs a real task-created event from Pusher', () => {
    render(<LiveActivity />)

    act(() => {
      handlers['task-created']({ id: 't1', title: 'Ship it', status: 'TODO' })
    })

    expect(screen.getByText(/ship it/i)).toBeInTheDocument()
  })

  it('logs a task-updated status change distinctly from creation', () => {
    render(<LiveActivity />)

    act(() => {
      handlers['task-updated']({ id: 't1', title: 'Ship it', status: 'DONE' })
    })

    expect(screen.getByText(/moved/i)).toBeInTheDocument()
    expect(screen.getByText(/done/i)).toBeInTheDocument()
  })
})
