import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  getTenantContext: vi.fn(),
  replayEvents: vi.fn(),
  subscribeToEvents: vi.fn(),
  /** The live `send` the route hands to subscribeToEvents. */
  live: null as null | ((e: unknown) => void),
}))

vi.mock('@/lib/ops/tenant', () => ({ getTenantContext: () => h.getTenantContext() }))
vi.mock('@/lib/realtime/bus', () => ({
  replayEvents: (...a: unknown[]) => h.replayEvents(...a),
  // The route withholds `id:` for non-replayable events; an incomplete mock
  // made `send` throw and the stream produced nothing at all.
  isReplayable: (id: string) => !id.startsWith('local-'),
  subscribeToEvents: (tenantId: string, send: (e: unknown) => void) => {
    h.live = send
    h.subscribeToEvents(tenantId)
    return () => {
      h.live = null
    }
  },
}))

import { GET } from '../route'

// The payload deliberately does NOT echo the id: counting occurrences of
// `"id":"x"` in the stream would otherwise match twice per frame.
const ev = (id: string) => ({
  id,
  tenantId: 'tnt_internal',
  channel: 'BOARD',
  type: 'task-updated',
  payload: { note: 'n' },
  at: new Date().toISOString(),
})

async function drain(res: Response, ms = 60): Promise<string> {
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let out = ''
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    const next = await Promise.race([
      reader.read(),
      new Promise<{ value: undefined }>((r) => setTimeout(() => r({ value: undefined }), 15)),
    ])
    if (next.value) out += decoder.decode(next.value)
    else break
  }
  await reader.cancel().catch(() => {})
  return out
}

describe('replay and the live stream must not leave a gap', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    h.live = null
    h.getTenantContext.mockResolvedValue({
      tenantId: 'tnt_internal', slug: 'autiva', name: 'A', mode: 'internal',
    })
  })

  it('delivers an event published WHILE the replay query is running', async () => {
    // The obvious order (replay, then subscribe) drops this event: too new for
    // the replay, too early for the subscription. That is precisely the gap
    // replay exists to close.
    h.replayEvents.mockImplementation(async () => {
      // Mid-flight: the subscription must already be attached.
      expect(h.live).not.toBeNull()
      h.live?.(ev('raced'))
      return [ev('replayed')]
    })

    const res = await GET(new Request('http://localhost/api/events?since=e0'))
    const body = await drain(res)

    expect(body).toContain('"id":"replayed"')
    expect(body).toContain('"id":"raced"')
    // Order is preserved: history before the thing that happened during it.
    expect(body.indexOf('"id":"replayed"')).toBeLessThan(body.indexOf('"id":"raced"'))
  })

  it('subscribes before it replays', async () => {
    const order: string[] = []
    h.subscribeToEvents.mockImplementation(() => order.push('subscribe'))
    h.replayEvents.mockImplementation(async () => {
      order.push('replay')
      return []
    })

    const res = await GET(new Request('http://localhost/api/events?since=e0'))
    await drain(res)
    expect(order).toEqual(['subscribe', 'replay'])
  })

  it('does not repeat an event that the replay already carried', async () => {
    // Subscribing first can duplicate but never drop, so duplicates are
    // filtered rather than shown twice.
    h.replayEvents.mockImplementation(async () => {
      h.live?.(ev('both'))
      return [ev('both')]
    })

    const res = await GET(new Request('http://localhost/api/events?since=e0'))
    const body = await drain(res)
    const hits = body.split('"id":"both"').length - 1
    expect(hits).toBe(1)
  })

  it('still opens a live stream when there is no cursor to replay from', async () => {
    h.replayEvents.mockResolvedValue([])
    const res = await GET(new Request('http://localhost/api/events'))
    const body = await drain(res)
    expect(h.replayEvents).not.toHaveBeenCalled()
    expect(h.subscribeToEvents).toHaveBeenCalled()
    expect(body).toContain(': connected')
  })

  it('keeps the live stream alive when the replay query fails', async () => {
    h.replayEvents.mockRejectedValue(new Error('database down'))
    const res = await GET(new Request('http://localhost/api/events?since=e0'))
    // Assert the subscription was established, not that it is still open:
    // draining cancels the reader, which unsubscribes on the way out.
    expect(h.subscribeToEvents).toHaveBeenCalled()
    const body = await drain(res)
    expect(body).toContain(': replay-unavailable')
  })
})
