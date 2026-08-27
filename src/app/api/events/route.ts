import { subscribeToEvents, replayEvents, type StreamEvent, type EventChannel } from '@/lib/realtime/bus'
import { getTenantContext } from '@/lib/ops/tenant'

// Long-lived response — must never be statically optimized/cached.
export const dynamic = 'force-dynamic'

const HEARTBEAT_MS = 25_000
const VALID_CHANNELS: EventChannel[] = ['BOARD', 'COMMENTS', 'FLEET', 'RUNS', 'APPROVALS', 'SYSTEM']

export async function GET(req: Request) {
  const ctx = await getTenantContext()
  if (!ctx) return new Response('unauthorised', { status: 401 })

  const url = new URL(req.url)
  // Channel filtering is a subscriber convenience. The TENANT filter is not —
  // it is applied server-side in the bus and cannot be widened from here.
  const requested = (url.searchParams.get('channels') ?? '')
    .split(',')
    .map((c) => c.trim().toUpperCase())
    .filter((c): c is EventChannel => VALID_CHANNELS.includes(c as EventChannel))

  // Last-Event-ID is the standard SSE reconnect header; the query param is a
  // fallback for clients that cannot set it.
  const sinceId =
    req.headers.get('Last-Event-ID') ?? url.searchParams.get('since') ?? undefined

  const encoder = new TextEncoder()
  let unsubscribe: (() => void) | undefined
  let heartbeat: ReturnType<typeof setInterval> | undefined

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: StreamEvent) => {
        // The id: field is what the browser echoes back as Last-Event-ID on
        // reconnect, which is what makes replay work without client bookkeeping.
        controller.enqueue(
          encoder.encode(`id: ${event.id}\ndata: ${JSON.stringify(event)}\n\n`)
        )
      }

      // Flush a frame immediately: the browser only fires EventSource.onopen
      // once the response body starts arriving, so a stream that sends
      // nothing until the first heartbeat leaves the client stuck on
      // "connecting" for HEARTBEAT_MS.
      controller.enqueue(encoder.encode(`: connected\n\n`))

      // Replay before subscribing, so a reconnecting client sees what it
      // missed. A silently stale dashboard is worse than an obviously broken
      // one — and worse still is one that looks live but has a hole in it.
      if (sinceId) {
        try {
          const missed = await replayEvents(ctx.tenantId, sinceId)
          for (const e of missed) {
            if (requested.length === 0 || requested.includes(e.channel)) send(e)
          }
        } catch {
          // Replay is best-effort: a failed catch-up must not kill the live
          // stream the client is about to depend on.
          controller.enqueue(encoder.encode(`: replay-unavailable\n\n`))
        }
      }

      unsubscribe = subscribeToEvents(ctx.tenantId, send, requested)

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
      // Nginx and similar buffer proxied responses by default, which holds
      // frames until the buffer fills and defeats the point of a stream.
      'X-Accel-Buffering': 'no',
    },
  })
}
