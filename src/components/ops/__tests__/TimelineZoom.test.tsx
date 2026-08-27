import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import useSWR from 'swr'
import { Timeline } from '../Timeline'

vi.mock('swr', async (importOriginal) => {
  const actual = await importOriginal<typeof import('swr')>()
  return { ...actual, default: vi.fn(), useSWRConfig: () => ({ mutate: vi.fn() }) }
})

const ALL = { human: true, scheduled: true, run: true, deadline: true }

/**
 * These test the WIRING, not the arithmetic.
 *
 * zoomWindow was correct and unit-tested throughout, yet zooming out stalled at
 * three weeks and pinch-zoom panned instead of zooming — because centre and
 * span were two states and one was updated from inside the other's updater.
 * Only driving the real component catches that, so this drives the real
 * component.
 */
describe('the timeline window', () => {
  beforeEach(() => {
    vi.mocked(useSWR).mockReturnValue({
      data: { items: [] },
      isLoading: false,
      mutate: vi.fn(),
      error: undefined,
      isValidating: false,
    } as unknown as ReturnType<typeof useSWR>)
  })

  const track = () => screen.getByLabelText('Zoomable timeline')

  it('zooms out all the way to the month tier', () => {
    render(<Timeline enabled={ALL} />)
    expect(track()).toHaveAttribute('data-tier', 'day')
    for (let i = 0; i < 14; i++) fireEvent.click(screen.getByText('− out'))
    expect(track()).toHaveAttribute('data-tier', 'month')
  })

  it('zooms in all the way to the hour tier', () => {
    render(<Timeline enabled={ALL} />)
    for (let i = 0; i < 14; i++) fireEvent.click(screen.getByText('+ in'))
    expect(track()).toHaveAttribute('data-tier', 'hour')
  })

  it('actually changes the span on every step, rather than only sometimes', () => {
    // The old bug let some clicks through and dropped others, so a test that
    // checked only the endpoints could still pass by luck.
    render(<Timeline enabled={ALL} />)
    const label = () => screen.getByTestId('window-label').textContent
    let previous = label()
    for (let i = 0; i < 5; i++) {
      fireEvent.click(screen.getByText('+ in'))
      const next = label()
      expect(next).not.toBe(previous)
      previous = next
    }
  })

  it('stops at the ends instead of running away', () => {
    render(<Timeline enabled={ALL} />)
    for (let i = 0; i < 30; i++) fireEvent.click(screen.getByText('− out'))
    expect(screen.getByText('− out')).toBeDisabled()
    for (let i = 0; i < 40; i++) fireEvent.click(screen.getByText('+ in'))
    expect(screen.getByText('+ in')).toBeDisabled()
  })

  it('returns to the default window when reset', () => {
    render(<Timeline enabled={ALL} />)
    const start = screen.getByTestId('window-label').textContent
    for (let i = 0; i < 6; i++) fireEvent.click(screen.getByText('− out'))
    expect(screen.getByTestId('window-label').textContent).not.toBe(start)
    fireEvent.click(screen.getByText('now'))
    expect(track()).toHaveAttribute('data-tier', 'day')
  })

  it('pans with the arrow keys without changing the zoom', () => {
    render(<Timeline enabled={ALL} />)
    const before = screen.getByTestId('window-label').textContent
    fireEvent.keyDown(track(), { key: 'ArrowRight' })
    expect(screen.getByTestId('window-label').textContent).not.toBe(before)
    // Panning must not be a disguised zoom.
    expect(track()).toHaveAttribute('data-tier', 'day')
  })

  it('renders only the layers that are switched on', () => {
    render(<Timeline enabled={{ ...ALL, run: false, deadline: false }} />)
    expect(screen.getByText('Events')).toBeInTheDocument()
    expect(screen.queryByText('Runs')).not.toBeInTheDocument()
  })

  it('says so when every layer is off, rather than showing an empty box', () => {
    render(<Timeline enabled={{ human: false, scheduled: false, run: false, deadline: false }} />)
    expect(screen.getByText(/every layer is switched off/i)).toBeInTheDocument()
  })
})
