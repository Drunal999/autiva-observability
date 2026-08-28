import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { Dock, type DockItem } from '../Dock'

vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>()
  return { ...actual, useReducedMotion: () => false }
})

const items: DockItem[] = [
  { href: '/board', label: 'Mission', glyph: '◈', active: true },
  { href: '/approvals', label: 'Approvals', glyph: '✓', badge: 4 },
  { href: '/fleet', label: 'Fleet', glyph: '◇' },
]

describe('the dock', () => {
  let navigate: (href: string) => void
  let calls: string[]
  beforeEach(() => {
    calls = []
    navigate = (href) => calls.push(href)
  })

  const setup = () => render(<Dock items={items} onNavigate={navigate} />)

  it('renders one link per item', () => {
    setup()
    expect(screen.getByLabelText('Mission')).toBeInTheDocument()
    expect(screen.getByLabelText('Approvals')).toBeInTheDocument()
    expect(screen.getByLabelText('Fleet')).toBeInTheDocument()
  })

  it('uses real anchors, so the keyboard and open-in-new-tab work', () => {
    // The source used role="button" with tabIndex={0} and no key handler:
    // reachable by keyboard, impossible to activate with one.
    setup()
    const mission = screen.getByLabelText('Mission')
    expect(mission.tagName).toBe('A')
    expect(mission).toHaveAttribute('href', '/board')
  })

  it('marks the current page for assistive tech, not just with colour', () => {
    setup()
    expect(screen.getByLabelText('Mission')).toHaveAttribute('aria-current', 'page')
    expect(screen.getByLabelText('Fleet')).not.toHaveAttribute('aria-current')
  })

  it('navigates client-side on a plain click', () => {
    setup()
    fireEvent.click(screen.getByLabelText('Fleet'), { button: 0 })
    expect(calls).toEqual(['/fleet'])
  })

  it('leaves a modified click to the browser', () => {
    // Ctrl/cmd-click and middle-click must still open a new tab; swallowing
    // them is the classic way a custom nav breaks a real link.
    setup()
    fireEvent.click(screen.getByLabelText('Fleet'), { button: 0, metaKey: true })
    fireEvent.click(screen.getByLabelText('Fleet'), { button: 0, ctrlKey: true })
    fireEvent.click(screen.getByLabelText('Fleet'), { button: 1 })
    expect(calls).toEqual([])
  })

  it('shows a badge only where there is something waiting', () => {
    setup()
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(screen.getByLabelText('4 waiting')).toBeInTheDocument()
  })

  it('does not announce a popup that does not exist', () => {
    // The source put aria-haspopup="true" on every item; the label is a
    // tooltip, not a menu.
    setup()
    expect(screen.getByLabelText('Mission')).not.toHaveAttribute('aria-haspopup')
  })

  it('shows no tooltip until something asks for one', () => {
    setup()
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('reveals the label on keyboard focus, and hides it on blur', async () => {
    // Focus, not hover: framer-motion drives hover from its own pointer
    // gesture, which jsdom cannot deliver convincingly. Pointer magnification
    // and the hover tooltip are verified in a real browser instead — a
    // simulated hover here would assert the mock, not the behaviour.
    setup()
    const fleet = screen.getByLabelText('Fleet')
    fireEvent.focus(fleet)
    expect(screen.getByRole('tooltip')).toHaveTextContent('Fleet')
    // AnimatePresence keeps the node mounted through its exit animation, so
    // this waits for removal rather than asserting on the same tick.
    fireEvent.blur(fleet)
    await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument())
  })

  it('keeps the panel a fixed height', () => {
    // The source animated the container from 64px to 256px on hover — a
    // 200-pixel layout jump every time a cursor crossed it.
    const { container } = setup()
    const panel = container.querySelector('nav')!
    expect(panel.style.height).toBe('58px')
  })
})
