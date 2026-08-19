import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import useSWR from 'swr'

vi.mock('swr')
vi.mock('@/lib/realtime/client', () => ({
  useBoardEvents: vi.fn(),
}))

import { KanbanBoard } from '../KanbanBoard'

describe('KanbanBoard', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders tasks into their status columns', async () => {
    ;(useSWR as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      data: [
        { id: 't1', title: 'A', status: 'TODO', priority: 'MED', assignee: null, dueDate: null, overdueFlaggedAt: null, lastStatusChangeAt: new Date().toISOString() },
        { id: 't2', title: 'B', status: 'DONE', priority: 'MED', assignee: null, dueDate: null, overdueFlaggedAt: null, lastStatusChangeAt: new Date().toISOString() },
      ],
      mutate: vi.fn(),
      isLoading: false,
    })

    render(<KanbanBoard />)

    await waitFor(() => {
      expect(screen.getByTestId('column-TODO')).toHaveTextContent('A')
      expect(screen.getByTestId('column-DONE')).toHaveTextContent('B')
    })
  })
})
