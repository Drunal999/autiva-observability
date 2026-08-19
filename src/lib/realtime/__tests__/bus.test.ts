import { describe, it, expect, vi } from 'vitest'
import { publishBoardEvent, subscribeToBoardEvents } from '../bus'

describe('board event bus', () => {
  it('delivers a published event to a subscriber', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeToBoardEvents(listener)

    publishBoardEvent({ type: 'task-deleted', payload: { id: 't1' } })

    expect(listener).toHaveBeenCalledWith({ type: 'task-deleted', payload: { id: 't1' } })
    unsubscribe()
  })

  it('stops delivering events after unsubscribe', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeToBoardEvents(listener)
    unsubscribe()

    publishBoardEvent({ type: 'task-deleted', payload: { id: 't2' } })

    expect(listener).not.toHaveBeenCalled()
  })

  it('delivers events independently to multiple subscribers', () => {
    const a = vi.fn()
    const b = vi.fn()
    const unsubA = subscribeToBoardEvents(a)
    const unsubB = subscribeToBoardEvents(b)

    publishBoardEvent({ type: 'task-deleted', payload: { id: 't3' } })

    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)
    unsubA()
    unsubB()
  })
})
