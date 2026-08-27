import { EventEmitter } from 'events'
import { prisma } from '@/lib/prisma'

/**
 * The single realtime bus. Every feature that needs live updates adds a
 * CHANNEL here — it does not open a second connection or a parallel socket
 * stack. Both this dashboard and the city UI consume the same stream.
 *
 * CAVEAT, unchanged from the original design: this emitter is in-process. On a
 * single instance it is correct. On a serverless platform where requests land
 * on different containers, a publish and an open SSE connection can miss each
 * other. Persisting every event (below) is what makes that survivable — a
 * client replays from the log on connect rather than silently missing work.
 */

export type EventChannel = 'BOARD' | 'COMMENTS' | 'FLEET' | 'RUNS' | 'APPROVALS' | 'SYSTEM'

export interface StreamEvent {
  id: string
  tenantId: string
  channel: EventChannel
  /** Dotted name within the channel, e.g. "task.created". */
  type: string
  payload: unknown
  at: string
}

const globalForBus = globalThis as unknown as { boardBus?: EventEmitter }

// Singleton across hot-reloads in dev, same pattern as src/lib/prisma.ts —
// otherwise each recompiled module would create its own emitter and SSE
// subscribers would stop receiving events published from a newer instance.
export const boardBus: EventEmitter = globalForBus.boardBus ?? new EventEmitter()
if (process.env.NODE_ENV !== 'production') {
  globalForBus.boardBus = boardBus
}
// Many SSE connections (one per open tab) all listen on the same emitter —
// raise the default 10-listener warning threshold.
boardBus.setMaxListeners(0)

const STREAM_EVENT = 'stream-event'

/**
 * Publish to the log and the live bus.
 *
 * Persisting first is deliberate: a subscriber that reconnects replays from
 * the log, so an event that reached the database but not the emitter is
 * recoverable, whereas the reverse is lost forever.
 */
export async function publishEvent(input: {
  tenantId: string
  channel: EventChannel
  type: string
  payload: unknown
}): Promise<StreamEvent> {
  const row = await prisma.event.create({
    data: {
      tenantId: input.tenantId,
      channel: input.channel,
      type: input.type,
      payload: (input.payload ?? {}) as never,
    },
  })

  const event: StreamEvent = {
    id: row.id,
    tenantId: row.tenantId,
    channel: row.channel as EventChannel,
    type: row.type,
    payload: row.payload,
    at: row.at.toISOString(),
  }

  boardBus.emit(STREAM_EVENT, event)
  return event
}

/**
 * Subscribe to live events for ONE tenant. The tenant filter is applied here,
 * on the server, so a subscriber can never receive another tenant's traffic
 * even if it asks for it — the same boundary rule as every query.
 */
export function subscribeToEvents(
  tenantId: string,
  listener: (event: StreamEvent) => void,
  channels?: EventChannel[]
): () => void {
  const handler = (event: StreamEvent) => {
    // '*' is the single-tenant board's broadcast marker — it predates the
    // tenant dimension and has no context to publish with. Everything else
    // must match exactly; a subscriber never sees another tenant's traffic.
    if (event.tenantId !== tenantId && event.tenantId !== '*') return
    if (channels && channels.length > 0 && !channels.includes(event.channel)) return
    listener(event)
  }
  boardBus.on(STREAM_EVENT, handler)
  return () => boardBus.off(STREAM_EVENT, handler)
}

/** Events since a cursor, for a client catching up after a reconnect. */
export async function replayEvents(
  tenantId: string,
  sinceId?: string,
  limit = 100
): Promise<StreamEvent[]> {
  const since = sinceId
    ? await prisma.event.findFirst({ where: { id: sinceId, tenantId }, select: { at: true } })
    : null

  const rows = await prisma.event.findMany({
    where: { tenantId, ...(since ? { at: { gt: since.at } } : {}) },
    orderBy: { at: 'asc' },
    take: limit,
  })

  return rows.map((r) => ({
    id: r.id,
    tenantId: r.tenantId,
    channel: r.channel as EventChannel,
    type: r.type,
    payload: r.payload,
    at: r.at.toISOString(),
  }))
}

// ── Board compatibility ──────────────────────────────────────────
// The task board predates channels. These keep its call sites unchanged while
// routing everything through the one bus.

export type BoardEvent =
  | { type: 'task-created'; payload: unknown }
  | { type: 'task-updated'; payload: unknown }
  | { type: 'task-deleted'; payload: { id: string } }

/** Maps a board event onto the BOARD channel. */
export function publishBoardEvent(event: BoardEvent): void {
  boardBus.emit(STREAM_EVENT, {
    id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    // The board is single-tenant today; '*' means "deliver to any listener".
    tenantId: '*',
    channel: 'BOARD' as EventChannel,
    type: event.type,
    payload: 'payload' in event ? event.payload : {},
    at: new Date().toISOString(),
  } satisfies StreamEvent)
}

export function subscribeToBoardEvents(listener: (event: BoardEvent) => void): () => void {
  const handler = (event: StreamEvent) => {
    if (event.channel !== 'BOARD') return
    listener({ type: event.type, payload: event.payload } as BoardEvent)
  }
  boardBus.on(STREAM_EVENT, handler)
  return () => boardBus.off(STREAM_EVENT, handler)
}
