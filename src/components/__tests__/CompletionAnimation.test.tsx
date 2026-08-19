import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CompletionAnimation } from '../CompletionAnimation'

describe('CompletionAnimation', () => {
  it('renders and calls onComplete after its duration', async () => {
    vi.useFakeTimers()
    const onComplete = vi.fn()
    render(<CompletionAnimation taskId="t1" onComplete={onComplete} />)

    expect(screen.getByTestId('completion-animation')).toBeInTheDocument()

    // waitFor's internal polling uses real timers, which stalls forever
    // under vi.useFakeTimers() — advance fake time directly instead.
    await vi.advanceTimersByTimeAsync(1000)
    expect(onComplete).toHaveBeenCalled()
    vi.useRealTimers()
  })
})
