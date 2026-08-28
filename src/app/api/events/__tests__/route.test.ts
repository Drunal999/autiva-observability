import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  getTenantContext: vi.fn(),
  replayEvents: vi.fn(),
}))

vi.mock('@/lib/ops/tenant', () => ({ getTenantContext: () => h.getTenantContext() }))

import { publishBoardEvent } from '@/lib/realtime/bus'
import { GET } from '../route'

const req = (qs = '') => new Request(`http://localhost/api/events${qs}`)

async function readOneChunk(reader: ReadableStreamDefaultReader<Uint8Array>) {
  const { value } = await reader.read()
  return new TextDecoder().decode(value)
}

// The stream opens with a `: connected` comment frame so the browser fires
// EventSource.onopen immediately; comment frames carry no payload, so skip
// them when the assertion is about an actual event.
async function readUntilDataFrame(reader: ReadableStreamDefaultReader<Uint8Array>) {
  for (let i = 0; i < 5; i++) {
    const chunk = await readOneChunk(reader)
    if (chunk.includes('data: ')) return chunk
  }
  throw new Error('no data frame received')
}

describe('/api/events (SSE)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    h.getTenantContext.mockResolvedValue({
      tenantId: 'tnt_internal', slug: 'autiva', name: 'A', mode: 'internal',
    })
  })

  it('refuses a caller with no tenant context', async () => {
    h.getTenantContext.mockResolvedValue(null)
    const res = await GET(req())
    expect(res.status).toBe(401)
  })

  it('responds with an event-stream content type', async () => {
    const res = await GET(req())
    expect(res.headers.get('Content-Type')).toBe('text/event-stream')
    await res.body?.cancel()
  })

  it('disables proxy buffering, which would otherwise hold frames back', async () => {
    const res = await GET(req())
    expect(res.headers.get('X-Accel-Buffering')).toBe('no')
    await res.body?.cancel()
  })

  it('flushes an opening frame immediately so the client leaves "connecting"', async () => {
    const res = await GET(req())
    const reader = res.body!.getReader()

    // Nothing is published — this must resolve on the handshake frame alone,
    // not wait for the 25s heartbeat.
    const chunk = await readOneChunk(reader)
    expect(chunk).toContain(': connected')

    await reader.cancel()
  })

  it('streams a published board event to the client as an SSE data frame', async () => {
    const res = await GET(req())
    const reader = res.body!.getReader()

    const chunkPromise = readUntilDataFrame(reader)
    publishBoardEvent({ type: 'task-created', payload: { id: 't1' } })
    const chunk = await chunkPromise

    expect(chunk).toContain('data: ')
    expect(chunk).toContain('task-created')
    expect(chunk).toContain('t1')

    await reader.cancel()
  })

  it('withholds id: for an event that was never persisted', async () => {
    const res = await GET(req())
    const reader = res.body!.getReader()

    const chunkPromise = readUntilDataFrame(reader)
    // publishBoardEvent mints a `local-…` id for a row that never reaches the
    // Event table. Advertising it would park a cursor in the client that
    // replay can never resolve, silently disabling catch-up from then on.
    publishBoardEvent({ type: 'task-updated', payload: { id: 't2' } })
    const chunk = await chunkPromise

    expect(chunk).toContain('data: ')
    expect(chunk.startsWith('id: ')).toBe(false)
    expect(chunk).not.toContain('\nid: ')

    await reader.cancel()
  })

  it('drops events outside the requested channels', async () => {
    // Subscribe to FLEET only; a BOARD event must not arrive.
    const res = await GET(req('?channels=FLEET'))
    const reader = res.body!.getReader()

    const first = await readOneChunk(reader)
    expect(first).toContain(': connected')

    publishBoardEvent({ type: 'task-created', payload: { id: 't3' } })

    const next = await Promise.race([
      readOneChunk(reader),
      new Promise<string>((r) => setTimeout(() => r('__nothing__'), 300)),
    ])
    expect(next).toBe('__nothing__')

    await reader.cancel()
  })
})
