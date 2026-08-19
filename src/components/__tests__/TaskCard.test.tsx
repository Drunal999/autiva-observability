import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TaskCard } from '../TaskCard'
import type { Task } from '@/types/task'

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '1',
    title: 'Write the plan',
    description: null,
    status: 'TODO',
    priority: 'HIGH',
    assignee: { id: 'u1', name: 'Alex', avatarUrl: null },
    assigneeId: 'u1',
    dueDate: null,
    overdueFlaggedAt: null,
    lastStatusChangeAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('TaskCard', () => {
  it('renders the title and assignee name', () => {
    render(<TaskCard task={makeTask()} onClick={() => {}} />)
    expect(screen.getByText('Write the plan')).toBeInTheDocument()
    expect(screen.getByText('Alex')).toBeInTheDocument()
  })

  it('marks overdue tasks with data-due-badge="overdue"', () => {
    render(<TaskCard task={makeTask({ overdueFlaggedAt: new Date().toISOString() })} onClick={() => {}} />)
    expect(screen.getByTestId('task-card')).toHaveAttribute('data-due-badge', 'overdue')
  })

  it('calls onClick when clicked', () => {
    const onClick = vi.fn()
    render(<TaskCard task={makeTask()} onClick={onClick} />)
    fireEvent.click(screen.getByTestId('task-card'))
    expect(onClick).toHaveBeenCalled()
  })
})
