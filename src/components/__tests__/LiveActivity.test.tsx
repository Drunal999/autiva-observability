import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import type { Task } from '@/types/task'

interface CapturedHandlers {
  onCreated?: (task: Task) => void
  onUpdated?: (task: Task) => void
  onDeleted?: (id: string) => void
}

let capturedHandlers: CapturedHandlers = {}

vi.mock('@/lib/realtime/client', () => ({
  useBoardEvents: (handlers: CapturedHandlers) => {
    capturedHandlers = handlers
  },
  useRealtimeConnectionState: () => 'connected',
}))

import { LiveActivity } from '../LiveActivity'

describe('LiveActivity', () => {
  beforeEach(() => {
    capturedHandlers = {}
  })

  it('shows an empty state before any events arrive', () => {
    render(<LiveActivity />)
    expect(screen.getByText(/no activity yet/i)).toBeInTheDocument()
  })

  it('logs a real task-created event from the realtime stream', () => {
    render(<LiveActivity />)

    act(() => {
      capturedHandlers.onCreated?.({ id: 't1', title: 'Ship it', status: 'TODO' } as Task)
    })

    expect(screen.getByText(/ship it/i)).toBeInTheDocument()
  })

  it('logs a task-updated status change distinctly from creation', () => {
    render(<LiveActivity />)

    act(() => {
      capturedHandlers.onUpdated?.({ id: 't1', title: 'Ship it', status: 'DONE' } as Task)
    })

    expect(screen.getByText(/moved/i)).toBeInTheDocument()
    expect(screen.getByText(/done/i)).toBeInTheDocument()
  })
})
