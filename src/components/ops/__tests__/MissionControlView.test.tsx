import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import useSWR from 'swr'
import { useSession } from 'next-auth/react'
import { MissionControlView } from '../MissionControlView'

vi.mock('swr', async (importOriginal) => {
  const actual = await importOriginal<typeof import('swr')>()
  return { ...actual, default: vi.fn(), useSWRConfig: () => ({ mutate: vi.fn() }) }
})
vi.mock('next-auth/react', () => ({ useSession: vi.fn() }))
vi.mock('@/lib/realtime/client', () => ({
  useBoardEvents: () => {},
  useEventListener: () => {},
  useRealtimeConnectionState: () => 'connected',
}))

const task = (id: string, assignee: { id: string; name: string } | null) => ({
  id,
  title: 'task ' + id,
  description: null,
  status: 'TODO',
  priority: 'MED',
  assignee,
  dueDate: null,
  overdueFlaggedAt: null,
  lastStatusChangeAt: new Date().toISOString(),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
})

const ME = { id: 'user-1', name: 'Devarshi' }
const SOMEONE_ELSE = { id: 'user-2', name: 'Priya' }

function setup(userId: string | null) {
  vi.mocked(useSession).mockReturnValue({
    data: userId ? { user: { id: userId, name: 'Devarshi' } } : null,
    status: userId ? 'authenticated' : 'unauthenticated',
    update: vi.fn(),
  } as unknown as ReturnType<typeof useSession>)

  vi.mocked(useSWR).mockReturnValue({
    data: [task('a', ME), task('b', SOMEONE_ELSE), task('c', null)],
    error: undefined,
    isLoading: false,
    mutate: vi.fn(),
    isValidating: false,
  } as unknown as ReturnType<typeof useSWR>)
}

describe('"My tasks"', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows only tasks assigned to the signed-in user', () => {
    // This filtered on `t.assignee` being truthy — "assigned to anyone" — so
    // it showed the whole team's work and was a near-duplicate of All tasks.
    setup('user-1')
    render(<MissionControlView />)
    fireEvent.click(screen.getByText('My tasks'))
    expect(screen.getByText('task a')).toBeInTheDocument()
    expect(screen.queryByText('task b')).not.toBeInTheDocument()
    expect(screen.queryByText('task c')).not.toBeInTheDocument()
  })

  it('counts the same tasks it lists', () => {
    // The chip counted with a different predicate than the filter, so the
    // number and the list it opened could disagree.
    setup('user-1')
    render(<MissionControlView />)
    const chip = screen.getByText('My tasks').closest('button')
    expect(chip?.textContent).toContain('1')
  })

  it('shows nothing rather than everything when nobody is signed in', () => {
    // Failing open here would put the whole team's work under "mine".
    setup(null)
    render(<MissionControlView />)
    fireEvent.click(screen.getByText('My tasks'))
    expect(screen.queryByText('task a')).not.toBeInTheDocument()
    expect(screen.queryByText('task b')).not.toBeInTheDocument()
  })

  it('leaves the other views alone', () => {
    setup('user-1')
    render(<MissionControlView />)
    // 'Unassigned' is also the assignee label on an unassigned card, so
    // target the view chip specifically.
    fireEvent.click(screen.getAllByText('Unassigned')[0])
    expect(screen.getByText('task c')).toBeInTheDocument()
    expect(screen.queryByText('task a')).not.toBeInTheDocument()
  })
})
