import { describe, it, expect } from 'vitest'
import { publishBoardEvent } from '@/lib/realtime/bus'
import { GET } from '../route'

async function readOneChunk(reader: ReadableStreamDefaultReader<Uint8Array>) {
  const { value } = await reader.read()
  return new TextDecoder().decode(value)
}

describe('/api/events (SSE)', () => {
  it('responds with an event-stream content type', async () => {
    const res = await GET()
    expect(res.headers.get('Content-Type')).toBe('text/event-stream')
    await res.body?.cancel()
  })

  it('streams a published board event to the client as an SSE data frame', async () => {
    const res = await GET()
    const reader = res.body!.getReader()

    const chunkPromise = readOneChunk(reader)
    publishBoardEvent({ type: 'task-created', payload: { id: 't1' } })
    const chunk = await chunkPromise

    expect(chunk).toContain('data: ')
    expect(chunk).toContain('task-created')
    expect(chunk).toContain('t1')

    await reader.cancel()
  })
})
