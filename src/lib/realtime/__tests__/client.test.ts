import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/** Minimal EventSource stand-in — jsdom has none. */
class FakeEventSource {
  static instances: FakeEventSource[] = []
  onopen: (() => void) | null = null
  onmessage: ((e: MessageEvent<string>) => void) | null = null
  onerror: (() => void) | null = null
  closed = false
  constructor(public url: string) {
    FakeEventSource.instances.push(this)
  }
  close() {
    this.closed = true
  }
  emit(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent<string>)
  }
}

vi.stubGlobal('EventSource', FakeEventSource as unknown as typeof EventSource)

import { useEventStream, __resetRealtime } from '../client'
import { renderHook, act } from '@testing-library/react'

const ev = (n: number, channel = 'BOARD') => ({
  id: `e${n}`, tenantId: 't1', channel, type: 'task.created',
  payload: { n }, at: new Date().toISOString(),
})

const latest = () => FakeEventSource.instances[FakeEventSource.instances.length - 1]

describe('useEventStream', () => {
  beforeEach(() => {
    FakeEventSource.instances = []
    __resetRealtime()
    vi.useFakeTimers()
  })
  afterEach(() => vi.useRealTimers())

  it('opens exactly one connection no matter how many consumers subscribe', () => {
    renderHook(() => useEventStream())
    renderHook(() => useEventStream(['FLEET']))
    renderHook(() => useEventStream(['APPROVALS']))
    expect(FakeEventSource.instances.length).toBe(1)
  })

  it('reports connected once the stream opens', () => {
    const { result } = renderHook(() => useEventStream())
    act(() => {
      latest().onopen?.()
    })
    expect(result.current.state).toBe('connected')
  })

  it('delivers events to subscribers', () => {
    const { result } = renderHook(() => useEventStream())
    act(() => {
      latest().onopen?.()
      latest().emit(ev(1))
    })
    expect(result.current.events).toHaveLength(1)
    expect(result.current.events[0].id).toBe('e1')
  })

  it('filters by channel without opening a second connection', () => {
    const all = renderHook(() => useEventStream())
    const fleet = renderHook(() => useEventStream(['FLEET']))
    act(() => {
      latest().onopen?.()
      latest().emit(ev(1, 'BOARD'))
      latest().emit(ev(2, 'FLEET'))
    })
    expect(all.result.current.events).toHaveLength(2)
    expect(fleet.result.current.events).toHaveLength(1)
    expect(fleet.result.current.events[0].channel).toBe('FLEET')
    expect(FakeEventSource.instances.length).toBe(1)
  })

  it('caps the buffer so a long-open tab does not grow without bound', () => {
    const { result } = renderHook(() => useEventStream())
    act(() => {
      latest().onopen?.()
      for (let i = 0; i < 620; i++) latest().emit(ev(i))
    })
    expect(result.current.events).toHaveLength(500)
    // Oldest are dropped, newest retained.
    expect(result.current.events[result.current.events.length - 1].id).toBe('e619')
  })

  it('surfaces reconnecting rather than silently going stale', () => {
    const { result } = renderHook(() => useEventStream())
    act(() => {
      latest().onopen?.()
    })
    expect(result.current.state).toBe('connected')
    act(() => {
      latest().onerror?.()
    })
    expect(result.current.state).toBe('reconnecting')
  })

  it('backs off exponentially instead of retrying in a fixed tick', () => {
    renderHook(() => useEventStream())
    const openedAt = () => FakeEventSource.instances.length

    act(() => { latest().onerror?.() })
    const afterFirst = openedAt()
    // Too early for the first retry.
    act(() => { vi.advanceTimersByTime(200) })
    expect(openedAt()).toBe(afterFirst)
    // First retry lands in the ~500ms band.
    act(() => { vi.advanceTimersByTime(700) })
    expect(openedAt()).toBe(afterFirst + 1)

    // Second failure must wait longer than the first did.
    act(() => { latest().onerror?.() })
    act(() => { vi.advanceTimersByTime(700) })
    expect(openedAt()).toBe(afterFirst + 1)
    act(() => { vi.advanceTimersByTime(800) })
    expect(openedAt()).toBe(afterFirst + 2)
  })

  it('resumes from the last event id so a reconnect replays the gap', () => {
    renderHook(() => useEventStream())
    act(() => {
      latest().onopen?.()
      latest().emit(ev(7))
      latest().onerror?.()
      vi.advanceTimersByTime(2000)
    })
    expect(latest().url).toContain('since=e7')
  })

  it('escalates to offline after repeated failures', () => {
    const { result } = renderHook(() => useEventStream())
    act(() => {
      for (let i = 0; i < 4; i++) {
        latest().onerror?.()
        vi.advanceTimersByTime(40_000)
      }
    })
    expect(result.current.state).toBe('offline')
  })
})
