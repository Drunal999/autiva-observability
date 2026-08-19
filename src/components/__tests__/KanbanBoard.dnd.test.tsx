import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import useSWR from 'swr'

vi.mock('swr')
vi.mock('@/lib/pusher/client', () => ({
  getPusherClient: () => ({ subscribe: () => ({ bind: vi.fn(), unbind_all: vi.fn() }), unsubscribe: vi.fn() }),
  BOARD_CHANNEL: 'board',
}))

import { KanbanBoard } from '../KanbanBoard'

const baseTask = {
  id: 't1',
  title: 'A',
  priority: 'MED',
  assignee: null,
  dueDate: null,
  overdueFlaggedAt: null,
  lastStatusChangeAt: new Date().toISOString(),
}

describe('KanbanBoard drag-and-drop', () => {
  let mutate: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    mutate = vi.fn()
    global.fetch = vi.fn()
    ;(useSWR as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      data: [{ ...baseTask, status: 'TODO' }],
      mutate,
      isLoading: false,
    })
  })

  it('rolls back the optimistic update when the PATCH request fails', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false })
    render(<KanbanBoard />)

    const { moveTaskStatus } = await import('../KanbanBoard')
    await moveTaskStatus('t1', 'DONE', [{ ...baseTask, status: 'TODO' }] as never, mutate as never)

    await waitFor(() => {
      // first call is the optimistic update, second is the rollback to original data
      expect(mutate).toHaveBeenCalledTimes(2)
    })
  })
})
