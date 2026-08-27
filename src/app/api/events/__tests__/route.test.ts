import { describe, it, expect } from 'vitest'
import { publishBoardEvent } from '@/lib/realtime/bus'
import { GET } from '../route'

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
  it('responds with an event-stream content type', async () => {
    const res = await GET()
    expect(res.headers.get('Content-Type')).toBe('text/event-stream')
    await res.body?.cancel()
  })

  it('flushes an opening frame immediately so the client leaves "connecting"', async () => {
    const res = await GET()
    const reader = res.body!.getReader()

    // Nothing is published — this must resolve on the handshake frame alone,
    // not wait for the 25s heartbeat.
    const chunk = await readOneChunk(reader)
    expect(chunk).toContain(': connected')

    await reader.cancel()
  })

  it('streams a published board event to the client as an SSE data frame', async () => {
    const res = await GET()
    const reader = res.body!.getReader()

    const chunkPromise = readUntilDataFrame(reader)
    publishBoardEvent({ type: 'task-created', payload: { id: 't1' } })
    const chunk = await chunkPromise

    expect(chunk).toContain('data: ')
    expect(chunk).toContain('task-created')
    expect(chunk).toContain('t1')

    await reader.cancel()
  })
})
