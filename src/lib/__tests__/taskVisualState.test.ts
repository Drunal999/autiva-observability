import { describe, it, expect } from 'vitest'
import { getTaskVisualState } from '../taskVisualState'
import type { Task } from '@/types/task'

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '1',
    title: 'Test task',
    description: null,
    status: 'TODO',
    priority: 'MED',
    assignee: null,
    assigneeId: null,
    dueDate: null,
    overdueFlaggedAt: null,
    lastStatusChangeAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('getTaskVisualState', () => {
  const now = new Date('2026-08-19T12:00:00Z')

  it('returns none when there is no due date', () => {
    const task = makeTask()
    expect(getTaskVisualState(task, now).dueBadge).toBe('none')
  })

  it('returns due-soon when due within 24h', () => {
    const task = makeTask({ dueDate: new Date('2026-08-19T20:00:00Z').toISOString() })
    expect(getTaskVisualState(task, now).dueBadge).toBe('due-soon')
  })

  it('returns overdue when due date has passed and status is not DONE', () => {
    const task = makeTask({ dueDate: new Date('2026-08-18T12:00:00Z').toISOString() })
    expect(getTaskVisualState(task, now).dueBadge).toBe('overdue')
  })

  it('returns none when overdue but status is DONE', () => {
    const task = makeTask({ dueDate: new Date('2026-08-18T12:00:00Z').toISOString(), status: 'DONE' })
    expect(getTaskVisualState(task, now).dueBadge).toBe('none')
  })

  it('returns overdue when overdueFlaggedAt is set even without a future check', () => {
    const task = makeTask({ overdueFlaggedAt: new Date('2026-08-18T12:00:00Z').toISOString() })
    expect(getTaskVisualState(task, now).dueBadge).toBe('overdue')
  })

  it('flags stale when lastStatusChangeAt is more than 3 days old and not DONE', () => {
    const task = makeTask({ lastStatusChangeAt: new Date('2026-08-15T00:00:00Z').toISOString() })
    expect(getTaskVisualState(task, now).isStale).toBe(true)
  })

  it('does not flag stale when DONE regardless of age', () => {
    const task = makeTask({ lastStatusChangeAt: new Date('2026-08-01T00:00:00Z').toISOString(), status: 'DONE' })
    expect(getTaskVisualState(task, now).isStale).toBe(false)
  })
})
