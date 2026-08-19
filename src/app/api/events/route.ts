import { subscribeToBoardEvents, type BoardEvent } from '@/lib/realtime/bus'

// Long-lived response — must never be statically optimized/cached.
export const dynamic = 'force-dynamic'

const HEARTBEAT_MS = 25_000

export async function GET() {
  const encoder = new TextEncoder()
  let unsubscribe: (() => void) | undefined
  let heartbeat: ReturnType<typeof setInterval> | undefined

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: BoardEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
      }
      unsubscribe = subscribeToBoardEvents(send)

      // SSE connections behind some proxies/load balancers get killed if
      // nothing is sent for a while — a comment frame keeps it alive
      // without being a real event the client needs to parse.
      heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(`: heartbeat\n\n`))
      }, HEARTBEAT_MS)
    },
    cancel() {
      unsubscribe?.()
      if (heartbeat) clearInterval(heartbeat)
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
